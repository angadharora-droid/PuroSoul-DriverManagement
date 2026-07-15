import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import Admin from '../models/Admin.js';
import Transaction from '../models/Transaction.js';
import Handover from '../models/Handover.js';
import { requireAuth } from '../middleware/auth.js';
import { sendSms } from '../services/sms.js';
import { maskMobile, formatINR } from '../utils/format.js';
import {
  generateOtp,
  hashOtp,
  checkOtp,
  otpExpiry,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from '../utils/otp.js';

const router = Router();
const COMPANY = process.env.COMPANY_NAME || 'Puro Soul';
const MAX_HANDOVER_TXNS = 200;

// Abuse guard: at most 10 OTP sends (new + resend) per driver per 15 minutes.
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `handover:${req.user.id}`,
  validate: false,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many OTP requests — please wait a few minutes before trying again' },
});

function otpMessage(code, amount, driverName, count) {
  return {
    type: 'otp',
    text: `${COMPANY}: ${code} is the OTP to confirm you are RECEIVING ${formatINR(amount)} cash (${count} collection${count === 1 ? '' : 's'}) from driver ${driverName}. Share it ONLY with the driver handing over. Valid ${process.env.OTP_TTL_MINUTES || 5} min.`,
    vars: { otp: code, amount: formatINR(amount) },
  };
}

function driverView(h, extra = {}) {
  return {
    id: h._id,
    ref: h.ref,
    totalAmount: h.totalAmount,
    transactionCount: h.transactions.length,
    notes: h.notes,
    status: h.status,
    otpExpiresAt: h.otpExpiresAt,
    attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - h.otpAttempts),
    resendsLeft: Math.max(0, OTP_MAX_RESENDS - h.otpResendCount),
    resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    verifiedAt: h.verifiedAt,
    createdAt: h.createdAt,
    recipient: { id: h.recipient?._id || h.recipient, name: h.recipientName },
    ...extra,
  };
}

/** Handovers that still "own" their transactions: verified, or pending with a live OTP. */
function activeHandoverFilter(extra = {}) {
  return {
    ...extra,
    $or: [{ status: 'verified' }, { status: 'pending_otp', otpExpiresAt: { $gt: new Date() } }],
  };
}

/** True if any of the handover's transactions were claimed by another handover meanwhile. */
async function hasConflict(h) {
  const linked = await Transaction.exists({ _id: { $in: h.transactions }, handover: { $nin: [null, h._id] } });
  if (linked) return true;
  const clash = await Handover.exists(
    activeHandoverFilter({ _id: { $ne: h._id }, transactions: { $in: h.transactions } })
  );
  return Boolean(clash);
}

/**
 * Atomically link/unlink collections to a handover. Uses the native driver on
 * purpose: the Transaction schema blocks all query-level updates, and this
 * guarded $set is the one sanctioned path — the filter makes it race-safe
 * (a collection already claimed by another handover never matches).
 */
function claimTransactions(h) {
  return Transaction.collection.updateMany(
    { _id: { $in: [...h.transactions] }, $or: [{ handover: null }, { handover: h._id }] },
    { $set: { handover: h._id }, $currentDate: { updatedAt: true } }
  );
}

function releaseTransactions(h) {
  return Transaction.collection.updateMany(
    { _id: { $in: [...h.transactions] }, handover: h._id },
    { $set: { handover: null }, $currentDate: { updatedAt: true } }
  );
}

// ---------------------------------------------------------------- driver ---

/** Active admins who can receive cash (have a mobile on file). Mobile is masked for drivers. */
router.get('/recipients', requireAuth('driver'), async (_req, res) => {
  const admins = await Admin.find({ isActive: true, mobile: /^\d{10}$/ }).sort({ name: 1 });
  res.json({ recipients: admins.map((a) => ({ id: a._id, name: a.name, mobile: maskMobile(a.mobile) })) });
});

/** Verified collections still in the driver's hands (not yet part of any live handover). */
router.get('/pending-cash', requireAuth('driver'), async (req, res) => {
  const lockedIds = await Handover.find(activeHandoverFilter({ driver: req.user.id })).distinct('transactions');
  const txns = await Transaction.find({
    driver: req.user.id,
    status: 'verified',
    handover: null,
    _id: { $nin: lockedIds },
  })
    .sort({ createdAt: 1 })
    .limit(MAX_HANDOVER_TXNS) // matches the per-handover cap so "select all" always submits cleanly
    .select('amount party createdAt verifiedAt')
    .populate('party', 'name');

  const items = txns.map((t) => ({
    id: t._id,
    ref: t.ref,
    amount: t.amount,
    party: t.party?.name || '—',
    collectedAt: t.createdAt,
    verifiedAt: t.verifiedAt,
  }));
  const totalAmount = Math.round(items.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  res.json({ items, totalAmount, count: items.length });
});

/** Start a handover: validates the selection and sends the OTP to the RECIPIENT's mobile. */
router.post('/', requireAuth('driver'), otpSendLimiter, async (req, res) => {
  const { transactionIds, recipientId, notes } = req.body || {};

  const ids = [...new Set((Array.isArray(transactionIds) ? transactionIds : []).map(String))];
  if (ids.length === 0) return res.status(400).json({ error: 'Select at least one collection to hand over' });
  if (ids.length > MAX_HANDOVER_TXNS) return res.status(400).json({ error: 'Too many collections in one handover — split it up' });
  if (!ids.every((id) => mongoose.isValidObjectId(id))) {
    return res.status(400).json({ error: 'Invalid collection selected' });
  }

  if (!mongoose.isValidObjectId(recipientId)) {
    return res.status(400).json({ error: 'Please select who is receiving the cash' });
  }
  const recipient = await Admin.findOne({ _id: recipientId, isActive: true });
  if (!recipient) return res.status(400).json({ error: 'Selected recipient is not an active admin' });
  if (!/^\d{10}$/.test(recipient.mobile || '')) {
    return res.status(400).json({ error: 'This recipient has no mobile number on file — an admin must add it first' });
  }

  // Only the driver's own verified, not-yet-handed-over collections qualify.
  const txns = await Transaction.find({ _id: { $in: ids }, driver: req.user.id, status: 'verified', handover: null });
  if (txns.length !== ids.length) {
    return res.status(400).json({ error: 'One or more selected collections are not eligible for handover' });
  }
  const locked = await Handover.exists(activeHandoverFilter({ transactions: { $in: ids } }));
  if (locked) {
    return res.status(409).json({ error: 'Some selected collections are already part of another handover in progress' });
  }

  const totalAmount = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const code = generateOtp();
  const handover = await Handover.create({
    driver: req.user.id,
    recipient: recipient._id,
    recipientName: recipient.name,
    transactions: ids,
    totalAmount,
    notes: notes ? String(notes).slice(0, 500) : '',
    otpCodeHash: await hashOtp(code),
    otpExpiresAt: otpExpiry(),
    lastOtpSentAt: new Date(),
    status: 'pending_otp',
    driverIp: req.ip || '',
    deviceInfo: (req.get('user-agent') || '').slice(0, 300),
  });

  // Close the check-then-act window: if a concurrent request created another
  // handover over any of these collections, void this one before the SMS goes out.
  if (await Handover.exists(activeHandoverFilter({ _id: { $ne: handover._id }, transactions: { $in: ids } }))) {
    handover.status = 'cancelled';
    handover.notifyError = 'create: concurrent handover over the same collections';
    await handover.save();
    return res.status(409).json({ error: 'These collections are already part of another handover in progress — please try again' });
  }

  try {
    await sendSms(recipient.mobile, otpMessage(code, totalAmount, req.user.name, ids.length));
  } catch (err) {
    handover.status = 'failed';
    handover.notifyError = `otp-sms: ${err.message}`;
    await handover.save();
    console.error('[handover-otp] SMS send failed:', err.message);
    return res.status(502).json({ error: 'Could not send OTP SMS to the recipient — please try again' });
  }

  res.status(201).json({
    handover: driverView(handover),
    otpSentTo: maskMobile(recipient.mobile),
    message: `OTP sent to ${recipient.name}'s mobile — ask them for the 6-digit code.`,
  });
});

/** Resend OTP: limited count, with a cooldown between sends. Resets attempts. */
router.post('/:id/resend-otp', requireAuth('driver'), otpSendLimiter, async (req, res) => {
  const handover = await Handover.findOne({ _id: req.params.id, driver: req.user.id }).populate('recipient');
  if (!handover) return res.status(404).json({ error: 'Handover not found' });
  // 'failed' (locked after wrong attempts) is recoverable with a fresh OTP, per policy.
  if (!['pending_otp', 'expired', 'failed'].includes(handover.status)) {
    return res.status(400).json({ error: `Cannot resend OTP for a ${handover.status} handover` });
  }
  if (handover.otpResendCount >= OTP_MAX_RESENDS) {
    return res.status(429).json({ error: 'Resend limit reached — please start a new handover' });
  }
  const sinceLast = handover.lastOtpSentAt ? (Date.now() - handover.lastOtpSentAt.getTime()) / 1000 : Infinity;
  if (sinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
    const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLast);
    return res.status(429).json({ error: `Please wait ${wait}s before resending`, retryAfterSeconds: wait });
  }
  if (await hasConflict(handover)) {
    return res.status(409).json({ error: 'Some collections in this handover were handed over separately — please start a new handover' });
  }
  // The recipient may have been deactivated or lost their mobile since the handover started.
  if (!handover.recipient?.isActive || !/^\d{10}$/.test(handover.recipient.mobile || '')) {
    return res.status(409).json({ error: 'The recipient can no longer receive OTPs — please cancel and start a new handover' });
  }

  const prevLastOtpSentAt = handover.lastOtpSentAt;
  const code = generateOtp();
  handover.otpCodeHash = await hashOtp(code);
  handover.otpExpiresAt = otpExpiry();
  handover.otpAttempts = 0;
  handover.otpResendCount += 1;
  handover.lastOtpSentAt = new Date();
  handover.status = 'pending_otp';
  await handover.save();

  try {
    await sendSms(handover.recipient.mobile, otpMessage(code, handover.totalAmount, req.user.name, handover.transactions.length));
  } catch (err) {
    // A failed send must not cost the driver a resend or restart the cooldown.
    handover.otpResendCount -= 1;
    handover.lastOtpSentAt = prevLastOtpSentAt;
    await handover.save().catch(() => {});
    console.error('[handover-otp] resend SMS failed:', err.message);
    return res.status(502).json({ error: 'Could not send OTP SMS — please try again' });
  }

  res.json({ handover: driverView(handover), otpSentTo: maskMobile(handover.recipient.mobile) });
});

/** Verify the OTP the driver got verbally from the recipient. */
router.post('/:id/verify', requireAuth('driver'), async (req, res) => {
  const otp = String((req.body || {}).otp || '').trim();
  const handover = await Handover.findOne({ _id: req.params.id, driver: req.user.id });
  if (!handover) return res.status(404).json({ error: 'Handover not found' });

  if (handover.status === 'verified') return res.json({ handover: driverView(handover) }); // idempotent
  if (handover.status === 'cancelled') return res.status(400).json({ error: 'This handover was cancelled — start a new one' });
  if (handover.status === 'failed') {
    return res.status(400).json({ error: 'This handover is locked after too many wrong attempts — resend OTP or start again' });
  }
  if (handover.otpExpiresAt < new Date()) {
    if (handover.status !== 'expired') {
      handover.status = 'expired';
      await handover.save();
    }
    return res.status(400).json({ error: 'OTP has expired — please resend', expired: true, handover: driverView(handover) });
  }
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Enter the 6-digit OTP' });

  const ok = await checkOtp(otp, handover.otpCodeHash);
  if (!ok) {
    handover.otpAttempts += 1;
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - handover.otpAttempts);
    if (attemptsLeft === 0) handover.status = 'failed';
    await handover.save();
    return res.status(400).json({
      error: attemptsLeft > 0 ? `Incorrect OTP — ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left` : 'Incorrect OTP — handover locked. Resend OTP to try again.',
      attemptsLeft,
      locked: attemptsLeft === 0,
    });
  }

  // Atomically claim the collections: a collection already claimed by another
  // handover never matches the guarded filter, so two racing verifies can
  // never both count the same cash. The claim is retry-safe for this handover.
  const claim = await claimTransactions(handover);
  if (claim.matchedCount !== handover.transactions.length) {
    await releaseTransactions(handover).catch(() => {});
    handover.status = 'cancelled';
    handover.notifyError = 'verify: collections already handed over elsewhere';
    await handover.save();
    return res.status(409).json({ error: 'Some collections were already handed over — this handover was cancelled, please start again' });
  }

  handover.status = 'verified';
  handover.verifiedAt = new Date();
  await handover.save();

  res.json({ handover: driverView(handover), verified: true });
});

/** Driver abandons a pending handover, releasing its collections immediately. */
router.post('/:id/cancel', requireAuth('driver'), async (req, res) => {
  const handover = await Handover.findOne({ _id: req.params.id, driver: req.user.id });
  if (!handover) return res.status(404).json({ error: 'Handover not found' });
  if (!['pending_otp', 'expired', 'failed'].includes(handover.status)) {
    return res.status(400).json({ error: `Cannot cancel a ${handover.status} handover` });
  }
  handover.status = 'cancelled';
  await handover.save();
  // Free any collections a crashed verify attempt may have claimed.
  await releaseTransactions(handover).catch(() => {});
  res.json({ handover: driverView(handover) });
});

/** Driver's own handover history. */
router.get('/mine', requireAuth('driver'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const filter = { driver: req.user.id };
  const [items, total] = await Promise.all([
    Handover.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Handover.countDocuments(filter),
  ]);
  res.json({ items: items.map((h) => driverView(h)), total, page, pages: Math.ceil(total / limit) });
});

export default router;

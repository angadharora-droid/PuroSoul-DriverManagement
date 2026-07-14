import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import Party from '../models/Party.js';
import Driver from '../models/Driver.js';
import Transaction from '../models/Transaction.js';
import { requireAuth } from '../middleware/auth.js';
import { sendSms } from '../services/sms.js';
import { notifyVerified } from '../services/notify.js';
import { receiptPdf } from '../services/pdf.js';
import { toCsv } from '../utils/csv.js';
import { maskMobile, formatINR, dateRange, formatDateTime } from '../utils/format.js';
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

// Abuse guard: at most 10 OTP sends (new + resend) per driver per 15 minutes.
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `driver:${req.user.id}`,
  validate: false,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many OTP requests — please wait a few minutes before trying again' },
});

function otpMessage(code, amount) {
  return {
    type: 'otp',
    text: `${COMPANY}: ${code} is the OTP to confirm cash collection of ${formatINR(amount)}. Share it ONLY with the delivery driver present with you. Valid ${process.env.OTP_TTL_MINUTES || 5} min.`,
    vars: { otp: code, amount: formatINR(amount) },
  };
}

function driverView(txn, extra = {}) {
  return {
    id: txn._id,
    ref: txn.ref,
    amount: txn.amount,
    notes: txn.notes,
    status: txn.status,
    otpExpiresAt: txn.otpExpiresAt,
    attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - txn.otpAttempts),
    resendsLeft: Math.max(0, OTP_MAX_RESENDS - txn.otpResendCount),
    resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    verifiedAt: txn.verifiedAt,
    createdAt: txn.createdAt,
    party: txn.populated('party') || txn.party?.name ? { id: txn.party._id, name: txn.party.name } : txn.party,
    ...extra,
  };
}

// ---------------------------------------------------------------- driver ---

/** Start a collection: validates the party against the DB and sends the OTP to the PARTY's mobile. */
router.post('/', requireAuth('driver'), otpSendLimiter, async (req, res) => {
  const { partyId, amount, notes } = req.body || {};

  // Backend re-validation: the party must exist in the approved database and be active.
  if (!mongoose.isValidObjectId(partyId)) return res.status(400).json({ error: 'Please select a party from the list' });
  const party = await Party.findOne({ _id: partyId, isActive: true });
  if (!party) return res.status(400).json({ error: 'Selected party is not in the approved list' });

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });
  if (amt > 10000000) return res.status(400).json({ error: 'Amount looks too large — please check' });

  const code = generateOtp();
  const txn = await Transaction.create({
    party: party._id,
    driver: req.user.id,
    amount: Math.round(amt * 100) / 100,
    notes: notes ? String(notes).slice(0, 500) : '',
    otpCodeHash: await hashOtp(code),
    otpExpiresAt: otpExpiry(),
    lastOtpSentAt: new Date(),
    status: 'pending_otp',
    driverIp: req.ip || '',
    deviceInfo: (req.get('user-agent') || '').slice(0, 300),
  });

  try {
    await sendSms(party.mobile, otpMessage(code, amt));
  } catch (err) {
    txn.status = 'failed';
    txn.notifyError = `otp-sms: ${err.message}`;
    await txn.save();
    console.error('[otp] SMS send failed:', err.message);
    return res.status(502).json({ error: 'Could not send OTP SMS to the party — please try again' });
  }

  await txn.populate('party', 'name');
  res.status(201).json({
    transaction: driverView(txn),
    otpSentTo: maskMobile(party.mobile),
    message: `OTP sent to ${party.name}'s registered mobile — ask the party for the 6-digit code.`,
  });
});

/** Resend OTP: limited count, with a cooldown between sends. Resets attempts. */
router.post('/:id/resend-otp', requireAuth('driver'), otpSendLimiter, async (req, res) => {
  const txn = await Transaction.findOne({ _id: req.params.id, driver: req.user.id }).populate('party');
  if (!txn) return res.status(404).json({ error: 'Collection not found' });
  // 'failed' (locked after wrong attempts) is recoverable with a fresh OTP, per policy.
  if (!['pending_otp', 'expired', 'failed'].includes(txn.status)) {
    return res.status(400).json({ error: `Cannot resend OTP for a ${txn.status} collection` });
  }
  if (txn.otpResendCount >= OTP_MAX_RESENDS) {
    return res.status(429).json({ error: 'Resend limit reached — please start a new collection' });
  }
  const sinceLast = txn.lastOtpSentAt ? (Date.now() - txn.lastOtpSentAt.getTime()) / 1000 : Infinity;
  if (sinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
    const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLast);
    return res.status(429).json({ error: `Please wait ${wait}s before resending`, retryAfterSeconds: wait });
  }

  const code = generateOtp();
  txn.otpCodeHash = await hashOtp(code);
  txn.otpExpiresAt = otpExpiry();
  txn.otpAttempts = 0;
  txn.otpResendCount += 1;
  txn.lastOtpSentAt = new Date();
  txn.status = 'pending_otp';
  await txn.save();

  try {
    await sendSms(txn.party.mobile, otpMessage(code, txn.amount));
  } catch (err) {
    console.error('[otp] resend SMS failed:', err.message);
    return res.status(502).json({ error: 'Could not send OTP SMS — please try again' });
  }

  res.json({ transaction: driverView(txn), otpSentTo: maskMobile(txn.party.mobile) });
});

/** Verify the OTP the driver got verbally from the party. */
router.post('/:id/verify', requireAuth('driver'), async (req, res) => {
  const otp = String((req.body || {}).otp || '').trim();
  const txn = await Transaction.findOne({ _id: req.params.id, driver: req.user.id }).populate('party driver');
  if (!txn) return res.status(404).json({ error: 'Collection not found' });

  if (txn.status === 'verified') return res.json({ transaction: driverView(txn) }); // idempotent
  if (txn.status === 'failed') {
    return res.status(400).json({ error: 'This collection is locked after too many wrong attempts — resend OTP or start again' });
  }
  if (txn.otpExpiresAt < new Date()) {
    if (txn.status !== 'expired') {
      txn.status = 'expired';
      await txn.save();
    }
    return res.status(400).json({ error: 'OTP has expired — please resend', expired: true, transaction: driverView(txn) });
  }
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Enter the 6-digit OTP' });

  const ok = await checkOtp(otp, txn.otpCodeHash);
  if (!ok) {
    txn.otpAttempts += 1;
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - txn.otpAttempts);
    if (attemptsLeft === 0) txn.status = 'failed';
    await txn.save();
    return res.status(400).json({
      error: attemptsLeft > 0 ? `Incorrect OTP — ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left` : 'Incorrect OTP — collection locked. Resend OTP to try again.',
      attemptsLeft,
      locked: attemptsLeft === 0,
    });
  }

  txn.status = 'verified';
  txn.verifiedAt = new Date();
  await txn.save();

  // Email + SMS fire in the background; verification is already final.
  notifyVerified(txn).catch((err) => console.error('[notify] failed:', err.message));

  res.json({ transaction: driverView(txn), verified: true });
});

/** Driver's own history. */
router.get('/mine', requireAuth('driver'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const filter = { driver: req.user.id };
  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('party', 'name'),
    Transaction.countDocuments(filter),
  ]);
  res.json({ items: items.map((t) => driverView(t)), total, page, pages: Math.ceil(total / limit) });
});

// ----------------------------------------------------------------- admin ---

function adminFilter(q) {
  const filter = {};
  if (q.driverId && mongoose.isValidObjectId(q.driverId)) filter.driver = new mongoose.Types.ObjectId(q.driverId);
  if (q.partyId && mongoose.isValidObjectId(q.partyId)) filter.party = new mongoose.Types.ObjectId(q.partyId);
  if (q.status) filter.status = q.status;
  const { start, end } = dateRange(q.from, q.to);
  if (start || end) filter.createdAt = { ...(start && { $gte: start }), ...(end && { $lt: end }) };
  return filter;
}

/** All collections with filters, pagination and verified totals. */
router.get('/', requireAuth('admin'), async (req, res) => {
  const filter = adminFilter(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 25);

  const [items, total, totalsAgg] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('party', 'name')
      .populate('driver', 'name mobile'),
    Transaction.countDocuments(filter),
    Transaction.aggregate([
      { $match: { ...filter, status: 'verified' } },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    items,
    total,
    page,
    pages: Math.ceil(total / limit),
    verifiedTotals: { amount: totalsAgg[0]?.amount || 0, count: totalsAgg[0]?.count || 0 },
  });
});

/** CSV export of the filtered collections list. */
router.get('/export.csv', requireAuth('admin'), async (req, res) => {
  const filter = adminFilter(req.query);
  const items = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .limit(10000)
    .populate('party', 'name')
    .populate('driver', 'name');

  const csv = toCsv(
    ['Date', 'Ref', 'Party', 'Driver', 'Amount (INR)', 'Status', 'Verified At', 'Notes', 'Emails Sent', 'SMS Sent'],
    items.map((t) => [
      formatDateTime(t.createdAt),
      t.ref,
      t.party?.name || '',
      t.driver?.name || '',
      t.amount.toFixed(2),
      t.status,
      t.verifiedAt ? formatDateTime(t.verifiedAt) : '',
      t.notes,
      (t.notificationEmailsSent || []).join('; '),
      t.smsConfirmationSent ? 'yes' : 'no',
    ])
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="collections-${Date.now()}.csv"`);
  res.send(csv);
});

/** Receipt PDF for a single verified collection (admin, or the driver who collected it). */
router.get('/:id/receipt.pdf', requireAuth('admin', 'driver'), async (req, res) => {
  const txn = await Transaction.findById(req.params.id).populate('party driver');
  if (!txn) return res.status(404).json({ error: 'Collection not found' });
  if (req.user.role === 'driver' && txn.driver._id.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Not your collection' });
  }
  if (txn.status !== 'verified') return res.status(400).json({ error: 'Receipt is only available for verified collections' });

  const pdf = await receiptPdf(txn);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${txn.ref}.pdf"`);
  res.send(pdf);
});

/** Verified records are immutable — admins may only append audit notes. */
router.post('/:id/audit-note', requireAuth('admin'), async (req, res) => {
  const note = String((req.body || {}).note || '').trim();
  if (!note) return res.status(400).json({ error: 'Note text is required' });

  const txn = await Transaction.findById(req.params.id);
  if (!txn) return res.status(404).json({ error: 'Collection not found' });

  txn.auditNotes.push({ by: req.user.name, note: note.slice(0, 500) });
  await txn.save();
  res.json({ auditNotes: txn.auditNotes });
});

export default router;

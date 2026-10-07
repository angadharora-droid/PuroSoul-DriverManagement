import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import Event from '../models/Event.js';
import EventBill, { PAYMENT_MODES } from '../models/EventBill.js';
import EventStockEntry from '../models/EventStockEntry.js';
import EventAttachment, { SCREENSHOT_MAX_BYTES } from '../models/EventAttachment.js';
import Receiver from '../models/Receiver.js';
import Collector from '../models/Collector.js';
import { requireAuth } from '../middleware/auth.js';
import { httpError } from '../middleware/error.js';
import { sendSms } from '../services/sms.js';
import { collectionOtpMessage } from '../services/smsTemplates.js';
import { stockPositions, eventSummaries, buildEventReport, billRow } from '../services/eventReport.js';
import { eventBillPdf, eventReportPdf, eventScreenshotsPdf } from '../services/pdf.js';
import { toCsv } from '../utils/csv.js';
import { maskMobile, formatDateTime, formatDate, dayRange } from '../utils/format.js';
import {
  generateOtp,
  hashOtp,
  checkOtp,
  isValidOtp,
  otpExpiry,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from '../utils/otp.js';

const router = Router();
const MAX_QTY_PER_LINE = 10000;
const SCREENSHOTS_PER_PDF = 150;

const round2 = (n) => Math.round(n * 100) / 100;
const isId = (id) => mongoose.isValidObjectId(id);

/** Accepts pasted forms ("+91 98765-43210", "098765 43210") and returns bare 10 digits. */
function normalizeMobile(value) {
  let d = String(value ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

// Abuse guard: a busy stall bills far faster than field collections, so the
// per-biller ceiling is well above the collection limiter's 10.
const billOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => `event-bill:${req.user.id}`,
  validate: false,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many OTP requests — please wait a few minutes before trying again' },
});

// …and no single customer number can be flooded with OTPs. Rejected bills
// (out of stock, bad input) don't count against the customer.
const customerOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `event-customer:${normalizeMobile(req.body?.customerMobile)}`,
  skip: (req) => !/^\d{10}$/.test(normalizeMobile(req.body?.customerMobile)),
  skipFailedRequests: true,
  validate: false,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many OTPs sent to this customer number — please wait a few minutes' },
});

/** Content type from the file's own bytes — the client's claim is never trusted. */
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function decodeScreenshot(raw) {
  const b64 = typeof raw === 'string' ? raw : raw?.data;
  if (!b64 || typeof b64 !== 'string') throw httpError(400, 'Attach the UPI payment screenshot');
  const data = Buffer.from(b64.replace(/^data:[^,]*,/, ''), 'base64');
  if (data.length < 1024) throw httpError(400, 'The screenshot looks empty — please attach it again');
  if (data.length > SCREENSHOT_MAX_BYTES) throw httpError(413, 'The screenshot is too large (max 5 MB)');
  const contentType = sniffImage(data);
  if (!contentType) throw httpError(400, 'The screenshot must be a JPEG, PNG or WebP image');
  return { data, contentType, size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}

const billLabelOf = (b) => (b.billNo ? String(b.billNo).padStart(4, '0') : b._id.toString().slice(-8).toUpperCase());

function billView(b, event) {
  return {
    id: b._id,
    ref: b.ref,
    billNo: b.billNo,
    billLabel: b.billLabel,
    status: b.status,
    customerName: b.customerName,
    customerMobile: b.customerMobile,
    lines: b.lines.map((l) => ({ item: l.item, name: l.name, price: l.price, quantity: l.quantity, amount: l.amount })),
    totalQuantity: b.totalQuantity,
    totalAmount: b.totalAmount,
    paymentMode: b.paymentMode,
    upiRef: b.upiRef,
    hasScreenshot: Boolean(b.screenshot),
    otpExpiresAt: b.otpExpiresAt,
    attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - b.otpAttempts),
    resendsLeft: Math.max(0, OTP_MAX_RESENDS - b.otpResendCount),
    resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    verifiedAt: b.verifiedAt,
    createdAt: b.createdAt,
    billerName: b.billerName,
    event: event ? { id: event._id, name: event.name, venue: event.venue } : { id: b.event },
  };
}

function adminEventView(e, summary) {
  return {
    id: e._id,
    name: e.name,
    venue: e.venue,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
    notes: e.notes,
    items: e.items.map((i) => ({ id: i._id, name: i.name, price: i.price, isActive: i.isActive })),
    billers: e.billers.map((c) => ({ id: c._id, name: c.name, designation: c.designation, isActive: c.isActive })),
    // A receiver can only log in (and so keep stock) once an admin has given them a password.
    stockKeeper: e.stockKeeper
      ? {
          id: e.stockKeeper._id,
          name: e.stockKeeper.name,
          isActive: e.stockKeeper.isActive,
          canLogIn: Boolean(e.stockKeeper.passwordHash),
        }
      : null,
    summary: summary || { amount: 0, bills: 0, quantity: 0, cash: 0, upi: 0 },
    createdAt: e.createdAt,
  };
}

function populateForAdmin(query) {
  return query.populate('billers', 'name designation isActive').populate('stockKeeper', 'name isActive passwordHash');
}

/** Event as the stall staff see it: prices and live stock, nothing about other people. */
function fieldEventView(e, positions) {
  return {
    id: e._id,
    name: e.name,
    venue: e.venue,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
    items: positions,
  };
}

function entryView(e) {
  return {
    id: e._id,
    date: e.createdAt,
    item: e.item,
    itemName: e.itemName,
    kind: e.kind,
    quantity: e.quantity,
    note: e.note,
    enteredByName: e.enteredByName,
  };
}

function slug(name) {
  return (
    String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'event'
  );
}

/** Applies the admin's edits. Prices, billers and the stock keeper are only ever set here. */
async function applyEventFields(event, body) {
  const b = body || {};
  for (const key of ['name', 'venue', 'notes', 'startDate', 'endDate']) {
    if (b[key] !== undefined) event[key] = String(b[key] ?? '').trim();
  }
  if (event.startDate && event.endDate && event.endDate < event.startDate) {
    throw httpError(400, 'End date cannot be before the start date');
  }

  if (b.status !== undefined) {
    if (!['open', 'closed'].includes(b.status)) throw httpError(400, 'Status must be open or closed');
    event.status = b.status;
  }

  if (b.items !== undefined) {
    if (!Array.isArray(b.items)) throw httpError(400, 'Items must be a list');
    const names = new Set();
    const keep = new Set();
    for (const raw of b.items) {
      const name = String(raw?.name || '').trim();
      if (!name) throw httpError(400, 'Every item needs a name');
      if (names.has(name.toLowerCase())) throw httpError(400, `"${name}" is listed twice`);
      names.add(name.toLowerCase());
      const price = Number(raw.price);
      if (!Number.isFinite(price) || price <= 0) throw httpError(400, `Enter a price greater than zero for ${name}`);
      const isActive = raw.isActive !== false;

      if (raw.id) {
        const existing = isId(raw.id) ? event.items.id(raw.id) : null;
        if (!existing) throw httpError(400, `Unknown item "${name}" — reload the page and try again`);
        existing.set({ name, price, isActive });
        keep.add(String(existing._id));
      } else {
        const created = event.items.create({ name, price, isActive });
        event.items.push(created);
        keep.add(String(created._id));
      }
    }
    // Items left off the list are retired, never deleted — past bills and stock entries point at them.
    for (const it of event.items) if (!keep.has(String(it._id))) it.isActive = false;
    if (!event.items.some((it) => it.isActive)) throw httpError(400, 'Keep at least one item on sale');
  }

  if (b.billerIds !== undefined) {
    const ids = [...new Set((Array.isArray(b.billerIds) ? b.billerIds : []).map(String))];
    if (!ids.every(isId)) throw httpError(400, 'Invalid collector selected');
    if ((await Collector.countDocuments({ _id: { $in: ids } })) !== ids.length) {
      throw httpError(400, 'One or more selected collectors no longer exist');
    }
    event.billers = ids;
  }

  if (b.stockKeeperId !== undefined) {
    if (!b.stockKeeperId) {
      event.stockKeeper = null;
    } else {
      if (!isId(b.stockKeeperId)) throw httpError(400, 'Invalid stock keeper selected');
      const keeper = await Receiver.findById(b.stockKeeperId).select('_id');
      if (!keeper) throw httpError(400, 'The selected stock keeper no longer exists');
      event.stockKeeper = keeper._id;
    }
  }
}

// ----------------------------------------------------------- field staff ---

/**
 * Open events the signed-in person works at: collectors bill, the stock-keeping
 * receiver keeps stock, and an admin can do both at every open event.
 */
router.get('/mine', requireAuth('collector', 'receiver', 'admin'), async (req, res) => {
  const { role, id } = req.user;
  const scope = role === 'admin' ? {} : role === 'collector' ? { billers: id } : { stockKeeper: id };
  const events = await Event.find({ ...scope, status: 'open' }).sort({ createdAt: -1 });
  const out = [];
  for (const e of events) out.push(fieldEventView(e, await stockPositions(e)));
  res.json({ role: role === 'admin' ? 'admin' : role === 'collector' ? 'billing' : 'stock', events: out });
});

/** Admins stepping in are named as such on every bill and ledger line they make. */
const actorName = (user) => (user.role === 'admin' ? `${user.name} (Admin)` : user.name);

/** Bills the signed-in collector (or admin) raised, newest first (optionally for one event). */
router.get('/bills/mine', requireAuth('collector', 'admin'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 10);
  const filter = { biller: req.user.id };
  if (req.query.eventId && isId(req.query.eventId)) filter.event = req.query.eventId;
  const [items, total] = await Promise.all([
    EventBill.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    EventBill.countDocuments(filter),
  ]);
  const events = new Map(
    (await Event.find({ _id: { $in: [...new Set(items.map((b) => String(b.event)))] } }).select('name venue')).map((e) => [
      String(e._id),
      e,
    ])
  );
  res.json({
    items: items.map((b) => billView(b, events.get(String(b.event)))),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

/** A collector works on their own bills; an admin on any bill. */
async function loadOwnBill(req) {
  const filter = req.user.role === 'admin' ? { _id: req.params.billId } : { _id: req.params.billId, biller: req.user.id };
  const bill = await EventBill.findOne(filter);
  if (!bill) throw httpError(404, 'Bill not found');
  return bill;
}

/** Admins see every bill; a collector only their own. */
async function loadViewableBill(req) {
  const bill = await EventBill.findById(req.params.billId);
  if (!bill) throw httpError(404, 'Bill not found');
  if (req.user.role !== 'admin' && String(bill.biller) !== req.user.id) throw httpError(403, 'Not your bill');
  return bill;
}

/** Resend OTP: limited count, with a cooldown between sends. Resets attempts. */
router.post('/bills/:billId/resend-otp', requireAuth('collector', 'admin'), billOtpLimiter, async (req, res) => {
  const bill = await loadOwnBill(req);
  // 'failed' (locked after wrong attempts, or the first SMS never went) is recoverable with a fresh OTP.
  if (!['pending_otp', 'expired', 'failed'].includes(bill.status)) {
    return res.status(400).json({ error: `Cannot resend OTP for a ${bill.status} bill` });
  }
  if (bill.otpResendCount >= OTP_MAX_RESENDS) {
    return res.status(429).json({ error: 'Resend limit reached — please cancel this bill and start a new one' });
  }
  const sinceLast = bill.lastOtpSentAt ? (Date.now() - bill.lastOtpSentAt.getTime()) / 1000 : Infinity;
  if (sinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
    const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - sinceLast);
    return res.status(429).json({ error: `Please wait ${wait}s before resending`, retryAfterSeconds: wait });
  }

  const prevLastOtpSentAt = bill.lastOtpSentAt;
  const code = generateOtp();
  bill.otpCodeHash = await hashOtp(code);
  bill.otpExpiresAt = otpExpiry();
  bill.otpAttempts = 0;
  bill.otpResendCount += 1;
  bill.lastOtpSentAt = new Date();
  bill.status = 'pending_otp';
  await bill.save();

  try {
    await sendSms(bill.customerMobile, collectionOtpMessage(code, bill.totalAmount));
  } catch (err) {
    // A failed send must not cost the biller a resend or restart the cooldown.
    bill.otpResendCount -= 1;
    bill.lastOtpSentAt = prevLastOtpSentAt;
    await bill.save().catch(() => {});
    console.error('[event-otp] resend SMS failed:', err.message);
    return res.status(502).json({ error: 'Could not send OTP SMS — please try again' });
  }

  const event = await Event.findById(bill.event).select('name venue');
  res.json({ bill: billView(bill, event), otpSentTo: maskMobile(bill.customerMobile) });
});

/** Verify the OTP the biller got verbally from the customer. Numbers the bill. */
router.post('/bills/:billId/verify', requireAuth('collector', 'admin'), async (req, res) => {
  const otp = String((req.body || {}).otp || '').trim();
  const bill = await loadOwnBill(req);
  const event = await Event.findById(bill.event).select('name venue');

  if (bill.status === 'verified') return res.json({ bill: billView(bill, event), verified: true }); // idempotent
  if (bill.status === 'cancelled') return res.status(400).json({ error: 'This bill was cancelled — start a new one' });
  if (bill.status === 'failed') {
    return res.status(400).json({
      error:
        bill.otpAttempts >= OTP_MAX_ATTEMPTS
          ? 'This bill is locked after too many wrong attempts — resend OTP or start again'
          : 'The OTP was not delivered — tap Resend OTP',
    });
  }
  if (bill.otpExpiresAt < new Date()) {
    if (bill.status !== 'expired') {
      bill.status = 'expired';
      await bill.save();
    }
    return res.status(400).json({ error: 'OTP has expired — please resend', expired: true, bill: billView(bill, event) });
  }
  if (!isValidOtp(otp)) return res.status(400).json({ error: `Enter the ${OTP_LENGTH}-digit OTP` });

  const ok = await checkOtp(otp, bill.otpCodeHash);
  if (!ok) {
    bill.otpAttempts += 1;
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - bill.otpAttempts);
    if (attemptsLeft === 0) bill.status = 'failed';
    await bill.save();
    return res.status(400).json({
      error:
        attemptsLeft > 0
          ? `Incorrect OTP — ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left`
          : 'Incorrect OTP — bill locked. Resend OTP to try again.',
      attemptsLeft,
      locked: attemptsLeft === 0,
    });
  }

  const seq = await Event.findByIdAndUpdate(bill.event, { $inc: { billSeq: 1 } }, { new: true, projection: { billSeq: 1 } });
  bill.billNo = seq.billSeq;
  bill.status = 'verified';
  bill.verifiedAt = new Date();
  try {
    await bill.save();
  } catch (err) {
    // A parallel request (double tap) verified it first — report that result.
    if (err.name === 'VersionError') {
      const fresh = await EventBill.findById(bill._id);
      if (fresh?.status === 'verified') return res.json({ bill: billView(fresh, event), verified: true });
    }
    throw err;
  }

  res.json({ bill: billView(bill, event), verified: true });
});

/** Abandon an unverified bill. Its screenshot stays on record but can be used again. */
router.post('/bills/:billId/cancel', requireAuth('collector', 'admin'), async (req, res) => {
  const bill = await loadOwnBill(req);
  if (!['pending_otp', 'expired', 'failed'].includes(bill.status)) {
    return res.status(400).json({ error: `Cannot cancel a ${bill.status} bill` });
  }
  bill.status = 'cancelled';
  await bill.save();
  res.json({ bill: billView(bill) });
});

/** The stored UPI screenshot, served from the database. */
router.get('/bills/:billId/screenshot', requireAuth('admin', 'collector'), async (req, res) => {
  const bill = await loadViewableBill(req);
  if (!bill.screenshot) return res.status(404).json({ error: 'This bill has no screenshot' });
  const shot = await EventAttachment.findById(bill.screenshot).select('+data');
  if (!shot) return res.status(404).json({ error: 'Screenshot not found' });
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[shot.contentType];
  res.setHeader('Content-Type', shot.contentType);
  res.setHeader('Content-Disposition', `inline; filename="upi-${billLabelOf(bill)}.${ext}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(shot.data);
});

/** Customer mini bill PDF (verified bills only). */
router.get('/bills/:billId/bill.pdf', requireAuth('admin', 'collector'), async (req, res) => {
  const bill = await loadViewableBill(req);
  if (bill.status !== 'verified') {
    return res.status(400).json({ error: 'The bill is only available once the customer has confirmed the OTP' });
  }
  const event = await Event.findById(bill.event).select('name venue');
  const pdf = await eventBillPdf(bill, event);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="bill-${slug(event?.name)}-${billLabelOf(bill)}.pdf"`);
  res.send(pdf);
});

/**
 * Raise a mini bill and send the OTP to the CUSTOMER's mobile. The collector
 * sends quantities only — every price comes from the admin's item list. A UPI
 * bill must carry its payment screenshot, and the bill and screenshot are
 * saved together before any SMS goes out, so neither can exist without the other.
 */
router.post('/:id/bills', requireAuth('collector', 'admin'), billOtpLimiter, customerOtpLimiter, async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && !event.billers.some((id) => id.equals(req.user.id))) {
    return res.status(403).json({ error: 'You are not assigned to bill at this event' });
  }
  if (event.status !== 'open') return res.status(400).json({ error: 'This event is closed — billing has stopped' });

  const body = req.body || {};
  const customerName = String(body.customerName || '').trim().replace(/\s+/g, ' ');
  if (customerName.length < 2) return res.status(400).json({ error: "Enter the customer's name" });
  if (customerName.length > 80) return res.status(400).json({ error: 'Customer name is too long' });
  const customerMobile = normalizeMobile(body.customerMobile);
  if (!/^[6-9]\d{9}$/.test(customerMobile)) {
    return res.status(400).json({ error: "Enter the customer's 10-digit mobile number — the OTP goes there" });
  }

  const qtyByItem = new Map();
  for (const raw of Array.isArray(body.items) ? body.items : []) {
    const q = Number(raw?.quantity);
    if (!q) continue; // blank/zero rows are items the customer didn't buy
    if (!Number.isInteger(q) || q < 0 || q > MAX_QTY_PER_LINE) {
      return res.status(400).json({ error: 'Quantities must be whole numbers' });
    }
    if (!isId(raw.itemId)) return res.status(400).json({ error: 'Unknown item — refresh and try again' });
    qtyByItem.set(String(raw.itemId), (qtyByItem.get(String(raw.itemId)) || 0) + q);
  }
  if (!qtyByItem.size) return res.status(400).json({ error: 'Enter the quantity for at least one item' });

  const positions = new Map((await stockPositions(event)).map((p) => [String(p.id), p]));
  const lines = [];
  for (const [itemId, quantity] of qtyByItem) {
    const item = event.items.id(itemId);
    if (!item || !item.isActive) {
      return res.status(400).json({ error: 'An item on this bill is no longer on sale — refresh and try again' });
    }
    const available = Math.max(0, positions.get(itemId)?.available ?? 0);
    if (quantity > available) {
      return res.status(400).json({
        error: available
          ? `Only ${available} × ${item.name} left in stock`
          : `${item.name} is out of stock — ask the stock keeper to add stock`,
      });
    }
    lines.push({ item: item._id, name: item.name, price: item.price, quantity, amount: round2(item.price * quantity) });
  }
  const totalAmount = round2(lines.reduce((s, l) => s + l.amount, 0));
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);

  const paymentMode = String(body.paymentMode || '');
  if (!PAYMENT_MODES.includes(paymentMode)) {
    return res.status(400).json({ error: 'Choose how the customer paid — cash or UPI' });
  }

  let upiRef = '';
  let shot = null;
  if (paymentMode === 'upi') {
    upiRef = String(body.upiRef || '').replace(/\s+/g, '').toUpperCase().slice(0, 40);
    if (upiRef && !/^[A-Z0-9-]{4,40}$/.test(upiRef)) {
      return res.status(400).json({ error: 'UPI reference should be the letters and numbers from the payment' });
    }
    shot = decodeScreenshot(body.screenshot);

    // One UPI payment can only ever pay for one bill — anywhere, at any event.
    const reused = await EventBill.findOne({ screenshotHash: shot.sha256, status: { $ne: 'cancelled' } }).select('billNo biller status');
    if (reused) {
      const mine = String(reused.biller) === req.user.id && reused.status !== 'verified';
      return res.status(409).json({
        error: `This screenshot is already attached to bill ${billLabelOf(reused)} — each UPI payment needs its own screenshot.${
          mine ? ' If that bill was a mistake, cancel it under Recent bills first.' : ''
        }`,
      });
    }
    if (upiRef) {
      const sameRef = await EventBill.findOne({ upiRef, status: { $ne: 'cancelled' } }).select('billNo');
      if (sameRef) {
        return res.status(409).json({ error: `UPI reference ${upiRef} is already used on bill ${billLabelOf(sameRef)}` });
      }
    }
  }

  const billId = new mongoose.Types.ObjectId();
  const shotDoc = shot
    ? await EventAttachment.create({ ...shot, bill: billId, event: event._id, uploadedBy: req.user.id })
    : null;

  const code = generateOtp();
  let bill;
  try {
    bill = await EventBill.create({
      _id: billId,
      event: event._id,
      biller: req.user.id,
      billerModel: isAdmin ? 'Admin' : 'Collector',
      billerName: actorName(req.user),
      customerName,
      customerMobile,
      lines,
      totalQuantity,
      totalAmount,
      paymentMode,
      upiRef,
      screenshot: shotDoc?._id || null,
      screenshotHash: shot?.sha256 || '',
      otpCodeHash: await hashOtp(code),
      otpExpiresAt: otpExpiry(),
      lastOtpSentAt: new Date(),
      status: 'pending_otp',
      collectorIp: req.ip || '',
      deviceInfo: (req.get('user-agent') || '').slice(0, 300),
    });
  } catch (err) {
    // The bill never existed, so its screenshot must not linger. Native delete:
    // the model blocks every query-level delete of a stored screenshot.
    if (shotDoc) await EventAttachment.collection.deleteOne({ _id: shotDoc._id }).catch(() => {});
    throw err;
  }

  try {
    await sendSms(customerMobile, collectionOtpMessage(code, totalAmount));
  } catch (err) {
    bill.status = 'failed';
    bill.notifyError = `otp-sms: ${err.message}`;
    await bill.save();
    console.error('[event-otp] SMS send failed:', err.message);
    // The bill (and screenshot) are safely stored — the biller can resend from the OTP screen.
    return res.status(502).json({
      error: 'Could not send the OTP SMS to the customer. The bill and screenshot are saved — tap Resend OTP.',
      bill: billView(bill, event),
    });
  }

  res.status(201).json({
    bill: billView(bill, event),
    otpSentTo: maskMobile(customerMobile),
    message: `OTP sent to ${customerName}'s mobile — ask them for the ${OTP_LENGTH}-digit code.`,
  });
});

async function loadStockEvent(req) {
  const event = await Event.findById(req.params.id);
  if (!event) throw httpError(404, 'Event not found');
  if (req.user.role !== 'admin' && String(event.stockKeeper) !== req.user.id) {
    throw httpError(403, 'You are not the stock keeper for this event');
  }
  return event;
}

/** Stock position and the latest ledger entries (stock keeper or admin). */
router.get('/:id/stock', requireAuth('receiver', 'admin'), async (req, res) => {
  const event = await loadStockEvent(req);
  const [items, entries] = await Promise.all([
    stockPositions(event),
    EventStockEntry.find({ event: event._id }).sort({ createdAt: -1 }).limit(200),
  ]);
  res.json({ event: fieldEventView(event, items), entries: entries.map(entryView) });
});

/** Stock keeper (or an admin) records stock arriving at (in) or leaving (out) the event. */
router.post('/:id/stock', requireAuth('receiver', 'admin'), async (req, res) => {
  const event = await loadStockEvent(req);
  if (event.status !== 'open') return res.status(400).json({ error: 'This event is closed — stock can no longer be changed' });

  const { itemId, kind, quantity, note } = req.body || {};
  const item = isId(itemId) ? event.items.id(itemId) : null;
  if (!item) return res.status(400).json({ error: 'Select an item from this event' });
  if (!['in', 'out'].includes(kind)) return res.status(400).json({ error: 'Choose stock in or stock out' });
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'Quantity must be a whole number of at least 1' });
  if (qty > 1000000) return res.status(400).json({ error: 'Quantity looks too large — please check' });
  const cleanNote = String(note || '').trim().slice(0, 200);

  if (kind === 'in' && !item.isActive) {
    return res.status(400).json({ error: `${item.name} is no longer on sale at this event` });
  }
  if (kind === 'out') {
    if (!cleanNote) return res.status(400).json({ error: 'Add a note saying why stock is going out (returned, damaged…)' });
    const pos = (await stockPositions(event)).find((p) => p.id.equals(item._id));
    if (qty > pos.available) {
      return res.status(400).json({ error: `Only ${Math.max(0, pos.available)} × ${item.name} in stock — cannot take out ${qty}` });
    }
  }

  const entry = await EventStockEntry.create({
    event: event._id,
    item: item._id,
    itemName: item.name,
    kind,
    quantity: qty,
    note: cleanNote,
    enteredBy: req.user.id,
    enteredByModel: req.user.role === 'admin' ? 'Admin' : 'Receiver',
    enteredByName: actorName(req.user),
  });
  res.status(201).json({ entry: entryView(entry), items: await stockPositions(event) });
});

// ----------------------------------------------------------------- admin ---

router.get('/', requireAuth('admin'), async (_req, res) => {
  const events = await populateForAdmin(Event.find().sort({ createdAt: -1 }));
  const summaries = await eventSummaries(events.map((e) => e._id));
  const out = events.map((e) => adminEventView(e, summaries.get(String(e._id))));
  // Open events first; newest first within each group (sort is stable).
  out.sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));
  res.json({ events: out });
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const event = new Event({ status: 'open' });
  await applyEventFields(event, req.body);
  await event.save();
  const saved = await populateForAdmin(Event.findById(event._id));
  res.status(201).json({ event: adminEventView(saved) });
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  await applyEventFields(event, req.body);
  await event.save();
  const saved = await populateForAdmin(Event.findById(event._id));
  const summaries = await eventSummaries([event._id]);
  res.json({ event: adminEventView(saved, summaries.get(String(event._id))) });
});

/** Whole-event report as JSON (admin screen), PDF or CSV. */
router.get('/:id/report', requireAuth('admin'), async (req, res) => {
  const report = await buildEventReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Event not found' });
  const format = req.query.format || 'json';
  if (format === 'json') return res.json({ report });

  const name = `event-${slug(report.event.name)}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'pdf') {
    const pdf = await eventReportPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
    return res.send(pdf);
  }

  if (format === 'csv') {
    // One row per verified bill, one quantity column per item — pivots cleanly in Excel.
    const items = report.event.items;
    const soldById = new Map(report.items.map((i) => [String(i.id), i.sold]));
    const rows = report.bills.map((b) => {
      const qty = new Map(b.lines.map((l) => [String(l.item), l.quantity]));
      return [
        b.billLabel,
        formatDateTime(b.date),
        b.customerName,
        b.customerMobile,
        ...items.map((i) => qty.get(String(i.id)) || ''),
        b.totalQuantity,
        b.totalAmount.toFixed(2),
        b.paymentMode === 'upi' ? 'UPI' : 'Cash',
        b.upiRef,
        b.hasScreenshot ? 'yes' : '',
        b.billerName,
        b.ref,
      ];
    });
    const t = report.totals;
    rows.push([
      'TOTAL',
      '',
      `${t.bills} bills`,
      '',
      ...items.map((i) => soldById.get(String(i.id)) || 0),
      t.quantity,
      t.amount.toFixed(2),
      `Cash ${t.cash.toFixed(2)} / UPI ${t.upi.toFixed(2)}`,
      '',
      '',
      '',
      '',
    ]);
    const csv = toCsv(
      [
        'Bill No',
        'Date',
        'Customer',
        'Mobile',
        ...items.map((i) => `${i.name} (qty)`),
        'Total Qty',
        'Amount (INR)',
        'Payment',
        'UPI Ref',
        'Screenshot',
        'Billed By',
        'Ref',
      ],
      rows
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(csv);
  }

  res.status(400).json({ error: 'format must be json, csv or pdf' });
});

/**
 * Every stored UPI screenshot as one printable PDF — whole event or one day
 * (?date=YYYY-MM-DD) — split into parts of SCREENSHOTS_PER_PDF (?part=2…).
 */
router.get('/:id/screenshots.pdf', requireAuth('admin'), async (req, res) => {
  const event = await Event.findById(req.params.id).select('name venue');
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const date = req.query.date ? String(req.query.date) : '';
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  const part = Math.max(1, Math.floor(Number(req.query.part) || 1));

  const filter = { event: event._id, status: 'verified', paymentMode: 'upi', screenshot: { $ne: null } };
  if (date) {
    const { start, end } = dayRange(date);
    filter.verifiedAt = { $gte: start, $lt: end };
  }
  const total = await EventBill.countDocuments(filter);
  const parts = Math.max(1, Math.ceil(total / SCREENSHOTS_PER_PDF));
  const bills = await EventBill.find(filter)
    .sort({ verifiedAt: 1 })
    .skip((part - 1) * SCREENSHOTS_PER_PDF)
    .limit(SCREENSHOTS_PER_PDF);

  const shotOf = new Map(bills.map((b) => [String(b._id), b.screenshot]));
  const loadBatch = async (billIds) => {
    const shots = await EventAttachment.find({ _id: { $in: billIds.map((id) => shotOf.get(String(id))) } }).select('+data');
    return new Map(shots.map((s) => [String(s.bill), { data: s.data, contentType: s.contentType, sha256: s.sha256 }]));
  };

  const first = (part - 1) * SCREENSHOTS_PER_PDF + 1;
  const pdf = await eventScreenshotsPdf({
    event,
    subtitle: `${date ? formatDate(dayRange(date).start) : 'Whole event'} • ${total} screenshot${total === 1 ? '' : 's'}${
      parts > 1 ? ` • part ${part} of ${parts}` : ''
    }`,
    note: parts > 1 ? `This file holds screenshots ${first}–${Math.min(first + bills.length - 1, total)} of ${total}.` : null,
    bills: bills.map(billRow),
    loadBatch,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="upi-screenshots-${slug(event.name)}${date ? `-${date}` : ''}${parts > 1 ? `-part${part}` : ''}.pdf"`
  );
  res.send(pdf);
});

export default router;

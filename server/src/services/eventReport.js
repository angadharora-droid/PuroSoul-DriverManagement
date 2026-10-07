import Event from '../models/Event.js';
import EventBill from '../models/EventBill.js';
import EventStockEntry from '../models/EventStockEntry.js';
import { dayRange, formatDate } from '../utils/format.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** IST calendar day (YYYY-MM-DD) a timestamp falls on. */
export function istDay(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** "2 × 1L Bottle, 1 × 20L Jar" */
export function linesLabel(lines) {
  return (lines || []).map((l) => `${l.quantity} × ${l.name}`).join(', ');
}

/**
 * Per-item stock position for an event:
 *   stockIn / stockOut — the stock keeper's ledger
 *   sold               — quantities on verified bills
 *   reserved           — quantities on bills still waiting on a live OTP
 *   remaining          — stockIn − stockOut − sold (what should physically be left)
 *   available          — remaining − reserved (what can still be billed)
 */
export async function stockPositions(event) {
  const [ledger, sold, reserved] = await Promise.all([
    EventStockEntry.aggregate([
      { $match: { event: event._id } },
      { $group: { _id: { item: '$item', kind: '$kind' }, qty: { $sum: '$quantity' } } },
    ]),
    EventBill.aggregate([
      { $match: { event: event._id, status: 'verified' } },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.item', qty: { $sum: '$lines.quantity' }, amount: { $sum: '$lines.amount' } } },
    ]),
    EventBill.aggregate([
      { $match: { event: event._id, status: 'pending_otp', otpExpiresAt: { $gt: new Date() } } },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.item', qty: { $sum: '$lines.quantity' } } },
    ]),
  ]);

  const key = (id) => String(id);
  const inMap = new Map();
  const outMap = new Map();
  for (const row of ledger) (row._id.kind === 'in' ? inMap : outMap).set(key(row._id.item), row.qty);
  const soldMap = new Map(sold.map((r) => [key(r._id), r]));
  const reservedMap = new Map(reserved.map((r) => [key(r._id), r.qty]));

  return event.items.map((it) => {
    const id = key(it._id);
    const stockIn = inMap.get(id) || 0;
    const stockOut = outMap.get(id) || 0;
    const soldQty = soldMap.get(id)?.qty || 0;
    const reservedQty = reservedMap.get(id) || 0;
    const remaining = stockIn - stockOut - soldQty;
    return {
      id: it._id,
      name: it.name,
      price: it.price,
      isActive: it.isActive,
      stockIn,
      stockOut,
      sold: soldQty,
      salesAmount: round2(soldMap.get(id)?.amount || 0),
      reserved: reservedQty,
      remaining,
      available: remaining - reservedQty,
    };
  });
}

/** Verified-sales headline numbers per event, keyed by event id — for the admin's event list. */
export async function eventSummaries(eventIds) {
  const rows = await EventBill.aggregate([
    { $match: { event: { $in: eventIds }, status: 'verified' } },
    {
      $group: {
        _id: '$event',
        amount: { $sum: '$totalAmount' },
        bills: { $sum: 1 },
        quantity: { $sum: '$totalQuantity' },
        cash: { $sum: { $cond: [{ $eq: ['$paymentMode', 'cash'] }, '$totalAmount', 0] } },
        upi: { $sum: { $cond: [{ $eq: ['$paymentMode', 'upi'] }, '$totalAmount', 0] } },
      },
    },
  ]);
  return new Map(
    rows.map((r) => [
      String(r._id),
      { amount: round2(r.amount), bills: r.bills, quantity: r.quantity, cash: round2(r.cash), upi: round2(r.upi) },
    ])
  );
}

/** A bill as it appears in reports, CSV and PDFs. */
export function billRow(b) {
  return {
    id: b._id,
    ref: b.ref,
    billNo: b.billNo,
    billLabel: b.billLabel,
    status: b.status,
    date: b.verifiedAt || b.createdAt,
    createdAt: b.createdAt,
    verifiedAt: b.verifiedAt,
    customerName: b.customerName,
    customerMobile: b.customerMobile,
    lines: b.lines.map((l) => ({ item: l.item, name: l.name, price: l.price, quantity: l.quantity, amount: l.amount })),
    itemsLabel: linesLabel(b.lines),
    totalQuantity: b.totalQuantity,
    totalAmount: b.totalAmount,
    paymentMode: b.paymentMode,
    upiRef: b.upiRef,
    hasScreenshot: Boolean(b.screenshot),
    screenshotHash: b.screenshotHash,
    receiverName: b.receiverName,
  };
}

function emptyBucket(extra = {}) {
  return { bills: 0, quantity: 0, amount: 0, cash: 0, upi: 0, cashBills: 0, upiBills: 0, ...extra };
}

function addToBucket(bucket, b) {
  bucket.bills += 1;
  bucket.quantity += b.totalQuantity;
  bucket.amount = round2(bucket.amount + b.totalAmount);
  if (b.paymentMode === 'upi') {
    bucket.upi = round2(bucket.upi + b.totalAmount);
    bucket.upiBills += 1;
  } else {
    bucket.cash = round2(bucket.cash + b.totalAmount);
    bucket.cashBills += 1;
  }
}

/**
 * Full event report — one shape for the admin screen, the PDF and the CSV.
 * Money totals count verified bills only; everything else is listed separately
 * for audit. Stock is the live, whole-event position.
 */
export async function buildEventReport(eventId) {
  const event = await Event.findById(eventId)
    .populate('billers', 'name designation mobile isActive passwordHash')
    .populate('stockKeeper', 'name designation mobile isActive');
  if (!event) return null;

  const [items, verified, others, statusAgg, entries] = await Promise.all([
    stockPositions(event),
    EventBill.find({ event: event._id, status: 'verified' }).sort({ verifiedAt: 1 }).limit(20000),
    EventBill.find({ event: event._id, status: { $ne: 'verified' } }).sort({ createdAt: -1 }).limit(1000),
    EventBill.aggregate([
      { $match: { event: event._id } },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } },
    ]),
    EventStockEntry.find({ event: event._id }).sort({ createdAt: 1 }).limit(20000),
  ]);

  const totals = emptyBucket();
  const byReceiver = new Map();
  const byDay = new Map();
  for (const b of verified) {
    addToBucket(totals, b);

    const rKey = String(b.receiver);
    if (!byReceiver.has(rKey)) byReceiver.set(rKey, emptyBucket({ name: b.receiverName }));
    addToBucket(byReceiver.get(rKey), b);

    const day = istDay(b.verifiedAt);
    if (!byDay.has(day)) byDay.set(day, emptyBucket({ date: day, label: formatDate(dayRange(day).start), screenshots: 0 }));
    const d = byDay.get(day);
    addToBucket(d, b);
    if (b.paymentMode === 'upi' && b.screenshot) d.screenshots += 1;
  }

  const stock = items.reduce(
    (s, i) => ({ stockIn: s.stockIn + i.stockIn, stockOut: s.stockOut + i.stockOut, remaining: s.remaining + i.remaining }),
    { stockIn: 0, stockOut: 0, remaining: 0 }
  );

  return {
    event: {
      id: event._id,
      name: event.name,
      venue: event.venue,
      startDate: event.startDate,
      endDate: event.endDate,
      status: event.status,
      notes: event.notes,
      items: event.items.map((i) => ({ id: i._id, name: i.name, price: i.price, isActive: i.isActive })),
      billers: event.billers.map((r) => ({
        id: r._id,
        name: r.name,
        designation: r.designation,
        isActive: r.isActive,
        canLogIn: Boolean(r.passwordHash),
      })),
      stockKeeper: event.stockKeeper
        ? { id: event.stockKeeper._id, name: event.stockKeeper.name, isActive: event.stockKeeper.isActive }
        : null,
      createdAt: event.createdAt,
    },
    generatedAt: new Date(),
    totals,
    stock,
    items,
    receivers: [...byReceiver.values()].sort((a, b) => b.amount - a.amount),
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    bills: verified.map(billRow),
    otherBills: others.map(billRow),
    statusCounts: Object.fromEntries(statusAgg.map((s) => [s._id, { count: s.count, amount: round2(s.amount) }])),
    stockEntries: entries.map((e) => ({
      id: e._id,
      date: e.createdAt,
      item: e.item,
      itemName: e.itemName,
      kind: e.kind,
      quantity: e.quantity,
      note: e.note,
      enteredByName: e.enteredByName,
    })),
  };
}

/** Verified event sales on one IST day, per event — for the day-end email. */
export async function eventDaySummary(date) {
  const { start, end } = dayRange(date);
  const rows = await EventBill.aggregate([
    { $match: { status: 'verified', verifiedAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: '$event',
        bills: { $sum: 1 },
        quantity: { $sum: '$totalQuantity' },
        amount: { $sum: '$totalAmount' },
        cash: { $sum: { $cond: [{ $eq: ['$paymentMode', 'cash'] }, '$totalAmount', 0] } },
        upi: { $sum: { $cond: [{ $eq: ['$paymentMode', 'upi'] }, '$totalAmount', 0] } },
      },
    },
  ]);
  if (!rows.length) return { events: [], amount: 0, bills: 0 };

  const names = new Map(
    (await Event.find({ _id: { $in: rows.map((r) => r._id) } }).select('name')).map((e) => [String(e._id), e.name])
  );
  const events = rows
    .map((r) => ({
      name: names.get(String(r._id)) || '—',
      bills: r.bills,
      quantity: r.quantity,
      amount: round2(r.amount),
      cash: round2(r.cash),
      upi: round2(r.upi),
    }))
    .sort((a, b) => b.amount - a.amount);
  return {
    events,
    amount: round2(events.reduce((s, e) => s + e.amount, 0)),
    bills: events.reduce((s, e) => s + e.bills, 0),
  };
}

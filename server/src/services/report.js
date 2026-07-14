import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import { dayRange, dateRange, formatINR, formatDate } from '../utils/format.js';

export function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

/**
 * Builds the uniform report shape used by the JSON view, CSV and PDF exports
 * and the day-end email. Only verified transactions count toward totals; other
 * statuses are reported separately in statusCounts for audit.
 */
export async function buildReport(query) {
  const type = query.type || 'custom';
  const match = {};

  let periodLabel;
  if (type === 'daily') {
    const date = query.date || todayIST();
    const { start, end } = dayRange(date);
    match.createdAt = { $gte: start, $lt: end };
    periodLabel = formatDate(start);
  } else {
    const { start, end } = dateRange(query.from, query.to);
    if (start || end) match.createdAt = { ...(start && { $gte: start }), ...(end && { $lt: end }) };
    periodLabel =
      query.from || query.to
        ? `${query.from ? formatDate(dateRange(query.from).start) : 'beginning'} to ${query.to ? formatDate(new Date(dateRange(undefined, query.to).end - 1)) : 'today'}`
        : 'All time';
  }

  if (query.partyId && mongoose.isValidObjectId(query.partyId)) match.party = new mongoose.Types.ObjectId(query.partyId);
  if (query.driverId && mongoose.isValidObjectId(query.driverId)) match.driver = new mongoose.Types.ObjectId(query.driverId);

  const [txns, statusAgg] = await Promise.all([
    Transaction.find({ ...match, status: 'verified' })
      .sort({ createdAt: 1 })
      .limit(10000)
      .populate('party', 'name')
      .populate('driver', 'name'),
    Transaction.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
  ]);

  const statusCounts = Object.fromEntries(statusAgg.map((s) => [s._id, { count: s.count, amount: s.amount }]));

  const toRow = (t) => ({
    id: t._id,
    date: t.createdAt,
    ref: t.ref,
    party: t.party?.name || '—',
    driver: t.driver?.name || '—',
    amount: t.amount,
  });

  const groupBy = { daily: (t) => t.driver?.name || '—', party: (t) => t.party?.name || '—', driver: (t) => t.driver?.name || '—', custom: () => 'All transactions' }[type] || (() => 'All transactions');

  const groupsMap = new Map();
  for (const t of txns) {
    const key = groupBy(t);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(t);
  }

  const groups = [...groupsMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, list]) => {
      const group = {
        label,
        rows: list.map(toRow),
        subtotal: list.reduce((s, t) => s + t.amount, 0),
        count: list.length,
      };
      // Driver report: per-party breakdown inside each driver group.
      if (type === 'driver') {
        const byParty = new Map();
        for (const t of list) {
          const p = t.party?.name || '—';
          byParty.set(p, (byParty.get(p) || 0) + t.amount);
        }
        group.breakdown = [...byParty.entries()].map(([p, amt]) => `${p}: ${formatINR(amt)}`).join('  •  ');
      }
      return group;
    });

  const titles = {
    daily: `Daily Collection Report — ${periodLabel}`,
    party: 'Collections by Party',
    driver: 'Collections by Driver',
    custom: 'Collection Report',
  };

  return {
    type,
    title: titles[type] || titles.custom,
    subtitle: `Period: ${periodLabel} • Verified collections only`,
    periodLabel,
    groups,
    grandTotal: txns.reduce((s, t) => s + t.amount, 0),
    grandCount: txns.length,
    statusCounts,
  };
}

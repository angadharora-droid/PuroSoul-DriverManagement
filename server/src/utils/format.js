const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Rs. 1,23,456.00" — PDF standard fonts have no ₹ glyph, so use "Rs." outside the web UI. */
export function formatINR(amount) {
  return `Rs. ${inr.format(Number(amount) || 0)}`;
}

export function maskMobile(mobile) {
  const m = String(mobile || '');
  return m.length >= 4 ? `••••••${m.slice(-4)}` : '••••';
}

const TZ_OFFSET = process.env.APP_TZ_OFFSET || '+05:30';

/** Day boundaries for a YYYY-MM-DD string in the app timezone (default IST). */
export function dayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00${TZ_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Inclusive from / exclusive to for a YYYY-MM-DD range in the app timezone. */
export function dateRange(fromStr, toStr) {
  const range = {};
  if (fromStr) range.start = new Date(`${fromStr}T00:00:00${TZ_OFFSET}`);
  if (toStr) range.end = new Date(new Date(`${toStr}T00:00:00${TZ_OFFSET}`).getTime() + 24 * 60 * 60 * 1000);
  return range;
}

export function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

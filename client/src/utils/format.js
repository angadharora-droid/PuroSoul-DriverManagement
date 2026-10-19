const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

export function formatINR(amount) {
  return inr.format(Number(amount) || 0);
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** An event bill's date — a past entry (backdated by an admin) has a day, but no real time of day. */
export function formatBillDate(value, backdated) {
  return backdated ? formatDate(value) : formatDateTime(value);
}

/** Accepts pasted "+91 98765-43210" / "098765 43210" and keeps the bare 10 digits. */
export function cleanMobile(value) {
  let d = String(value).replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

// Event bill payment modes — must match PAYMENT_MODES in server/src/models/EventBill.js.
export const PAYMENT_LABELS = { cash: 'Cash', upi: 'UPI', credit: 'Credit' };
export const PAYMENT_ICONS = { cash: 'banknotes', upi: 'phone', credit: 'clock' };

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Digits in an OTP — must match the server's OTP_LENGTH (server/src/utils/otp.js).
export const OTP_LENGTH = 4;

export const STATUS_LABELS = {
  pending_otp: 'Awaiting OTP',
  verified: 'Verified',
  expired: 'Expired',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

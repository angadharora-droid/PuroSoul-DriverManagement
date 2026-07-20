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

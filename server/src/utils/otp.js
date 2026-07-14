import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES) || 5;
export const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 3;
export const OTP_MAX_RESENDS = Number(process.env.OTP_MAX_RESENDS) || 3;
export const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 60;

export function generateOtp() {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits, crypto-strong
}

export function hashOtp(code) {
  return bcrypt.hash(code, 10);
}

export function checkOtp(code, hash) {
  return bcrypt.compare(code, hash);
}

export function otpExpiry() {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
}

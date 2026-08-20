import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Collector from '../models/Collector.js';
import Receiver from '../models/Receiver.js';
import Admin from '../models/Admin.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { passwordPolicyError } from '../utils/password.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again in a few minutes' },
});

router.post('/collector/login', loginLimiter, async (req, res) => {
  const { mobile, password } = req.body || {};
  if (!mobile || !password) return res.status(400).json({ error: 'Mobile and password are required' });

  const collector = await Collector.findOne({ mobile: String(mobile).trim() });
  const ok = collector && collector.isActive && (await collector.verifyPassword(String(password)));
  if (!ok) return res.status(401).json({ error: 'Invalid mobile number or password' });

  res.json({
    token: signToken(collector, 'collector'),
    // designation is deliberately not returned: it is for the receiver (in the
    // handover OTP) and for admins, not for the collector's own screens.
    user: { id: collector._id, name: collector.name, role: 'collector', mobile: collector.mobile },
  });
});

/** Receiver login — only receivers an admin has granted a password to (canCollect) can sign in. */
router.post('/receiver/login', loginLimiter, async (req, res) => {
  const { mobile, password } = req.body || {};
  if (!mobile || !password) return res.status(400).json({ error: 'Mobile and password are required' });

  const receiver = await Receiver.findOne({ mobile: String(mobile).trim() });
  const ok = receiver && receiver.isActive && receiver.passwordHash && (await receiver.verifyPassword(String(password)));
  if (!ok) return res.status(401).json({ error: 'Invalid mobile number or password' });

  res.json({
    token: signToken(receiver, 'receiver'),
    user: { id: receiver._id, name: receiver.name, role: 'receiver', mobile: receiver.mobile },
  });
});

router.post('/admin/login', loginLimiter, async (req, res) => {
  const { identifier, email, password } = req.body || {};
  const rawId = identifier ?? email; // `email` accepted for older clients
  if (!rawId || !password) return res.status(400).json({ error: 'Email/phone and password are required' });

  const raw = String(rawId).trim();
  let admin = null;
  if (raw.includes('@')) {
    admin = await Admin.findOne({ email: raw.toLowerCase() });
  } else {
    // Phone sign-in is admins-only. Compare the last 10 digits so formatting
    // and a country code ("+91 98765-43210") still match a stored mobile. The
    // length guard also keeps a digit-less identifier from matching the
    // schema's default empty mobile.
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 10) admin = await Admin.findOne({ mobile: digits.slice(-10) });
  }
  const ok = admin && admin.isActive && (await admin.verifyPassword(String(password)));
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({
    token: signToken(admin, 'admin'),
    user: { id: admin._id, name: admin.name, role: 'admin', email: admin.email },
  });
});

router.get('/me', requireAuth(), (req, res) => {
  // Explicit shape — req.user also carries the collector's designation, which
  // is meant for the receiver and for admins, never for the collector's own UI.
  const { id, name, role } = req.user;
  res.json({ user: { id, name, role } });
});

// Abuse guard: at most 10 password-change attempts per account per 15 minutes.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `pwd:${req.user.id}`,
  validate: false,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts — please wait a few minutes' },
});

/** Self-service password change for the logged-in account (collector, receiver, or admin). */
router.post('/change-password', requireAuth('collector', 'receiver', 'admin'), changePasswordLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  const policyError = passwordPolicyError(newPassword, req.user.role);
  if (policyError) return res.status(400).json({ error: policyError });
  if (String(newPassword) === String(currentPassword)) {
    return res.status(400).json({ error: 'New password must be different from the current one' });
  }

  const Model = req.user.role === 'collector' ? Collector : req.user.role === 'receiver' ? Receiver : Admin;
  const account = await Model.findById(req.user.id);
  // 400 (not 401) on a wrong current password — a 401 makes the client log out.
  if (!(await account.verifyPassword(String(currentPassword)))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  await account.setPassword(String(newPassword));
  await account.save();
  res.json({ ok: true });
});

export default router;

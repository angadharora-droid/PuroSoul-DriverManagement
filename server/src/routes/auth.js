import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Driver from '../models/Driver.js';
import Admin from '../models/Admin.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again in a few minutes' },
});

router.post('/driver/login', loginLimiter, async (req, res) => {
  const { mobile, password } = req.body || {};
  if (!mobile || !password) return res.status(400).json({ error: 'Mobile and password are required' });

  const driver = await Driver.findOne({ mobile: String(mobile).trim() });
  const ok = driver && driver.isActive && (await driver.verifyPassword(String(password)));
  if (!ok) return res.status(401).json({ error: 'Invalid mobile number or password' });

  res.json({
    token: signToken(driver, 'driver'),
    user: { id: driver._id, name: driver.name, role: 'driver', mobile: driver.mobile },
  });
});

router.post('/admin/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const admin = await Admin.findOne({ email: String(email).trim().toLowerCase() });
  const ok = admin && admin.isActive && (await admin.verifyPassword(String(password)));
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({
    token: signToken(admin, 'admin'),
    user: { id: admin._id, name: admin.name, role: 'admin', email: admin.email },
  });
});

router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

export default router;

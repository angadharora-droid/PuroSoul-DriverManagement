import { Router } from 'express';
import Driver from '../models/Driver.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth('admin'), async (req, res) => {
  const filter = {};
  if (req.query.q) filter.name = { $regex: String(req.query.q).trim(), $options: 'i' };
  const drivers = await Driver.find(filter).sort({ name: 1 });
  res.json({ drivers });
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const { name, mobile, password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const driver = new Driver({ name, mobile });
  await driver.setPassword(String(password));
  await driver.save();
  res.status(201).json({ driver });
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const { name, mobile, isActive, password } = req.body || {};
  if (name !== undefined) driver.name = name;
  if (mobile !== undefined) driver.mobile = mobile;
  if (isActive !== undefined) driver.isActive = Boolean(isActive);
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    await driver.setPassword(String(password));
  }

  await driver.save();
  res.json({ driver });
});

export default router;

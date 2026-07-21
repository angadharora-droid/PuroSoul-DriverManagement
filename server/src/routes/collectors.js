import { Router } from 'express';
import Collector from '../models/Collector.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth('admin'), async (req, res) => {
  const filter = {};
  if (req.query.q) filter.name = { $regex: String(req.query.q).trim(), $options: 'i' };
  const collectors = await Collector.find(filter).sort({ name: 1 });
  res.json({ collectors });
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const { name, designation, mobile, password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const collector = new Collector({ name, designation, mobile });
  await collector.setPassword(String(password));
  await collector.save();
  res.status(201).json({ collector });
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const collector = await Collector.findById(req.params.id);
  if (!collector) return res.status(404).json({ error: 'Collector not found' });

  const { name, designation, mobile, isActive, password } = req.body || {};
  if (name !== undefined) collector.name = name;
  if (designation !== undefined) collector.designation = designation;
  if (mobile !== undefined) collector.mobile = mobile;
  if (isActive !== undefined) collector.isActive = Boolean(isActive);
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    await collector.setPassword(String(password));
  }

  await collector.save();
  res.json({ collector });
});

export default router;

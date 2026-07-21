import { Router } from 'express';
import Receiver from '../models/Receiver.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth('admin'), async (req, res) => {
  const filter = {};
  if (req.query.q) filter.name = { $regex: String(req.query.q).trim(), $options: 'i' };
  const receivers = await Receiver.find(filter).sort({ name: 1 });
  res.json({ receivers });
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const { name, designation, mobile } = req.body || {};
  const receiver = await Receiver.create({ name, designation, mobile });
  res.status(201).json({ receiver });
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const receiver = await Receiver.findById(req.params.id);
  if (!receiver) return res.status(404).json({ error: 'Receiver not found' });

  const { name, designation, mobile, isActive } = req.body || {};
  if (name !== undefined) receiver.name = name;
  if (designation !== undefined) receiver.designation = designation;
  if (mobile !== undefined) receiver.mobile = mobile;
  if (isActive !== undefined) receiver.isActive = Boolean(isActive);

  await receiver.save();
  res.json({ receiver });
});

export default router;

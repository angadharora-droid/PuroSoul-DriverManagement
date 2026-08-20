import { Router } from 'express';
import Receiver from '../models/Receiver.js';
import { requireAuth } from '../middleware/auth.js';
import { passwordPolicyError } from '../utils/password.js';

const router = Router();

router.get('/', requireAuth('admin'), async (req, res) => {
  const filter = {};
  if (req.query.q) filter.name = { $regex: String(req.query.q).trim(), $options: 'i' };
  const receivers = await Receiver.find(filter).sort({ name: 1 });
  res.json({ receivers });
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const { name, designation, mobile, password } = req.body || {};
  // Password is optional: a plain receiver only ever receives handovers. Set
  // it to also let this person log in and collect cash like a collector.
  if (password) {
    const policyError = passwordPolicyError(password, 'receiver');
    if (policyError) return res.status(400).json({ error: policyError });
  }
  const receiver = new Receiver({ name, designation, mobile });
  if (password) await receiver.setPassword(String(password));
  await receiver.save();
  res.status(201).json({ receiver });
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const receiver = await Receiver.findById(req.params.id);
  if (!receiver) return res.status(404).json({ error: 'Receiver not found' });

  const { name, designation, mobile, isActive, password } = req.body || {};
  if (name !== undefined) receiver.name = name;
  if (designation !== undefined) receiver.designation = designation;
  if (mobile !== undefined) receiver.mobile = mobile;
  if (isActive !== undefined) receiver.isActive = Boolean(isActive);
  if (password) {
    const policyError = passwordPolicyError(password, 'receiver');
    if (policyError) return res.status(400).json({ error: policyError });
    await receiver.setPassword(String(password));
  }

  await receiver.save();
  res.json({ receiver });
});

export default router;

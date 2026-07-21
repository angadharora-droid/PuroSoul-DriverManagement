import { Router } from 'express';
import Admin from '../models/Admin.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth('admin'), async (req, res) => {
  const admins = await Admin.find().sort({ name: 1 });
  res.json({ admins });
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const { name, designation, email, mobile, password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const admin = new Admin({ name, designation, email, mobile: mobile ? String(mobile).trim() : '' });
  await admin.setPassword(String(password));
  await admin.save();
  res.status(201).json({ admin });
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  const { name, email, mobile, isActive, password } = req.body || {};
  if (name !== undefined) admin.name = name;
  if (email !== undefined) admin.email = email;
  if (mobile !== undefined) admin.mobile = String(mobile).trim();
  if (isActive !== undefined) {
    const active = Boolean(isActive);
    if (!active && admin._id.toString() === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    if (!active && admin.isActive) {
      const others = await Admin.countDocuments({ _id: { $ne: admin._id }, isActive: true });
      if (others === 0) return res.status(400).json({ error: 'At least one active admin is required' });
    }
    admin.isActive = active;
  }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    await admin.setPassword(String(password));
  }

  await admin.save();
  res.json({ admin });
});

export default router;

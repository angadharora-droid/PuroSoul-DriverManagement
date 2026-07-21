import { Router } from 'express';
import Party from '../models/Party.js';
import { requireAuth } from '../middleware/auth.js';
import { maskMobileEnds } from '../utils/format.js';

const router = Router();

/**
 * Options for the collector's select-only dropdown. Raw mobile numbers never
 * leave the server — a party holding more than one number exposes only masked
 * labels plus the index to send to, so the collector can choose without ever
 * seeing the number itself.
 */
router.get('/options', requireAuth('collector', 'admin'), async (_req, res) => {
  const parties = await Party.find({ isActive: true }).sort({ name: 1 }).select('name distributorCode mobile altMobiles');
  res.json({
    parties: parties.map((p) => ({
      _id: p._id,
      name: p.name,
      distributorCode: p.distributorCode,
      mobileChoices: p.otpNumbers().map((m, index) => ({ index, masked: maskMobileEnds(m) })),
    })),
  });
});

// --- Admin management ---

router.get('/', requireAuth('admin'), async (req, res) => {
  const filter = {};
  if (req.query.q) filter.name = { $regex: String(req.query.q).trim(), $options: 'i' };
  const parties = await Party.find(filter).sort({ name: 1 });
  res.json({ parties });
});

router.post('/', requireAuth('admin'), async (req, res) => {
  const { name, mobile, altMobiles, notifyEmails, distributorCode } = req.body || {};
  const party = await Party.create({ name, mobile, altMobiles, notifyEmails, distributorCode });
  res.status(201).json({ party });
});

router.put('/:id', requireAuth('admin'), async (req, res) => {
  const party = await Party.findById(req.params.id);
  if (!party) return res.status(404).json({ error: 'Party not found' });

  const { name, mobile, altMobiles, notifyEmails, distributorCode, isActive } = req.body || {};
  if (name !== undefined) party.name = name;
  if (mobile !== undefined) party.mobile = mobile;
  if (altMobiles !== undefined) party.altMobiles = altMobiles;
  if (notifyEmails !== undefined) party.notifyEmails = notifyEmails;
  if (distributorCode !== undefined) party.distributorCode = distributorCode;
  if (isActive !== undefined) party.isActive = Boolean(isActive);

  await party.save();
  res.json({ party });
});

export default router;

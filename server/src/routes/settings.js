import { Router } from 'express';
import { getGlobalSettings } from '../models/Setting.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth('admin'), async (_req, res) => {
  const settings = await getGlobalSettings();
  res.json({ settings: { globalNotifyEmails: settings.globalNotifyEmails } });
});

router.put('/', requireAuth('admin'), async (req, res) => {
  const settings = await getGlobalSettings();
  if (req.body && req.body.globalNotifyEmails !== undefined) {
    settings.globalNotifyEmails = req.body.globalNotifyEmails;
  }
  await settings.save();
  res.json({ settings: { globalNotifyEmails: settings.globalNotifyEmails } });
});

export default router;

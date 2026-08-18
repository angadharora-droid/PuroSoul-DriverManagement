import { Router } from 'express';
import { getGlobalSettings } from '../models/Setting.js';
import { requireAuth } from '../middleware/auth.js';
import { sendDayEndReport, scheduleDayEndReport } from '../services/dayend.js';

const router = Router();

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function settingsView(settings) {
  return {
    globalNotifyEmails: settings.globalNotifyEmails,
    // Never-set falls back to the env default so the UI shows what is actually scheduled.
    dayEndReportTime: settings.dayEndReportTime ?? (process.env.DAY_END_REPORT_TIME || '').trim(),
  };
}

router.get('/', requireAuth('admin'), async (_req, res) => {
  const settings = await getGlobalSettings();
  res.json({ settings: settingsView(settings) });
});

router.put('/', requireAuth('admin'), async (req, res) => {
  const settings = await getGlobalSettings();
  if (req.body && req.body.globalNotifyEmails !== undefined) {
    settings.globalNotifyEmails = req.body.globalNotifyEmails;
  }
  if (req.body && req.body.dayEndReportTime !== undefined) {
    const t = String(req.body.dayEndReportTime || '').trim();
    if (t && !TIME_RE.test(t)) {
      return res.status(400).json({ error: 'Day-end report time must be HH:MM (24-hour)' });
    }
    settings.dayEndReportTime = t;
  }
  await settings.save();
  // Apply a changed report time without a server restart.
  scheduleDayEndReport().catch((err) => console.error('[day-end] reschedule failed:', err.message));
  res.json({ settings: settingsView(settings) });
});

/** Send the day-end report immediately (today, or an explicit YYYY-MM-DD date). */
router.post('/day-end-report', requireAuth('admin'), async (req, res) => {
  const date = (req.body || {}).date;
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  }
  try {
    const result = await sendDayEndReport(date || undefined);
    res.json(result);
  } catch (err) {
    console.error('[day-end] manual send failed:', err.message);
    res.status(502).json({ error: 'Could not send the day-end report — please try again' });
  }
});

export default router;

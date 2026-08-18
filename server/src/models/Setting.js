import mongoose from 'mongoose';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'global' },
    // Every verified collection (in addition to the party's notifyEmails), every
    // verified handover, and the day-end report are mailed to these addresses.
    globalNotifyEmails: {
      type: [String],
      default: [],
      validate: {
        validator: (emails) => emails.every((e) => EMAIL_RE.test(e)),
        message: 'One or more notification emails are invalid',
      },
      set: (emails) => (emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean),
    },
    // Automatic day-end report time (HH:MM, 24h, IST). Empty string disables it;
    // never-set (undefined) falls back to the DAY_END_REPORT_TIME env variable.
    dayEndReportTime: {
      type: String,
      trim: true,
      validate: {
        validator: (t) => !t || /^([01]?\d|2[0-3]):([0-5]\d)$/.test(t),
        message: 'Day-end report time must be HH:MM (24-hour)',
      },
    },
  },
  { timestamps: true }
);

const Setting = mongoose.model('Setting', settingSchema);

export async function getGlobalSettings() {
  let doc = await Setting.findOne({ key: 'global' });
  if (!doc) doc = await Setting.create({ key: 'global' });
  return doc;
}

export default Setting;

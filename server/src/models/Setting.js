import mongoose from 'mongoose';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'global' },
    // Every verified collection is mailed to these addresses in addition to the party's notifyEmails.
    globalNotifyEmails: {
      type: [String],
      default: [],
      validate: {
        validator: (emails) => emails.every((e) => EMAIL_RE.test(e)),
        message: 'One or more notification emails are invalid',
      },
      set: (emails) => (emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean),
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

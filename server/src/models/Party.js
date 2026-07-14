import mongoose from 'mongoose';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const partySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Party name is required'], unique: true, trim: true },
    mobile: {
      type: String,
      required: [true, 'Party mobile is required'],
      trim: true,
      match: [/^\d{10}$/, 'Party mobile must be a 10-digit number'],
    },
    notifyEmails: {
      type: [String],
      default: [],
      validate: {
        validator: (emails) => emails.every((e) => EMAIL_RE.test(e)),
        message: 'One or more notification emails are invalid',
      },
      set: (emails) => (emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean),
    },
    distributorCode: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Party', partySchema);

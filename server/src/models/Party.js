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
    /**
     * Extra numbers on file for the same party. `mobile` is always the default
     * the OTP goes to; when a collector picks one of these instead, the two are
     * swapped so the choice sticks for everyone next time.
     */
    altMobiles: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => list.every((m) => /^\d{10}$/.test(m)),
        message: 'Each additional mobile must be a 10-digit number',
      },
      // Accepts pasted forms ("+91-98765 43210", "098765 43210") and normalises
      // them to bare 10-digit numbers so duplicates collapse.
      set: (list) =>
        [
          ...new Set(
            (list || [])
              .map((m) => {
                let d = String(m).replace(/\D/g, '');
                if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
                if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
                return d;
              })
              .filter(Boolean)
          ),
        ],
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

// The default can never also appear in the alternates list.
partySchema.pre('save', function (next) {
  this.altMobiles = (this.altMobiles || []).filter((m) => m && m !== this.mobile);
  next();
});

/** Every number the OTP may be sent to, default first. Index 0 is the default. */
partySchema.methods.otpNumbers = function otpNumbers() {
  return [this.mobile, ...(this.altMobiles || []).filter((m) => m && m !== this.mobile)];
};

export default mongoose.model('Party', partySchema);

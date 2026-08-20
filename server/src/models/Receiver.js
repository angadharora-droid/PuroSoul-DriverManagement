import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * A receiver takes cash off a collector at the end of a run (accounts, plant,
 * dispatch) — that part never needs a login, only a mobile number, because the
 * handover OTP is sent to them and read back to the collector out loud.
 *
 * A receiver may ALSO be granted a login (an admin sets a password on their
 * record) so they can collect cash themselves, exactly like a Collector —
 * useful when the same person both collects from parties and takes handovers
 * (e.g. a plant/dispatch lead). passwordHash stays null until that's granted.
 */
const receiverSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Receiver name is required'], trim: true },
    designation: { type: String, trim: true, default: '', maxlength: 60 },
    mobile: {
      type: String,
      required: [true, 'Receiver mobile is required'],
      unique: true,
      trim: true,
      match: [/^\d{10}$/, 'Receiver mobile must be a 10-digit number'],
    },
    // Set only when this receiver has also been granted the ability to collect
    // cash (log in and use the same OTP collection flow as a Collector).
    passwordHash: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

// True once an admin has set a password for this receiver — i.e. they can log
// in and collect cash in addition to receiving handovers.
receiverSchema.virtual('canCollect').get(function () {
  return Boolean(this.passwordHash);
});

receiverSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

receiverSchema.methods.verifyPassword = function (plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

export default mongoose.model('Receiver', receiverSchema);

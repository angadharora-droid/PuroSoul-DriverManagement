import mongoose from 'mongoose';

/**
 * A receiver takes cash off a collector at the end of a run (accounts, plant,
 * dispatch). They never log in — they only need a mobile number, because the
 * handover OTP is sent to them and read back to the collector out loud.
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
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Receiver', receiverSchema);

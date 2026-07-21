import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const collectorSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Collector name is required'], trim: true },
    designation: { type: String, trim: true, default: '', maxlength: 60 },
    mobile: {
      type: String,
      required: [true, 'Collector mobile is required'],
      unique: true,
      trim: true,
      match: [/^\d{10}$/, 'Collector mobile must be a 10-digit number'],
    },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

collectorSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

collectorSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export default mongoose.model('Collector', collectorSchema);

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Driver name is required'], trim: true },
    mobile: {
      type: String,
      required: [true, 'Driver mobile is required'],
      unique: true,
      trim: true,
      match: [/^\d{10}$/, 'Driver mobile must be a 10-digit number'],
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

driverSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

driverSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export default mongoose.model('Driver', driverSchema);

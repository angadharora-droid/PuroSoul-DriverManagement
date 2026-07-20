import mongoose from 'mongoose';

export const HANDOVER_STATUSES = ['pending_otp', 'verified', 'expired', 'failed', 'cancelled'];

/**
 * A handover is the collector passing collected cash to an admin (manager/cashier),
 * confirmed by an OTP sent to the RECIPIENT's mobile. Like transactions, a
 * verified handover becomes immutable except for notification bookkeeping.
 */
const MUTABLE_AFTER_VERIFY = new Set(['notifyError', 'updatedAt']);

const handoverSchema = new mongoose.Schema(
  {
    collector: { type: mongoose.Schema.Types.ObjectId, ref: 'Collector', required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    // Snapshot so the record stays readable even if the admin is renamed/removed.
    recipientName: { type: String, required: true, trim: true },

    transactions: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],
      required: true,
      validate: [(v) => v.length > 0, 'At least one collection is required'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0.01, 'Total must be greater than zero'],
    },
    notes: { type: String, trim: true, default: '', maxlength: 500 },

    otpCodeHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    otpAttempts: { type: Number, default: 0 },
    otpResendCount: { type: Number, default: 0 },
    lastOtpSentAt: { type: Date },

    status: { type: String, enum: HANDOVER_STATUSES, default: 'pending_otp', index: true },
    verifiedAt: { type: Date },
    notifyError: { type: String, default: '' },

    collectorIp: { type: String, default: '' },
    deviceInfo: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.otpCodeHash; // never leaves the server
        return ret;
      },
    },
  }
);

handoverSchema.virtual('ref').get(function () {
  return this._id.toString().slice(-8).toUpperCase();
});

handoverSchema.index({ createdAt: -1 });
handoverSchema.index({ collector: 1, createdAt: -1 });
handoverSchema.index({ transactions: 1 });

handoverSchema.post('init', function () {
  this._wasVerified = this.status === 'verified';
});

handoverSchema.pre('save', function (next) {
  if (!this.isNew && this._wasVerified) {
    const illegal = this.modifiedPaths().filter(
      (p) => !MUTABLE_AFTER_VERIFY.has(p.split('.')[0])
    );
    if (illegal.length) {
      return next(new Error(`Verified handovers are immutable (attempted to change: ${illegal.join(', ')})`));
    }
  }
  next();
});

// Keep the snapshot true for documents saved more than once in-process.
handoverSchema.post('save', function () {
  this._wasVerified = this.status === 'verified';
});

// Belt-and-braces: block query-level updates/deletes that would touch verified records.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  handoverSchema.pre(op, function (next) {
    next(new Error('Handovers may not be updated or deleted via queries — use document save for allowed fields'));
  });
}

export default mongoose.model('Handover', handoverSchema);

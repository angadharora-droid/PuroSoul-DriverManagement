import mongoose from 'mongoose';

export const TXN_STATUSES = ['pending_otp', 'verified', 'expired', 'failed'];

/**
 * Once a transaction is verified it becomes immutable: only notification
 * bookkeeping and admin audit notes may still be written. Enforced both here
 * (save hook) and by never exposing update endpoints for core fields.
 */
const MUTABLE_AFTER_VERIFY = new Set([
  'notificationEmailsSent',
  'smsConfirmationSent',
  'notifyError',
  'auditNotes',
  'updatedAt',
]);

const transactionSchema = new mongoose.Schema(
  {
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true, index: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
    },
    notes: { type: String, trim: true, default: '', maxlength: 500 },

    otpCodeHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    otpAttempts: { type: Number, default: 0 },
    otpResendCount: { type: Number, default: 0 },
    lastOtpSentAt: { type: Date },

    status: { type: String, enum: TXN_STATUSES, default: 'pending_otp', index: true },
    verifiedAt: { type: Date },

    notificationEmailsSent: { type: [String], default: [] },
    smsConfirmationSent: { type: Boolean, default: false },
    notifyError: { type: String, default: '' },

    auditNotes: [
      {
        by: { type: String },
        note: { type: String, trim: true, maxlength: 500 },
        at: { type: Date, default: Date.now },
      },
    ],

    driverIp: { type: String, default: '' },
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

transactionSchema.virtual('ref').get(function () {
  return this._id.toString().slice(-8).toUpperCase();
});

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ driver: 1, createdAt: -1 });
transactionSchema.index({ party: 1, createdAt: -1 });

transactionSchema.post('init', function () {
  this._wasVerified = this.status === 'verified';
});

transactionSchema.pre('save', function (next) {
  if (!this.isNew && this._wasVerified) {
    const illegal = this.modifiedPaths().filter(
      (p) => !MUTABLE_AFTER_VERIFY.has(p.split('.')[0])
    );
    if (illegal.length) {
      return next(new Error(`Verified transactions are immutable (attempted to change: ${illegal.join(', ')})`));
    }
  }
  next();
});

// Belt-and-braces: block query-level updates/deletes that would touch verified records.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  transactionSchema.pre(op, function (next) {
    next(new Error('Transactions may not be updated or deleted via queries — use document save for allowed fields'));
  });
}

export default mongoose.model('Transaction', transactionSchema);

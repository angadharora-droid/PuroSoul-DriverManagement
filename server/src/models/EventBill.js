import mongoose from 'mongoose';

export const EVENT_BILL_STATUSES = ['pending_otp', 'verified', 'expired', 'failed', 'cancelled'];
export const PAYMENT_MODES = ['cash', 'upi'];

/**
 * A mini bill raised by a collector at an event stall: who bought, how many of
 * each item (priced by the admin), and how they paid. Confirmed by an OTP sent
 * to the CUSTOMER's mobile, exactly like a party collection. Once verified it
 * is immutable except for notification bookkeeping.
 */
const MUTABLE_AFTER_VERIFY = new Set(['notifyError', 'updatedAt']);

const lineSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, required: true }, // Event.items subdocument id
    name: { type: String, required: true, trim: true }, // snapshot
    price: { type: Number, required: true }, // snapshot of the admin's price
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    // Whoever raised the bill — an assigned collector, or an admin stepping in.
    biller: { type: mongoose.Schema.Types.ObjectId, refPath: 'billerModel', required: true, index: true },
    billerModel: { type: String, enum: ['Collector', 'Admin'], default: 'Collector' },
    billerName: { type: String, required: true, trim: true }, // snapshot; admins carry an "(Admin)" suffix
    // Assigned on verification, so verified bills are numbered in sequence per event.
    billNo: { type: Number, default: null },

    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      minlength: [2, 'Customer name is too short'],
      maxlength: [80, 'Customer name is too long'],
    },
    customerMobile: {
      type: String,
      required: [true, 'Customer mobile is required'],
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Customer mobile must be a valid 10-digit mobile number'],
    },

    lines: {
      type: [lineSchema],
      validate: [(v) => v.length > 0, 'Add at least one item'],
    },
    totalQuantity: { type: Number, required: true, min: 1 },
    totalAmount: { type: Number, required: true, min: [0.01, 'Bill total must be greater than zero'] },

    paymentMode: { type: String, enum: PAYMENT_MODES, required: [true, 'Payment mode is required'] },
    // UPI transaction reference / UTR as typed by the biller (optional).
    upiRef: { type: String, trim: true, uppercase: true, default: '', maxlength: 40 },
    // The stored payment screenshot (UPI bills). Hash kept here too so a reused
    // screenshot is caught without loading any image bytes.
    screenshot: { type: mongoose.Schema.Types.ObjectId, ref: 'EventAttachment', default: null },
    screenshotHash: { type: String, default: '' },

    otpCodeHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    otpAttempts: { type: Number, default: 0 },
    otpResendCount: { type: Number, default: 0 },
    lastOtpSentAt: { type: Date },

    status: { type: String, enum: EVENT_BILL_STATUSES, default: 'pending_otp', index: true },
    verifiedAt: { type: Date },
    notifyError: { type: String, default: '' },

    collectorIp: { type: String, default: '' },
    deviceInfo: { type: String, default: '' },
  },
  {
    timestamps: true,
    // Two racing saves (a double-tapped verify, parallel OTP guesses) fail the
    // second one instead of silently overwriting the first.
    optimisticConcurrency: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.otpCodeHash; // never leaves the server
        return ret;
      },
    },
  }
);

billSchema.virtual('ref').get(function () {
  return this._id.toString().slice(-8).toUpperCase();
});

/** Printed bill number ("0012"), or null until the bill is verified. */
billSchema.virtual('billLabel').get(function () {
  return this.billNo ? String(this.billNo).padStart(4, '0') : null;
});

billSchema.index({ event: 1, createdAt: -1 });
billSchema.index({ event: 1, status: 1, verifiedAt: 1 });
billSchema.index({ biller: 1, createdAt: -1 });
billSchema.index({ screenshotHash: 1 });
billSchema.index({ upiRef: 1 });

billSchema.post('init', function () {
  this._wasVerified = this.status === 'verified';
});

billSchema.pre('save', function (next) {
  if (!this.isNew && this._wasVerified) {
    const illegal = this.modifiedPaths().filter((p) => !MUTABLE_AFTER_VERIFY.has(p.split('.')[0]));
    if (illegal.length) {
      return next(new Error(`Verified bills are immutable (attempted to change: ${illegal.join(', ')})`));
    }
  }
  next();
});

// Keep the snapshot true for documents saved more than once in-process.
billSchema.post('save', function () {
  this._wasVerified = this.status === 'verified';
});

// Belt-and-braces: block query-level updates/deletes that would touch verified records.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  billSchema.pre(op, function (next) {
    next(new Error('Event bills may not be updated or deleted via queries — use document save for allowed fields'));
  });
}

export default mongoose.model('EventBill', billSchema);

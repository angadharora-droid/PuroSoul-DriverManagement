import mongoose from 'mongoose';

export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The UPI payment screenshot behind an event bill. Kept in MongoDB itself, not
 * on the server's disk: app hosts commonly wipe the local filesystem on every
 * redeploy or restart, the database doesn't. Written once with the bill and
 * never changed; the bill keeps the SHA-256 so the image can be shown to be
 * untouched and the same screenshot can't be reused for a second bill.
 */
const attachmentSchema = new mongoose.Schema(
  {
    bill: { type: mongoose.Schema.Types.ObjectId, ref: 'EventBill', required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    // Sniffed from the bytes on upload, never taken from the client.
    contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
    size: { type: Number, required: true, max: SCREENSHOT_MAX_BYTES },
    sha256: { type: String, required: true, index: true },
    // select: false keeps the image bytes out of every query unless asked for with '+data'.
    data: { type: Buffer, required: true, select: false },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, required: true }, // the receiver or admin who raised the bill
  },
  { timestamps: true }
);

attachmentSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('Payment screenshots cannot be changed once saved'));
  next();
});

// Belt-and-braces: no query path may rewrite or delete a stored screenshot.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  attachmentSchema.pre(op, function (next) {
    next(new Error('Payment screenshots may not be updated or deleted'));
  });
}

export default mongoose.model('EventAttachment', attachmentSchema);

import mongoose from 'mongoose';

/**
 * One line of an event's stock ledger, entered by the event's stock keeper
 * (a receiver) or an admin. Append-only: a mistake is corrected with an opposite entry,
 * never by editing, so the ledger always shows what was recorded and when.
 */
const stockEntrySchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    item: { type: mongoose.Schema.Types.ObjectId, required: true }, // Event.items subdocument id
    itemName: { type: String, required: true, trim: true }, // snapshot
    // in = stock received at the event; out = returned, damaged or otherwise removed.
    kind: { type: String, enum: ['in', 'out'], required: true },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    note: { type: String, trim: true, default: '', maxlength: 200 },
    // The event's stock keeper, or an admin stepping in.
    enteredBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'enteredByModel', required: true },
    enteredByModel: { type: String, enum: ['Receiver', 'Admin'], default: 'Receiver' },
    enteredByName: { type: String, required: true, trim: true }, // snapshot; admins carry an "(Admin)" suffix
  },
  { timestamps: true }
);

stockEntrySchema.index({ event: 1, createdAt: -1 });

stockEntrySchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('Stock entries are append-only — add a correcting entry instead'));
  next();
});

for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  stockEntrySchema.pre(op, function (next) {
    next(new Error('Stock entries may not be updated or deleted'));
  });
}

export default mongoose.model('EventStockEntry', stockEntrySchema);

import mongoose from 'mongoose';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An event is a sales stall (exhibition, fair, promotion) where receivers sell
 * stock straight to walk-in customers. The admin fixes everything that decides
 * money — the items and their prices, which receivers may bill, and which
 * collector keeps the stock ledger — so the people at the stall only ever
 * enter quantities, never a price.
 */
const itemSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Item name is required'], trim: true, maxlength: 80 },
  // Admin-decided. A bill snapshots the price it was raised at, so changing it
  // later never rewrites past bills.
  price: {
    type: Number,
    required: [true, 'Item price is required'],
    min: [0.01, 'Item price must be greater than zero'],
    max: [1000000, 'Item price looks too large — please check'],
    set: (v) => Math.round(Number(v) * 100) / 100,
  },
  // Retired items stay on the event so past bills and stock entries still resolve.
  isActive: { type: Boolean, default: true },
});

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Event name is required'], trim: true, maxlength: 100 },
    venue: { type: String, trim: true, default: '', maxlength: 150 },
    startDate: {
      type: String,
      default: '',
      validate: { validator: (v) => !v || DATE_RE.test(v), message: 'Start date must be YYYY-MM-DD' },
    },
    endDate: {
      type: String,
      default: '',
      validate: { validator: (v) => !v || DATE_RE.test(v), message: 'End date must be YYYY-MM-DD' },
    },
    items: {
      type: [itemSchema],
      validate: [(v) => v.length > 0, 'Add at least one item with its price'],
    },
    // Receivers allowed to raise bills at this event (they need a login — see Receiver.canCollect).
    billers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Receiver' }],
    // The one collector who records stock coming in and going out.
    stockKeeper: { type: mongoose.Schema.Types.ObjectId, ref: 'Collector', default: null },
    // Closed events take no new bills or stock entries; bills already awaiting
    // OTP can still be verified, since the customer has usually paid by then.
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    notes: { type: String, trim: true, default: '', maxlength: 500 },
    // Last bill number handed out. Bumped atomically when a bill is verified,
    // so verified bills are numbered in sequence per event.
    billSeq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

eventSchema.index({ billers: 1, status: 1 });
eventSchema.index({ stockKeeper: 1, status: 1 });

export default mongoose.model('Event', eventSchema);

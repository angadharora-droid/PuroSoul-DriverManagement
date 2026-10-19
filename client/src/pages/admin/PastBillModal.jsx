import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { Button, Field, Alert, Modal, SegmentedControl, inputClass } from '../../components/ui';
import { useToast } from '../../components/toast';
import { formatINR, formatDate, cleanMobile, todayStr, PAYMENT_LABELS, PAYMENT_ICONS } from '../../utils/format';
import { preparePhoto, dataUrlToBase64, formatBytes } from '../../utils/image';

const EMPTY = { billDate: '', customerName: '', customerMobile: '', qty: {}, paymentMode: '', upiRef: '', photo: null };

const PAY_OPTIONS = ['cash', 'upi', 'credit'].map((value) => ({ value, label: PAYMENT_LABELS[value], icon: PAYMENT_ICONS[value] }));

/**
 * Admin only: enter a bill for an earlier day of the event — one written on
 * paper, or missed while the app was down. No OTP (the customer isn't here):
 * the bill is confirmed on save, counts on the chosen day, and shows as a past
 * entry everywhere it appears. Works on closed events too.
 * event / items = the event report's `event` and `items` (live stock positions).
 */
export default function PastBillModal({ open, event, items, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setError('');
  }, [open]);

  if (!open) return null;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const today = todayStr();
  const maxDate = event.endDate && event.endDate < today ? event.endDate : today;
  const activeItems = items.filter((i) => i.isActive);
  const lines = activeItems.map((i) => ({ ...i, q: Number(form.qty[i.id]) || 0 })).filter((l) => l.q > 0);
  const totalQty = lines.reduce((s, l) => s + l.q, 0);
  const totalAmount = Math.round(lines.reduce((s, l) => s + l.q * l.price, 0) * 100) / 100;
  const overStock = lines.find((l) => l.q > Math.max(0, l.available));
  const isUpi = form.paymentMode === 'upi';

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same file again should still fire
    if (!file) return;
    setPhotoBusy(true);
    setError('');
    try {
      set('photo', await preparePhoto(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.billDate) return setError('Pick the date of the bill');
    if (form.customerName.trim().length < 2) return setError("Enter the customer's name");
    if (!/^[6-9]\d{9}$/.test(form.customerMobile)) return setError("Enter the customer's 10-digit mobile number");
    if (!lines.length) return setError('Enter the quantity for at least one item');
    if (overStock) return setError(`Only ${Math.max(0, overStock.available)} × ${overStock.name} left in stock`);
    if (!form.paymentMode) return setError('Choose how the customer paid — cash, UPI or credit');

    setBusy(true);
    try {
      const d = await api.post(`/api/events/${event.id}/bills`, {
        billDate: form.billDate,
        customerName: form.customerName.trim(),
        customerMobile: form.customerMobile,
        items: lines.map((l) => ({ itemId: l.id, quantity: l.q })),
        paymentMode: form.paymentMode,
        upiRef: isUpi ? form.upiRef : '',
        screenshot: isUpi && form.photo ? dataUrlToBase64(form.photo.dataUrl) : undefined,
      });
      toast(`Bill ${d.bill.billLabel} added for ${formatDate(`${form.billDate}T00:00:00`)}`);
      onSaved(d.bill);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="Add past bill" onClose={() => !busy && onClose()} wide>
      <form onSubmit={save} className="space-y-5">
        <Alert kind="info">
          For a sale made on an earlier day of {event.name} — e.g. a paper bill. No OTP is sent: the bill is saved as confirmed on the date you pick, gets the
          next bill number, comes out of stock, and can't be changed afterwards.
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bill date" required>
            <input
              type="date"
              className={inputClass}
              value={form.billDate}
              min={event.startDate || undefined}
              max={maxDate}
              onChange={(e) => set('billDate', e.target.value)}
            />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">
              Paid by<span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
            </p>
            <SegmentedControl options={PAY_OPTIONS} value={form.paymentMode} onChange={(v) => set('paymentMode', v)} className="w-fit max-w-full" />
          </div>
          <Field label="Customer name" required>
            <input
              type="text"
              autoComplete="off"
              maxLength={80}
              className={inputClass}
              value={form.customerName}
              onChange={(e) => set('customerName', e.target.value)}
              placeholder="e.g. Rahul Sharma"
            />
          </Field>
          <Field label="Customer mobile" required>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center text-sm font-semibold text-slate-400" aria-hidden="true">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                className={`${inputClass} tnum pl-12`}
                value={form.customerMobile}
                onChange={(e) => set('customerMobile', cleanMobile(e.target.value))}
                placeholder="98765 43210"
              />
            </div>
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Items<span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {activeItems.map((i) => {
              const q = Number(form.qty[i.id]) || 0;
              return (
                <div key={i.id} className={`flex items-center gap-3 border-b border-slate-100 px-3.5 py-2.5 last:border-0 ${q > 0 ? 'bg-brand-50/50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold leading-snug text-slate-900">{i.name}</p>
                    <p className="tnum text-xs text-slate-500">
                      {formatINR(i.price)} each •{' '}
                      <span className={i.available <= 0 ? 'font-semibold text-red-600' : ''}>{i.available <= 0 ? 'out of stock' : `${i.available} left`}</span>
                    </p>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`${i.name} quantity`}
                    placeholder="0"
                    value={form.qty[i.id] || ''}
                    onChange={(e) => setForm((f) => ({ ...f, qty: { ...f.qty, [i.id]: e.target.value.replace(/\D/g, '').slice(0, 5) } }))}
                    className={`${inputClass} tnum w-20 shrink-0 text-center font-bold`}
                  />
                </div>
              );
            })}
            {activeItems.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No items on sale at this event.</p>}
          </div>
        </div>

        {isUpi && (
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
            <Field label="UPI transaction ID / UTR" hint="Optional">
              <input
                type="text"
                autoComplete="off"
                maxLength={40}
                className={`${inputClass} tnum font-mono`}
                value={form.upiRef}
                onChange={(e) => set('upiRef', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                placeholder="e.g. 412345678901"
              />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Payment photo</p>
              {form.photo ? (
                <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-white p-2">
                  <img src={form.photo.dataUrl} alt="UPI payment photo" className="h-14 w-10 shrink-0 rounded-md border border-slate-200 object-cover" />
                  <p className="min-w-0 flex-1 text-xs text-slate-500">{formatBytes(form.photo.size)}</p>
                  <button type="button" onClick={() => set('photo', null)} className="min-h-9 shrink-0 cursor-pointer rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                    Remove
                  </button>
                </div>
              ) : (
                <Button type="button" variant="secondary" icon="photo" loading={photoBusy} className="w-full" onClick={() => fileRef.current?.click()}>
                  Attach photo (optional)
                </Button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onPhoto} />
            </div>
          </div>
        )}

        {totalQty > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <span className="text-sm font-semibold text-brand-900">
              Total <span className="tnum font-normal text-brand-800/80">({totalQty} qty)</span>
            </span>
            <span className="tnum text-xl font-bold text-brand-900">{formatINR(totalAmount)}</span>
          </div>
        )}

        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" icon={busy ? undefined : 'check'} loading={busy} disabled={photoBusy}>
            Save past bill{totalQty > 0 ? ` • ${formatINR(totalAmount)}` : ''}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

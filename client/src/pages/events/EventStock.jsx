import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { Button, Field, Alert, inputClass, EmptyState, CardSkeleton, PageHeader, SegmentedControl } from '../../components/ui';
import Icon from '../../components/icons';
import { useToast } from '../../components/toast';
import { formatINR, formatDateTime } from '../../utils/format';

const KINDS = [
  { value: 'in', label: 'Stock in', icon: 'plus' },
  { value: 'out', label: 'Stock out', icon: 'minus' },
];

function Figure({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`tnum text-base font-bold ${tone}`}>{value}</p>
    </div>
  );
}

export default function EventStock() {
  const toast = useToast();
  const { user } = useAuth();
  const { id: preferredId } = useParams(); // admin arrives from an event's report page
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);
  const [eventId, setEventId] = useState('');
  const [data, setData] = useState(null); // { event, entries }
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ itemId: '', kind: 'in', quantity: '', note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/api/events/mine')
      .then((d) => {
        setEvents(d.events);
        const ids = d.events.map((e) => String(e.id));
        setEventId(preferredId && ids.includes(preferredId) ? preferredId : ids[0] || '');
      })
      .catch((err) => setLoadError(err.message));
  }, [preferredId]);

  const load = useCallback(() => {
    if (!eventId) return;
    api
      .get(`/api/events/${eventId}/stock`)
      .then(setData)
      .catch((err) => setLoadError(err.message));
  }, [eventId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const items = data?.event.items || [];
  const selectable = items.filter((i) => (form.kind === 'in' ? i.isActive : i.isActive || i.available > 0));
  const selected = items.find((i) => String(i.id) === form.itemId);
  const qty = Number(form.quantity) || 0;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!selected) return setError('Select an item');
    if (!Number.isInteger(qty) || qty < 1) return setError('Enter a quantity of at least 1');
    if (form.kind === 'out' && !form.note.trim()) return setError('Add a note saying why stock is going out');
    if (form.kind === 'out' && qty > selected.available) {
      return setError(`Only ${Math.max(0, selected.available)} × ${selected.name} in stock`);
    }
    setBusy(true);
    try {
      const res = await api.post(`/api/events/${eventId}/stock`, {
        itemId: form.itemId,
        kind: form.kind,
        quantity: qty,
        note: form.note.trim(),
      });
      setData((d) => ({ event: { ...d.event, items: res.items }, entries: [res.entry, ...d.entries] }));
      setForm((f) => ({ ...f, quantity: '', note: '' }));
      toast(`${form.kind === 'in' ? 'Added' : 'Removed'} ${qty} × ${selected.name}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!events) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <PageHeader title="Event stock" />
        {loadError ? <Alert>{loadError}</Alert> : <CardSkeleton count={3} />}
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <PageHeader title="Event stock" />
        <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
          <EmptyState
            icon="cube"
            title={user?.role === 'admin' ? 'No open events' : "You're not keeping stock for any open event"}
            subtitle={
              user?.role === 'admin'
                ? 'Reopen or create an event to record its stock.'
                : "When an admin makes you the stock keeper of an event, you'll record its stock here."
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 animate-fade-in-up">
      <PageHeader title="Event stock" subtitle="Record every lot of stock that arrives at, or leaves, the event." />

      {events.length > 1 ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Event</span>
          <select className={inputClass} value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <div className="flex items-center gap-2.5 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
            <Icon name="cube" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-brand-900">{events[0].name}</p>
            {events[0].venue && <p className="truncate text-xs text-slate-500">{events[0].venue}</p>}
          </div>
        </div>
      )}

      {user?.role === 'receiver' && eventId && (
        <Button variant="secondary" icon="receipt" className="w-full" onClick={() => navigate(`/events/report/${eventId}`)}>
          See all bills &amp; report
        </Button>
      )}

      {loadError && <Alert>{loadError}</Alert>}

      {!data ? (
        <CardSkeleton count={2} />
      ) : (
        <>
          {/* Live position per item */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <h3 className="mb-3 text-sm font-bold text-slate-700">Stock position</h3>
            <div className="space-y-3">
              {items.map((i) => (
                <div key={i.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {i.name}
                      {!i.isActive && <span className="ml-1.5 text-xs font-normal text-slate-400">(retired)</span>}
                    </p>
                    <p className="tnum shrink-0 text-xs text-slate-500">{formatINR(i.price)}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    <Figure label="In" value={i.stockIn} />
                    <Figure label="Out" value={i.stockOut} />
                    <Figure label="Sold" value={i.sold} />
                    <Figure label="Left" value={i.remaining} tone={i.remaining < 0 ? 'text-red-600' : i.remaining === 0 ? 'text-amber-700' : 'text-brand-800'} />
                  </div>
                  {i.reserved > 0 && (
                    <p className="mt-1.5 text-[11px] text-slate-500">{i.reserved} held by bills waiting for the customer's OTP</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* New ledger entry */}
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h3 className="text-sm font-bold text-slate-700">Record stock</h3>
            <SegmentedControl
              options={KINDS}
              value={form.kind}
              onChange={(kind) => {
                setForm((f) => ({ ...f, kind }));
                setError('');
              }}
            />
            <Field label="Item" required>
              <select className={inputClass} value={form.itemId} onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}>
                <option value="">Select item…</option>
                {selectable.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} — {i.available} available
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity" required>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                className={`${inputClass} tnum text-lg font-semibold`}
              />
            </Field>
            <Field
              label={form.kind === 'out' ? 'Reason' : 'Note (optional)'}
              required={form.kind === 'out'}
              hint={form.kind === 'out' ? 'e.g. returned to warehouse, damaged, counting correction' : 'e.g. opening stock, vehicle MH12 AB 1234'}
            >
              <input
                type="text"
                maxLength={200}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Alert>{error}</Alert>
            <Button type="submit" className="w-full py-3" loading={busy} icon={busy ? undefined : form.kind === 'in' ? 'plus' : 'minus'} disabled={!form.itemId || !qty}>
              {form.kind === 'in' ? 'Add to stock' : 'Take out of stock'}
              {selected && qty > 0 ? ` • ${qty} × ${selected.name}` : ''}
            </Button>
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-400">
              <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Entries can't be edited or deleted. To fix a mistake, add an opposite entry with a note.
            </p>
          </form>

          {/* Ledger */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <h3 className="mb-3 text-sm font-bold text-slate-700">Stock ledger</h3>
            {data.entries.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No stock recorded yet — start with the opening stock.</p>
            ) : (
              <div className="space-y-2">
                {data.entries.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{e.itemName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(e.date)} • {e.enteredByName}
                      </p>
                      {e.note && <p className="mt-0.5 text-xs text-slate-400">{e.note}</p>}
                    </div>
                    <span className={`tnum shrink-0 text-sm font-bold ${e.kind === 'in' ? 'text-brand-700' : 'text-amber-700'}`}>
                      {e.kind === 'in' ? '+' : '−'}
                      {e.quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

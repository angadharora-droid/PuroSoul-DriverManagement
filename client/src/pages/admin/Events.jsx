import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Field, Input, Alert, Modal, EmptyState, CardSkeleton, PageHeader, SegmentedControl, inputClass } from '../../components/ui';
import Icon from '../../components/icons';
import { useToast } from '../../components/toast';
import { formatINR, formatDate } from '../../utils/format';

export function EventStatusChip({ status }) {
  const open = status === 'open';
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2.5 text-xs font-semibold ${
        open ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-brand-600' : 'bg-slate-400'}`} />
      {open ? 'Open' : 'Closed'}
    </span>
  );
}

export function eventDates(e) {
  if (!e.startDate && !e.endDate) return '';
  const s = e.startDate ? formatDate(`${e.startDate}T00:00:00`) : '';
  const t = e.endDate ? formatDate(`${e.endDate}T00:00:00`) : '';
  return s && t && s !== t ? `${s} – ${t}` : s || t;
}

export default function Events() {
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | event
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/events').then((d) => setEvents(d.events)).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Events"
        subtitle="Stalls where receivers bill customers directly. You set the items and prices, who can bill, and which collector keeps the stock."
        actions={<Button icon="plus" onClick={() => setEditing('new')}>New event</Button>}
      />

      {error && <Alert>{error}</Alert>}

      {!events ? (
        <CardSkeleton count={3} />
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
          <EmptyState
            icon="ticket"
            title="No events yet"
            subtitle="Create an event, add its items and prices, then pick the receivers who bill and the collector who keeps stock."
            action={<Button icon="plus" onClick={() => setEditing('new')}>Create first event</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {events.map((e, i) => (
            <div
              key={e.id}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/admin/events/${e.id}`)}
              onKeyDown={(ev) => ev.key === 'Enter' && navigate(`/admin/events/${e.id}`)}
              className="min-w-0 cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-colors hover:border-brand-200 animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-slate-900">{e.name}</p>
                    <EventStatusChip status={e.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {[e.venue, eventDates(e)].filter(Boolean).join(' • ') || 'No venue or dates set'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum font-bold text-brand-800">{formatINR(e.summary.amount)}</p>
                  <p className="tnum text-xs text-slate-400">
                    {e.summary.bills} bill{e.summary.bills === 1 ? '' : 's'} • {e.summary.quantity} qty
                  </p>
                </div>
              </div>

              <p className="mt-3 truncate text-xs text-slate-600">
                {e.items.filter((it) => it.isActive).map((it) => `${it.name} ${formatINR(it.price)}`).join(' • ')}
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-slate-500">
                  <span className="flex items-center gap-1">
                    <Icon name="ticket" className="h-3.5 w-3.5" />
                    {e.billers.length ? e.billers.map((b) => b.name).join(', ') : <span className="font-semibold text-amber-700">No billers</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="cube" className="h-3.5 w-3.5" />
                    {e.stockKeeper ? e.stockKeeper.name : <span className="font-semibold text-amber-700">No stock keeper</span>}
                  </span>
                </div>
                <span className="tnum text-slate-500">
                  Cash {formatINR(e.summary.cash)} • UPI {formatINR(e.summary.upi)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <EventModal
        event={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved, isNew) => {
          setEditing(null);
          if (isNew) navigate(`/admin/events/${saved.id}`);
          else load();
        }}
      />
    </div>
  );
}

const blankItem = () => ({ key: Math.random().toString(36).slice(2), id: null, name: '', price: '', isActive: true });

/** Create / edit an event: details, items & prices, billers, stock keeper, status. */
export function EventModal({ event, onClose, onSaved }) {
  const toast = useToast();
  const isNew = event === 'new';
  const [form, setForm] = useState(null);
  const [receivers, setReceivers] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!event) return;
    setError('');
    setForm(
      isNew
        ? { name: '', venue: '', startDate: '', endDate: '', notes: '', status: 'open', items: [blankItem()], billerIds: [], stockKeeperId: '' }
        : {
            name: event.name,
            venue: event.venue || '',
            startDate: event.startDate || '',
            endDate: event.endDate || '',
            notes: event.notes || '',
            status: event.status,
            items: event.items.map((i) => ({ key: String(i.id), id: i.id, name: i.name, price: String(i.price), isActive: i.isActive })),
            billerIds: event.billers.map((b) => String(b.id)),
            stockKeeperId: event.stockKeeper ? String(event.stockKeeper.id) : '',
          }
    );
    api.get('/api/receivers').then((d) => setReceivers(d.receivers)).catch(() => {});
    api.get('/api/collectors').then((d) => setCollectors(d.collectors)).catch(() => {});
  }, [event, isNew]);

  if (!event || !form) return null;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setItem = (key, patch) => setForm((f) => ({ ...f, items: f.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) }));

  // Inactive people stay listed only if already assigned, so an edit never silently drops them.
  const receiverChoices = receivers.filter((r) => r.isActive || form.billerIds.includes(String(r._id)));
  const collectorChoices = collectors.filter((c) => c.isActive || String(c._id) === form.stockKeeperId);

  function toggleBiller(id) {
    set('billerIds', form.billerIds.includes(id) ? form.billerIds.filter((x) => x !== id) : [...form.billerIds, id]);
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    const items = form.items.filter((it) => it.id || it.name.trim() || it.price);
    if (!form.name.trim()) return setError('Give the event a name');
    if (!items.length) return setError('Add at least one item with its price');
    const bad = items.find((it) => !it.name.trim() || !(Number(it.price) > 0));
    if (bad) return setError(bad.name.trim() ? `Enter a price for ${bad.name.trim()}` : 'Every item needs a name');

    setBusy(true);
    const payload = {
      name: form.name.trim(),
      venue: form.venue.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      notes: form.notes.trim(),
      items: items.map((it) => ({ id: it.id || undefined, name: it.name.trim(), price: Number(it.price), isActive: it.isActive })),
      billerIds: form.billerIds,
      stockKeeperId: form.stockKeeperId || null,
      ...(isNew ? {} : { status: form.status }),
    };
    try {
      const d = isNew ? await api.post('/api/events', payload) : await api.put(`/api/events/${event.id}`, payload);
      toast(isNew ? 'Event created' : 'Event updated');
      onSaved(d.event, isNew);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={isNew ? 'New event' : `Edit ${event.name}`} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Event name" required>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={100} autoFocus placeholder="e.g. Pune Water Expo 2026" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Venue">
              <Input value={form.venue} onChange={(e) => set('venue', e.target.value)} maxLength={150} placeholder="e.g. Hall 3, Agriculture College Grounds" />
            </Field>
          </div>
          <Field label="Start date">
            <input type="date" className={inputClass} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="End date">
            <input type="date" className={inputClass} value={form.endDate} min={form.startDate || undefined} onChange={(e) => set('endDate', e.target.value)} />
          </Field>
        </div>

        {/* Items & prices — the only place prices are ever set */}
        <div>
          <p className="mb-1 text-sm font-bold text-slate-700">Items &amp; prices</p>
          <p className="mb-2.5 text-xs text-slate-500">Billers only enter quantities; the bill uses these prices. Changing a price later doesn't change bills already made.</p>
          <div className="space-y-2">
            {form.items.map((it) => (
              <div key={it.key} className={`flex items-center gap-2 ${it.isActive ? '' : 'opacity-60'}`}>
                <input
                  className={`${inputClass} min-w-0 flex-1`}
                  placeholder="Item name, e.g. 1L Bottle (case of 12)"
                  maxLength={80}
                  value={it.name}
                  aria-label="Item name"
                  onChange={(e) => setItem(it.key, { name: e.target.value })}
                />
                <div className="relative w-32 shrink-0">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex w-8 items-center justify-center text-slate-400" aria-hidden="true">₹</span>
                  <input
                    className={`${inputClass} tnum pl-8`}
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="Price"
                    aria-label={`Price of ${it.name || 'item'}`}
                    value={it.price}
                    onChange={(e) => setItem(it.key, { price: e.target.value })}
                  />
                </div>
                {it.id ? (
                  <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold text-slate-600" title="Untick to stop selling this item">
                    <input type="checkbox" checked={it.isActive} onChange={(e) => setItem(it.key, { isActive: e.target.checked })} className="h-4 w-4 accent-brand-700" />
                    On sale
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => set('items', form.items.filter((x) => x.key !== it.key))}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Remove item"
                  >
                    <Icon name="close" className="h-4.5 w-4.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => set('items', [...form.items, blankItem()])}
            className="mt-2 flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            <Icon name="plus" className="h-4 w-4" />
            Add item
          </button>
        </div>

        {/* Who bills */}
        <div>
          <p className="mb-1 text-sm font-bold text-slate-700">Receivers who can bill</p>
          <p className="mb-2.5 text-xs text-slate-500">They raise bills and the customer confirms each one by OTP. A receiver needs a password (Receivers page) to log in.</p>
          {receiverChoices.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">No receivers yet — add them on the Receivers page.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
              {receiverChoices.map((r) => {
                const id = String(r._id);
                const checked = form.billerIds.includes(id);
                return (
                  <label
                    key={id}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 border-b border-slate-100 px-3.5 py-2 text-sm last:border-0 ${checked ? 'bg-brand-50/70' : 'hover:bg-slate-50'}`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleBiller(id)} className="h-4.5 w-4.5 shrink-0 rounded accent-brand-700" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-slate-900">{r.name}</span>
                      {r.designation && <span className="text-slate-500"> — {r.designation}</span>}
                    </span>
                    {!r.isActive ? (
                      <span className="shrink-0 text-xs font-semibold text-slate-400">Inactive</span>
                    ) : !r.canCollect ? (
                      <span className="shrink-0 text-xs font-semibold text-amber-700">No login yet</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Who keeps stock */}
        <Field label="Stock keeper (collector)" hint="The one collector who records stock coming in and going out. Billing can't go past the recorded stock.">
          <select className={inputClass} value={form.stockKeeperId} onChange={(e) => set('stockKeeperId', e.target.value)}>
            <option value="">— Not assigned yet —</option>
            {collectorChoices.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}{c.designation ? ` — ${c.designation}` : ''}{c.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes (optional)">
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} />
        </Field>

        {!isNew && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Status</p>
            <SegmentedControl
              options={[
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
              ]}
              value={form.status}
              onChange={(v) => set('status', v)}
              className="w-fit"
            />
            <p className="mt-1.5 text-xs text-slate-500">Closed events take no new bills or stock entries. Everything recorded stays in the report.</p>
          </div>
        )}

        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{isNew ? 'Create event' : 'Save event'}</Button>
        </div>
      </form>
    </Modal>
  );
}

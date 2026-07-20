import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button, Field, Input, Alert, Modal, EmptyState, Avatar, TableSkeleton, PageHeader, inputClass } from '../../components/ui';
import Icon from '../../components/icons';
import { useToast } from '../../components/toast';

const emptyForm = { name: '', mobile: '', distributorCode: '', notifyEmails: '', isActive: true };

export default function Parties() {
  const [parties, setParties] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | party object
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/parties', q ? { q } : undefined).then((d) => setParties(d.parties)).catch((err) => setError(err.message));
  }, [q]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Party database"
        subtitle="Collectors can only collect against this approved list. OTPs always go to the party's registered mobile."
        actions={<Button icon="plus" onClick={() => setEditing('new')}>Add party</Button>}
      />

      <div className="relative max-w-sm">
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
        <input className={`${inputClass} pl-10`} placeholder="Search parties…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search parties" />
      </div>

      {error && <Alert>{error}</Alert>}

      {!parties ? (
        <TableSkeleton rows={6} cols={5} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Mobile</th>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Notify emails</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => (
                  <tr key={p._id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5 font-medium text-slate-900">
                        <Avatar name={p.name} className="h-7 w-7 text-[11px]" />
                        {p.name}
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 font-mono text-xs text-slate-600">{p.mobile}</td>
                    <td className="px-4 py-3 text-slate-500">{p.distributorCode || '—'}</td>
                    <td className="max-w-56 truncate px-4 py-3 text-xs text-slate-500">{(p.notifyEmails || []).join(', ') || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2.5 text-xs font-semibold ${
                          p.isActive ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${p.isActive ? 'bg-brand-600' : 'bg-slate-400'}`} />
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="min-h-9 cursor-pointer rounded-lg px-2.5 font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                        onClick={() => setEditing(p)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parties.length === 0 && (
            <EmptyState
              icon="storefront"
              title={q ? 'No parties match your search' : 'No parties yet'}
              subtitle={q ? 'Try a different name.' : 'Add the distributors your collectors collect from.'}
              action={!q && <Button icon="plus" onClick={() => setEditing('new')}>Add first party</Button>}
            />
          )}
        </div>
      )}

      <PartyModal party={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function PartyModal({ party, onClose, onSaved }) {
  const toast = useToast();
  const isNew = party === 'new';
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!party) return;
    setError('');
    setForm(
      isNew
        ? emptyForm
        : {
            name: party.name,
            mobile: party.mobile,
            distributorCode: party.distributorCode || '',
            notifyEmails: (party.notifyEmails || []).join(', '),
            isActive: party.isActive,
          }
    );
  }, [party, isNew]);

  if (!party) return null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      distributorCode: form.distributorCode.trim(),
      notifyEmails: form.notifyEmails.split(/[,;\s]+/).filter(Boolean),
      isActive: form.isActive,
    };
    try {
      if (isNew) await api.post('/api/parties', payload);
      else await api.put(`/api/parties/${party._id}`, payload);
      toast(isNew ? 'Party added' : 'Party updated');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={isNew ? 'Add party' : `Edit ${party.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Party name" required>
          <Input value={form.name} onChange={set('name')} required autoFocus />
        </Field>
        <Field label="Registered mobile" required hint="OTPs and SMS confirmations go to this number">
          <Input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.mobile}
            onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '') }))}
            required
          />
        </Field>
        <Field label="Distributor code (optional)">
          <Input value={form.distributorCode} onChange={set('distributorCode')} />
        </Field>
        <Field label="Notification emails" hint="Comma-separated — notified on every verified collection for this party">
          <Input placeholder="accounts@co.com, sales@co.com" value={form.notifyEmails} onChange={set('notifyEmails')} />
        </Field>
        {!isNew && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 text-sm text-slate-700 transition-colors hover:bg-slate-50">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded accent-brand-700"
            />
            Active — visible in the collector dropdown
          </label>
        )}
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save party</Button>
        </div>
      </form>
    </Modal>
  );
}

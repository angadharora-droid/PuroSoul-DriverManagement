import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button, Field, Input, Alert, Modal, EmptyState, Avatar, TableSkeleton, PageHeader } from '../../components/ui';
import { useToast } from '../../components/toast';

export default function Receivers() {
  const [receivers, setReceivers] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | receiver
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/receivers').then((d) => setReceivers(d.receivers)).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Receivers"
        subtitle="Staff who take cash from collectors — the handover OTP is sent to their mobile. Give one a password to let them also collect cash."
        actions={<Button icon="plus" onClick={() => setEditing('new')}>Add receiver</Button>}
      />

      {error && <Alert>{error}</Alert>}

      {!receivers ? (
        <TableSkeleton rows={4} cols={4} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Designation</th>
                  <th className="px-4 py-3 font-semibold">Mobile (login / handover OTP)</th>
                  <th className="px-4 py-3 font-semibold">Collects cash?</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {receivers.map((r) => (
                  <tr key={r._id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5 font-medium text-slate-900">
                        <Avatar name={r.name} className="h-7 w-7 text-[11px]" />
                        {r.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.designation || <span className="text-slate-400">—</span>}</td>
                    <td className="tnum px-4 py-3 font-mono text-xs text-slate-600">{r.mobile}</td>
                    <td className="px-4 py-3">
                      {r.canCollect ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-0.5 pl-1.5 pr-2.5 text-xs font-semibold text-brand-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                          Yes — can log in
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No login</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2.5 text-xs font-semibold ${
                          r.isActive ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${r.isActive ? 'bg-brand-600' : 'bg-slate-400'}`} />
                        {r.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="min-h-9 cursor-pointer rounded-lg px-2.5 font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                        onClick={() => setEditing(r)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {receivers.length === 0 && (
            <EmptyState
              icon="inbox"
              title="No receivers yet"
              subtitle="Add the staff who take cash from collectors at the end of a run."
              action={<Button icon="plus" onClick={() => setEditing('new')}>Add first receiver</Button>}
            />
          )}
        </div>
      )}

      <ReceiverModal receiver={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function ReceiverModal({ receiver, onClose, onSaved }) {
  const toast = useToast();
  const isNew = receiver === 'new';
  const [form, setForm] = useState({ name: '', designation: '', mobile: '', password: '', isActive: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!receiver) return;
    setError('');
    setForm(
      isNew
        ? { name: '', designation: '', mobile: '', password: '', isActive: true }
        : {
            name: receiver.name,
            designation: receiver.designation || '',
            mobile: receiver.mobile,
            password: '',
            isActive: receiver.isActive,
          }
    );
  }, [receiver, isNew]);

  if (!receiver) return null;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      designation: form.designation.trim(),
      mobile: form.mobile.trim(),
      isActive: form.isActive,
    };
    if (form.password) payload.password = form.password;
    try {
      if (isNew) await api.post('/api/receivers', payload);
      else await api.put(`/api/receivers/${receiver._id}`, payload);
      toast(isNew ? 'Receiver added' : 'Receiver updated');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={isNew ? 'Add receiver' : `Edit ${receiver.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Receiver name" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
        </Field>
        <Field label="Designation" hint="e.g. Account Manager, Plant Manager, Dispatch">
          <Input
            value={form.designation}
            onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
            maxLength={60}
          />
        </Field>
        <Field label="Mobile number" required hint="10-digit number — the handover OTP is sent here, and it doubles as the login if a password is set below">
          <Input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.mobile}
            onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '') }))}
            required
          />
        </Field>
        <Field
          label={receiver?.canCollect ? 'Reset password (leave blank to keep current)' : 'Password (optional)'}
          hint={
            receiver?.canCollect
              ? 'This receiver can log in and collect cash. Minimum 8 characters.'
              : 'Set a password to also let this receiver log in and collect cash, exactly like a collector. Leave blank to keep them handover-only. Minimum 8 characters.'
          }
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            minLength={8}
          />
        </Field>
        {!isNew && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 text-sm text-slate-700 transition-colors hover:bg-slate-50">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded accent-brand-700"
            />
            Active — can receive cash handovers{receiver?.canCollect ? ' and log in to collect' : ''}
          </label>
        )}
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save receiver</Button>
        </div>
      </form>
    </Modal>
  );
}

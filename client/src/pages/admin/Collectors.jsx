import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button, Field, Input, Alert, Modal, EmptyState, Avatar, TableSkeleton, PageHeader } from '../../components/ui';
import { useToast } from '../../components/toast';

export default function Collectors() {
  const [collectors, setCollectors] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | collector
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/collectors').then((d) => setCollectors(d.collectors)).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Collectors"
        subtitle="Field collectors who record cash collections on their phones"
        actions={<Button icon="plus" onClick={() => setEditing('new')}>Add collector</Button>}
      />

      {error && <Alert>{error}</Alert>}

      {!collectors ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Mobile (login)</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {collectors.map((d) => (
                  <tr key={d._id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5 font-medium text-slate-900">
                        <Avatar name={d.name} className="h-7 w-7 text-[11px]" />
                        {d.name}
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 font-mono text-xs text-slate-600">{d.mobile}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2.5 text-xs font-semibold ${
                          d.isActive ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${d.isActive ? 'bg-brand-600' : 'bg-slate-400'}`} />
                        {d.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="min-h-9 cursor-pointer rounded-lg px-2.5 font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                        onClick={() => setEditing(d)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {collectors.length === 0 && (
            <EmptyState
              icon="truck"
              title="No collectors yet"
              subtitle="Add the field collectors who collect cash from parties."
              action={<Button icon="plus" onClick={() => setEditing('new')}>Add first collector</Button>}
            />
          )}
        </div>
      )}

      <CollectorModal collector={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function CollectorModal({ collector, onClose, onSaved }) {
  const toast = useToast();
  const isNew = collector === 'new';
  const [form, setForm] = useState({ name: '', mobile: '', password: '', isActive: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!collector) return;
    setError('');
    setForm(
      isNew
        ? { name: '', mobile: '', password: '', isActive: true }
        : { name: collector.name, mobile: collector.mobile, password: '', isActive: collector.isActive }
    );
  }, [collector, isNew]);

  if (!collector) return null;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = { name: form.name.trim(), mobile: form.mobile.trim(), isActive: form.isActive };
    if (form.password) payload.password = form.password;
    try {
      if (isNew) await api.post('/api/collectors', payload);
      else await api.put(`/api/collectors/${collector._id}`, payload);
      toast(isNew ? 'Collector added' : 'Collector updated');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={isNew ? 'Add collector' : `Edit ${collector.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Collector name" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
        </Field>
        <Field label="Mobile number" required hint="Used to log in to the collector app">
          <Input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.mobile}
            onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '') }))}
            required
          />
        </Field>
        <Field label={isNew ? 'Password' : 'Reset password (leave blank to keep current)'} required={isNew} hint="Minimum 6 characters">
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required={isNew}
            minLength={6}
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
            Active — can log in and collect
          </label>
        )}
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save collector</Button>
        </div>
      </form>
    </Modal>
  );
}

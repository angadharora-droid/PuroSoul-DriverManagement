import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button, Field, Input, Alert, Modal, EmptyState, Avatar, TableSkeleton, PageHeader } from '../../components/ui';
import { useToast } from '../../components/toast';

export default function Drivers() {
  const [drivers, setDrivers] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | driver
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/drivers').then((d) => setDrivers(d.drivers)).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Drivers"
        subtitle="Field drivers who record cash collections on their phones"
        actions={<Button icon="plus" onClick={() => setEditing('new')}>Add driver</Button>}
      />

      {error && <Alert>{error}</Alert>}

      {!drivers ? (
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
                {drivers.map((d) => (
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
          {drivers.length === 0 && (
            <EmptyState
              icon="truck"
              title="No drivers yet"
              subtitle="Add the field drivers who collect cash from parties."
              action={<Button icon="plus" onClick={() => setEditing('new')}>Add first driver</Button>}
            />
          )}
        </div>
      )}

      <DriverModal driver={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function DriverModal({ driver, onClose, onSaved }) {
  const toast = useToast();
  const isNew = driver === 'new';
  const [form, setForm] = useState({ name: '', mobile: '', password: '', isActive: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!driver) return;
    setError('');
    setForm(
      isNew
        ? { name: '', mobile: '', password: '', isActive: true }
        : { name: driver.name, mobile: driver.mobile, password: '', isActive: driver.isActive }
    );
  }, [driver, isNew]);

  if (!driver) return null;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = { name: form.name.trim(), mobile: form.mobile.trim(), isActive: form.isActive };
    if (form.password) payload.password = form.password;
    try {
      if (isNew) await api.post('/api/drivers', payload);
      else await api.put(`/api/drivers/${driver._id}`, payload);
      toast(isNew ? 'Driver added' : 'Driver updated');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={isNew ? 'Add driver' : `Edit ${driver.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Driver name" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
        </Field>
        <Field label="Mobile number" required hint="Used to log in to the driver app">
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
          <Button type="submit" loading={busy}>Save driver</Button>
        </div>
      </form>
    </Modal>
  );
}

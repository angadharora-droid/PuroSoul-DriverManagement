import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button, Field, Input, Alert, Modal, EmptyState, Avatar, TableSkeleton, PageHeader } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useAuth } from '../../context/AuthContext';

export default function Admins() {
  const [admins, setAdmins] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | admin
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/api/admins').then((d) => setAdmins(d.admins)).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admins"
        subtitle="Admin accounts with full access to collections, reports and settings"
        actions={<Button icon="plus" onClick={() => setEditing('new')}>Add admin</Button>}
      />

      {error && <Alert>{error}</Alert>}

      {!admins ? (
        <TableSkeleton rows={3} cols={5} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email (login)</th>
                  <th className="px-4 py-3 font-semibold">Mobile</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a._id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5 font-medium text-slate-900">
                        <Avatar name={a.name} className="h-7 w-7 text-[11px]" />
                        {a.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{a.email}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{a.mobile || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2.5 text-xs font-semibold ${
                          a.isActive ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${a.isActive ? 'bg-brand-600' : 'bg-slate-400'}`} />
                        {a.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="min-h-9 cursor-pointer rounded-lg px-2.5 font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                        onClick={() => setEditing(a)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AdminModal admin={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function AdminModal({ admin, onClose, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  const isNew = admin === 'new';
  const isSelf = !isNew && admin && admin._id === user?.id;
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '', isActive: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!admin) return;
    setError('');
    setForm(
      isNew
        ? { name: '', email: '', mobile: '', password: '', isActive: true }
        : { name: admin.name, email: admin.email, mobile: admin.mobile || '', password: '', isActive: admin.isActive }
    );
  }, [admin, isNew]);

  if (!admin) return null;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = { name: form.name.trim(), email: form.email.trim(), mobile: form.mobile.trim(), isActive: form.isActive };
    if (form.password) payload.password = form.password;
    try {
      if (isNew) await api.post('/api/admins', payload);
      else await api.put(`/api/admins/${admin._id}`, payload);
      toast(isNew ? 'Admin added' : 'Admin updated');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={isNew ? 'Add admin' : `Edit ${admin.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required autoFocus />
        </Field>
        <Field label="Email" required hint="Used to log in to the admin panel">
          <Input
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </Field>
        <Field label="Mobile (optional)" hint="10-digit contact number. To receive cash handovers, add the person on the Receivers page.">
          <Input
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            pattern="\d{10}"
            placeholder="9876543210"
            value={form.mobile}
            onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
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
        {!isNew && !isSelf && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 text-sm text-slate-700 transition-colors hover:bg-slate-50">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded accent-brand-700"
            />
            Active — can log in
          </label>
        )}
        {isSelf && <p className="text-xs text-slate-500">This is your own account — you cannot deactivate yourself.</p>}
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save admin</Button>
        </div>
      </form>
    </Modal>
  );
}

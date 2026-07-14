import { useState } from 'react';
import { api } from '../api/client';
import { Alert, Button, Field, Input, Modal } from './ui';
import { useToast } from './toast';

export default function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 6) return setError('New password must be at least 6 characters');
    if (next !== confirm) return setError('New passwords do not match');
    setError('');
    setSaving(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next });
      toast('Password changed');
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Change password" onClose={close}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Current password" required>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </Field>
        <Field label="New password" hint="At least 6 characters" required>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={6}
          />
        </Field>
        <Field label="Confirm new password" required>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} icon="lock">
            Change password
          </Button>
        </div>
      </form>
    </Modal>
  );
}

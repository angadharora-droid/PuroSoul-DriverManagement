import { useState } from 'react';
import { api } from '../api/client';
import { Alert, Button, Field, Input, Modal, SegmentedControl } from './ui';
import { useToast } from './toast';
import { useAuth } from '../context/AuthContext';

const MODES = [
  { value: 'text', label: 'Text password' },
  { value: 'pin4', label: '4-digit PIN' },
  { value: 'pin6', label: '6-digit PIN' },
];

export default function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [mode, setMode] = useState('text');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // PIN modes exist for admins only; everyone else gets the plain text form.
  const isPin = isAdmin && mode !== 'text';
  const pinLength = mode === 'pin4' ? 4 : 6;
  const noun = isPin ? 'PIN' : 'password';

  const close = () => {
    setMode('text');
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
    onClose();
  };

  const switchMode = (m) => {
    setMode(m);
    setNext('');
    setConfirm('');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (isPin) {
      if (!new RegExp(`^\\d{${pinLength}}$`).test(next)) return setError(`PIN must be exactly ${pinLength} digits`);
    } else if (next.length < 8) {
      return setError('New password must be at least 8 characters');
    }
    if (next !== confirm) return setError(`New ${noun}s do not match`);
    setError('');
    setSaving(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next });
      toast(isPin ? 'PIN set' : 'Password changed');
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const pinProps = isPin ? { inputMode: 'numeric', maxLength: pinLength } : { minLength: 8 };
  const handlePinSafe = (setter) => (e) => setter(isPin ? e.target.value.replace(/\D/g, '').slice(0, pinLength) : e.target.value);

  return (
    <Modal open={open} title="Change password" onClose={close}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        {isAdmin && <SegmentedControl value={mode} onChange={switchMode} options={MODES} />}
        <Field label="Current password" required>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </Field>
        <Field label={`New ${noun}`} hint={isPin ? `Exactly ${pinLength} digits` : 'At least 8 characters'} required>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={handlePinSafe(setNext)}
            required
            {...pinProps}
          />
        </Field>
        <Field label={`Confirm new ${noun}`} required>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={handlePinSafe(setConfirm)}
            required
            {...pinProps}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} icon="lock">
            {isPin ? 'Set PIN' : 'Change password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

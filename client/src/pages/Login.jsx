import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Input, Alert, SegmentedControl, inputClass } from '../components/ui';
import { BrandMark } from '../components/Layout';
import Icon from '../components/icons';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('driver');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(role, role === 'admin' ? { email, password } : { mobile, password });
      navigate(user.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Soft brand backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-brand-100/60 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark className="mb-3 h-14 w-14" />
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand-900">Puro Soul Cash</h1>
          <p className="mt-0.5 text-sm text-slate-500">Field cash collection verification</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-pop">
          <SegmentedControl
            className="mb-5"
            value={role}
            onChange={(r) => {
              setRole(r);
              setError('');
            }}
            options={[
              { value: 'driver', label: 'Driver', icon: 'truck' },
              { value: 'admin', label: 'Admin', icon: 'shield' },
            ]}
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            {role === 'driver' ? (
              <Field label="Mobile number">
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
              </Field>
            ) : (
              <Field label="Email">
                <Input type="email" autoComplete="email" placeholder="admin@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
            )}
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eye-slash' : 'eye'} className="h-5 w-5" />
                </button>
              </div>
            </Field>
            <Alert>{error}</Alert>
            <Button type="submit" className="w-full py-3" loading={busy}>
              {busy ? 'Signing in…' : 'Log in'}
            </Button>
          </form>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <Icon name="droplet" className="h-3.5 w-3.5 text-brand-400" />
          <span className="font-display italic">Where purity lives in every drop</span>
          <span aria-hidden="true">•</span>
          OTP-verified collections
        </p>
      </div>
    </div>
  );
}

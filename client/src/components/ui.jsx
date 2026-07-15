import { useEffect, useRef } from 'react';
import Icon from './icons';
import { STATUS_LABELS } from '../utils/format';

export function Button({ children, variant = 'primary', loading = false, icon, className = '', disabled, ...props }) {
  const variants = {
    primary:
      'bg-brand-700 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-800 disabled:bg-slate-300 disabled:shadow-none',
    secondary: 'bg-white text-slate-700 border border-slate-300 shadow-sm hover:border-slate-400 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
    ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-slate-400',
  };
  return (
    <button
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} className="h-4.5 w-4.5" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
          <Icon name="warning" className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  'w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50 disabled:text-slate-400';

export function Input(props) {
  return <input className={inputClass} {...props} />;
}

const STATUS_STYLES = {
  verified: { chip: 'bg-brand-100 text-brand-800', icon: 'check-circle' },
  pending_otp: { chip: 'bg-amber-100 text-amber-800', icon: 'clock' },
  expired: { chip: 'bg-slate-200 text-slate-600', icon: 'clock' },
  failed: { chip: 'bg-red-100 text-red-700', icon: 'warning' },
  cancelled: { chip: 'bg-slate-200 text-slate-600', icon: 'close' },
};

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.expired;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2.5 text-xs font-semibold ${s.chip}`}>
      <Icon name={s.icon} className="h-3.5 w-3.5" strokeWidth={2} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-700',
    success: 'border-brand-200 bg-brand-50 text-brand-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  };
  const icons = { error: 'warning', success: 'check-circle', info: 'info' };
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm animate-fade-in-up ${styles[kind]}`}>
      <Icon name={icons[kind]} className="mt-0.5 h-4.5 w-4.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin text-current ${className}`} viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Modal({ open, title, onClose, children, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-pop animate-scale-in sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close dialog"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon name={icon} className="h-7 w-7" />
      </div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {subtitle && <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon, accent = false }) {
  return (
    <div
      className={`flex items-center gap-3.5 rounded-2xl border p-4 shadow-card ${
        accent ? 'border-brand-200 bg-gradient-to-br from-brand-50 to-white' : 'border-slate-200 bg-white'
      }`}
    >
      {icon && (
        <div
          className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex ${
            accent ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <Icon name={icon} className="h-5.5 w-5.5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`tnum mt-0.5 truncate text-xl font-bold sm:text-2xl ${accent ? 'text-brand-800' : 'text-slate-900'}`}>{value}</p>
      </div>
    </div>
  );
}

export function Avatar({ name, className = 'h-8 w-8 text-xs' }) {
  const initials = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  // Deterministic pastel per name so the same party/driver always gets the same color
  const hues = [
    'bg-emerald-100 text-emerald-700',
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-teal-100 text-teal-700',
  ];
  const hue = hues[(name || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${hue} ${className}`} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Skeleton placeholder for tables/lists so layout doesn't jump when data lands. */
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4" role="status" aria-label="Loading data">
      <div className="space-y-3.5">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-32' : c === cols - 1 ? 'ml-auto w-16' : 'w-24 flex-1'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 3 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading data">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-[22px] font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SegmentedControl({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 overflow-x-auto rounded-xl bg-slate-200/70 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150 ${
            value === o.value ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.icon && <Icon name={o.icon} className="h-4 w-4" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Six-box OTP input backed by a single real input, so paste, backspace and
 * SMS autofill (autocomplete="one-time-code") all work natively.
 */
export function OtpInput({ value, onChange, disabled = false, autoFocus = true }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className="relative" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer text-2xl opacity-0"
        aria-label="6-digit OTP"
      />
      <div className="flex justify-between gap-2" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => {
          const filled = i < value.length;
          const active = i === value.length && !disabled;
          return (
            <div
              key={i}
              className={`tnum flex h-14 flex-1 items-center justify-center rounded-xl border-2 text-2xl font-bold transition-all duration-150 ${
                filled
                  ? 'border-brand-600 bg-brand-50 text-brand-900'
                  : active
                    ? 'border-brand-400 bg-white shadow-[0_0_0_3px_rgba(24,89,151,0.14)]'
                    : 'border-slate-200 bg-white text-slate-300'
              }`}
            >
              {value[i] || (active ? <span className="h-6 w-0.5 animate-pulse bg-brand-600" /> : '')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

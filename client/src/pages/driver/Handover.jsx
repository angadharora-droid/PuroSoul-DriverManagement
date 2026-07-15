import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button, Field, Alert, OtpInput, inputClass, EmptyState, CardSkeleton, StatusBadge } from '../../components/ui';
import Icon from '../../components/icons';
import { formatINR, formatDateTime } from '../../utils/format';

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return target ? Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000)) : 0;
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const STEPS = [
  { key: 'select', label: 'Select cash' },
  { key: 'otp', label: 'Verify' },
  { key: 'done', label: 'Done' },
];

function StepIndicator({ current }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="mb-5 flex items-center gap-1.5" aria-label={`Step ${idx + 1} of 3: ${STEPS[idx].label}`}>
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-1 flex-col gap-1.5">
          <span
            className={`h-1.5 rounded-full transition-colors duration-300 ${
              i < idx ? 'bg-brand-400' : i === idx ? 'bg-brand-700' : 'bg-slate-200'
            }`}
          />
          <span className={`text-[11px] font-semibold ${i === idx ? 'text-brand-800' : 'text-slate-400'}`}>
            {i + 1}. {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Handover() {
  const [step, setStep] = useState('select');
  const [cash, setCash] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [recipientId, setRecipientId] = useState('');
  const [notes, setNotes] = useState('');
  const [handover, setHandover] = useState(null);
  const [otpSentTo, setOtpSentTo] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(null);
  const [history, setHistory] = useState(null);

  const otpSecondsLeft = useCountdown(step === 'otp' ? handover?.otpExpiresAt : null);
  const resendWait = useCountdown(step === 'otp' ? resendAvailableAt : null);
  const otpTotalSeconds = 300;

  const loadCash = useCallback(() => {
    api.get('/api/handovers/pending-cash').then(setCash).catch((err) => setError(err.message));
  }, []);
  const loadHistory = useCallback(() => {
    api.get('/api/handovers/mine', { limit: 5 }).then((d) => setHistory(d.items)).catch(() => {});
  }, []);

  useEffect(() => {
    loadCash();
    loadHistory();
    api.get('/api/handovers/recipients').then((d) => setRecipients(d.recipients)).catch((err) => setError(err.message));
  }, [loadCash, loadHistory]);

  const items = cash?.items || [];
  const selectedItems = items.filter((t) => selected.has(t.id));
  const selectedTotal = selectedItems.reduce((s, t) => s + t.amount, 0);
  const allSelected = items.length > 0 && selected.size === items.length;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((t) => t.id)));
  }

  async function startHandover(e) {
    e.preventDefault();
    setError('');
    if (selected.size === 0) return setError('Select at least one collection to hand over');
    if (!recipientId) return setError('Select who is receiving the cash');

    setBusy(true);
    try {
      const data = await api.post('/api/handovers', { transactionIds: [...selected], recipientId, notes });
      setHandover(data.handover);
      setOtpSentTo(data.otpSentTo);
      setResendAvailableAt(Date.now() + data.handover.resendCooldownSeconds * 1000);
      setOtp('');
      setInfo('');
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.post(`/api/handovers/${handover.id}/verify`, { otp });
      setHandover(data.handover);
      setStep('done');
    } catch (err) {
      setError(err.message);
      setOtp('');
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const data = await api.post(`/api/handovers/${handover.id}/resend-otp`);
      setHandover(data.handover);
      setOtpSentTo(data.otpSentTo);
      setResendAvailableAt(Date.now() + data.handover.resendCooldownSeconds * 1000);
      setOtp('');
      setInfo('A new OTP has been sent to the recipient.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('select');
    setSelected(new Set());
    setRecipientId('');
    setNotes('');
    setHandover(null);
    setOtp('');
    setError('');
    setInfo('');
    loadCash();
    loadHistory();
  }

  async function cancelHandover() {
    if (handover) {
      await api.post(`/api/handovers/${handover.id}/cancel`).catch(() => {});
    }
    reset();
  }

  // ---------------------------------------------------------------- done ---
  if (step === 'done') {
    return (
      <div className="mx-auto max-w-md animate-fade-in-up">
        <StepIndicator current="done" />
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-card">
          <div className="bg-gradient-to-b from-brand-50 to-white px-6 pb-5 pt-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-700 shadow-lg shadow-brand-700/30 animate-pop">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                <path d="M5 13l4 4L19 7" strokeDasharray="24" className="animate-draw" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Handover verified</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-slate-500">
              {handover.recipient?.name} confirmed receiving the cash by OTP. The handover is recorded and will appear in reports.
            </p>
          </div>

          <div className="px-6 pb-6">
            <p className="tnum text-center text-3xl font-bold text-brand-800">{formatINR(handover.totalAmount)}</p>

            <div className="mt-5 space-y-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Handed over to</span><span className="text-right font-semibold">{handover.recipient?.name}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Collections</span><span className="tnum text-right font-semibold">{handover.transactionCount}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Verified at</span><span className="text-right font-semibold">{formatDateTime(handover.verifiedAt)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Reference</span><span className="tnum font-mono font-semibold">{handover.ref}</span></div>
            </div>

            <div className="mt-5 grid gap-2">
              <Button onClick={reset} icon="arrows-right-left" className="w-full py-3">Back to handover</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------- otp ---
  if (step === 'otp') {
    const expired = otpSecondsLeft === 0;
    const progress = Math.max(0, Math.min(1, otpSecondsLeft / otpTotalSeconds));
    return (
      <div className="mx-auto max-w-md animate-fade-in-up">
        <StepIndicator current="otp" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <Icon name="phone" className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug text-slate-900">Ask {handover.recipient?.name} for the OTP</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                A 6-digit code was sent to <span className="font-semibold text-slate-700">{handover.recipient?.name}</span>'s mobile ({otpSentTo}).
                Entering it confirms they received the cash from you.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Handing over <span className="tnum font-bold text-slate-800">{formatINR(handover.totalAmount)}</span>{' '}
                ({handover.transactionCount} collection{handover.transactionCount === 1 ? '' : 's'})
              </span>
              <span className={`tnum flex items-center gap-1.5 font-mono font-bold ${expired ? 'text-red-600' : otpSecondsLeft < 60 ? 'text-amber-600' : 'text-slate-700'}`}>
                <Icon name="clock" className="h-4 w-4" strokeWidth={2} />
                {expired ? 'Expired' : mmss(otpSecondsLeft)}
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200" role="presentation">
              <div
                className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${expired ? 'bg-red-400' : otpSecondsLeft < 60 ? 'bg-amber-400' : 'bg-brand-500'}`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          <form onSubmit={verifyOtp} className="mt-5 space-y-4">
            <OtpInput value={otp} onChange={setOtp} disabled={expired || busy} />
            <Alert>{error}</Alert>
            <Alert kind="info">{info}</Alert>
            <Button type="submit" icon={busy ? undefined : 'shield'} className="w-full py-3" loading={busy} disabled={otp.length !== 6 || expired}>
              {busy ? 'Verifying…' : 'Verify handover'}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
            <button
              onClick={resendOtp}
              disabled={busy || resendWait > 0 || handover.resendsLeft === 0}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 font-semibold text-brand-700 transition-colors hover:text-brand-800 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <Icon name="refresh" className="h-4 w-4" />
              {handover.resendsLeft === 0 ? 'No resends left' : resendWait > 0 ? `Resend in ${resendWait}s` : `Resend OTP (${handover.resendsLeft} left)`}
            </button>
            <button onClick={cancelHandover} className="min-h-11 cursor-pointer px-2 text-slate-500 transition-colors hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------- select ---
  return (
    <div className="mx-auto max-w-md space-y-4 animate-fade-in-up">
      <div>
        <StepIndicator current="select" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <h2 className="text-lg font-bold text-slate-900">Hand over cash</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Tick the collections you are handing over and select the receiver — an OTP goes to their mobile to confirm.
          </p>

          {!cash ? (
            <div className="mt-5"><CardSkeleton count={3} /></div>
          ) : items.length === 0 ? (
            <>
              <div className="mt-4"><Alert>{error}</Alert></div>
              <EmptyState
                icon="banknotes"
                title="No cash to hand over"
                subtitle="Verified collections that haven't been handed over yet will appear here."
              />
            </>
          ) : (
            <form onSubmit={startHandover} className="mt-5 space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <label className="flex cursor-pointer items-center gap-3 border-b border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded accent-brand-700" />
                  Select all ({items.length} collection{items.length === 1 ? '' : 's'} • {formatINR(cash.totalAmount)})
                </label>
                <div className="max-h-72 overflow-y-auto">
                  {items.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3.5 py-2.5 transition-colors last:border-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                        className="h-4 w-4 shrink-0 rounded accent-brand-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-900">{t.party}</p>
                          <p className="tnum shrink-0 text-sm font-bold text-slate-900">{formatINR(t.amount)}</p>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDateTime(t.collectedAt)} • ref <span className="tnum font-mono">{t.ref}</span>
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {selected.size > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
                  <span className="font-semibold text-brand-900">
                    Handing over {selected.size} collection{selected.size === 1 ? '' : 's'}
                  </span>
                  <span className="tnum text-base font-bold text-brand-900">{formatINR(selectedTotal)}</span>
                </div>
              )}

              <Field
                label="Hand over to"
                required
                hint={
                  recipients.length === 0
                    ? 'No recipients available — an admin must add their mobile number on the Admins page first'
                    : "The OTP goes to this person's mobile — they must be with you"
                }
              >
                <select className={inputClass} value={recipientId} onChange={(e) => setRecipientId(e.target.value)} required>
                  <option value="">Select recipient…</option>
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.mobile})</option>
                  ))}
                </select>
              </Field>

              <Field label="Notes (optional)">
                <input
                  type="text"
                  maxLength={500}
                  placeholder="e.g. end of day handover"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Alert>{error}</Alert>

              <Button type="submit" icon={busy ? undefined : 'send'} className="w-full py-3" loading={busy} disabled={selected.size === 0 || !recipientId}>
                {busy ? 'Sending OTP…' : selected.size > 0 ? `Send OTP • ${formatINR(selectedTotal)}` : 'Send OTP to recipient'}
              </Button>

              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-400">
                <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The OTP goes to the recipient's phone, not yours. Ask them for the code once they have counted the cash.
              </p>
            </form>
          )}
        </div>
      </div>

      {history && history.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Recent handovers</h3>
          <div className="space-y-2.5">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {h.recipient?.name} <span className="font-normal text-slate-400">• {h.transactionCount} collection{h.transactionCount === 1 ? '' : 's'}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(h.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="tnum text-sm font-bold text-slate-900">{formatINR(h.totalAmount)}</span>
                  <StatusBadge status={h.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

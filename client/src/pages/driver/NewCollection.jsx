import { useEffect, useState } from 'react';
import { api, apiDownload } from '../../api/client';
import PartySelect from '../../components/PartySelect';
import { Button, Field, Alert, OtpInput, inputClass } from '../../components/ui';
import Icon from '../../components/icons';
import { useToast } from '../../components/toast';
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
  { key: 'form', label: 'Details' },
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

export default function NewCollection() {
  const toast = useToast();
  const [step, setStep] = useState('form');
  const [party, setParty] = useState(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [txn, setTxn] = useState(null);
  const [otpSentTo, setOtpSentTo] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(null);

  const otpSecondsLeft = useCountdown(step === 'otp' ? txn?.otpExpiresAt : null);
  const resendWait = useCountdown(step === 'otp' ? resendAvailableAt : null);
  const otpTotalSeconds = 300;

  const amountNumber = Number(amount);
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0;

  async function sendOtp(e) {
    e.preventDefault();
    setError('');
    if (!party) return setError('Please select a party from the list');
    if (!amountValid) return setError('Enter an amount greater than zero');

    setBusy(true);
    try {
      const data = await api.post('/api/collections', { partyId: party.value, amount: amountNumber, notes });
      setTxn(data.transaction);
      setOtpSentTo(data.otpSentTo);
      setResendAvailableAt(Date.now() + data.transaction.resendCooldownSeconds * 1000);
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
      const data = await api.post(`/api/collections/${txn.id}/verify`, { otp });
      setTxn(data.transaction);
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
      const data = await api.post(`/api/collections/${txn.id}/resend-otp`);
      setTxn(data.transaction);
      setOtpSentTo(data.otpSentTo);
      setResendAvailableAt(Date.now() + data.transaction.resendCooldownSeconds * 1000);
      setOtp('');
      setInfo('A new OTP has been sent to the party.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep('form');
    setParty(null);
    setAmount('');
    setNotes('');
    setTxn(null);
    setOtp('');
    setError('');
    setInfo('');
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
            <h2 className="text-lg font-bold text-slate-900">Collection verified</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-slate-500">
              The party confirmed by OTP. Stakeholders are being emailed the receipt and the party gets an SMS confirmation.
            </p>
          </div>

          <div className="px-6 pb-6">
            <p className="tnum text-center text-3xl font-bold text-brand-800">{formatINR(txn.amount)}</p>

            <div className="mt-5 space-y-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Party</span><span className="text-right font-semibold">{txn.party?.name}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Verified at</span><span className="text-right font-semibold">{formatDateTime(txn.verifiedAt)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Reference</span><span className="tnum font-mono font-semibold">{txn.ref}</span></div>
            </div>

            <div className="mt-5 grid gap-2">
              <Button onClick={reset} icon="plus" className="w-full py-3">Start new collection</Button>
              <Button
                variant="secondary"
                icon="download"
                className="w-full"
                onClick={() =>
                  apiDownload(`/api/collections/${txn.id}/receipt.pdf`, null, `receipt-${txn.ref}.pdf`)
                    .then(() => toast('Receipt downloaded'))
                    .catch((e) => toast(e.message, 'error'))
                }
              >
                Download receipt (PDF)
              </Button>
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
              <h2 className="text-lg font-bold leading-snug text-slate-900">Ask the party for the OTP</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                A 6-digit code was sent to <span className="font-semibold text-slate-700">{txn.party?.name}</span>'s mobile ({otpSentTo}).
                Entering it confirms they acknowledge handing over the cash.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Collecting <span className="tnum font-bold text-slate-800">{formatINR(txn.amount)}</span></span>
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
              {busy ? 'Verifying…' : 'Verify collection'}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
            <button
              onClick={resendOtp}
              disabled={busy || resendWait > 0 || txn.resendsLeft === 0}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 font-semibold text-brand-700 transition-colors hover:text-brand-800 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <Icon name="refresh" className="h-4 w-4" />
              {txn.resendsLeft === 0 ? 'No resends left' : resendWait > 0 ? `Resend in ${resendWait}s` : `Resend OTP (${txn.resendsLeft} left)`}
            </button>
            <button onClick={reset} className="min-h-11 cursor-pointer px-2 text-slate-500 transition-colors hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- form ---
  return (
    <div className="mx-auto max-w-md animate-fade-in-up">
      <StepIndicator current="form" />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold text-slate-900">New cash collection</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Select the party and amount — an OTP goes to the party's registered mobile to confirm.
        </p>

        <form onSubmit={sendOtp} className="mt-5 space-y-4">
          <Field label="Party" required hint="Select from the approved list — free typing is disabled">
            <PartySelect value={party} onChange={setParty} />
          </Field>

          <Field label="Amount collected" required>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-lg font-semibold text-slate-400" aria-hidden="true">
                ₹
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className={`${inputClass} tnum pl-11 text-lg font-semibold`}
              />
            </div>
            {amountValid && (
              <span className="tnum mt-1.5 block text-xs font-medium text-brand-700">You are collecting {formatINR(amountNumber)}</span>
            )}
          </Field>

          <Field label="Notes (optional)">
            <input
              type="text"
              maxLength={500}
              placeholder="e.g. against invoice #123"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Alert>{error}</Alert>

          <Button type="submit" icon={busy ? undefined : 'send'} className="w-full py-3" loading={busy} disabled={!party || !amountValid}>
            {busy ? 'Sending OTP…' : 'Send OTP to party'}
          </Button>

          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-400">
            <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The OTP goes to the party's phone, not yours. You'll need to ask them for the code in person.
          </p>
        </form>
      </div>
    </div>
  );
}

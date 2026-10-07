import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, apiBlob, saveBlob } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Button, Field, Alert, OtpInput, inputClass, EmptyState, CardSkeleton, StatusBadge, PageHeader, Spinner, Modal } from '../../components/ui';
import Icon from '../../components/icons';
import ScreenshotViewer from '../../components/ScreenshotViewer';
import { useToast } from '../../components/toast';
import { formatINR, formatDateTime, OTP_LENGTH } from '../../utils/format';
import { prepareScreenshot, dataUrlToBase64, formatBytes } from '../../utils/image';

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
  { key: 'form', label: 'Bill' },
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

const EMPTY_FORM = { customerName: '', customerMobile: '', qty: {}, paymentMode: '', upiRef: '', screenshot: null };

const isBlankForm = (f) =>
  !f.customerName && !f.customerMobile && !Object.values(f.qty || {}).some(Number) && !f.paymentMode && !f.upiRef && !f.screenshot;

/** Accepts pasted "+91 98765-43210" / "098765 43210" and keeps the bare 10 digits. */
function cleanMobile(value) {
  let d = String(value).replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

// The unsent bill — screenshot included — is kept on this device until the
// server has it, so a reload, a phone call or Android killing the tab never
// loses it. Keyed per user + event, since stall phones are often shared.
const draftKeyFor = (userId, eventId) => `purosoul_event_draft:${userId}:${eventId}`;

function readDraft(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

/** 'full' when saved with the screenshot, 'partial' when storage only had room for the text. */
function writeDraft(key, form) {
  try {
    localStorage.setItem(key, JSON.stringify(form));
    return 'full';
  } catch {
    try {
      localStorage.setItem(key, JSON.stringify({ ...form, screenshot: null }));
    } catch {
      /* storage unavailable — the in-memory form still works */
    }
    return 'partial';
  }
}

function dropDraft(key) {
  try {
    if (key) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function QtyStepper({ label, value, max, disabled, onChange }) {
  const n = Number(value) || 0;
  const btn =
    'flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} aria-label={`One less ${label}`} disabled={disabled || n <= 0} onClick={() => onChange(String(n - 1))}>
        <Icon name="minus" className="h-4 w-4" strokeWidth={2.2} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`${label} quantity`}
        placeholder="0"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
        className="tnum h-10 w-14 rounded-lg border border-slate-300 bg-white text-center text-base font-bold text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50"
      />
      <button type="button" className={btn} aria-label={`One more ${label}`} disabled={disabled || n >= max} onClick={() => onChange(String(n + 1))}>
        <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}

function PayOption({ active, icon, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left transition-colors ${
        active ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs text-slate-500">{subtitle}</span>
      </span>
    </button>
  );
}

export default function EventBilling() {
  const toast = useToast();
  const { user } = useAuth();
  const { id: preferredId } = useParams(); // admin arrives from an event's report page
  const [events, setEvents] = useState(null);
  const [eventId, setEventId] = useState('');
  const [loadError, setLoadError] = useState('');

  const [step, setStep] = useState('form');
  const [form, setForm] = useState(EMPTY_FORM);
  const [restored, setRestored] = useState(false);
  const [draftPartial, setDraftPartial] = useState(false);
  const [shotBusy, setShotBusy] = useState(false);

  const [bill, setBill] = useState(null);
  const [otpSentTo, setOtpSentTo] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmUpi, setConfirmUpi] = useState(false);

  const [recent, setRecent] = useState(null);
  const [viewShot, setViewShot] = useState(null);

  const fileRef = useRef(null);
  const confirmTimer = useRef(null);
  const draftLoadedFor = useRef('');
  const billFromForm = useRef(false);

  const event = events?.find((e) => String(e.id) === eventId) || null;
  const draftKey = user && eventId ? draftKeyFor(user.id, eventId) : '';

  const otpSecondsLeft = useCountdown(step === 'otp' ? bill?.otpExpiresAt : null);
  const resendWait = useCountdown(step === 'otp' ? resendAvailableAt : null);
  const otpTotalSeconds = 300;

  const loadEvents = useCallback(() => {
    api
      .get('/api/events/mine')
      .then((d) => {
        setEvents(d.events);
        const ids = d.events.map((e) => String(e.id));
        setEventId((cur) => (cur && ids.includes(cur) ? cur : preferredId && ids.includes(preferredId) ? preferredId : ids[0] || ''));
      })
      .catch((err) => setLoadError(err.message));
  }, [preferredId]);

  const loadRecent = useCallback(() => {
    if (!eventId) return;
    api
      .get('/api/events/bills/mine', { eventId, limit: 8 })
      .then((d) => setRecent(d.items))
      .catch(() => {});
  }, [eventId]);

  useEffect(loadEvents, [loadEvents]);
  useEffect(() => {
    setRecent(null);
    loadRecent();
  }, [loadRecent]);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  // Bring back an unsent bill for this event.
  useEffect(() => {
    if (!draftKey || draftLoadedFor.current === draftKey) return;
    draftLoadedFor.current = draftKey;
    const draft = readDraft(draftKey);
    if (draft && !isBlankForm({ ...EMPTY_FORM, ...draft })) {
      setForm({ ...EMPTY_FORM, ...draft });
      setRestored(true);
    } else {
      setForm(EMPTY_FORM);
      setRestored(false);
    }
  }, [draftKey]);

  // …and keep saving it while it's being filled in.
  useEffect(() => {
    if (!draftKey || step !== 'form' || draftLoadedFor.current !== draftKey) return undefined;
    const t = setTimeout(() => {
      if (isBlankForm(form)) {
        dropDraft(draftKey);
        setDraftPartial(false);
      } else {
        setDraftPartial(writeDraft(draftKey, form) === 'partial');
      }
    }, 300);
    return () => clearTimeout(t);
  }, [form, draftKey, step]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const activeItems = (event?.items || []).filter((i) => i.isActive);
  const lines = activeItems.map((i) => ({ ...i, q: Number(form.qty[i.id]) || 0 })).filter((l) => l.q > 0);
  const totalQty = lines.reduce((s, l) => s + l.q, 0);
  const totalAmount = Math.round(lines.reduce((s, l) => s + l.q * l.price, 0) * 100) / 100;
  const overStock = lines.find((l) => l.q > Math.max(0, l.available));

  async function onPickScreenshot(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same file again should still fire
    if (!file) return;
    setError('');
    setShotBusy(true);
    try {
      setField('screenshot', await prepareScreenshot(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setShotBusy(false);
    }
  }

  function enterOtpStep(b, sentTo) {
    setBill(b);
    setOtpSentTo(sentTo || '');
    setOtp('');
    setInfo('');
    setError('');
    setConfirmCancel(false);
    setStep('otp');
  }

  /** Validates the form; cash goes straight to the OTP, UPI asks for a final check first. */
  function submitBill(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (form.customerName.trim().length < 2) return setError("Enter the customer's name");
    if (!/^[6-9]\d{9}$/.test(form.customerMobile)) return setError("Enter the customer's 10-digit mobile number");
    if (!lines.length) return setError('Enter the quantity for at least one item');
    if (overStock) return setError(`Only ${Math.max(0, overStock.available)} × ${overStock.name} left in stock`);
    if (!form.paymentMode) return setError('Choose how the customer paid — cash or UPI');
    if (form.paymentMode === 'upi' && !form.screenshot) return setError('Attach the UPI payment screenshot');
    // A UPI bill is final the moment it's saved (no OTP to back out of), so confirm it first.
    if (form.paymentMode === 'upi') return setConfirmUpi(true);
    saveBill();
  }

  async function saveBill() {
    setBusy(true);
    try {
      const data = await api.post(`/api/events/${eventId}/bills`, {
        customerName: form.customerName.trim(),
        customerMobile: form.customerMobile,
        items: lines.map((l) => ({ itemId: l.id, quantity: l.q })),
        paymentMode: form.paymentMode,
        upiRef: form.paymentMode === 'upi' ? form.upiRef : '',
        screenshot: form.paymentMode === 'upi' ? dataUrlToBase64(form.screenshot.dataUrl) : undefined,
      });
      // The bill (and any screenshot) is on the server now — the local draft has done its job.
      dropDraft(draftKey);
      billFromForm.current = true;
      if (data.verified) {
        // UPI: final on save, no OTP.
        setConfirmUpi(false);
        setBill(data.bill);
        setForm(EMPTY_FORM);
        setRestored(false);
        setStep('done');
        loadEvents(); // stock moved
        loadRecent();
        return;
      }
      // Cash: the form stays in memory so a cancelled OTP (e.g. a mistyped number) can be fixed and resent.
      setResendAvailableAt(Date.now() + data.bill.resendCooldownSeconds * 1000);
      enterOtpStep(data.bill, data.otpSentTo);
      loadRecent();
    } catch (err) {
      setConfirmUpi(false);
      if (err.body?.bill) {
        // Saved, but the OTP SMS didn't go out — carry on to the OTP screen to resend.
        dropDraft(draftKey);
        billFromForm.current = true;
        setResendAvailableAt(null);
        enterOtpStep(err.body.bill, '');
        loadRecent();
      }
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
      const data = await api.post(`/api/events/bills/${bill.id}/verify`, { otp });
      setBill(data.bill);
      setStep('done');
      if (billFromForm.current) {
        setForm(EMPTY_FORM);
        setRestored(false);
      }
      loadEvents(); // stock moved
      loadRecent();
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
      const data = await api.post(`/api/events/bills/${bill.id}/resend-otp`);
      setBill(data.bill);
      setOtpSentTo(data.otpSentTo);
      setResendAvailableAt(Date.now() + data.bill.resendCooldownSeconds * 1000);
      setOtp('');
      setInfo('A new OTP has been sent to the customer.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function resumeBill(b) {
    billFromForm.current = false;
    setResendAvailableAt(null); // the server still enforces the real cooldown
    enterOtpStep(b, '');
  }

  async function cancelBill(b) {
    try {
      await api.post(`/api/events/bills/${b.id}/cancel`);
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    if (step === 'otp' && bill && b.id === bill.id) {
      setStep('form');
      setError('');
      setInfo(billFromForm.current ? 'Bill cancelled — correct the details below and send the OTP again.' : 'Bill cancelled.');
    } else {
      toast('Bill cancelled');
    }
    loadEvents(); // releases the stock it was holding
    loadRecent();
  }

  /** Cancelling a live bill is destructive — ask for a second tap to confirm. */
  function onCancelClick() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmCancel(false), 3500);
      return;
    }
    clearTimeout(confirmTimer.current);
    cancelBill(bill);
  }

  function newBill() {
    setStep('form');
    setBill(null);
    setError('');
    setInfo('');
  }

  async function shareBill(b) {
    let file;
    try {
      const { blob, filename } = await apiBlob(`/api/events/bills/${b.id}/bill.pdf`, null, `bill-${b.billLabel}.pdf`);
      file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Bill ${b.billLabel}` });
      } else {
        saveBlob(blob, filename);
        toast('Bill downloaded');
      }
    } catch (err) {
      if (err?.name === 'AbortError') return; // share sheet closed
      if (file) {
        saveBlob(file, file.name); // sharing refused — fall back to a download
        toast('Bill downloaded');
      } else {
        toast(err.message, 'error');
      }
    }
  }

  // ------------------------------------------------------------- loading ---
  if (!events) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <PageHeader title="Event billing" />
        {loadError ? <Alert>{loadError}</Alert> : <CardSkeleton count={3} />}
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <PageHeader title="Event billing" />
        <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
          <EmptyState
            icon="ticket"
            title={user?.role === 'admin' ? 'No open events' : 'No open event assigned to you'}
            subtitle={
              user?.role === 'admin'
                ? 'Reopen or create an event to raise bills.'
                : 'When an admin adds you as a biller on an open event, you can raise bills for it here.'
            }
          />
        </div>
      </div>
    );
  }

  const eventHeader = (
    <div className="mb-4 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white px-4 py-3">
      {events.length > 1 ? (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Billing at</span>
          <select
            className={inputClass}
            value={eventId}
            disabled={step !== 'form'}
            onChange={(e) => {
              setEventId(e.target.value);
              setError('');
              setInfo('');
            }}
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
            <Icon name="ticket" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-brand-900">{event.name}</p>
            {event.venue && <p className="truncate text-xs text-slate-500">{event.venue}</p>}
          </div>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------- done ---
  if (step === 'done') {
    return (
      <div className="mx-auto max-w-md animate-fade-in-up">
        <StepIndicator current="done" />
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-card">
          <div className="bg-gradient-to-b from-brand-50 to-white px-6 pb-4 pt-7 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 shadow-lg shadow-brand-700/30 animate-pop">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M5 13l4 4L19 7" strokeDasharray="24" className="animate-draw" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Bill {bill.billLabel} confirmed</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-slate-500">
              {bill.paymentMode === 'upi'
                ? 'Saved with the UPI payment screenshot. Share the bill with the customer below.'
                : `${bill.customerName} confirmed the purchase by OTP. Share the bill with them below.`}
            </p>
          </div>

          {/* The mini bill itself */}
          <div className="mx-5 mb-5 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-sm">
            <div className="flex justify-between gap-3 text-xs text-slate-500">
              <span>Bill <span className="tnum font-mono font-semibold text-slate-700">{bill.billLabel}</span></span>
              <span>{formatDateTime(bill.verifiedAt)}</span>
            </div>
            <p className="mt-2 font-semibold text-slate-900">{bill.customerName}</p>
            <p className="tnum text-xs text-slate-500">+91 {bill.customerMobile}</p>
            <div className="my-3 border-t border-dashed border-slate-300" />
            <div className="space-y-2">
              {bill.lines.map((l) => (
                <div key={l.item} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{l.name}</p>
                    <p className="tnum text-xs text-slate-500">{l.quantity} × {formatINR(l.price)}</p>
                  </div>
                  <span className="tnum shrink-0 font-semibold text-slate-900">{formatINR(l.amount)}</span>
                </div>
              ))}
            </div>
            <div className="my-3 border-t border-dashed border-slate-300" />
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Total <span className="tnum font-normal text-slate-500">({bill.totalQuantity} qty)</span></span>
              <span className="tnum text-xl font-bold text-brand-800">{formatINR(bill.totalAmount)}</span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-semibold ring-1 ring-slate-200">
                <Icon name={bill.paymentMode === 'upi' ? 'phone' : 'banknotes'} className="h-3.5 w-3.5" />
                {bill.paymentMode === 'upi' ? 'UPI' : 'Cash'}
              </span>
              {bill.upiRef && <span className="tnum font-mono">Ref {bill.upiRef}</span>}
              {bill.hasScreenshot && (
                <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                  <Icon name="check-circle" className="h-3.5 w-3.5" />
                  Screenshot saved
                </span>
              )}
            </p>
          </div>

          <div className="grid gap-2 px-5 pb-5">
            <Button onClick={newBill} icon="plus" className="w-full py-3">New bill</Button>
            <Button variant="secondary" icon="share" className="w-full" onClick={() => shareBill(bill)}>
              Share / download bill (PDF)
            </Button>
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
              <h2 className="text-lg font-bold leading-snug text-slate-900">Ask {bill.customerName} for the OTP</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                A {OTP_LENGTH}-digit code was sent to the customer's mobile{otpSentTo ? ` (${otpSentTo})` : ''}. Entering it confirms the purchase and payment.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">
                Bill <span className="tnum font-bold text-slate-800">{formatINR(bill.totalAmount)}</span> • {bill.paymentMode === 'upi' ? 'UPI' : 'Cash'}
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
            <Button type="submit" icon={busy ? undefined : 'shield'} className="w-full py-3" loading={busy} disabled={otp.length !== OTP_LENGTH || expired}>
              {busy ? 'Verifying…' : 'Confirm bill'}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
            <button
              onClick={resendOtp}
              disabled={busy || resendWait > 0 || bill.resendsLeft === 0}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 font-semibold text-brand-700 transition-colors hover:text-brand-800 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <Icon name="refresh" className="h-4 w-4" />
              {bill.resendsLeft === 0 ? 'No resends left' : resendWait > 0 ? `Resend in ${resendWait}s` : `Resend OTP (${bill.resendsLeft} left)`}
            </button>
            <button
              onClick={onCancelClick}
              className={`min-h-11 cursor-pointer rounded-lg px-2 transition-colors ${
                confirmCancel ? 'font-semibold text-red-600 hover:text-red-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {confirmCancel ? 'Tap again to cancel' : 'Cancel bill'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- form ---
  const livePending = recent?.find((b) => b.status === 'pending_otp' && new Date(b.otpExpiresAt).getTime() > Date.now());

  return (
    <div className="mx-auto max-w-md space-y-4 animate-fade-in-up">
      <div>
        <StepIndicator current="form" />
        {eventHeader}

        {livePending && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Icon name="clock" className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-900">Bill awaiting OTP</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                  <span className="tnum font-semibold">{formatINR(livePending.totalAmount)}</span> for {livePending.customerName} — the OTP is still valid.
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1 py-2" onClick={() => resumeBill(livePending)}>Continue</Button>
              <Button variant="secondary" className="flex-1 py-2" onClick={() => cancelBill(livePending)}>Cancel it</Button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">New bill</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">Prices are set by the admin — just enter the quantities.</p>
            </div>
            {!isBlankForm(form) && (
              <button
                type="button"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setRestored(false);
                  setError('');
                  setInfo('');
                }}
                className="min-h-9 shrink-0 cursor-pointer rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                Clear
              </button>
            )}
          </div>

          {restored && (
            <div className="mt-4">
              <Alert kind="info">We kept the bill you hadn't sent yet{form.screenshot ? ', screenshot included' : ''}.</Alert>
            </div>
          )}

          <form onSubmit={submitBill} className="mt-5 space-y-5">
            <div className="space-y-4">
              <Field label="Customer name" required>
                <input
                  type="text"
                  autoComplete="off"
                  maxLength={80}
                  value={form.customerName}
                  onChange={(e) => setField('customerName', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Rahul Sharma"
                />
              </Field>
              <Field label="Customer mobile" required hint="Printed on the bill. For cash, the OTP goes here and the customer reads it back to you.">
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center text-sm font-semibold text-slate-400" aria-hidden="true">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.customerMobile}
                    onChange={(e) => setField('customerMobile', cleanMobile(e.target.value))}
                    className={`${inputClass} tnum pl-12`}
                    placeholder="98765 43210"
                  />
                </div>
              </Field>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Items<span className="ml-0.5 text-red-500" aria-hidden="true">*</span></p>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                {activeItems.map((i) => {
                  const q = Number(form.qty[i.id]) || 0;
                  const out = i.available <= 0 && q === 0;
                  return (
                    <div key={i.id} className={`flex items-center gap-3 border-b border-slate-100 px-3.5 py-3 last:border-0 ${q > 0 ? 'bg-brand-50/50' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold leading-snug text-slate-900">{i.name}</p>
                        <p className="tnum text-xs text-slate-500">
                          {formatINR(i.price)} each •{' '}
                          <span className={i.available <= 0 ? 'font-semibold text-red-600' : i.available < 10 ? 'font-semibold text-amber-700' : ''}>
                            {i.available <= 0 ? 'out of stock' : `${i.available} left`}
                          </span>
                        </p>
                        {q > 0 && <p className="tnum mt-0.5 text-xs font-semibold text-brand-800">{formatINR(q * i.price)}</p>}
                      </div>
                      <QtyStepper
                        label={i.name}
                        value={form.qty[i.id] || ''}
                        max={Math.max(0, i.available)}
                        disabled={out}
                        onChange={(v) => setForm((f) => ({ ...f, qty: { ...f.qty, [i.id]: v } }))}
                      />
                    </div>
                  );
                })}
                {activeItems.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No items on sale at this event yet.</p>}
              </div>
            </div>

            {totalQty > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 animate-fade-in-up">
                <span className="text-sm font-semibold text-brand-900">
                  Total <span className="tnum font-normal text-brand-800/80">({totalQty} qty)</span>
                </span>
                <span className="tnum text-xl font-bold text-brand-900">{formatINR(totalAmount)}</span>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Paid by<span className="ml-0.5 text-red-500" aria-hidden="true">*</span></p>
              <div className="grid grid-cols-2 gap-2">
                <PayOption active={form.paymentMode === 'cash'} icon="banknotes" title="Cash" subtitle="OTP to customer" onClick={() => setField('paymentMode', 'cash')} />
                <PayOption active={form.paymentMode === 'upi'} icon="phone" title="UPI" subtitle="Screenshot, no OTP" onClick={() => setField('paymentMode', 'upi')} />
              </div>
            </div>

            {form.paymentMode === 'upi' && (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 animate-fade-in-up">
                <Field label="UPI transaction ID / UTR" hint="Optional — the 12-digit reference on the payment screen">
                  <input
                    type="text"
                    autoComplete="off"
                    maxLength={40}
                    value={form.upiRef}
                    onChange={(e) => setField('upiRef', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                    className={`${inputClass} tnum font-mono`}
                    placeholder="e.g. 412345678901"
                  />
                </Field>

                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700">
                    Payment screenshot<span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                  </p>
                  <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onPickScreenshot} tabIndex={-1} />
                  {form.screenshot ? (
                    <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-white p-2.5">
                      <img src={form.screenshot.dataUrl} alt="Attached UPI payment screenshot" className="h-20 w-14 shrink-0 rounded-lg border border-slate-200 object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 text-sm font-semibold text-brand-800">
                          <Icon name="check-circle" className="h-4 w-4" />
                          Screenshot attached
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatBytes(form.screenshot.size)} •{' '}
                          {draftPartial ? 'too large to keep offline — send soon' : 'kept on this phone until the bill is sent'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button type="button" onClick={() => fileRef.current?.click()} className="min-h-8 cursor-pointer rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                          Change
                        </button>
                        <button type="button" onClick={() => setField('screenshot', null)} className="min-h-8 cursor-pointer rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={shotBusy}
                      className="flex min-h-24 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-400 hover:text-brand-800 disabled:cursor-wait"
                    >
                      {shotBusy ? <Spinner className="h-6 w-6 text-brand-700" /> : <Icon name="photo" className="h-7 w-7 text-slate-400" />}
                      {shotBusy ? 'Preparing screenshot…' : 'Attach payment screenshot'}
                      <span className="text-xs font-normal text-slate-400">From the gallery — the customer's or your UPI app's success screen</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <Alert>{error}</Alert>
            <Alert kind="info">{info}</Alert>

            <Button
              type="submit"
              icon={busy ? undefined : form.paymentMode === 'upi' ? 'check' : 'send'}
              className="w-full py-3"
              loading={busy}
              disabled={shotBusy || totalQty === 0 || !form.paymentMode}
            >
              {form.paymentMode === 'upi'
                ? busy
                  ? 'Saving bill…'
                  : `Save UPI bill${totalQty > 0 ? ` • ${formatINR(totalAmount)}` : ''}`
                : busy
                  ? 'Sending OTP…'
                  : totalQty > 0
                    ? `Send OTP • ${formatINR(totalAmount)}`
                    : 'Send OTP to customer'}
            </Button>

            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-400">
              <Icon name="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {form.paymentMode === 'upi'
                ? 'No OTP for UPI — the payment screenshot is the proof. The bill is final once saved.'
                : "Cash bills: the OTP goes to the customer's phone. Ask them for the code once they've paid."}
            </p>
          </form>
        </div>
      </div>

      <Modal open={confirmUpi} title="Save this UPI bill?" onClose={() => !busy && setConfirmUpi(false)}>
        <div className="space-y-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3.5">
            <p className="font-semibold text-slate-900">{form.customerName.trim()}</p>
            <p className="tnum text-xs text-slate-500">+91 {form.customerMobile}</p>
            <div className="my-2.5 border-t border-dashed border-slate-300" />
            {lines.map((l) => (
              <div key={l.id} className="flex justify-between gap-3 py-0.5">
                <span className="text-slate-700">{l.q} × {l.name}</span>
                <span className="tnum shrink-0 font-semibold text-slate-900">{formatINR(l.q * l.price)}</span>
              </div>
            ))}
            <div className="my-2.5 border-t border-dashed border-slate-300" />
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Total</span>
              <span className="tnum text-lg font-bold text-brand-800">{formatINR(totalAmount)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {form.screenshot && (
              <img src={form.screenshot.dataUrl} alt="UPI payment screenshot" className="h-20 w-14 shrink-0 rounded-lg border border-slate-200 object-cover" />
            )}
            <p className="text-xs leading-relaxed text-slate-600">
              Check the screenshot shows <span className="tnum font-bold text-slate-900">{formatINR(totalAmount)}</span> received
              {form.upiRef ? <> (UTR <span className="tnum font-mono">{form.upiRef}</span>)</> : ''}. No OTP is sent for UPI — once saved, the bill can't be changed.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmUpi(false)}>Go back</Button>
            <Button icon={busy ? undefined : 'check'} loading={busy} onClick={saveBill}>Save bill</Button>
          </div>
        </div>
      </Modal>

      {recent && recent.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Recent bills</h3>
          <div className="space-y-2.5">
            {recent.map((b, i) => {
              const unverified = !['verified', 'cancelled'].includes(b.status);
              const live = b.status === 'pending_otp' && new Date(b.otpExpiresAt).getTime() > Date.now();
              return (
                <div
                  key={b.id}
                  className="rounded-xl border border-slate-100 px-3.5 py-2.5 animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{b.customerName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(b.createdAt)} • {b.billLabel ? `bill ${b.billLabel}` : <span className="tnum font-mono">{b.ref}</span>} •{' '}
                        {b.paymentMode === 'upi' ? 'UPI' : 'Cash'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tnum text-sm font-bold text-slate-900">{formatINR(b.totalAmount)}</span>
                      <StatusBadge status={b.status} />
                    </div>
                  </div>
                  {(unverified || b.status === 'verified') && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {unverified && (live || b.resendsLeft > 0) && (
                        <button onClick={() => resumeBill(b)} className="min-h-9 cursor-pointer rounded-lg px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                          Continue
                        </button>
                      )}
                      {unverified && (
                        <button onClick={() => cancelBill(b)} className="min-h-9 cursor-pointer rounded-lg px-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                          Cancel
                        </button>
                      )}
                      {b.status === 'verified' && (
                        <button onClick={() => shareBill(b)} className="flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                          <Icon name="share" className="h-3.5 w-3.5" />
                          Bill
                        </button>
                      )}
                      {b.hasScreenshot && (
                        <button onClick={() => setViewShot(b)} className="flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                          <Icon name="photo" className="h-3.5 w-3.5" />
                          Screenshot
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ScreenshotViewer bill={viewShot} onClose={() => setViewShot(null)} />
    </div>
  );
}

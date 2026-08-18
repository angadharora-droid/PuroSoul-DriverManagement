import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button, Field, Input, Alert, PageHeader, Skeleton } from '../../components/ui';
import Icon from '../../components/icons';
import { useToast } from '../../components/toast';

export default function Settings() {
  const toast = useToast();
  const [emails, setEmails] = useState('');
  const [dayEndTime, setDayEndTime] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/api/settings')
      .then((d) => {
        setEmails((d.settings.globalNotifyEmails || []).join(', '));
        setDayEndTime(d.settings.dayEndReportTime || '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoaded(true));
  }, []);

  const parsed = emails.split(/[,;\s]+/).filter(Boolean);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api.put('/api/settings', { globalNotifyEmails: parsed, dayEndReportTime: dayEndTime });
      setEmails((d.settings.globalNotifyEmails || []).join(', '));
      setDayEndTime(d.settings.dayEndReportTime || '');
      toast('Settings saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    setSending(true);
    setError('');
    try {
      const r = await api.post('/api/settings/day-end-report');
      if (r.sent) toast(`Day-end report sent to ${r.recipients.join(', ')}`);
      else toast(r.reason || 'Report was not sent', 'error');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader
        title="Notification settings"
        subtitle="These addresses receive an email with the PDF receipt for every verified collection and every verified cash handover, plus the day-end report — in addition to each party's own notification emails."
      />

      {!loaded ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-32" />
        </div>
      ) : (
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <Field label="Global notification emails" hint="Comma-separated">
            <Input placeholder="owner@company.com, accounts@company.com" value={emails} onChange={(e) => setEmails(e.target.value)} />
          </Field>

          {parsed.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Recipients preview">
              {parsed.map((e, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-2 pr-3 text-xs font-medium text-slate-700">
                  <Icon name="envelope" className="h-3.5 w-3.5 text-slate-400" />
                  {e}
                </span>
              ))}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-700">Day-end report</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Every day at this time (IST), the addresses above get an email summarising all cash collected and handed over that day, with the full PDF reports attached.
            </p>
            <div className="mt-3 max-w-[200px]">
              <Field label="Send daily at" hint="Clear the time to disable the automatic report">
                <Input type="time" value={dayEndTime} onChange={(e) => setDayEndTime(e.target.value)} />
              </Field>
            </div>
          </div>

          <Alert>{error}</Alert>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy} icon={busy ? undefined : 'check'}>
              Save settings
            </Button>
            <Button type="button" variant="secondary" loading={sending} icon={sending ? undefined : 'send'} onClick={sendNow} disabled={parsed.length === 0}>
              {sending ? 'Sending…' : "Send today's report now"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

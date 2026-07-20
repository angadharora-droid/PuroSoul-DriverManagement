import { useCallback, useEffect, useState } from 'react';
import { api, apiDownload } from '../../api/client';
import { Button, EmptyState, StatCard, Alert, SegmentedControl, TableSkeleton, PageHeader, Avatar, inputClass } from '../../components/ui';
import Icon from '../../components/icons';
import { useToast } from '../../components/toast';
import { formatINR, formatDateTime, todayStr, STATUS_LABELS } from '../../utils/format';

const TABS = [
  { value: 'daily', label: 'Daily', icon: 'calendar' },
  { value: 'party', label: 'By party', icon: 'storefront' },
  { value: 'collector', label: 'By collector', icon: 'truck' },
  { value: 'handover', label: 'Handovers', icon: 'arrows-right-left' },
  { value: 'custom', label: 'Custom range', icon: 'adjustments' },
];

export default function Reports() {
  const toast = useToast();
  const [tab, setTab] = useState('daily');
  const [date, setDate] = useState(todayStr());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [partyId, setPartyId] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [parties, setParties] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/parties').then((d) => setParties(d.parties)).catch(() => {});
    api.get('/api/collectors').then((d) => setCollectors(d.collectors)).catch(() => {});
  }, []);

  const params = useCallback(
    () => ({
      type: tab,
      ...(tab === 'daily' ? { date } : { from, to }),
      ...(tab !== 'daily' && tab !== 'handover' && partyId ? { partyId } : {}),
      ...(tab !== 'daily' && collectorId ? { collectorId } : {}),
    }),
    [tab, date, from, to, partyId, collectorId]
  );

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get('/api/reports', params())
      .then((d) => setReport(d.report))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(load, [load]);

  function download(format) {
    apiDownload('/api/reports', { ...params(), format }, `report.${format}`)
      .then(() => toast(`${format.toUpperCase()} report downloaded`))
      .catch((e) => toast(e.message, 'error'));
  }

  function emailDayEnd() {
    setSending(true);
    api
      .post('/api/reports/day-end', { date })
      .then((d) => toast(`Report emailed to ${d.recipients.length} recipient${d.recipients.length === 1 ? '' : 's'}`))
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setSending(false));
  }

  const otherStatuses = report ? Object.entries(report.statusCounts || {}).filter(([s]) => s !== 'verified') : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle={
          tab === 'handover'
            ? 'OTP-verified cash handovers from collectors — other statuses are listed separately for audit'
            : 'Verified collections only — pending, expired and failed records are listed separately for audit'
        }
      />

      <SegmentedControl options={TABS} value={tab} onChange={setTab} className="w-fit max-w-full" />

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        {tab === 'daily' ? (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</span>
            <input type="date" className={`${inputClass} w-auto`} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">From</span>
              <input type="date" className={`${inputClass} w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">To</span>
              <input type="date" className={`${inputClass} w-auto`} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            {(tab === 'party' || tab === 'custom') && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Party</span>
                <select className={`${inputClass} w-auto`} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                  <option value="">All parties</option>
                  {parties.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}
            {(tab === 'collector' || tab === 'custom' || tab === 'handover') && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Collector</span>
                <select className={`${inputClass} w-auto`} value={collectorId} onChange={(e) => setCollectorId(e.target.value)}>
                  <option value="">All collectors</option>
                  {collectors.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" icon="download" onClick={() => download('csv')}>CSV</Button>
          <Button variant="secondary" icon="receipt" onClick={() => download('pdf')}>PDF</Button>
          {tab === 'daily' && (
            <Button icon="send" loading={sending} onClick={emailDayEnd}>Email report</Button>
          )}
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {loading || !report ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[74px] rounded-2xl border border-slate-200 bg-white p-4">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton mt-2 h-6 w-28" />
              </div>
            ))}
          </div>
          <TableSkeleton rows={6} cols={5} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label={tab === 'handover' ? 'Total handed over' : 'Total verified'} value={formatINR(report.grandTotal)} icon="banknotes" accent />
            <StatCard label={tab === 'handover' ? 'Handovers' : 'Transactions'} value={report.grandCount} icon="check-circle" />
            <StatCard label="Not verified (audit)" value={otherStatuses.reduce((s, [, v]) => s + v.count, 0)} icon="warning" />
          </div>

          {otherStatuses.length > 0 && (
            <p className="text-xs text-slate-500">
              Excluded from totals:{' '}
              {otherStatuses.map(([s, v]) => `${STATUS_LABELS[s] || s}: ${v.count} (${formatINR(v.amount)})`).join(' • ')}
            </p>
          )}

          {report.groups.length === 0 && (
            <EmptyState
              icon="chart-bar"
              title={tab === 'handover' ? 'No verified handovers in this period' : 'No verified collections in this period'}
              subtitle="Adjust the date range or filters above."
            />
          )}

          <div className="space-y-4">
            {report.groups.map((g, gi) => {
              const share = report.grandTotal > 0 ? g.subtotal / report.grandTotal : 0;
              return (
                <div
                  key={g.label}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(gi, 6) * 50}ms` }}
                >
                  <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={g.label} className="h-8 w-8 text-xs" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{g.label}</p>
                          {g.breakdown && <p className="mt-0.5 truncate text-xs text-slate-500">{g.breakdown}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="tnum text-sm font-bold text-brand-800">{formatINR(g.subtotal)}</p>
                        <p className="tnum text-xs text-slate-400">
                          {g.count} txn{g.count === 1 ? '' : 's'}
                          {report.groups.length > 1 && ` • ${Math.round(share * 100)}% of total`}
                        </p>
                      </div>
                    </div>
                    {report.groups.length > 1 && (
                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200" role="presentation">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700" style={{ width: `${Math.max(share * 100, 2)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <tbody>
                        {g.rows.map((r) => (
                          <tr key={r.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatDateTime(r.date)}</td>
                            <td className="tnum px-4 py-2.5 font-mono text-xs text-slate-500">{r.ref}</td>
                            <td className="px-4 py-2.5 font-medium text-slate-900">{r.party}</td>
                            <td className="px-4 py-2.5 text-slate-500">{r.collector}</td>
                            <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-semibold">{formatINR(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          {report.groups.length > 1 && (
            <div className="flex items-center justify-between rounded-2xl border-2 border-brand-700/20 bg-brand-50 px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-900">
                <Icon name="banknotes" className="h-5 w-5" />
                Grand total
              </span>
              <span className="tnum text-lg font-bold text-brand-900">{formatINR(report.grandTotal)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

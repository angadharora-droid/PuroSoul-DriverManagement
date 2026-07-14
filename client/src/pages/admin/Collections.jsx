import { useCallback, useEffect, useState } from 'react';
import { api, apiDownload } from '../../api/client';
import {
  Button,
  StatusBadge,
  EmptyState,
  StatCard,
  Modal,
  Avatar,
  TableSkeleton,
  PageHeader,
  inputClass,
} from '../../components/ui';
import Icon from '../../components/icons';
import { useToast } from '../../components/toast';
import { formatINR, formatDateTime, STATUS_LABELS } from '../../utils/format';

const emptyFilters = { from: '', to: '', driverId: '', partyId: '', status: '' };

function FilterField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export default function Collections() {
  const toast = useToast();
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [parties, setParties] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/drivers').then((d) => setDrivers(d.drivers)).catch(() => {});
    api.get('/api/parties').then((d) => setParties(d.parties)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setError('');
    api
      .get('/api/collections', { ...filters, page })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [filters, page]);

  useEffect(load, [load]);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Collections"
        subtitle="Every OTP-verified cash collection across all drivers"
        actions={
          <Button
            variant="secondary"
            icon="download"
            onClick={() =>
              apiDownload('/api/collections/export.csv', filters, 'collections.csv')
                .then(() => toast('CSV exported'))
                .catch((e) => toast(e.message, 'error'))
            }
          >
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <FilterField label="From">
            <input type="date" className={inputClass} value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
          </FilterField>
          <FilterField label="To">
            <input type="date" className={inputClass} value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
          </FilterField>
          <FilterField label="Driver">
            <select className={inputClass} value={filters.driverId} onChange={(e) => setFilter('driverId', e.target.value)}>
              <option value="">All drivers</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Party">
            <select className={inputClass} value={filters.partyId} onChange={(e) => setFilter('partyId', e.target.value)}>
              <option value="">All parties</option>
              {parties.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select className={inputClass} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </FilterField>
        </div>
        {hasFilters && (
          <button
            onClick={() => {
              setFilters(emptyFilters);
              setPage(1);
            }}
            className="mt-3 flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
            Clear all filters
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[74px] rounded-2xl border border-slate-200 bg-white p-4">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton mt-2 h-6 w-28" />
              </div>
            ))}
          </div>
          <TableSkeleton rows={8} cols={6} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Verified total" value={formatINR(data.verifiedTotals.amount)} icon="banknotes" accent />
            <StatCard label="Verified count" value={data.verifiedTotals.count} icon="check-circle" />
            <StatCard label="All records (filtered)" value={data.total} icon="funnel" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Ref</th>
                    <th className="px-4 py-3 font-semibold">Party</th>
                    <th className="px-4 py-3 font-semibold">Driver</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <tr
                      key={t._id}
                      className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-brand-50/40"
                      onClick={() => setDetail(t)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(t.createdAt)}</td>
                      <td className="tnum px-4 py-3 font-mono text-xs text-slate-500">{t.ref}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-medium text-slate-900">
                          <Avatar name={t.party?.name} className="h-6 w-6 text-[10px]" />
                          {t.party?.name || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.driver?.name || '—'}</td>
                      <td className="tnum whitespace-nowrap px-4 py-3 text-right font-semibold">{formatINR(t.amount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Icon name="chevron-right" className="ml-auto h-4 w-4 text-slate-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.items.length === 0 && (
              <EmptyState
                icon="funnel"
                title="No collections match these filters"
                subtitle="Try widening the date range or clearing a filter."
              />
            )}
          </div>

          {data.pages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="secondary" icon="chevron-left" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="tnum text-sm text-slate-500">Page {data.page} of {data.pages}</span>
              <Button variant="secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                Next
                <Icon name="chevron-right" className="h-4.5 w-4.5" />
              </Button>
            </div>
          )}
        </>
      )}

      <DetailModal txn={detail} onClose={() => setDetail(null)} onChanged={load} />
    </div>
  );
}

function TimelineStep({ icon, title, meta, done, danger }) {
  return (
    <li className="flex gap-3">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          danger ? 'bg-red-100 text-red-600' : done ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'
        }`}
      >
        <Icon name={icon} className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="min-w-0 pb-4">
        <p className={`text-sm font-semibold ${done || danger ? 'text-slate-900' : 'text-slate-400'}`}>{title}</p>
        {meta && <p className="text-xs text-slate-500">{meta}</p>}
      </div>
    </li>
  );
}

/** OTP audit trail: statuses and timestamps only — the OTP itself is never shown or stored in plain text. */
function DetailModal({ txn, onClose, onChanged }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!txn) return null;

  const verified = txn.status === 'verified';
  const failed = txn.status === 'failed';

  async function addNote() {
    setBusy(true);
    try {
      await api.post(`/api/collections/${txn._id}/audit-note`, { note });
      setNote('');
      toast('Audit note added');
      onChanged();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`Collection ${txn.ref}`} onClose={onClose} wide>
      {/* Summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={txn.party?.name} className="h-10 w-10 text-sm" />
          <div>
            <p className="font-semibold text-slate-900">{txn.party?.name}</p>
            <p className="text-xs text-slate-500">collected by {txn.driver?.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="tnum text-xl font-bold text-slate-900">{formatINR(txn.amount)}</p>
          <StatusBadge status={txn.status} />
        </div>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        {/* Verification timeline */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Verification trail</p>
          <ol>
            <TimelineStep icon="banknotes" title="Collection started" meta={formatDateTime(txn.createdAt)} done />
            <TimelineStep
              icon="send"
              title={`OTP sent to party${txn.otpResendCount ? ` (${txn.otpResendCount} resend${txn.otpResendCount > 1 ? 's' : ''})` : ''}`}
              meta={`${txn.otpAttempts || 0} wrong attempt${(txn.otpAttempts || 0) === 1 ? '' : 's'} • expires ${formatDateTime(txn.otpExpiresAt)}`}
              done
            />
            <TimelineStep
              icon={failed ? 'warning' : 'shield'}
              title={verified ? 'Verified by party OTP' : failed ? 'Locked after wrong attempts' : STATUS_LABELS[txn.status]}
              meta={txn.verifiedAt ? formatDateTime(txn.verifiedAt) : undefined}
              done={verified}
              danger={failed}
            />
            <TimelineStep
              icon="envelope"
              title={
                (txn.notificationEmailsSent || []).length
                  ? `Emailed ${(txn.notificationEmailsSent || []).length} stakeholder${txn.notificationEmailsSent.length > 1 ? 's' : ''}`
                  : 'Stakeholder email'
              }
              meta={(txn.notificationEmailsSent || []).join(', ') || (verified ? 'No recipients configured' : 'After verification')}
              done={(txn.notificationEmailsSent || []).length > 0}
            />
            <TimelineStep
              icon="phone"
              title="Party SMS confirmation"
              meta={txn.smsConfirmationSent ? 'Sent' : verified ? 'Not sent' : 'After verification'}
              done={txn.smsConfirmationSent}
            />
          </ol>
          {txn.notifyError && (
            <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <Icon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {txn.notifyError}
            </p>
          )}
        </div>

        {/* Facts */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Details</p>
          <dl className="space-y-2 text-sm">
            {[
              ['Reference', txn.ref],
              ['Notes', txn.notes || '—'],
              ['Driver IP', txn.driverIp || '—'],
              ['Device', txn.deviceInfo ? txn.deviceInfo.slice(0, 60) + (txn.deviceInfo.length > 60 ? '…' : '') : '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <dt className="shrink-0 text-slate-500">{label}</dt>
                <dd className="break-all text-right font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>

          {verified && (
            <Button
              variant="secondary"
              icon="download"
              className="mt-4 w-full"
              onClick={() =>
                apiDownload(`/api/collections/${txn._id}/receipt.pdf`, null, `receipt-${txn.ref}.pdf`)
                  .then(() => toast('Receipt downloaded'))
                  .catch((e) => toast(e.message, 'error'))
              }
            >
              Download receipt PDF
            </Button>
          )}
        </div>
      </div>

      {(txn.auditNotes || []).length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Audit notes</p>
          <div className="space-y-1.5">
            {txn.auditNotes.map((n, i) => (
              <p key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">{n.by}</span> • {formatDateTime(n.at)} — {n.note}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
          <Icon name="lock" className="h-3.5 w-3.5" />
          Verified records are immutable — you can only append an audit note.
        </p>
        <div className="flex gap-2">
          <input className={inputClass} placeholder="Add audit note…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <Button disabled={!note.trim()} loading={busy} onClick={addNote}>
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}

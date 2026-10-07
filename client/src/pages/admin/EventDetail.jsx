import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, apiDownload } from '../../api/client';
import { Button, Alert, StatCard, TableSkeleton, PageHeader, StatusBadge, EmptyState, inputClass } from '../../components/ui';
import Icon from '../../components/icons';
import ScreenshotViewer from '../../components/ScreenshotViewer';
import { useToast } from '../../components/toast';
import { formatINR, formatDateTime, STATUS_LABELS } from '../../utils/format';
import { EventModal, EventStatusChip, eventDates } from './Events';

// Must match SCREENSHOTS_PER_PDF in server/src/routes/events.js.
const SCREENSHOTS_PER_PDF = 150;
const BILLS_PAGE = 200;

function Card({ title, subtitle, actions, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

const th = 'px-4 py-2.5 font-semibold';
const thR = `${th} text-right`;
const td = 'px-4 py-2.5';
const tdR = 'tnum whitespace-nowrap px-4 py-2.5 text-right';

function SplitTable({ rows, firstLabel, labelOf, totals, extra }) {
  if (!rows.length) return <p className="px-4 py-6 text-center text-sm text-slate-500">No verified bills yet.</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className={th}>{firstLabel}</th>
            <th className={thR}>Bills</th>
            <th className={thR}>Qty</th>
            <th className={thR}>Cash</th>
            <th className={thR}>UPI</th>
            <th className={thR}>Total</th>
            {extra && <th className={th}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={labelOf(r)} className="border-b border-slate-100 last:border-0">
              <td className={`${td} font-medium text-slate-900`}>{labelOf(r)}</td>
              <td className={tdR}>{r.bills}</td>
              <td className={tdR}>{r.quantity}</td>
              <td className={tdR}>{formatINR(r.cash)}</td>
              <td className={tdR}>{formatINR(r.upi)}</td>
              <td className={`${tdR} font-semibold`}>{formatINR(r.amount)}</td>
              {extra && <td className="whitespace-nowrap px-3 py-1.5 text-right">{extra(r)}</td>}
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold text-slate-900">
            <td className={td}>Total</td>
            <td className={tdR}>{totals.bills}</td>
            <td className={tdR}>{totals.quantity}</td>
            <td className={tdR}>{formatINR(totals.cash)}</td>
            <td className={tdR}>{formatINR(totals.upi)}</td>
            <td className={tdR}>{formatINR(totals.amount)}</td>
            {extra && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BillRows({ bills, onScreenshot, onBillPdf, onCancel, showStatus }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className={th}>{showStatus ? 'Ref' : 'Bill'}</th>
            <th className={th}>Date</th>
            <th className={th}>Customer</th>
            <th className={th}>Items</th>
            <th className={th}>Paid by</th>
            <th className={thR}>Amount</th>
            <th className={th}>Billed by</th>
            <th className={th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => (
            <tr key={b.id} className="border-b border-slate-100 align-top transition-colors last:border-0 hover:bg-slate-50/70">
              <td className={`${td} tnum font-mono text-xs text-slate-600`}>
                {showStatus ? b.ref : b.billLabel}
                {showStatus && <div className="mt-1"><StatusBadge status={b.status} /></div>}
              </td>
              <td className={`${td} whitespace-nowrap text-slate-600`}>{formatDateTime(b.date)}</td>
              <td className={td}>
                <p className="font-medium text-slate-900">{b.customerName}</p>
                <p className="tnum text-xs text-slate-500">+91 {b.customerMobile}</p>
              </td>
              <td className={`${td} text-slate-600`}>
                {b.itemsLabel}
                <span className="tnum text-xs text-slate-400"> ({b.totalQuantity})</span>
              </td>
              <td className={td}>
                <span className="font-semibold text-slate-800">{b.paymentMode === 'upi' ? 'UPI' : 'Cash'}</span>
                {b.upiRef && <p className="tnum font-mono text-xs text-slate-500">{b.upiRef}</p>}
              </td>
              <td className={`${tdR} font-semibold text-slate-900`}>{formatINR(b.totalAmount)}</td>
              <td className={`${td} text-slate-600`}>{b.receiverName}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right">
                {b.hasScreenshot && (
                  <button
                    onClick={() => onScreenshot(b)}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    <Icon name="photo" className="h-3.5 w-3.5" />
                    Screenshot
                  </button>
                )}
                {onCancel && ['pending_otp', 'expired', 'failed'].includes(b.status) && (
                  <button
                    onClick={() => onCancel(b)}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Icon name="close" className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                )}
                {b.status === 'verified' && (
                  <button
                    onClick={() => onBillPdf(b)}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    <Icon name="receipt" className="h-3.5 w-3.5" />
                    Bill
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [viewShot, setViewShot] = useState(null);
  const [downloading, setDownloading] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('');
  const [visible, setVisible] = useState(BILLS_PAGE);
  const [showOthers, setShowOthers] = useState(false);

  const load = useCallback(() => {
    setError('');
    api
      .get(`/api/events/${id}/report`)
      .then((d) => setReport(d.report))
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(load, [load]);

  function download(key, path, params, fallback) {
    setDownloading(key);
    apiDownload(path, params, fallback)
      .then(() => toast('Downloaded'))
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setDownloading(''));
  }

  const bills = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    return report.bills.filter(
      (b) =>
        (!mode || b.paymentMode === mode) &&
        (!q ||
          b.customerName.toLowerCase().includes(q) ||
          b.customerMobile.includes(q) ||
          (b.billLabel || '').includes(q) ||
          (b.upiRef || '').toLowerCase().includes(q) ||
          b.receiverName.toLowerCase().includes(q))
    );
  }, [report, search, mode]);

  if (!report) {
    return (
      <div className="space-y-4">
        <Link to="/admin/events" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
          <Icon name="arrow-left" className="h-4 w-4" />
          All events
        </Link>
        {error ? <Alert>{error}</Alert> : <TableSkeleton rows={8} cols={5} />}
      </div>
    );
  }

  const { event, totals } = report;
  const shotCount = report.days.reduce((s, d) => s + d.screenshots, 0);
  const shotParts = Math.ceil(shotCount / SCREENSHOTS_PER_PDF);
  const otherStatuses = Object.entries(report.statusCounts || {}).filter(([s]) => s !== 'verified');
  const billersWithoutLogin = event.billers.filter((b) => !b.canLogIn || !b.isActive);
  const overSold = report.items.filter((i) => i.remaining < 0);

  // Admin clean-up: an abandoned bill holds stock (while its OTP is live) and its screenshot until cancelled.
  const cancelBill = (b) =>
    api
      .post(`/api/events/bills/${b.id}/cancel`)
      .then(() => {
        toast(`Bill ${b.ref} cancelled`);
        load();
      })
      .catch((e) => toast(e.message, 'error'));

  const billPdf = (b) => download(`bill-${b.id}`, `/api/events/bills/${b.id}/bill.pdf`, null, `bill-${b.billLabel}.pdf`);
  const shotsPdf = (key, params, label) => download(key, `/api/events/${id}/screenshots.pdf`, params, `upi-screenshots-${label}.pdf`);

  return (
    <div className="space-y-4">
      <Link to="/admin/events" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
        <Icon name="arrow-left" className="h-4 w-4" />
        All events
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {event.name}
            <EventStatusChip status={event.status} />
          </span>
        }
        subtitle={[event.venue, eventDates(event)].filter(Boolean).join(' • ') || undefined}
      />
      {/* Own wrapping row (not PageHeader actions) so four buttons never overflow a phone screen. */}
      <div className="flex flex-wrap gap-2">
        {event.status === 'open' && (
          <>
            <Button icon="ticket" onClick={() => navigate(`/admin/events/${id}/billing`)}>Raise bill</Button>
            <Button variant="secondary" icon="cube" onClick={() => navigate(`/admin/events/${id}/stock`)}>Add stock</Button>
          </>
        )}
        <Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button>
        <Button variant="secondary" icon="adjustments" onClick={() => setEditing(event)}>Edit</Button>
        <Button variant="secondary" icon="download" loading={downloading === 'csv'} onClick={() => download('csv', `/api/events/${id}/report`, { format: 'csv' }, 'event-report.csv')}>
          CSV
        </Button>
        <Button variant="secondary" icon="receipt" loading={downloading === 'pdf'} onClick={() => download('pdf', `/api/events/${id}/report`, { format: 'pdf' }, 'event-report.pdf')}>
          Report PDF
        </Button>
      </div>

      {/* Setup + anything that needs the admin's attention */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-card">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Items &amp; prices</p>
            <p className="mt-1 text-slate-800">
              {event.items.filter((i) => i.isActive).map((i) => `${i.name} ${formatINR(i.price)}`).join(' • ') || '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Billing receivers</p>
            <p className="mt-1 text-slate-800">{event.billers.map((b) => b.name).join(', ') || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Stock keeper</p>
            <p className="mt-1 text-slate-800">{event.stockKeeper?.name || '—'}</p>
          </div>
        </div>
        {(event.status === 'open' && (!event.billers.length || !event.stockKeeper || billersWithoutLogin.length > 0)) || overSold.length > 0 ? (
          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
            {event.status === 'open' && !event.billers.length && <Warn>No receivers can bill yet — edit the event to add them.</Warn>}
            {event.status === 'open' && !event.stockKeeper && <Warn>No stock keeper — nothing can be billed until stock is recorded (assign a collector, or use Add stock).</Warn>}
            {event.status === 'open' && billersWithoutLogin.length > 0 && (
              <Warn>
                {billersWithoutLogin.map((b) => b.name).join(', ')} can't log in yet — set a password on the Receivers page{' '}
                {billersWithoutLogin.some((b) => !b.isActive) ? '(or reactivate them)' : ''}.
              </Warn>
            )}
            {overSold.length > 0 && <Warn>More billed than recorded in stock: {overSold.map((i) => `${i.name} (${i.remaining})`).join(', ')}.</Warn>}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 sm:col-span-1">
          <StatCard label="Total sales" value={formatINR(totals.amount)} icon="banknotes" accent />
        </div>
        <StatCard label="Bills" value={totals.bills} icon="receipt" />
        <StatCard label="Units sold" value={totals.quantity} icon="cube" />
        <StatCard label={`Cash (${totals.cashBills})`} value={formatINR(totals.cash)} icon="banknotes" />
        <StatCard label={`UPI (${totals.upiBills})`} value={formatINR(totals.upi)} icon="phone" />
      </div>

      {otherStatuses.length > 0 && (
        <p className="text-xs text-slate-500">
          Not counted (never confirmed by customer OTP):{' '}
          {otherStatuses.map(([s, v]) => `${STATUS_LABELS[s] || s}: ${v.count} (${formatINR(v.amount)})`).join(' • ')}
        </p>
      )}

      <Card title="Item-wise stock & sales" subtitle="Left = stock in − stock out − sold on confirmed bills. Held = on bills still waiting for the customer's OTP.">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className={th}>Item</th>
                <th className={thR}>Rate</th>
                <th className={thR}>Stock in</th>
                <th className={thR}>Out</th>
                <th className={thR}>Sold</th>
                <th className={thR}>Held</th>
                <th className={thR}>Left</th>
                <th className={thR}>Sales</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 last:border-0">
                  <td className={`${td} font-medium text-slate-900`}>
                    {i.name}
                    {!i.isActive && <span className="ml-1.5 text-xs font-normal text-slate-400">(retired)</span>}
                  </td>
                  <td className={tdR}>{formatINR(i.price)}</td>
                  <td className={tdR}>{i.stockIn}</td>
                  <td className={tdR}>{i.stockOut}</td>
                  <td className={tdR}>{i.sold}</td>
                  <td className={`${tdR} text-slate-400`}>{i.reserved || '—'}</td>
                  <td className={`${tdR} font-semibold ${i.remaining < 0 ? 'text-red-600' : 'text-brand-800'}`}>{i.remaining}</td>
                  <td className={`${tdR} font-semibold`}>{formatINR(i.salesAmount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold text-slate-900">
                <td className={td}>Total</td>
                <td />
                <td className={tdR}>{report.stock.stockIn}</td>
                <td className={tdR}>{report.stock.stockOut}</td>
                <td className={tdR}>{totals.quantity}</td>
                <td />
                <td className={tdR}>{report.stock.remaining}</td>
                <td className={tdR}>{formatINR(totals.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Receiver-wise" subtitle="Cash column = the cash each receiver should be holding from this event.">
          <SplitTable rows={report.receivers} firstLabel="Receiver" labelOf={(r) => r.name} totals={totals} />
        </Card>
        <Card
          title="Day-wise"
          subtitle={shotCount ? `${shotCount} UPI screenshot${shotCount === 1 ? '' : 's'} on file` : 'No UPI screenshots yet'}
          actions={
            shotCount > 0 &&
            Array.from({ length: shotParts }, (_, p) => (
              <Button
                key={p}
                variant="secondary"
                icon="photo"
                className="min-h-9 px-3 py-1.5 text-xs"
                loading={downloading === `shots-all-${p + 1}`}
                onClick={() => shotsPdf(`shots-all-${p + 1}`, { part: p + 1 }, shotParts > 1 ? `part${p + 1}` : 'all')}
              >
                {shotParts > 1 ? `Screenshots part ${p + 1}` : 'All screenshots PDF'}
              </Button>
            ))
          }
        >
          <SplitTable
            rows={report.days}
            firstLabel="Date"
            labelOf={(d) => d.label}
            totals={totals}
            extra={(d) =>
              d.screenshots > 0 &&
              Array.from({ length: Math.ceil(d.screenshots / SCREENSHOTS_PER_PDF) }, (_, p) => (
                <button
                  key={p}
                  onClick={() => shotsPdf(`shots-${d.date}-${p + 1}`, { date: d.date, part: p + 1 }, d.date)}
                  disabled={downloading === `shots-${d.date}-${p + 1}`}
                  title={`Download this day's UPI screenshots as a PDF`}
                  className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <Icon name="photo" className="h-3.5 w-3.5" />
                  {d.screenshots > SCREENSHOTS_PER_PDF ? `Part ${p + 1}` : d.screenshots}
                </button>
              ))
            }
          />
        </Card>
      </div>

      <Card
        title={`Bills (${report.bills.length})`}
        subtitle="Confirmed by OTP sent to each customer. UPI screenshots are stored with the bill and can't be changed."
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="relative w-56">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputClass} min-h-9 py-1.5 pl-9`}
                placeholder="Customer, mobile, bill, UTR…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisible(BILLS_PAGE);
                }}
                aria-label="Search bills"
              />
            </div>
            <div className="w-36">
              <select className={`${inputClass} min-h-9 py-1.5`} value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Payment mode">
                <option value="">Cash + UPI</option>
                <option value="cash">Cash only</option>
                <option value="upi">UPI only</option>
              </select>
            </div>
          </div>
        }
      >
        {bills.length === 0 ? (
          <EmptyState icon="receipt" title={report.bills.length ? 'No bills match' : 'No confirmed bills yet'} />
        ) : (
          <>
            <BillRows bills={bills.slice(0, visible)} onScreenshot={setViewShot} onBillPdf={billPdf} />
            {bills.length > visible && (
              <div className="border-t border-slate-100 p-3 text-center">
                <Button variant="ghost" onClick={() => setVisible((v) => v + BILLS_PAGE)}>
                  Show more ({bills.length - visible} left)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {report.otherBills.length > 0 && (
        <Card
          title={`Unconfirmed bills (${report.otherBills.length})`}
          subtitle="Pending, expired, locked or cancelled — not counted in any total. Kept for audit."
          actions={
            <Button variant="ghost" className="min-h-9 py-1.5" onClick={() => setShowOthers((v) => !v)}>
              {showOthers ? 'Hide' : 'Show'}
            </Button>
          }
        >
          {showOthers && <BillRows bills={report.otherBills} onScreenshot={setViewShot} onBillPdf={billPdf} onCancel={cancelBill} showStatus />}
        </Card>
      )}

      <Card title={`Stock ledger (${report.stockEntries.length})`} subtitle={`Recorded by ${event.stockKeeper?.name || 'the stock keeper'}. Append-only — corrections show as separate entries.`}>
        {report.stockEntries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No stock recorded yet.</p>
        ) : (
          <div className="relative max-h-[480px] overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className={th}>Date</th>
                  <th className={th}>Item</th>
                  <th className={thR}>Qty</th>
                  <th className={th}>Entered by</th>
                  <th className={th}>Note</th>
                </tr>
              </thead>
              <tbody>
                {[...report.stockEntries].reverse().map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{formatDateTime(e.date)}</td>
                    <td className={`${td} font-medium text-slate-900`}>{e.itemName}</td>
                    <td className={`${tdR} font-bold ${e.kind === 'in' ? 'text-brand-700' : 'text-amber-700'}`}>
                      {e.kind === 'in' ? '+' : '−'}
                      {e.quantity}
                    </td>
                    <td className={`${td} text-slate-600`}>{e.enteredByName}</td>
                    <td className={`${td} text-slate-500`}>{e.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ScreenshotViewer bill={viewShot} onClose={() => setViewShot(null)} />
      <EventModal
        event={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}

function Warn({ children }) {
  return (
    <p className="flex items-start gap-1.5 text-xs font-medium text-amber-800">
      <Icon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

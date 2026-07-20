import { buildReport, todayIST } from './report.js';
import { reportPdf } from './pdf.js';
import { sendMail } from './email.js';
import { getGlobalSettings } from '../models/Setting.js';
import { formatINR } from '../utils/format.js';

const COMPANY = process.env.COMPANY_NAME || 'Puro Soul';

/**
 * Builds the daily report for the given YYYY-MM-DD (default: today IST) and
 * emails it — HTML summary per collector + the full PDF attached — to the global
 * notification emails configured in Settings.
 */
export async function sendDayEndReport(date = todayIST()) {
  const settings = await getGlobalSettings();
  const recipients = settings.globalNotifyEmails || [];
  if (!recipients.length) {
    return { sent: false, reason: 'No notification emails configured in Settings' };
  }

  const report = await buildReport({ type: 'daily', date });
  const pdf = await reportPdf(report);

  await sendMail({
    to: recipients,
    subject: `Day-end report ${report.periodLabel}: ${formatINR(report.grandTotal)} verified (${report.grandCount} collection${report.grandCount === 1 ? '' : 's'})`,
    html: dayEndHtml(report),
    attachments: [{ filename: `daily-report-${date}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });

  return { sent: true, recipients, date, grandTotal: report.grandTotal, grandCount: report.grandCount };
}

function dayEndHtml(report) {
  const cell = 'padding:6px 12px;font-size:13px';
  const collectorRows = report.groups
    .map(
      (g) =>
        `<tr><td style="${cell};color:#0f172a">${g.label}</td>` +
        `<td style="${cell};color:#64748b;text-align:center">${g.count}</td>` +
        `<td style="${cell};color:#0f172a;font-weight:600;text-align:right">${formatINR(g.subtotal)}</td></tr>`
    )
    .join('');

  const other = Object.entries(report.statusCounts || {}).filter(([s]) => s !== 'verified');
  const otherLine = other.length
    ? `<p style="color:#94a3b8;font-size:12px">Excluded from totals: ${other
        .map(([s, v]) => `${s.replace('_', ' ')}: ${v.count} (${formatINR(v.amount)})`)
        .join(' • ')}</p>`
    : '';

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#185997;margin-bottom:4px">${COMPANY} — Day-End Collection Report</h2>
    <p style="color:#334155;font-size:14px">${report.periodLabel} • Verified collections only. The full report with every collection (party, time, collector, amount) is attached as PDF.</p>
    <table style="border-collapse:collapse;background:#eff6fc;border-radius:8px;width:100%">
      <tr>
        <th style="${cell};color:#64748b;text-align:left">Collector</th>
        <th style="${cell};color:#64748b;text-align:center">Collections</th>
        <th style="${cell};color:#64748b;text-align:right">Amount</th>
      </tr>
      ${collectorRows || `<tr><td style="${cell};color:#64748b" colspan="3">No verified collections this day.</td></tr>`}
      <tr>
        <td style="${cell};color:#185997;font-weight:700">TOTAL</td>
        <td style="${cell};color:#185997;font-weight:700;text-align:center">${report.grandCount}</td>
        <td style="${cell};color:#185997;font-weight:700;text-align:right">${formatINR(report.grandTotal)}</td>
      </tr>
    </table>
    ${otherLine}
  </div>`;
}

/**
 * Auto-send the day-end report every day at DAY_END_REPORT_TIME (HH:MM, 24h,
 * IST). Leave the variable empty to disable. IST has no DST, so a fixed +05:30
 * offset and 24h steps are exact.
 */
export function scheduleDayEndReport() {
  const time = (process.env.DAY_END_REPORT_TIME || '').trim();
  if (!time) return;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) {
    console.warn(`[day-end] invalid DAY_END_REPORT_TIME "${time}" — expected HH:MM (24h, IST); auto-report disabled`);
    return;
  }
  const [h, min] = [Number(m[1]), Number(m[2])];

  const schedule = () => {
    let next = new Date(`${todayIST()}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00+05:30`).getTime();
    if (next <= Date.now()) next += 24 * 60 * 60 * 1000;
    setTimeout(async () => {
      try {
        const result = await sendDayEndReport();
        console.log(
          result.sent
            ? `[day-end] report for ${result.date} emailed to ${result.recipients.join(', ')}`
            : `[day-end] skipped — ${result.reason}`
        );
      } catch (err) {
        console.error('[day-end] failed:', err.message);
      }
      schedule();
    }, next - Date.now());
    console.log(`[day-end] daily report scheduled for ${time} IST (next: ${new Date(next).toISOString()})`);
  };
  schedule();
}

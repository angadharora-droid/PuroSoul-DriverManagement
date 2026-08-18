import { sendMail } from './email.js';
import { sendSms } from './sms.js';
import { receiptPdf, handoverReceiptPdf } from './pdf.js';
import { getGlobalSettings } from '../models/Setting.js';
import { formatINR, formatDateTime } from '../utils/format.js';

const COMPANY = process.env.COMPANY_NAME || 'Puro Soul';
// DLT requires the registered entity/brand name in the SMS body — keep this
// identical to the brand phrase in the approved templates and on the portal.
const SMS_BRAND = process.env.SMS_BRAND_NAME || 'Puro Soul - Hotel Centre Point';

/**
 * Fired after a transaction is verified. Sends the stakeholder email (with PDF
 * receipt attached) and the confirmation SMS to the party, then records what
 * was sent on the transaction. Failures are recorded, never thrown — the
 * verification itself has already succeeded.
 *
 * txn must be populated with party and collector.
 */
export async function notifyVerified(txn) {
  const settings = await getGlobalSettings().catch(() => null);
  const recipients = [
    ...new Set([...(txn.party.notifyEmails || []), ...((settings && settings.globalNotifyEmails) || [])]),
  ];

  const errors = [];

  // 1) Email to internal stakeholders with PDF receipt attached
  if (recipients.length) {
    try {
      const pdf = await receiptPdf(txn);
      await sendMail({
        to: recipients,
        subject: `Cash collected: ${formatINR(txn.amount)} from ${txn.party.name} (ref ${txn.ref})`,
        html: emailHtml(txn),
        attachments: [{ filename: `receipt-${txn.ref}.pdf`, content: pdf, contentType: 'application/pdf' }],
      });
      txn.notificationEmailsSent = recipients;
    } catch (err) {
      errors.push(`email: ${err.message}`);
    }
  }

  // 2) Confirmation SMS to the party
  try {
    const dateStr = formatDateTime(txn.verifiedAt);
    await sendSms(txn.otpMobile || txn.party.mobile, {
      type: 'confirmation',
      template: 'confirmation',
      text: `Cash collection of ${formatINR(txn.amount)} by ${txn.collector.name} on ${dateStr} is confirmed for ${SMS_BRAND}. Ref ${txn.ref}.`,
      vars: { amount: formatINR(txn.amount), collector: txn.collector.name, date: dateStr, ref: txn.ref },
      // {#var#} fill order of the registered DLT template — keep in sync with the
      // portal. "Rs." stays in the template's static text; the amount keeps its
      // comma/decimal, so its DLT variable is Alphanumeric (Number rejects those).
      dltVars: [formatINR(txn.amount).replace('Rs. ', ''), txn.collector.name, dateStr, txn.ref],
    });
    txn.smsConfirmationSent = true;
  } catch (err) {
    errors.push(`sms: ${err.message}`);
  }

  txn.notifyError = errors.join(' | ');
  await txn.save();
}

/**
 * Fired after a handover is verified. Emails the global notification addresses
 * (Settings) the handover summary — who handed over, who received, and the
 * party-wise amounts — with the PDF handover receipt attached. Failures are
 * recorded on the handover, never thrown.
 */
export async function notifyHandoverVerified(handover, collector, parties) {
  const settings = await getGlobalSettings().catch(() => null);
  const recipients = (settings && settings.globalNotifyEmails) || [];
  if (!recipients.length) return;

  try {
    const pdf = await handoverReceiptPdf(handover, collector, parties);
    await sendMail({
      to: recipients,
      subject: `Cash handed over: ${formatINR(handover.totalAmount)} by ${collector?.name || 'collector'} to ${handover.recipientName} (ref ${handover.ref})`,
      html: handoverEmailHtml(handover, collector, parties),
      attachments: [{ filename: `handover-${handover.ref}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
    handover.notifyError = '';
  } catch (err) {
    handover.notifyError = `email: ${err.message}`;
  }
  await handover.save().catch(() => {});
}

function handoverEmailHtml(handover, collector, parties) {
  const cell = 'padding:6px 12px;font-size:13px';
  const row = (label, value) =>
    `<tr><td style="${cell};color:#64748b">${label}</td>` +
    `<td style="${cell};color:#0f172a;font-weight:600">${value}</td></tr>`;

  const partyRows = (parties || [])
    .map(
      (p) =>
        `<tr><td style="${cell};color:#0f172a">${p.name}</td>` +
        `<td style="${cell};color:#64748b;text-align:center">${p.count}</td>` +
        `<td style="${cell};color:#0f172a;font-weight:600;text-align:right">${formatINR(p.amount)}</td></tr>`
    )
    .join('');

  const receivedBy = handover.recipientDesignation
    ? `${handover.recipientName} — ${handover.recipientDesignation}`
    : handover.recipientName;

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#185997;margin-bottom:4px">${COMPANY} — Cash Handover Verified</h2>
    <p style="color:#334155;font-size:14px">A collector handed over cash and the receiver confirmed it by OTP. The PDF handover receipt is attached.</p>
    <table style="border-collapse:collapse;background:#eff6fc;border-radius:8px;width:100%">
      ${row('Handed over by', collector?.name || '—')}
      ${row('Received by', receivedBy)}
      ${row('Total amount', formatINR(handover.totalAmount))}
      ${row('Collections', String(handover.transactions.length))}
      ${row('Verified at', formatDateTime(handover.verifiedAt) + ' IST')}
      ${row('Reference', handover.ref)}
      ${handover.notes ? row('Notes', handover.notes) : ''}
    </table>
    <h3 style="color:#0f172a;font-size:14px;margin:16px 0 6px">Party-wise amounts</h3>
    <table style="border-collapse:collapse;background:#f8fafc;border-radius:8px;width:100%">
      <tr>
        <th style="${cell};color:#64748b;text-align:left">Party</th>
        <th style="${cell};color:#64748b;text-align:center">Collections</th>
        <th style="${cell};color:#64748b;text-align:right">Amount</th>
      </tr>
      ${partyRows || `<tr><td style="${cell};color:#64748b" colspan="3">—</td></tr>`}
      <tr>
        <td style="${cell};color:#185997;font-weight:700">TOTAL</td>
        <td style="${cell};color:#185997;font-weight:700;text-align:center">${handover.transactions.length}</td>
        <td style="${cell};color:#185997;font-weight:700;text-align:right">${formatINR(handover.totalAmount)}</td>
      </tr>
    </table>
  </div>`;
}

function emailHtml(txn) {
  const row = (label, value) =>
    `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px">${label}</td>` +
    `<td style="padding:6px 12px;color:#0f172a;font-size:13px;font-weight:600">${value}</td></tr>`;

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#185997;margin-bottom:4px">${COMPANY} — Cash Collection Verified</h2>
    <p style="color:#334155;font-size:14px">A field cash collection was verified by party OTP. The PDF receipt is attached.</p>
    <table style="border-collapse:collapse;background:#eff6fc;border-radius:8px;width:100%">
      ${row('Party', txn.party.name)}
      ${row('Amount', formatINR(txn.amount))}
      ${row('Collector', txn.collector.name)}
      ${row('Verified at', formatDateTime(txn.verifiedAt) + ' IST')}
      ${row('Reference', txn.ref)}
      ${txn.notes ? row('Notes', txn.notes) : ''}
    </table>
    <p style="color:#94a3b8;font-size:12px">Status: VERIFIED — the party acknowledged this collection by sharing the OTP sent to their registered mobile (+91 •••••• ${String(
      txn.otpMobile || txn.party.mobile
    ).slice(-4)}).</p>
  </div>`;
}

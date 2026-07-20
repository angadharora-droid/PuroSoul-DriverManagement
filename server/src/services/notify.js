import { sendMail } from './email.js';
import { sendSms } from './sms.js';
import { receiptPdf } from './pdf.js';
import { getGlobalSettings } from '../models/Setting.js';
import { formatINR, formatDateTime } from '../utils/format.js';

const COMPANY = process.env.COMPANY_NAME || 'Puro Soul';

/**
 * Fired after a transaction is verified. Sends the stakeholder email (with PDF
 * receipt attached) and the confirmation SMS to the party, then records what
 * was sent on the transaction. Failures are recorded, never thrown — the
 * verification itself has already succeeded.
 *
 * txn must be populated with party and driver.
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
    await sendSms(txn.party.mobile, {
      type: 'confirmation',
      template: 'confirmation',
      text: `${COMPANY}: Collection of ${formatINR(txn.amount)} received by ${txn.driver.name} on ${dateStr} is confirmed. Ref ${txn.ref}.`,
      vars: { amount: formatINR(txn.amount), driver: txn.driver.name, date: dateStr, ref: txn.ref },
      // {#var#} fill order of the registered DLT template — keep in sync with the
      // portal. "Rs." is static text in the template, so the amount var is numeric.
      dltVars: [formatINR(txn.amount).replace('Rs. ', ''), txn.driver.name, dateStr, txn.ref],
    });
    txn.smsConfirmationSent = true;
  } catch (err) {
    errors.push(`sms: ${err.message}`);
  }

  txn.notifyError = errors.join(' | ');
  await txn.save();
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
      ${row('Driver', txn.driver.name)}
      ${row('Verified at', formatDateTime(txn.verifiedAt) + ' IST')}
      ${row('Reference', txn.ref)}
      ${txn.notes ? row('Notes', txn.notes) : ''}
    </table>
    <p style="color:#94a3b8;font-size:12px">Status: VERIFIED — the party acknowledged this collection by sharing the OTP sent to their registered mobile (+91 •••••• ${String(
      txn.party.mobile
    ).slice(-4)}).</p>
  </div>`;
}

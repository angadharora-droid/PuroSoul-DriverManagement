import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      // Fail fast with a real error instead of hanging until a gateway 502.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });
  } else {
    // Development fallback: log the email instead of sending it.
    transporter = {
      isStub: true,
      async sendMail(opts) {
        console.log(
          `[email:console] to=${opts.to} subject="${opts.subject}" attachments=${(opts.attachments || [])
            .map((a) => a.filename)
            .join(', ')}`
        );
        return { messageId: 'console-stub' };
      },
    };
  }
  return transporter;
}

/**
 * Sender address. Most SMTP hosts (Hostinger included) reject a From that the
 * authenticated mailbox doesn't own — "553 Sender address rejected" — so when
 * EMAIL_FROM is unset, default to the login mailbox itself, which is always
 * accepted. Run `npm run email-doctor` to test the configured value.
 */
function fromAddress() {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  const company = process.env.COMPANY_NAME || 'PuroSoul Cash';
  if (process.env.SMTP_USER) return `"${company}" <${process.env.SMTP_USER}>`;
  return `"${company}" <no-reply@localhost>`;
}

export async function sendMail({ to, subject, html, attachments }) {
  const t = getTransporter();
  return t.sendMail({
    from: fromAddress(),
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    attachments,
  });
}

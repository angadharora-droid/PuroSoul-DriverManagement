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

export async function sendMail({ to, subject, html, attachments }) {
  const t = getTransporter();
  return t.sendMail({
    from: process.env.EMAIL_FROM || '"PuroSoul Cash" <no-reply@localhost>',
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    attachments,
  });
}

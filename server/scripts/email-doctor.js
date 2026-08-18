/**
 * SMTP diagnostics — answers "why does no notification email arrive?".
 *
 *   npm run email-doctor          # checks connection + login, then sends one
 *                                 # self-test email (SMTP_USER → SMTP_USER)
 *
 * Prints the raw SMTP response for every step. The app swallows these behind
 * sendMail(), so this is the only place the actual server rejection shows up.
 * If the configured EMAIL_FROM is rejected, it retries as the SMTP_USER —
 * hosts like Hostinger only accept a From matching the authenticated mailbox.
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';

const line = (s = '') => console.log(s);
const head = (s) => line(`\n${s}\n${'-'.repeat(s.length)}`);

async function main() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;

  head('1. Effective SMTP config (server/.env)');
  if (!SMTP_HOST) {
    line('SMTP_HOST is not set — the app logs emails to the console instead of sending. Nothing to diagnose.');
    return 1;
  }
  line(`host       ${SMTP_HOST}:${Number(SMTP_PORT) || 587}  secure=${SMTP_SECURE === 'true'}`);
  line(`login      ${SMTP_USER || '(no auth)'}  pass=${SMTP_PASS ? '*'.repeat(6) + SMTP_PASS.slice(-2) : '(none)'}`);
  line(`from       ${EMAIL_FROM || '(unset — app falls back to no-reply@localhost)'}`);

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true',
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  head('2. Connection + login (verify)');
  try {
    await transporter.verify();
    line('OK — TCP connection, TLS and login all succeeded.');
  } catch (err) {
    line(`FAILED: ${err.message}`);
    line('Fix the host/port/credentials above before anything else. If this times out from the');
    line('production host but works locally, the host is blocking outbound SMTP ports.');
    return 1;
  }

  head(`3. Self-test send (${SMTP_USER} → ${SMTP_USER}) using the configured From`);
  const trySend = async (from) => {
    const info = await transporter.sendMail({
      from,
      to: SMTP_USER,
      subject: 'PuroSoul email-doctor self-test',
      text: `Sent by scripts/email-doctor.js with From: ${from}. If you can read this, sending works with that From address.`,
    });
    line(`OK — accepted by server: ${info.response || info.messageId}`);
  };

  const configuredFrom = EMAIL_FROM || `"PuroSoul Cash" <no-reply@localhost>`;
  try {
    await trySend(configuredFrom);
    line('The configured EMAIL_FROM works — email sending is healthy.');
    return 0;
  } catch (err) {
    line(`FAILED: ${err.message}`);
  }

  head('4. Retry with From = the authenticated mailbox');
  try {
    await trySend(SMTP_USER);
    line('');
    line(`>>> Diagnosis: the server rejects the configured EMAIL_FROM but accepts the login mailbox.`);
    line(`>>> Fix: set  EMAIL_FROM="PuroSoul Collection <${SMTP_USER}>"  in server/.env (and the`);
    line('>>> production environment), or create the From address as an alias of this mailbox.');
    return 1;
  } catch (err) {
    line(`FAILED too: ${err.message}`);
    line('Sending fails even as the login mailbox — check the account with the email host.');
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('email-doctor crashed:', err);
    process.exit(1);
  }
);

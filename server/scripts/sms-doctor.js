/**
 * Fast2SMS diagnostics — answers "why was I charged but no SMS arrived?".
 *
 *   npm run sms-doctor                 # config + wallet only, sends nothing
 *   npm run sms-doctor -- 9876543210   # also sends a real test OTP (costs credits)
 *
 * Prints the raw gateway response for every call. The app swallows these behind
 * sendSms(), so this is the only place the actual status_code shows up.
 */
import 'dotenv/config';

const API_KEY = process.env.FAST2SMS_API_KEY;
const mobile = (process.argv[2] || '').replace(/\D/g, '').slice(-10);

const line = (s = '') => console.log(s);
const head = (s) => line(`\n${s}\n${'-'.repeat(s.length)}`);
const getJson = (url) =>
  fetch(url)
    .then((r) => r.json())
    .catch((e) => ({ error: e.message }));

async function main() {
  if (!API_KEY) {
    line('FAST2SMS_API_KEY is not set in server/.env — nothing to diagnose.');
    return 1;
  }

  // --- 1. Which route will the app actually take? ---------------------------
  head('Config');

  const senderId = process.env.FAST2SMS_DLT_SENDER_ID;
  const dltIds = {
    'collection-otp': process.env.FAST2SMS_DLT_COLLECTION_OTP_ID,
    'handover-otp': process.env.FAST2SMS_DLT_HANDOVER_OTP_ID,
    confirmation: process.env.FAST2SMS_DLT_CONFIRMATION_ID,
  };

  line(`SMS_PROVIDER            ${process.env.SMS_PROVIDER || '(unset → console)'}`);
  line(`FAST2SMS_API_KEY        set (${API_KEY.length} chars)`);
  line(`FAST2SMS_DLT_SENDER_ID  ${senderId || 'MISSING'}`);
  for (const [name, id] of Object.entries(dltIds)) {
    line(`  ${name.padEnd(20)} ${id || 'MISSING'}`);
  }

  // Mirrors the branch in src/services/sms.js — DLT only fires when the sender
  // id AND that template's message id are both present.
  const dltReady = Boolean(senderId && dltIds['collection-otp']);
  line('');
  if (dltReady) {
    line('=> route "dlt": your approved templates. Reaches DND numbers.');
  } else {
    line('=> route "otp", falling back to "q" on status 996.');
    line('   "q" is PROMOTIONAL: credits are deducted on submission, then the');
    line('   operator drops it for any DND-registered number. Charged, undelivered.');
  }

  // --- 2. Does the key work, and is there balance? --------------------------
  head('Wallet');
  line(JSON.stringify(await getJson(`https://www.fast2sms.com/dev/wallet?authorization=${API_KEY}`)));

  // --- 3. Send a real test message and read the delivery report -------------
  if (mobile.length !== 10) {
    head('Send test');
    line('No valid 10-digit mobile given — skipping the live send.');
    line('Re-run as: npm run sms-doctor -- 9876543210');
    return 0;
  }

  head(`Send test → ${mobile}`);

  const post = async (payload) => {
    line(`request  ${JSON.stringify(payload)}`);
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    line(`response HTTP ${res.status} ${JSON.stringify(body)}`);
    return body;
  };

  const code = String(Math.floor(1000 + Math.random() * 9000));
  let body;

  if (dltReady) {
    body = await post({
      route: 'dlt',
      sender_id: senderId,
      message: dltIds['collection-otp'],
      variables_values: [code, '1,000.00', '5'].join('|'),
      numbers: mobile,
    });
  } else {
    body = await post({ route: 'otp', variables_values: code, numbers: mobile });
    if (body.status_code === 996) {
      line('\n!! 996 = OTP-route website KYC not approved. The app falls back to "q" here.');
      body = await post({ route: 'q', message: `${code} is your test OTP.`, numbers: mobile });
    }
  }

  const requestId = body.request_id;
  if (!requestId) {
    line('\nNo request_id returned — the send was rejected outright (see response above).');
    return 1;
  }

  // Submission success != delivery. This is the part the app never checks.
  head(`Delivery report (request_id ${requestId})`);
  line('Submission accepted. Polling actual delivery status...\n');

  for (let i = 1; i <= 4; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const report = await getJson(
      `https://www.fast2sms.com/dev/delivery-report?authorization=${API_KEY}&request_id=${requestId}`
    );
    line(`poll ${i} (${i * 8}s)  ${JSON.stringify(report)}`);
  }

  line('\nRead the status field above:');
  line('  DELIVRD          delivered — the gateway is fine, look elsewhere');
  line('  DND / BLOCKED    DND rejection — you paid, operator dropped it. Fix: use route "dlt"');
  line('  FAILED / EXPIRED operator rejected; on "dlt" this usually means the message');
  line('                   text or variable count does not match the approved template');
  return 0;
}

// Node on Windows asserts if process.exit() runs while fetch still holds a
// keep-alive socket, so set the code and let the event loop drain naturally.
process.exitCode = await main();

/**
 * Fast2SMS diagnostics — answers "why was I charged but no SMS arrived?".
 *
 *   npm run sms-doctor                        # config + wallet only, sends nothing
 *   npm run sms-doctor -- 9876543210          # also sends a real test OTP (costs credits)
 *   npm run sms-doctor -- 9876543210 STPL     # ...overriding the sender id, to test
 *                                             # which header the template is chained to
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

  // A second arg overrides the header for this run only, so alternate sender ids
  // can be tried without editing .env between attempts.
  const senderOverride = (process.argv[3] || '').trim();
  const senderId = senderOverride || process.env.FAST2SMS_DLT_SENDER_ID;
  const dltIds = {
    'collection-otp': process.env.FAST2SMS_DLT_COLLECTION_OTP_ID,
    'handover-otp': process.env.FAST2SMS_DLT_HANDOVER_OTP_ID,
    confirmation: process.env.FAST2SMS_DLT_CONFIRMATION_ID,
  };

  line(`SMS_PROVIDER            ${process.env.SMS_PROVIDER || '(unset → console)'}`);
  line(`FAST2SMS_API_KEY        set (${API_KEY.length} chars)`);
  line(
    `FAST2SMS_DLT_SENDER_ID  ${senderId || 'MISSING'}` +
      (senderOverride ? `  (overridden for this run; .env has ${process.env.FAST2SMS_DLT_SENDER_ID || 'nothing'})` : '')
  );
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

  // Submission success != delivery. Fast2SMS's dev API has no delivery-report
  // endpoint (only bulkV2 and wallet), so the operator-side status has to be
  // read from the dashboard.
  head(`Accepted — request_id ${requestId}`);
  line('This only means Fast2SMS queued it. The operator can still drop it.');
  line('');
  line('Check the real status at:  https://www.fast2sms.com/dashboard/sms/reports');
  line(`Find request id ${requestId} and read its status:`);
  line('');
  line('  DELIVRD          delivered — gateway is fine, look elsewhere');
  line('  FAILED / BLOCKED operator rejected. On the DLT route the usual causes are:');
  line('                   (a) sender_id is not the header the template is registered');
  line('                       against — they must be the same pair on the DLT portal');
  line('                   (b) variable count differs from the approved template');
  line('                   (c) template approved <1-2h ago, not yet synced to operators');
  return 0;
}

// Node on Windows asserts if process.exit() runs while fetch still holds a
// keep-alive socket, so set the code and let the event loop drain naturally.
process.exitCode = await main();

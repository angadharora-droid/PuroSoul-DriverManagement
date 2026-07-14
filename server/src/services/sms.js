/**
 * SMS gateway abstraction. Select with SMS_PROVIDER: console | msg91 | twilio | fast2sms
 *
 * All sends go through sendSms(mobile, message) where message is:
 *   { type: 'otp' | 'confirmation', text: string, vars: object }
 * - text        : full message body (used by console / twilio / fast2sms quick route)
 * - vars        : template variables (used by MSG91 DLT flow templates)
 *
 * India note: production SMS to Indian numbers requires DLT-registered templates.
 * fast2sms needs no DLT setup of your own — OTPs go through its dedicated OTP
 * route (Fast2SMS's pre-approved template, delivers 24/7 incl. DND numbers) and
 * confirmations through the quick route (promotional-grade delivery). For fully
 * templated delivery, use MSG91: register two templates and put their IDs in .env.
 */

const provider = (process.env.SMS_PROVIDER || 'console').toLowerCase();

async function sendConsole(mobile, message) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SMS_PROVIDER=console cannot be used in production');
  }
  // Development only — prints the OTP so you can test without a gateway.
  console.log(`[sms:console] to +91${mobile} (${message.type}): ${message.text}`);
  return { provider: 'console' };
}

async function sendMsg91(mobile, message) {
  const authKey = requiredEnv('MSG91_AUTH_KEY');
  const templateId =
    message.type === 'otp'
      ? requiredEnv('MSG91_OTP_TEMPLATE_ID')
      : requiredEnv('MSG91_SMS_TEMPLATE_ID');

  const res = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: authKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: templateId,
      sender: process.env.MSG91_SENDER_ID || undefined,
      recipients: [{ mobiles: `91${mobile}`, ...message.vars }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.type === 'error') {
    throw new Error(`MSG91 send failed: ${body.message || res.status}`);
  }
  return { provider: 'msg91', id: body.request_id };
}

async function sendTwilio(mobile, message) {
  const sid = requiredEnv('TWILIO_ACCOUNT_SID');
  const token = requiredEnv('TWILIO_AUTH_TOKEN');
  const from = requiredEnv('TWILIO_FROM_NUMBER');

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: `+91${mobile}`, From: from, Body: message.text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio send failed: ${body.message || res.status}`);
  return { provider: 'twilio', id: body.sid };
}

async function sendFast2Sms(mobile, message) {
  const apiKey = requiredEnv('FAST2SMS_API_KEY');
  const post = async (payload) => {
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { res, body };
  };

  // OTP route sends only the numeric code ("{code} is your verification code")
  // but is DLT-approved on Fast2SMS's side, so it reaches DND numbers 24/7.
  let out;
  if (message.type === 'otp') {
    out = await post({ route: 'otp', variables_values: String(message.vars.otp), numbers: mobile });
    // 996 = account's OTP-route website KYC not approved yet. Fall back to the
    // quick route so OTPs keep flowing; this stops triggering once KYC passes.
    if (out.body.status_code === 996) {
      console.warn('[sms] Fast2SMS OTP route not verified yet — falling back to quick route');
      out = await post({ route: 'q', message: message.text, numbers: mobile });
    }
  } else {
    out = await post({ route: 'q', message: message.text, numbers: mobile });
  }

  const { res, body } = out;
  if (!res.ok || body.return === false) {
    throw new Error(`Fast2SMS send failed: ${(body.message && String(body.message)) || res.status}`);
  }
  return { provider: 'fast2sms', id: body.request_id };
}

const providers = { console: sendConsole, msg91: sendMsg91, twilio: sendTwilio, fast2sms: sendFast2Sms };

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name} for SMS provider "${provider}"`);
  return v;
}

export async function sendSms(mobile, message) {
  const impl = providers[provider];
  if (!impl) throw new Error(`Unknown SMS_PROVIDER "${provider}"`);
  return impl(mobile, message);
}

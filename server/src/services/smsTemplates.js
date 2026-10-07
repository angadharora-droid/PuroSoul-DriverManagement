import { formatINR } from '../utils/format.js';

// DLT requires the registered entity/brand name in the SMS body — keep this
// identical to the brand phrase in the approved templates and on the portal.
const SMS_BRAND = process.env.SMS_BRAND_NAME || 'Puro Soul - Hotel Centre Point';

/**
 * The registered "Collection OTP" DLT template. Used for party collections and
 * for event bills (the OTP goes to the customer) — one approved template, so
 * event billing needs no new DLT registration.
 */
export function collectionOtpMessage(code, amount) {
  const ttl = process.env.OTP_TTL_MINUTES || 5;
  return {
    type: 'otp',
    template: 'collection-otp',
    text: `${code} is your OTP for confirming cash collection of ${formatINR(amount)} for ${SMS_BRAND}. Share this OTP only with the collector present with you. Valid for ${ttl} minutes.`,
    vars: { otp: code, amount: formatINR(amount) },
    // {#var#} fill order of the registered DLT template — keep in sync with the
    // portal. "Rs." stays in the template's static text; the amount keeps its
    // comma/decimal, so its DLT variable is Alphanumeric (Number rejects those).
    dltVars: [code, formatINR(amount).replace('Rs. ', ''), String(ttl)],
  };
}

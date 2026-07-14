/**
 * Import-only smoke test: verifies every module loads and the PDF templates
 * render, without needing MongoDB or any gateway credentials.
 *   npm run smoke
 */
import 'dotenv/config';

const modules = [
  '../src/middleware/auth.js',
  '../src/middleware/error.js',
  '../src/models/Party.js',
  '../src/models/Driver.js',
  '../src/models/Admin.js',
  '../src/models/Transaction.js',
  '../src/models/Setting.js',
  '../src/utils/otp.js',
  '../src/utils/format.js',
  '../src/utils/csv.js',
  '../src/services/sms.js',
  '../src/services/email.js',
  '../src/services/pdf.js',
  '../src/services/notify.js',
  '../src/services/report.js',
  '../src/services/dayend.js',
  '../src/routes/auth.js',
  '../src/routes/parties.js',
  '../src/routes/drivers.js',
  '../src/routes/admins.js',
  '../src/routes/collections.js',
  '../src/routes/reports.js',
  '../src/routes/settings.js',
];

for (const m of modules) {
  await import(m);
  console.log(`ok  ${m.replace('../src/', '')}`);
}

// Render both PDF templates with fake data
const { receiptPdf, reportPdf } = await import('../src/services/pdf.js');
const fakeTxn = {
  ref: 'TESTREF1',
  amount: 12345.5,
  notes: 'Smoke test',
  createdAt: new Date(),
  verifiedAt: new Date(),
  party: { name: 'Test Party', mobile: '9876543210' },
  driver: { name: 'Test Driver' },
};
const receipt = await receiptPdf(fakeTxn);
console.log(`ok  receipt PDF rendered (${receipt.length} bytes)`);

const report = await reportPdf({
  title: 'Daily Collection Report — Test',
  subtitle: 'Period: test • Verified collections only',
  groups: [
    {
      label: 'Test Driver',
      breakdown: 'Test Party: Rs. 12,345.50',
      rows: [{ date: new Date(), ref: 'TESTREF1', party: 'Test Party', driver: 'Test Driver', amount: 12345.5 }],
      subtotal: 12345.5,
      count: 1,
    },
  ],
  grandTotal: 12345.5,
  grandCount: 1,
});
console.log(`ok  report PDF rendered (${report.length} bytes)`);
console.log('smoke test passed');
process.exit(0);

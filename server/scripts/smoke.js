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
  '../src/models/Collector.js',
  '../src/models/Receiver.js',
  '../src/models/Admin.js',
  '../src/models/Transaction.js',
  '../src/models/Handover.js',
  '../src/models/Setting.js',
  '../src/models/Event.js',
  '../src/models/EventBill.js',
  '../src/models/EventStockEntry.js',
  '../src/models/EventAttachment.js',
  '../src/utils/otp.js',
  '../src/utils/format.js',
  '../src/utils/csv.js',
  '../src/services/sms.js',
  '../src/services/email.js',
  '../src/services/pdf.js',
  '../src/services/notify.js',
  '../src/services/report.js',
  '../src/services/dayend.js',
  '../src/services/smsTemplates.js',
  '../src/services/eventReport.js',
  '../src/routes/auth.js',
  '../src/routes/parties.js',
  '../src/routes/collectors.js',
  '../src/routes/receivers.js',
  '../src/routes/admins.js',
  '../src/routes/collections.js',
  '../src/routes/handovers.js',
  '../src/routes/reports.js',
  '../src/routes/settings.js',
  '../src/routes/events.js',
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
  collector: { name: 'Test Collector' },
};
const receipt = await receiptPdf(fakeTxn);
console.log(`ok  receipt PDF rendered (${receipt.length} bytes)`);

const report = await reportPdf({
  title: 'Daily Collection Report — Test',
  subtitle: 'Period: test • Verified collections only',
  groups: [
    {
      label: 'Test Collector',
      breakdown: 'Test Party: Rs. 12,345.50',
      rows: [{ date: new Date(), ref: 'TESTREF1', party: 'Test Party', collector: 'Test Collector', amount: 12345.5 }],
      subtotal: 12345.5,
      count: 1,
    },
  ],
  grandTotal: 12345.5,
  grandCount: 1,
});
console.log(`ok  report PDF rendered (${report.length} bytes)`);

// Handover report uses the same template with relabelled columns
const handoverReport = await reportPdf({
  title: 'Cash Handover Report',
  subtitle: 'Period: test • Verified handovers only',
  groups: [
    {
      label: 'Test Collector',
      breakdown: 'Test Admin: Rs. 12,345.50',
      rows: [{ date: new Date(), ref: 'TESTREF2', party: 'Test Admin', collector: 'Test Collector', amount: 12345.5 }],
      subtotal: 12345.5,
      count: 1,
    },
  ],
  grandTotal: 12345.5,
  grandCount: 1,
  colLabels: { party: 'Received by' },
  totalLabel: 'TOTAL CASH HANDED OVER',
  countLabel: 'HANDOVERS',
});
console.log(`ok  handover report PDF rendered (${handoverReport.length} bytes)`);

// Event module: mini bill, full event report, UPI screenshot archive
const { eventBillPdf, eventReportPdf, eventScreenshotsPdf } = await import('../src/services/pdf.js');
const fakeLines = [
  { item: 'i1', name: '1L Bottle (case of 12)', price: 240, quantity: 2, amount: 480 },
  { item: 'i2', name: '20L Jar', price: 90, quantity: 1, amount: 90 },
];
const fakeBill = {
  ref: 'EVTREF01',
  billLabel: '0001',
  customerName: 'Test Customer',
  customerMobile: '9876543210',
  lines: fakeLines,
  totalQuantity: 3,
  totalAmount: 570,
  paymentMode: 'upi',
  upiRef: '412345678901',
  billerName: 'Test Collector',
  createdAt: new Date(),
  verifiedAt: new Date(),
};
const miniBill = await eventBillPdf(fakeBill, { name: 'Test Expo 2026', venue: 'Hall 3, Test Grounds' });
console.log(`ok  event mini bill PDF rendered (${miniBill.length} bytes)`);

const bucket = { bills: 1, quantity: 3, amount: 570, cash: 0, upi: 570, cashBills: 0, upiBills: 1 };
const billRowFake = { ...fakeBill, id: 'b1', date: new Date(), itemsLabel: '2 × 1L Bottle (case of 12), 1 × 20L Jar', hasScreenshot: true };
const eventReport = await eventReportPdf({
  event: { name: 'Test Expo 2026', venue: 'Hall 3', startDate: '2026-10-07', endDate: '2026-10-09', status: 'open' },
  generatedAt: new Date(),
  totals: bucket,
  stock: { stockIn: 60, stockOut: 2, remaining: 55 },
  items: [
    { id: 'i1', name: '1L Bottle (case of 12)', price: 240, isActive: true, stockIn: 40, stockOut: 2, sold: 2, salesAmount: 480, remaining: 36 },
    { id: 'i2', name: '20L Jar', price: 90, isActive: true, stockIn: 20, stockOut: 0, sold: 1, salesAmount: 90, remaining: 19 },
  ],
  byBiller: [{ ...bucket, name: 'Test Collector' }],
  days: [{ ...bucket, date: '2026-10-07', label: '07 Oct 2026' }],
  bills: [billRowFake],
  statusCounts: { verified: { count: 1, amount: 570 }, cancelled: { count: 1, amount: 90 } },
  stockEntries: [{ date: new Date(), itemName: '1L Bottle (case of 12)', kind: 'in', quantity: 40, note: 'Opening stock', enteredByName: 'Test Receiver' }],
});
console.log(`ok  event report PDF rendered (${eventReport.length} bytes)`);

// 1×1 PNG stands in for a real screenshot.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const shots = await eventScreenshotsPdf({
  event: { name: 'Test Expo 2026' },
  subtitle: 'Whole event • 1 screenshot',
  bills: [billRowFake],
  loadBatch: async (ids) => new Map(ids.map((id) => [String(id), { data: png, contentType: 'image/png', sha256: 'f'.repeat(64) }])),
});
console.log(`ok  UPI screenshots PDF rendered (${shots.length} bytes)`);
console.log('smoke test passed');
process.exit(0);

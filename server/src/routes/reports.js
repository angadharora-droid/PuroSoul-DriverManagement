import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { buildReport } from '../services/report.js';
import { sendDayEndReport } from '../services/dayend.js';
import { reportPdf } from '../services/pdf.js';
import { toCsv } from '../utils/csv.js';
import { formatDateTime } from '../utils/format.js';

const router = Router();

router.get('/', requireAuth('admin'), async (req, res) => {
  const report = await buildReport(req.query);
  const format = req.query.format || 'json';

  if (format === 'json') return res.json({ report });

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'pdf') {
    const pdf = await reportPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report.type}-report-${stamp}.pdf"`);
    return res.send(pdf);
  }

  if (format === 'csv') {
    const rows = [];
    for (const g of report.groups) {
      for (const r of g.rows) rows.push([g.label, formatDateTime(r.date), r.ref, r.party, r.driver, r.amount.toFixed(2)]);
      rows.push([`${g.label} — subtotal (${g.count} txns)`, '', '', '', '', g.subtotal.toFixed(2)]);
    }
    rows.push(['GRAND TOTAL', '', '', '', '', report.grandTotal.toFixed(2)]);
    const csv = toCsv(['Group', 'Date', 'Ref', 'Party', 'Driver', 'Amount (INR)'], rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.type}-report-${stamp}.csv"`);
    return res.send(csv);
  }

  res.status(400).json({ error: 'format must be json, csv or pdf' });
});

/** Email the day-end report PDF to the configured notification emails right now. */
router.post('/day-end', requireAuth('admin'), async (req, res) => {
  const date = (req.body || {}).date;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  const result = await sendDayEndReport(date || undefined);
  if (!result.sent) return res.status(400).json({ error: result.reason });
  res.json(result);
});

export default router;

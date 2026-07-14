function escapeCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** rows: array of arrays. Returns a CSV string with BOM so Excel opens it as UTF-8. */
export function toCsv(headerRow, rows) {
  const lines = [headerRow, ...rows].map((row) => row.map(escapeCell).join(','));
  return '﻿' + lines.join('\r\n');
}

/** Safe for application-generated reports and spreadsheet-compatible exports. */
export function escapeReportHtml(value: unknown): string {
  return String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function csvSafeCell(value: unknown): string {
  const text = String(value ?? '');
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replaceAll('"', '""')}"`;
}

export function csvSafeRows(rows: unknown[][]): string {
  return rows.map(row => row.map(csvSafeCell).join(',')).join('\n');
}

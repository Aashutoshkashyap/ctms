/** Safe for text-node interpolation in application-generated report HTML. */
export function escapeReportHtml(value: unknown) {
  return String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Preserve ordinary numeric cells, but prevent user-controlled strings from
 * becoming formulas in spreadsheet applications when the CSV is opened.
 */
export function csvSafeCell(value: unknown) {
  const text = String(value ?? '');
  const neutralized = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

export function csvSafeRows(rows: unknown[][]) {
  return rows.map(row => row.map(csvSafeCell).join(',')).join('\n');
}

/**
 * CSV export utility — RFC 4180 compliant with Excel BOM support.
 */

/** Escape a single field per RFC 4180: quote if it contains comma, quote, or newline. */
function escapeField(value: string | number): string {
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** Build an RFC 4180 CSV string from headers + rows. */
export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeField).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeField).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Build CSV with a comment header (lines starting with #) prepended before the data. */
export function buildCsvWithComment(
  comment: string,
  headers: string[],
  rows: (string | number)[][],
): string {
  const commentLines = comment
    .split('\n')
    .map((l) => (l.startsWith('#') ? l : '# ' + l));
  return commentLines.join('\r\n') + '\r\n' + buildCsv(headers, rows);
}

/**
 * Trigger a CSV file download in the browser.
 * Prepends a UTF-8 BOM for Excel compatibility.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const csv = '\uFEFF' + buildCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger a CSV file download with a comment header prepended.
 * Prepends a UTF-8 BOM for Excel compatibility.
 */
export function downloadCsvWithComment(
  filename: string,
  comment: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const csv = '\uFEFF' + buildCsvWithComment(comment, headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

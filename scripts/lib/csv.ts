/**
 * CSV reading for the analysis scripts.
 *
 * WHY SHARED
 * ----------
 * The macro extract and the WDI series both quote fields, so a naive `split(',')`
 * silently shifts every column after the first quoted value. That is not a
 * cosmetic bug: it makes a covariate look absent when it is present, which turns
 * a blocker count into a fabrication. `build_canonical_panel.ts` grew a correct
 * RFC 4180 reader for this reason; this module is that reader, extracted so the
 * derivation scripts cannot each grow their own nearly-correct copy.
 */

/** Split one RFC 4180 line, honouring double-quoted fields and `""` escapes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else { quoted = false; }
      } else { cur += ch; }
    } else if (ch === '"') { quoted = true; }
    else if (ch === ',') { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}

/** Read CSV text into objects keyed by the trimmed header row. */
export function readCsvRecords(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

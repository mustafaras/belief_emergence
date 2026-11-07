import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Section = {
  label: string;
  pattern: string;
  kind: 'regex' | 'literal';
};

type Audit = {
  outFile: string;
  sections: Section[];
};

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  '__pycache__',
  '.git',
]);

const EXCLUDED_FILE_NAMES = new Set([
  'eslint-report.json',
  'eslint-out.txt',
  'eslint-stderr.txt',
]);

function isExcludedPath(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  // Never let the audit generator influence its own evidence.
  if (normalized.endsWith(path.normalize(path.join('scripts', 'generate_search_audits.ts')))) return true;
  const parts = normalized.split(path.sep);

  for (const part of parts) {
    if (EXCLUDED_DIR_NAMES.has(part)) return true;
  }

  const base = path.basename(normalized);
  if (EXCLUDED_FILE_NAMES.has(base)) return true;
  if (/^search_audit_[A-F]\.txt$/i.test(base)) return true;

  const ext = path.extname(base).toLowerCase();
  if (ext === '.pyc') return true;

  return false;
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      out.push(...(await walkFiles(full)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (isExcludedPath(full)) continue;
    out.push(full);
  }

  return out;
}

function countRegexMatches(text: string, re: RegExp): number {
  // Ensure global so we can count all occurrences.
  const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let count = 0;
  for (const _m of text.matchAll(globalRe)) {
    void _m;
    count += 1;
  }
  return count;
}

function countLiteralMatches(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const found = text.indexOf(needle, idx);
    if (found === -1) break;
    count += 1;
    idx = found + needle.length;
  }
  return count;
}

async function computeSection(files: string[], section: Section): Promise<{ total: number; files: string[] }> {
  const matchedFiles: string[] = [];
  let total = 0;

  const regex =
    section.kind === 'regex'
      ? new RegExp(section.pattern, 'gi')
      : null;

  for (const filePath of files) {
    // Read as UTF-8; ignore files that are not text.
    let text: string;
    try {
      text = await fs.promises.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const count =
      section.kind === 'regex'
        ? countRegexMatches(text, regex as RegExp)
        : countLiteralMatches(text, section.pattern);

    if (count > 0) {
      total += count;
      matchedFiles.push(filePath);
    }
  }

  matchedFiles.sort((a, b) => a.localeCompare(b));
  return { total, files: matchedFiles };
}

async function writeAudit(audit: Audit, files: string[]): Promise<void> {
  const outPath = path.join(REPO_ROOT, audit.outFile);
  const lines: string[] = [];

  for (const section of audit.sections) {
    const result = await computeSection(files, section);

    if (result.files.length === 0) {
      lines.push(`=== ${section.label} === TOTAL_MATCHES: ${result.total} FILES_WITH_MATCHES: (none) `);
      continue;
    }

    lines.push(`=== ${section.label} === TOTAL_MATCHES: ${result.total} FILES_WITH_MATCHES:`);
    for (const filePath of result.files) {
      lines.push(` - ${filePath}`);
    }
    lines.push('');
  }

  await fs.promises.writeFile(outPath, `${lines.join('\n')}\n`, 'utf8');
}

const AUDITS: Audit[] = [
  {
    outFile: 'search_audit_A.txt',
    sections: [
      { label: 'A1: pred - obs / predicted - observed', pattern: 'pred - obs|predicted - observed', kind: 'regex' },
      { label: 'A2: observed - predicted', pattern: 'observed - predicted', kind: 'literal' },
      { label: 'A3: obs - pred', pattern: 'obs - pred', kind: 'literal' },
      { label: 'A4: Bias = literal', pattern: 'Bias =', kind: 'literal' },
      { label: 'A5: bias_definition token', pattern: 'bias_definition', kind: 'literal' },
    ],
  },
  {
    outFile: 'search_audit_B.txt',
    sections: [
      { label: 'B1: panel_complete_23_countries', pattern: 'panel_complete_23_countries', kind: 'literal' },
      { label: 'B2: panel_model_data_v2', pattern: 'panel_model_data_v2', kind: 'literal' },
      { label: 'B3: panel_data_production', pattern: 'panel_data_production', kind: 'literal' },
      { label: 'B4: /data/ path strings', pattern: '/data/', kind: 'literal' },
      { label: 'B5: canonical dataset filename', pattern: 'panel_canonical_v2', kind: 'literal' },
    ],
  },
  {
    outFile: 'search_audit_C.txt',
    sections: [
      { label: 'C1: split(",") or split(,)', pattern: 'split\\("[,]"\\)|split\\(\\x27,\\x27\\)', kind: 'regex' },
      { label: 'C2: panelDataLoader symbol', pattern: 'panelDataLoader', kind: 'literal' },
      { label: 'C3: Papa.parse or PapaParse', pattern: 'Papa\\.parse|PapaParse', kind: 'regex' },
    ],
  },
  {
    outFile: 'search_audit_D.txt',
    sections: [
      { label: 'D1: phi0 / φ0', pattern: 'phi0|φ0', kind: 'regex' },
      { label: 'D2: 4 structural (tunable language)', pattern: '4 structural', kind: 'literal' },
    ],
  },
  {
    outFile: 'search_audit_E.txt',
    sections: [
      { label: 'E1: means token', pattern: 'means', kind: 'literal' },
      { label: 'E2: stds token', pattern: 'stds', kind: 'literal' },
      { label: 'E3: literal 0.5', pattern: '0.5', kind: 'literal' },
      { label: 'E4: literal 0.2', pattern: '0.2', kind: 'literal' },
    ],
  },
  {
    outFile: 'search_audit_F.txt',
    sections: [
      { label: 'F1: PRODUCTION_MODEL_METADATA', pattern: 'PRODUCTION_MODEL_METADATA', kind: 'literal' },
      { label: 'F2: headline.metrics token', pattern: 'headline.metrics', kind: 'literal' },
      { label: 'F3: modelMetrics token', pattern: 'modelMetrics', kind: 'literal' },
      { label: 'F4: metric keys r2/mae/rmse/corr', pattern: 'r2|mae|rmse|corr', kind: 'regex' },
    ],
  },
];

export async function generateSearchAudits(): Promise<void> {
  const files = await walkFiles(REPO_ROOT);

  for (const audit of AUDITS) {
    await writeAudit(audit, files);
  }

  // Intentionally minimal output: these files are evidence artifacts.
  console.log('✅ Regenerated search_audit_{A..F}.txt');
}

if (process.argv[1] && process.argv[1].endsWith('generate_search_audits.ts')) {
  generateSearchAudits().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Hit = {
  file: string;
  line: number;
  value: string;
};

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_COMPONENTS = path.join(APP_ROOT, 'src', 'components');

const FORBIDDEN_PATTERNS: RegExp[] = [
  /0\.8461/g,
  /0\.9488/g,
  /0\.1005/g,
  /0\.1212/g,
  /R\^2\s*=\s*0\.8461/g,
  /Corr\(Z,\\hat\{Z\}\)\s*=\s*0\.9488/g,
  /MAE\s*=\s*0\.1005/g,
  /RMSE\s*=\s*0\.1212/g,
];

function walkTsxFiles(rootDir: string): string[] {
  const out: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && full.endsWith('.tsx')) {
        out.push(full);
      }
    }
  }

  return out;
}

function scanFile(filePath: string): Hit[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const hits: Hit[] = [];

  lines.forEach((lineText: string, index: number) => {
    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(lineText)) {
        hits.push({
          file: path.relative(APP_ROOT, filePath).replace(/\\/g, '/'),
          line: index + 1,
          value: lineText.trim(),
        });
        break;
      }
    }
  });

  return hits;
}

export function checkNoHardcodedHeadlineMetrics(): void {
  if (!fs.existsSync(SRC_COMPONENTS)) {
    throw new Error(`Directory not found: ${SRC_COMPONENTS}`);
  }

  const files = walkTsxFiles(SRC_COMPONENTS);
  const allHits = files.flatMap((filePath) => scanFile(filePath));

  if (allHits.length > 0) {
    console.error('❌ Hard-coded headline metric literals detected in UI components:');
    for (const hit of allHits) {
      console.error(`- ${hit.file}:${hit.line}`);
      console.error(`  ${hit.value}`);
    }
    console.error('Use shared metric accessors from src/data/modelMetrics.ts instead of numeric literals.');
    process.exitCode = 1;
    return;
  }

  console.log('✅ No hard-coded headline metric literals found in src/components/**/*.tsx');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkNoHardcodedHeadlineMetrics();
}

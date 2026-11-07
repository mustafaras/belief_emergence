import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Issue = {
  file: string;
  sectionRef: number;
  message: string;
  remediation: string;
};

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = path.resolve(APP_ROOT, '..');
// The manuscript lives in one of three places depending on where this runs:
//   <repo>/paper                          versioned layout (CI and fresh clones)
//   <repo>/BE_paper_latest                local development tree, app at root
//   <repo>/../BE_paper_latest             local development tree, app in BE_app/
// Resolve by existence rather than by assumption; assuming the third form is
// what made the check pass locally and fail in CI.
const PAPER_ROOT = [
  path.join(REPO_ROOT, 'paper'),
  path.join(REPO_ROOT, 'BE_paper_latest'),
  path.join(APP_ROOT, 'paper'),
  path.join(REPO_ROOT, '..', 'BE_paper_latest'),
].find((candidate) => fs.existsSync(candidate)) ?? path.join(REPO_ROOT, 'BE_paper_latest');

const MAIN_TEX = path.join(PAPER_ROOT, 'main', 'main.tex');
const SUPP_TEX = path.join(PAPER_ROOT, 'supplementary', 'supplementary_materials.tex');

const FILE_CONTEXTS: Array<{ file: string; context: 'main' | 'supplementary' | 'self-markdown'; required: boolean }> = [
  { file: path.join('main', 'main.tex'), context: 'main', required: true },
  { file: path.join('supplementary', 'supplementary_materials.tex'), context: 'supplementary', required: true },
  { file: 'highlights.tex', context: 'main', required: true },
  { file: 'cover_letter.tex', context: 'main', required: true },
  { file: 'EDITOR_RESPONSE_MATRIX.md', context: 'main', required: false },
  { file: 'CLAIM_EVIDENCE_MAP.md', context: 'main', required: false },
  { file: 'REPRO_RUNBOOK.md', context: 'self-markdown', required: false },
];

const SECTION_REF_REGEX = /\bSection\s+(\d+)\b/g;

function readText(absolutePath: string): string {
  return fs.readFileSync(absolutePath, 'utf8');
}

function countMainSections(mainTex: string): number {
  return [...mainTex.matchAll(/\\section\{[^}]+\}/g)].length;
}

function countSupplementarySections(suppTex: string): number {
  const numberedSections = [...suppTex.matchAll(/\\section\{[^}]+\}/g)].length;
  const customSections = [...suppTex.matchAll(/\\Section\{[^}]+\}/g)].length;
  return Math.max(numberedSections, customSections);
}

function countMarkdownSections(markdownText: string): number {
  return [...markdownText.matchAll(/^##\s+/gm)].length;
}

function contextMaxSections(
  context: 'main' | 'supplementary' | 'self-markdown',
  fileText: string,
  mainMax: number,
  supplementaryMax: number,
): number {
  if (context === 'main') {
    return mainMax;
  }
  if (context === 'supplementary') {
    return supplementaryMax;
  }
  return countMarkdownSections(fileText);
}

function inferKeywordMismatch(sectionRef: number, nearbyText: string): { expected: number; keyword: string } | null {
  const lower = nearbyText.toLowerCase();
  const keywordMap: Array<{ keyword: string; expected: number }> = [
    { keyword: 'data', expected: 3 },
    { keyword: 'method', expected: 4 },
    { keyword: 'uncertainty quantification', expected: 5 },
    { keyword: 'results', expected: 7 },
    { keyword: 'discussion', expected: 8 },
    { keyword: 'conclusion', expected: 9 },
  ];

  for (const { keyword, expected } of keywordMap) {
    if (lower.includes(keyword) && sectionRef !== expected) {
      return { expected, keyword };
    }
  }
  return null;
}

export function runSectionReferenceCheck(): void {
  const issues: Issue[] = [];
  const skippedOptionalFiles: string[] = [];

  if (!fs.existsSync(MAIN_TEX)) {
    issues.push({
      file: path.join('main', 'main.tex'),
      sectionRef: 0,
      message: 'Required manuscript file is missing.',
      remediation: 'Restore `paper/main/main.tex` before running docs verification.',
    });
  }

  if (!fs.existsSync(SUPP_TEX)) {
    issues.push({
      file: path.join('supplementary', 'supplementary_materials.tex'),
      sectionRef: 0,
      message: 'Required supplementary file is missing.',
      remediation: 'Restore `paper/supplementary/supplementary_materials.tex` before running docs verification.',
    });
  }

  if (issues.length > 0) {
    console.error('\n❌ Section reference check failed.');
    for (const issue of issues) {
      console.error(`\n[${issue.file}]`);
      console.error(`- Issue: ${issue.message}`);
      console.error(`- Remediation: ${issue.remediation}`);
    }
    process.exitCode = 1;
    return;
  }

  const mainText = readText(MAIN_TEX);
  const supplementaryText = readText(SUPP_TEX);
  const mainMax = countMainSections(mainText);
  const supplementaryMax = countSupplementarySections(supplementaryText);

  for (const item of FILE_CONTEXTS) {
    const absolutePath = path.join(PAPER_ROOT, item.file);
    if (!fs.existsSync(absolutePath)) {
      if (item.required) {
        issues.push({
          file: item.file,
          sectionRef: 0,
          message: 'Required file is missing for section-reference validation.',
          remediation: 'Restore the required manuscript file or update validation policy intentionally.',
        });
      } else {
        skippedOptionalFiles.push(item.file);
      }
      continue;
    }

    const text = readText(absolutePath);
    const maxSections = contextMaxSections(item.context, text, mainMax, supplementaryMax);

    for (const match of text.matchAll(SECTION_REF_REGEX)) {
      const sectionRef = Number.parseInt(match[1], 10);
      if (!Number.isFinite(sectionRef)) {
        continue;
      }

      if (sectionRef < 1 || sectionRef > maxSections) {
        issues.push({
          file: item.file,
          sectionRef,
          message: `Section ${sectionRef} is out of valid range for context (1..${maxSections}).`,
          remediation: 'Update the numeric section reference or context mapping for this file.',
        });
        continue;
      }

      if (item.context === 'main') {
        const start = Math.max(0, (match.index ?? 0) - 20);
        const end = Math.min(text.length, (match.index ?? 0) + 120);
        const nearby = text.slice(start, end);
        const mismatch = inferKeywordMismatch(sectionRef, nearby);
        if (mismatch) {
          issues.push({
            file: item.file,
            sectionRef,
            message: `Section ${sectionRef} conflicts with nearby keyword "${mismatch.keyword}" (expected Section ${mismatch.expected} in main manuscript).`,
            remediation: 'Align section number to current `main/main.tex` numbering after manuscript edits.',
          });
        }
      }
    }
  }

  if (issues.length > 0) {
    console.error('\n❌ Section reference check failed.');
    for (const issue of issues) {
      if (issue.sectionRef > 0) {
        console.error(`\n[${issue.file}] Section ${issue.sectionRef}`);
      } else {
        console.error(`\n[${issue.file}]`);
      }
      console.error(`- Issue: ${issue.message}`);
      console.error(`- Remediation: ${issue.remediation}`);
    }
    if (skippedOptionalFiles.length > 0) {
      console.error(`\nInfo: skipped optional files: ${skippedOptionalFiles.join(', ')}`);
    }
    console.error('\nHint: fix stale numeric references (e.g., old "Section 7" mentions) after structural manuscript changes.');
    process.exitCode = 1;
    return;
  }

  console.log('✅ Section reference check passed.');
  console.log(`Validated numeric section references across ${FILE_CONTEXTS.length - skippedOptionalFiles.length} manuscript/support files.`);
  if (skippedOptionalFiles.length > 0) {
    console.log(`Skipped optional files: ${skippedOptionalFiles.join(', ')}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSectionReferenceCheck();
}

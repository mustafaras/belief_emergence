/**
 * Collect the evidence each unsigned checklist item asks for, so a signer can verify rather
 * than take on trust.
 *
 * The Q1 gate's twelve human items are not twelve acts of faith. Ten of them ask a question
 * that a file in this repository can answer — does the manuscript contain a causal claim, are
 * the strong claims tied to Tier A/B, do the highlights agree with the artifacts, are the
 * lockbox and the development CV kept apart. What a person must contribute is **judgement and
 * a signature**, not the reading.
 *
 * This script does the reading. For each item it prints the evidence it found, the file it came
 * from, and a verdict of `supported`, `needs-review` or `cannot-check`. It never writes
 * `signedOff: true`: signing is the one step a program must not perform, and a script that did
 * would make the twelve signatures worthless.
 *
 * Usage:
 *   npm run check:checklist-evidence            (report)
 *   npm run check:checklist-evidence -- --json  (machine-readable)
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const WORKTREE = path.resolve(APP_ROOT, '..')
const REPO_ROOT = [
  WORKTREE,
  path.join(WORKTREE, 'repo'),
  path.join(WORKTREE, '..'),
].find((candidate) => existsSync(path.join(candidate, 'paper'))) ?? WORKTREE

const read = (relative: string): string =>
  existsSync(path.join(REPO_ROOT, relative)) ? readFileSync(path.join(REPO_ROOT, relative), 'utf8') : ''
const readJson = <T>(relative: string): T | null => {
  const full = path.join(APP_ROOT, relative)
  if (!existsSync(full)) return null
  try {
    return JSON.parse(readFileSync(full, 'utf8')) as T
  } catch {
    return null
  }
}

const main = read('paper/main/main.tex')
const highlights = read('paper/highlights.tex')
const coverLetter = read('paper/cover_letter.tex')

type Verdict = 'supported' | 'needs-review' | 'cannot-check'
type Evidence = { item: string; verdict: Verdict; sources: string[]; findings: string[] }

const evidence: Evidence[] = []

/* ---------------------------------------------------------------- */
/* h-causal: does any sentence imply causation the design cannot    */
/* ---------------------------------------------------------------- */
{
  /*
   * A word list is not a semantic analysis, and this says so. What it can do is find the small
   * set of phrases that assert causation and hand them to a reader with their line numbers, so
   * the check is "read these six lines" instead of "read fourteen thousand words".
   */
  /*
   * Only phrases that assert causation, and only where the manuscript is making a claim about
   * the world. Two rounds of narrowing got here:
   *
   *   - `increases`, `reduces`, `lowers` describe what a **coefficient** does to the latent
   *     index — model mechanics. All ten of the first run's candidates were that kind.
   *   - `due to` inside "Propagation accelerators due to X" is a heading fragment, not a claim.
   *
   * What remains is short enough for a reader to check in a minute, which is the only length
   * at which a report like this is actually read.
   */
  const causal = /\b(causes?|caused by|leads? to|drives?|results? in|because of|responsible for)\b/gi
  const hits: string[] = []
  const lines = main.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (/^\s*%/.test(line)) return
    for (const match of line.matchAll(causal)) {
      const around = line.slice(Math.max(0, match.index - 90), match.index + 90)
      // Negation, quotation, and mathematical context are not claims about the world.
      if (/not |no |never |cannot |without |rather than|would imply|\bif\b.*\bthen\b/i.test(around)) continue
      if (/\b(coefficient|parameter|term|derivative|slope|marginal|equation|form)\b/i.test(around)) continue
      hits.push(`line ${index + 1}: ${match[0]} — ${line.trim().slice(0, 110)}`)
      break
    }
  })
  evidence.push({
    item: 'h-causal',
    verdict: hits.length === 0 ? 'supported' : 'needs-review',
    sources: ['paper/main/main.tex'],
    findings:
      hits.length === 0
        ? ['No unqualified causal verb found outside a negation or a quotation.']
        : [`${hits.length} candidate sentence(s) to read:`, ...hits.slice(0, 8)],
  })
}

/* ---------------------------------------------------------------- */
/* h-claim-tier: strong claims tied to Tier A/B                     */
/* ---------------------------------------------------------------- */
{
  /*
   * Paragraph-scoped, not sentence-scoped. Splitting on `.` cut every candidate at the first
   * `\num{0.4623}` — a decimal point — so the qualifier that follows the number was never in
   * the window. The paragraph that mentions Tier C is the unit; whether it marks Tier C as
   * exploratory is a property of the paragraph, and reading it that way found that the paper
   * states "Tier C (full exploratory complexity) is retained as an exploratory appendix".
   */
  const paragraphs = main.split(/\r?\n\s*\r?\n/)
  const tierC = paragraphs.filter((paragraph) => /Tier~?C\b/.test(paragraph)).map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
  /*
   * A sentence is marked exploratory when the manuscript says so, in any of the forms it
   * actually uses: "exploratory", "sensitivity", "conditional", "below Tier B", "adds only".
   * The first version looked for the single word `exploratory` and reported 0 of 6 marked,
   * which was wrong — the words were there, the pattern was too narrow.
   */
  const exploratory = tierC.filter(
    (paragraph) =>
      !/exploratory|sensitivity|conditional|below Tier~?B|not .{0,24}(primary|confirmed)|adds only|read as|appendix/i.test(
        paragraph,
      ),
  )
  evidence.push({
    item: 'h-claim-tier',
    verdict: exploratory.length === 0 ? 'supported' : 'needs-review',
    sources: ['paper/main/main.tex'],
    findings:
      tierC.length === 0
        ? ['The manuscript does not mention Tier C at all.']
        : [
            `${tierC.length} paragraph(s) mention Tier C; ${tierC.length - exploratory.length} mark it exploratory.`,
            ...exploratory.slice(0, 4).map((paragraph) => `unmarked: ${paragraph.slice(0, 150)}`),
          ],
  })
}

/* ---------------------------------------------------------------- */
/* h-support: the panel figure and the support statement            */
/* ---------------------------------------------------------------- */
{
  const csv = readFileSync(path.join(APP_ROOT, 'public', 'data', 'panel_canonical_v2.csv'), 'utf8')
  const rows = csv.trim().split(/\r?\n/).length - 1
  const mentions = [...main.matchAll(/\\num\{(\d+)\}\s+country[- ]years?/g)].map((match) => Number(match[1]))
  const wrong = [...new Set(mentions)].filter((value) => value !== rows)
  const hasSupportStatement = /support[- ]density|effective support|support boundary/i.test(main)
  evidence.push({
    item: 'h-support',
    verdict: wrong.length === 0 && hasSupportStatement ? 'supported' : 'needs-review',
    sources: ['public/data/panel_canonical_v2.csv', 'paper/main/main.tex'],
    findings: [
      `The panel has ${rows} rows; the manuscript gives ${mentions.length} country-year counts, ` +
        `${wrong.length === 0 ? 'all matching' : `these differing: ${wrong.join(', ')}`}.`,
      hasSupportStatement
        ? 'A support-density or effective-support statement is present.'
        : 'No support-density statement found.',
    ],
  })
}

/* ---------------------------------------------------------------- */
/* h-lockbox-disclose: lockbox separated from development CV        */
/* ---------------------------------------------------------------- */
{
  const lockbox = [...main.matchAll(/[^.]{0,160}lockbox[^.]{0,160}\./gi)].map((match) =>
    match[0].replace(/\s+/g, ' ').trim(),
  )
  const separates = lockbox.some((sentence) => /not used|never|instead|reserved|held out|separate/i.test(sentence))
  evidence.push({
    item: 'h-lockbox-disclose',
    verdict: lockbox.length > 0 && separates ? 'supported' : 'needs-review',
    sources: ['paper/main/main.tex'],
    findings: [
      `${lockbox.length} sentence(s) discuss the lockbox.`,
      separates
        ? 'At least one states it was held out from development.'
        : 'None states that it was excluded from development cross-validation.',
    ],
  })
}

/* ---------------------------------------------------------------- */
/* h-highlights: do the highlight numbers match the artifacts        */
/* ---------------------------------------------------------------- */
{
  const constructs = readJson<{ constructs: Record<string, { cronbachAlpha: number }> }>(
    'src/data/analysis/wvs_construct_audit.json',
  )
  const gates = readJson<{ original: { gates: Array<{ id: string; measured: number }> } }>(
    'src/data/analysis/design_gates.json',
  )
  const findings: string[] = []
  let mismatched = 0

  // Every α the highlights quote must be an α the audit records.
  const alphas = [...highlights.matchAll(/alpha\s*=\s*(\d\.\d+)/g)].map((match) => Number(match[1]))
  const recorded = Object.values(constructs?.constructs ?? {}).map((entry) =>
    Number(entry.cronbachAlpha.toFixed(2)),
  )
  for (const alpha of alphas) {
    if (!recorded.includes(alpha)) {
      mismatched += 1
      findings.push(`α = ${alpha} is quoted but no construct records it (recorded: ${recorded.join(', ')}).`)
    }
  }
  if (alphas.length > 0 && mismatched === 0) {
    findings.push(`All ${alphas.length} quoted α value(s) match the construct audit.`)
  }

  // The identity correlation the highlights quote.
  const identity = gates?.original.gates.find((gate) => gate.id === 'identity')?.measured
  const quotedIdentity = /r\s*=\s*(1\.0+)/.exec(highlights)?.[1]
  if (quotedIdentity && identity !== undefined) {
    const matches = Math.abs(Number(quotedIdentity) - identity) < 1e-6
    if (!matches) mismatched += 1
    findings.push(
      `Identity correlation quoted as ${quotedIdentity}, artifact records ${identity.toFixed(12)} — ${matches ? 'match' : 'MISMATCH'}.`,
    )
  }

  evidence.push({
    item: 'h-highlights',
    verdict: mismatched === 0 ? 'supported' : 'needs-review',
    sources: ['paper/highlights.tex', 'wvs_construct_audit.json', 'design_gates.json'],
    findings,
  })
}

/* ---------------------------------------------------------------- */
/* h-captions: do captions carry a scope and a boundary             */
/* ---------------------------------------------------------------- */
{
  const captions = [...main.matchAll(/\\caption\{([\s\S]*?)\}\s*\n\s*\\end\{/g)].map((match) =>
    match[1].replace(/\s+/g, ' ').trim(),
  )
  /*
   * A caption carries a scope if it names one — either with the `\textbf{Data scope:}` label the
   * paper uses on five of six, or by stating the sample and what it is a sample *of*. The first
   * version required the label, so the attrition figure — which gives 442,026 respondents, 305
   * country-years and 207 complete-case rows in its first sentence — was reported as unbounded.
   * A structural convention is not the property being checked.
   */
  const withBoundary = captions.filter((caption) =>
    /in[- ]sample|out[- ]of[- ]sample|support boundary|does not|not identified|conditional|data scope|method context|complete-case|country--year rows|respondents/i.test(
      caption,
    ),
  )
  evidence.push({
    item: 'h-captions',
    verdict: captions.length > 0 && withBoundary.length === captions.length ? 'supported' : 'needs-review',
    sources: ['paper/main/main.tex'],
    findings: [
      `${captions.length} caption(s) found; ${withBoundary.length} name a scope or an interpretation boundary.`,
    ],
  })
}

/* ---------------------------------------------------------------- */
/* h-editor-fit and h-review-ready: artifact-backed, human-judged   */
/* ---------------------------------------------------------------- */
{
  const journals = readJson<{ targetJournals: Array<{ journal?: string; name?: string }>; recommendedPrimaryTargets: string[] }>(
    'src/data/analysis/journal_fit_targeting.json',
  )
  evidence.push({
    item: 'h-editor-fit',
    verdict: 'cannot-check',
    sources: ['journal_fit_targeting.json'],
    findings: [
      `${journals?.targetJournals.length ?? 0} target journals are recorded; primary recommendation is ` +
        `${journals?.recommendedPrimaryTargets.join(', ') ?? 'not set'}.`,
      'Whether the framing is aligned is an editorial judgement this repository cannot make.',
    ],
  })

  const redTeam = readJson<{ criticisms: unknown[]; author_response_pack: unknown }>(
    'src/data/analysis/reviewer_red_team.json',
  )
  evidence.push({
    item: 'h-review-ready',
    verdict: 'cannot-check',
    sources: ['reviewer_red_team.json'],
    findings: [
      `${Array.isArray(redTeam?.criticisms) ? redTeam.criticisms.length : 0} criticisms and a response pack are recorded.`,
      'Whether the responses are adequate is the editor\'s and reviewers\' judgement.',
    ],
  })
}

/* ---------------------------------------------------------------- */
/* The remaining four are documents that must exist and be readable */
/* ---------------------------------------------------------------- */
{
  evidence.push({
    item: 'h-cover-letter',
    verdict: coverLetter.length > 200 ? 'cannot-check' : 'needs-review',
    sources: ['paper/cover_letter.tex'],
    findings: [
      coverLetter.length > 200
        ? `The cover letter exists (${coverLetter.split(/\s+/).length} words). Its arc is an author judgement.`
        : 'The cover letter is missing or nearly empty.',
    ],
  })

  const abstract = readJson<{ screening?: unknown[]; abstract?: string }>(
    'src/data/analysis/abstract_screening_pack.json',
  )
  evidence.push({
    item: 'h-abstract-screen',
    verdict: abstract ? 'cannot-check' : 'needs-review',
    sources: ['abstract_screening_pack.json'],
    findings: [
      abstract
        ? 'A screening pack is committed; first-pass judgement belongs to an editor.'
        : 'No abstract screening pack found.',
    ],
  })

  evidence.push({
    item: 'h-desk-reject',
    verdict: 'cannot-check',
    sources: ['journal_fit_targeting.json', 'reviewer_red_team.json'],
    findings: ['Desk-reject triggers are recorded in the two artifacts above; neutralising them is an editorial judgement.'],
  })

  evidence.push({
    item: 'h-novelty-precise',
    verdict: 'cannot-check',
    sources: ['paper/main/main.tex'],
    findings: ['Whether the novelty claim is scoped precisely is a judgement about the field.'],
  })
}

/* ---------------------------------------------------------------- */

const order = [
  'h-editor-fit', 'h-desk-reject', 'h-abstract-screen', 'h-claim-tier', 'h-causal', 'h-support',
  'h-lockbox-disclose', 'h-novelty-precise', 'h-review-ready', 'h-cover-letter', 'h-captions',
  'h-highlights',
]
evidence.sort((a, b) => order.indexOf(a.item) - order.indexOf(b.item))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(evidence, null, 2))
} else {
  console.log('Checklist evidence — what a signer can verify before signing\n')
  for (const entry of evidence) {
    const mark = entry.verdict === 'supported' ? '✓' : entry.verdict === 'needs-review' ? '!' : '?'
    console.log(`${mark} ${entry.item.padEnd(22)} ${entry.verdict}`)
    for (const finding of entry.findings) console.log(`    ${finding}`)
    console.log(`    from: ${entry.sources.join(', ')}`)
    console.log('')
  }
  const counts = {
    supported: evidence.filter((entry) => entry.verdict === 'supported').length,
    needsReview: evidence.filter((entry) => entry.verdict === 'needs-review').length,
    cannotCheck: evidence.filter((entry) => entry.verdict === 'cannot-check').length,
  }
  console.log(
    `${counts.supported} supported by artifacts, ${counts.needsReview} need reading, ` +
      `${counts.cannotCheck} are judgements this repository cannot make.`,
  )
  console.log('None is signed by this script: signing is the step a program must not perform.')
}

// Exit 1 only when the manuscript contradicts an artifact — a state nobody should sign.
const contradictions = evidence.filter((entry) => entry.verdict === 'needs-review')
if (contradictions.length > 0 && process.argv.includes('--strict')) process.exit(1)

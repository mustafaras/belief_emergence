/**
 * What stands between this repository and a submission.
 *
 * P00–P38 closed the application. What remains is not code: it is twelve checklist signatures
 * that a person must give, five external permissions this repository cannot grant, and a set of
 * documents that describe the study. Those three are different kinds of work and conflating
 * them is how a "ready" report gets read as "submitted".
 *
 * This script separates them and prints one list per kind:
 *
 *   BLOCKING-HUMAN     a signature nobody but the author or editor can give
 *   BLOCKING-EXTERNAL  a permission this repository cannot obtain
 *   STALE              a document that disagrees with the measured tree
 *   READY              verified, with the command that verified it
 *
 * It exits 1 when anything in the first three lists is non-empty, so it can be used as the last
 * gate before a submission run rather than as a report someone reads once.
 *
 * Usage:
 *   npm run check:submission-state
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Where the manuscript worktree is.
 *
 * This repository is checked out twice — `repo/` on the manuscript branch and `repo-app-v2/`
 * on this one — and they are siblings, not parent and child. Resolving `..` from the app root
 * therefore lands on the directory that contains both, where there is no `paper/` and no
 * `submission/`. The first version of this script reported all five submission PDFs missing
 * while they sat one directory across.
 *
 * Candidates are tried in order and the first with a `paper/` directory wins, so a single
 * checkout (CI, or a fresh clone of one branch) works as well as the two-worktree layout.
 */
const WORKTREE = path.resolve(APP_ROOT, '..')
const REPO_ROOT = [
  WORKTREE,
  path.join(WORKTREE, 'repo'),
  path.join(WORKTREE, '..'),
].find((candidate) => existsSync(path.join(candidate, 'paper'))) ?? WORKTREE

type Item = { id: string; detail: string }

const checklist = JSON.parse(
  readFileSync(path.join(APP_ROOT, 'src', 'data', 'analysis', 'q1_submission_gate_report.json'), 'utf8'),
) as {
  verdict: string
  summary: { totalChecks: number; passed: number; failed: number }
  humanChecklist: Array<{ id: string; category: string; question: string; signedOff: boolean }>
}

/*
 * External permissions, transcribed from the roadmap's constraint list rather than invented
 * here. Each names what would close it, because "CRED permission" is not actionable on its own
 * and the person who can resolve it needs to know what to ask for.
 */
const EXTERNAL = [
  {
    id: 'cred-permission',
    detail: 'CRED: permission to use and redistribute the disaster extract is not held in this repository.',
  },
  {
    id: 'oecd-size',
    detail: 'OECD: the extract-size limit and redistribution terms for the derived panel are unresolved.',
  },
  {
    id: 'o3-raw-source',
    detail: 'O3: access to the raw source has not been obtained, so the artifact that depends on it cannot be recomputed here.',
  },
  {
    id: 'panel-redistribution',
    detail: 'The derived panel is committed; whether it may be redistributed is an author decision, not a repository one.',
  },
]

/** Documents that must agree with the measured tree, and the figure that proves they do not. */
function staleDocuments(panelRows: number): Item[] {
  const stale: Item[] = []

  const roadmapPath = path.join(REPO_ROOT, 'docs', 'ROADMAP_TO_SUBMISSION.md')
  if (existsSync(roadmapPath)) {
    const roadmap = readFileSync(roadmapPath, 'utf8')
    // The roadmap records the gate total at the moment it was written. When the gate grew, the
    // sentence stayed — so a reader sees "91/91" while the gate runs 99.
    // A figure inside a sentence that dates it is history, not a claim about the current gate.
    // `passed 91/91 at that point (it runs 99 now)` is the honest way to keep the record, and
    // flagging it would force the document to forget what happened.
    const totals = [...roadmap.matchAll(/`?ci:gate`?\s*(?:reaches|passed|passes)\s*\**(\d+)\/(\d+)\**([^\n]*)/g)]
      // History markers, including "for the first time", which is how a milestone is
      // recorded. A gate total inside a milestone sentence describes the day it was reached.
      .filter((match) => !/at that|histor|\bthen\b|for the first time/i.test(match[3]))
      .map((match) => `${match[1]}/${match[2]}`)
    const current = readCurrentGateTotal()
    for (const total of new Set(totals)) {
      if (total !== current) {
        stale.push({
          id: `roadmap-gate-total-${total.replace('/', '-')}`,
          detail: `docs/ROADMAP_TO_SUBMISSION.md records ci:gate at ${total}; the gate runs ${current}.`,
        })
      }
    }
    // Log depth: compare the claim against the log rather than against a constant. The first
    // version hardcoded P38 and so reported a stale document even after the sentence was
    // corrected to P38 — a check that fails on a correct file teaches its reader to ignore it.
    const claimedDepth = /App-v2 commits through (P\d+) are recorded/.exec(roadmap)?.[1]
    const actualDepth = readLogDepth()
    if (claimedDepth && actualDepth && claimedDepth !== actualDepth) {
      stale.push({
        id: 'roadmap-log-depth',
        detail: `docs/ROADMAP_TO_SUBMISSION.md says the log records commits through ${claimedDepth}; APP_V2_LOG.md records ${actualDepth}.`,
      })
    }
  }

  // The checklist question that carried a typed panel figure.
  for (const item of checklist.humanChecklist) {
    const match = /\(n=(\d+) country-years\)/.exec(item.question)
    if (match && Number(match[1]) !== panelRows) {
      stale.push({
        id: `checklist-support-n-${match[1]}`,
        detail: `${item.id} states n=${match[1]} country-years; the panel has ${panelRows}.`,
      })
    }
  }

  return stale
}

/** The highest prompt number the app-v2 log records a section for. */
function readLogDepth(): string | null {
  const logPath = path.join(APP_ROOT, 'docs', 'APP_V2_LOG.md')
  if (!existsSync(logPath)) return null
  const numbers = [...readFileSync(logPath, 'utf8').matchAll(/^## P(\d+) —/gm)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value))
  return numbers.length ? `P${Math.max(...numbers)}` : null
}

function readCurrentGateTotal(): string {
  const generated = path.join(APP_ROOT, 'src', 'sections', 'reproduce', 'gateSteps.generated.ts')
  if (!existsSync(generated)) return '?'
  const total = /total:\s*(\d+)/.exec(readFileSync(generated, 'utf8'))?.[1]
  return total ? `${total}/${total}` : '?'
}

function readPanelRows(): number {
  const csv = readFileSync(path.join(APP_ROOT, 'public', 'data', 'panel_canonical_v2.csv'), 'utf8')
  return csv.trim().split(/\r?\n/).length - 1
}

/** The submission bundle: five PDFs, or the reason there are fewer. */
function bundleState(): { ready: Item[]; missing: Item[] } {
  // The workflow assembles into `submission/` at the repository root, not under `paper/`. The
  // first version of this looked in `paper/submission/` and reported all five files missing
  // while they sat one directory up.
  const bundle = path.join(REPO_ROOT, 'submission')
  const expected = [
    '01_manuscript.pdf',
    '02_supplementary.pdf',
    '03_title_page.pdf',
    '04_cover_letter.pdf',
    '05_highlights.pdf',
  ]
  const ready: Item[] = []
  const missing: Item[] = []
  for (const file of expected) {
    const full = path.join(bundle, file)
    if (existsSync(full)) ready.push({ id: file, detail: `${file} is present` })
    else missing.push({ id: file, detail: `${file} is not in submission/ — run the workflow's assemble step` })
  }
  return { ready, missing }
}

function main(): void {
  const panelRows = readPanelRows()
  const gateTotal = readCurrentGateTotal()

  const unsigned = checklist.humanChecklist.filter((item) => !item.signedOff)
  const stale = staleDocuments(panelRows)
  const bundle = bundleState()

  const ready: Item[] = [
    {
      id: 'automated-checks',
      detail: `${checklist.summary.passed}/${checklist.summary.totalChecks} automated Q1 checks pass (verdict ${checklist.verdict})`,
    },
    {
      id: 'ci-gate',
      detail: `ci:gate runs ${gateTotal} checks; run \`npm run ci:gate\` for the current result`,
    },
    { id: 'panel', detail: `canonical panel: ${panelRows} rows, read from the CSV` },
    ...bundle.ready,
  ]

  const section = (title: string, items: Item[]) => {
    console.log(`\n${title} (${items.length})`)
    if (items.length === 0) console.log('  none')
    for (const item of items) console.log(`  ${item.id.padEnd(30)} ${item.detail}`)
  }

  console.log(`Submission state — ${new Date().toISOString().slice(0, 10)}`)
  section('BLOCKING — HUMAN SIGNATURE REQUIRED', unsigned.map((item) => ({
    id: item.id,
    detail: `[${item.category}] ${item.question}`,
  })))
  section('BLOCKING — EXTERNAL PERMISSION', EXTERNAL.map((item) => ({ id: item.id, detail: item.detail })))
  section('STALE — DOCUMENT DISAGREES WITH THE TREE', stale)
  section('MISSING FROM THE SUBMISSION BUNDLE', bundle.missing)
  section('READY', ready)

  const blocking = unsigned.length + EXTERNAL.length + stale.length + bundle.missing.length
  console.log('')
  if (blocking === 0) {
    console.log('PASS  nothing automated is outstanding; the submission waits only on the signatures above')
    return
  }
  console.log(
    `FAIL  ${blocking} item(s) stand between this tree and a submission: ` +
      `${unsigned.length} signature(s), ${EXTERNAL.length} external permission(s), ` +
      `${stale.length} stale document(s), ${bundle.missing.length} missing bundle file(s)`,
  )
  console.log('      this script cannot close any of them; it exists so that none is forgotten')
  process.exit(1)
}

main()

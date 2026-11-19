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

/** Read a committed JSON artifact, or null when it is absent or unparseable. */
function readJson<T>(relativePath: string): T | null {
  const full = path.join(APP_ROOT, relativePath)
  if (!existsSync(full)) return null
  try {
    return JSON.parse(readFileSync(full, 'utf8')) as T
  } catch {
    return null
  }
}

const checklist = JSON.parse(
  readFileSync(path.join(APP_ROOT, 'src', 'data', 'analysis', 'q1_submission_gate_report.json'), 'utf8'),
) as {
  verdict: string
  summary: { totalChecks: number; passed: number; failed: number }
  humanChecklist: Array<{ id: string; category: string; question: string; signedOff: boolean }>
}

/**
 * External items, read from `data_code_provenance.json` rather than transcribed from prose.
 *
 * The first version of this list had four entries — CRED, an OECD extract-size limit, O3 raw
 * access, and panel redistribution — written from memory of the roadmap. Checking them against
 * the provenance artifact found that three were wrong:
 *
 *   - The restricted sources are WVS/EVS, not CRED. `rawdata/` is gitignored and LICENSE §3
 *     documents the restriction, so the high-priority action item is **resolved**.
 *   - `G` (the OECD wealth measure) is empty in all 207 panel rows, so an OECD extract-size
 *     limit does not bear on the committed data.
 *   - O3 does not appear as a data source at all.
 *
 * What the artifact does carry is a `compliance_summary` with five action items and their
 * resolutions. Those are the external items, and they are read here.
 */
type ProvenanceArtifact = {
  compliance_summary?: {
    action_items?: Array<{ priority: string; item: string; resolution?: string }>
  }
  data_sources?: Array<{ name: string; license?: string }>
}

/**
 * What the open question actually is, from the license text rather than from the item name.
 *
 * `data_code_provenance.json` records both the licence and the action item. The licences for
 * EM-DAT and OECD permit academic use; what is unresolved is whether the **derived panel** and
 * the raw extracts may be redistributed. A signer needs that distinction — "permission missing"
 * and "permission held, redistribution unclear" call for different actions.
 */
function restrictionKind(item: string): string | null {
  if (/em-dat|oecd/i.test(item)) {
    return 'The licence permits academic use; what is unresolved is redistribution of the raw extract.'
  }
  if (/derived panel/i.test(item)) {
    return 'The committed panel is derived from restricted sources; whether it may be redistributed is an author decision.'
  }
  return null
}

function externalItems(): Item[] {
  const provenance = readJson<ProvenanceArtifact>('src/data/analysis/data_code_provenance.json')
  const items = provenance?.compliance_summary?.action_items ?? []

  return items
    .filter((entry) => {
      /*
       * Two ways an item is closed, both of them the artifact's own words:
       *
       *   - it carries a resolution paragraph (the WVS/EVS item does: rawdata is gitignored and
       *     LICENSE §3 documents the restriction);
       *   - its priority is `resolved` (the LICENSE item).
       *
       * An empty resolution on a `medium` item is an open item, not a closed one with no note.
       * The first version treated only a non-empty resolution as closure and so listed the
       * already-resolved LICENSE item alongside the genuinely open ones.
       */
      if (entry.priority.trim().toLowerCase() === 'resolved') return false
      return (entry.resolution ?? '').trim().length === 0
    })
    .map((entry) => ({
      id: entry.item.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
      // Say what kind of question it is. "EM-DAT raw custom-request files" alone reads as
      // "permission missing", which is not the finding: the licenses permit academic use and
      // the open question is redistribution of the raw extract.
      detail:
        `[${entry.priority}] ${entry.item} — no resolution recorded in data_code_provenance.json. ` +
        (restrictionKind(entry.item) ?? ''),
    }))
}

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
  const external = externalItems()
  section('BLOCKING — EXTERNAL DEPENDENCY', external)
  section('STALE — DOCUMENT DISAGREES WITH THE TREE', stale)
  section('MISSING FROM THE SUBMISSION BUNDLE', bundle.missing)
  section('READY', ready)

  const blocking = unsigned.length + external.length + stale.length + bundle.missing.length
  console.log('')
  if (blocking === 0) {
    console.log('PASS  nothing automated is outstanding; the submission waits only on the signatures above')
    return
  }
  console.log(
    `FAIL  ${blocking} item(s) stand between this tree and a submission: ` +
      `${unsigned.length} signature(s), ${external.length} external dependency(ies), ` +
      `${stale.length} stale document(s), ${bundle.missing.length} missing bundle file(s)`,
  )
  console.log('      this script cannot close any of them; it exists so that none is forgotten')
  process.exit(1)
}

main()

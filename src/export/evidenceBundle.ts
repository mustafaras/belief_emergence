import { jsPDF } from 'jspdf'
import { APP_ROUTES } from '../app/routes'
import { REPRODUCTION_MANIFEST, MANIFEST_CLAIM_COUNT } from '../evidence/reproductionManifest.generated'
import { GATE_LOOP_CHECKS } from '../sections/reproduce/gateSteps.generated'
import { listClaims } from '../claims/registry'
import { formatClaim } from '../claims/format'
import type { Claim } from '../claims/types'

/**
 * The evidence bundle: a PDF carrying the claims this application showed the reader, and the
 * provenance of each.
 *
 * This replaces `exportBehavioralDynamicsReport`, which produced 2,038 lines of narrative
 * about a model the paper no longer reports — it printed the 630-row panel's r² = 0.8461,
 * the number the construct audit withdrew. A PDF that carries a retracted metric is worse
 * than no export, so the old generator is deleted rather than repaired.
 *
 * What goes in is decided by the question a reader has after closing the tab: *what exactly
 * was claimed, from which artifact, at which commit?* So the bundle carries a commit hash
 * (a PDF that cannot be tied to a build is a printout, not evidence), one table per route of
 * the claims that route displays, the URL the reader was on, and the artifact and generator
 * behind every value.
 *
 * Claims are read from the registry, never typed into this file. A number in the PDF that
 * exists nowhere in the repository is the exact failure the rendered-number audit exists to
 * prevent, and it would be absurd to reintroduce it in the export path.
 */

export type BundleInput = {
  /** The URL the reader was on, including its query state. */
  url: string
  /** Timestamp for the cover page; injected so a test can pin it. */
  generatedAt?: Date
  /**
   * Commit the build came from, injected by Vite as `import.meta.env.VITE_COMMIT`.
   *
   * Undefined in development, and reported as "unversioned build" rather than omitted: a
   * PDF that silently drops its provenance reads exactly like one that never had any.
   */
  commit?: string
  /** The claims registry, injected so a test can render a small, checkable bundle. */
  claims?: Claim[]
}

/**
 * Characters jsPDF's standard fonts cannot encode, mapped to ones they can.
 *
 * `formatClaim` prints a minus as U+2212 (−) because that is the correct typographic sign in
 * HTML, and the sign diagnostics rely on it. The standard PDF fonts are WinAnsi-encoded,
 * where U+2212 is not representable: `doc.text()` emits a control byte and the reader sees
 * mojibake. Verified against a rendered bundle — every `signed2` value was affected, which is
 * precisely the family of claims about the direction of a coefficient.
 *
 * U+2212 → hyphen-minus is the only honest substitution here: it is the same sign, less
 * carefully drawn. Anything without an equivalent is not silently dropped; `assertEncodable`
 * fails the export instead.
 */
const WIN_ANSI_SUBSTITUTIONS: Record<string, string> = {
  '\u2212': '-', // minus sign
  '\u2192': '->', // rightwards arrow
  '\u2264': '<=',
  '\u2265': '>=',
  '\u00d7': 'x',
}

export function pdfSafe(text: string): string {
  return text.replace(/[\u2212\u2192\u2264\u2265\u00d7]/g, (character) => WIN_ANSI_SUBSTITUTIONS[character])
}

/** True for every code point a standard jsPDF font can encode. */
export function isPdfEncodable(text: string): boolean {
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0
    // WinAnsi covers Latin-1, plus the typographic marks jsPDF maps explicitly.
    const typographic = '\u2018\u2019\u201c\u201d\u2013\u2014\u2022\u2026\u2020\u2021\u2030\u2039\u203a\u20ac\u2122'
    if (codePoint > 0xff && !typographic.includes(character)) return false
  }
  return true
}

const PAGE = { width: 210, height: 297, margin: 16 }
const BODY = { size: 9, leading: 4.6 }

/** Claims a route displays itself, resolved through the generated manifest. */
export function claimsForRoute(routeId: string, claims: Claim[]): Claim[] {
  const route = REPRODUCTION_MANIFEST.routes.find((entry) => entry.id === routeId)
  if (!route) return []
  const byId = new Map(claims.map((claim) => [claim.id, claim]))
  return route.directClaimIds.flatMap((id) => {
    const claim = byId.get(id)
    return claim ? [claim] : []
  })
}

/**
 * How a claim's value is printed in the bundle.
 *
 * `exact` is the registry's "no rounding" format, which is right for a number the interface
 * prints at full precision and wrong here: `eval.paired.median` is 0.000001926431755006064,
 * and twenty-one digits in a table cell is unreadable rather than precise — the interface
 * itself never prints that claim, it prints the two medians it is derived from. So a value
 * carrying more than ten significant digits is written in scientific notation at three
 * places, which states the magnitude without pretending to a precision no reader can use.
 */
export function formatBundleValue(claim: Claim): string {
  const rendered = formatClaim(claim.value, claim.format)
  if (claim.format !== 'exact') return pdfSafe(rendered)
  const digits = Math.abs(claim.value) === 0 ? 0 : Math.floor(Math.log10(Math.abs(claim.value))) + 1
  if (digits <= 10 && rendered.length <= 12) return pdfSafe(rendered)
  return claim.value.toExponential(3)
}

export function buildEvidenceBundle(input: BundleInput): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const generatedAt = input.generatedAt ?? new Date()
  const claims = input.claims ?? listClaims()

  let cursor = PAGE.margin

  const applyFont = (size: number, bold: boolean) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
  }

  const write = (text: string, options: { size?: number; leading?: number; bold?: boolean } = {}) => {
    const size = options.size ?? BODY.size
    const leading = options.leading ?? BODY.leading
    const bold = options.bold ?? false
    applyFont(size, bold)
    const safe = pdfSafe(text)
    const unencodable = [...safe].filter((character) => !isPdfEncodable(character))
    if (unencodable.length > 0) {
      // Failing loudly beats emitting a PDF with a corrupted glyph: the bundle is evidence,
      // and evidence with a broken sign is worse than no evidence.
      throw new Error(`Evidence bundle cannot encode ${JSON.stringify(unencodable)} in ${JSON.stringify(text.slice(0, 60))}`)
    }
    const lines = doc.splitTextToSize(safe, PAGE.width - PAGE.margin * 2) as string[]
    for (const line of lines) {
      if (cursor + leading > PAGE.height - PAGE.margin) {
        doc.addPage()
        cursor = PAGE.margin
        applyFont(size, bold)
      }
      doc.text(line, PAGE.margin, cursor)
      cursor += leading
    }
  }

  const rule = () => {
    if (cursor + 3 > PAGE.height - PAGE.margin) {
      doc.addPage()
      cursor = PAGE.margin
    }
    doc.setDrawColor(190)
    doc.line(PAGE.margin, cursor, PAGE.width - PAGE.margin, cursor)
    cursor += 4
  }

  const newPage = () => {
    doc.addPage()
    cursor = PAGE.margin
  }

  /* ---- cover ------------------------------------------------------- */

  write('Measurement Validity Before Model Geometry', { size: 17, leading: 7.5, bold: true })
  write('Evidence bundle', { size: 12, leading: 7 })
  cursor += 3
  write(
    'Every value in this document was displayed by the accompanying application and read from '
      + 'a committed artifact. Nothing here is transcribed by hand.',
    { size: 9.5, leading: 5 },
  )
  cursor += 3
  rule()

  write(`Generated: ${generatedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`, { bold: true })
  write(
    input.commit
      ? `Build commit: ${input.commit}`
      : 'Build commit: unversioned build (development); values below still come from artifacts',
  )
  write(`Source view: ${input.url}`, { size: 8 })
  cursor += 2
  rule()

  const generated = REPRODUCTION_MANIFEST.artifacts.filter((a) => a.provenance === 'generated').length
  const recorded = REPRODUCTION_MANIFEST.artifacts.filter((a) => a.provenance === 'recorded').length
  const copied = REPRODUCTION_MANIFEST.artifacts.filter((a) => a.provenance === 'copied').length

  write(
    `${MANIFEST_CLAIM_COUNT} distinct claims are reachable from the ${REPRODUCTION_MANIFEST.routes.length} `
      + `routes in this application; ${claims.length} are registered. The continuous-integration gate `
      + `runs ${GATE_LOOP_CHECKS.total} checks over the artifacts and the rendered interface.`,
  )
  write(
    `${generated} of ${REPRODUCTION_MANIFEST.artifacts.length} artifacts declare a script that rebuilds them`
      + `${copied > 0 ? `, ${copied} are byte-identical copies of a rawdata measurement` : ''}`
      + `${recorded > 0 ? `, and ${recorded} are evidence this checkout cannot rebuild` : ''}.`,
  )

  /* ---- one table per route ----------------------------------------- */

  for (const route of APP_ROUTES) {
    const routeClaims = claimsForRoute(route.id, claims)
    if (routeClaims.length === 0) continue

    newPage()
    write(`${route.number === '—' ? '' : `${route.number} · `}${route.title}`, { size: 13, leading: 7, bold: true })
    write(`Paper reference: ${route.paperRef}`, { size: 8 })
    cursor += 1.5
    rule()

    for (const claim of routeClaims) {
      if (cursor + 14 > PAGE.height - PAGE.margin) newPage()
      write(`${formatBundleValue(claim)}  ${claim.label}`, { size: 9.5, leading: 4.4, bold: true })
      write(`id ${claim.id} · artifact ${claim.artifact} · ${claim.path}`, { size: 7.5, leading: 3.8 })
      if (claim.generator) write(`rebuild: ${claim.generator}`, { size: 7.5, leading: 3.8 })
      if (claim.note) write(claim.note, { size: 7.5, leading: 3.8 })
      cursor += 1.4
    }
  }

  /* ---- artifacts ---------------------------------------------------- */

  newPage()
  write('Artifacts behind these claims', { size: 13, leading: 7, bold: true })
  cursor += 1.5
  rule()
  for (const artifact of REPRODUCTION_MANIFEST.artifacts) {
    if (cursor + 10 > PAGE.height - PAGE.margin) newPage()
    const rebuild = artifact.generator
      ? `rebuild: ${artifact.generator}`
      : artifact.provenance === 'copied'
        ? `copied from ${artifact.sourceTwin ?? 'rawdata'}`
        : 'no producing script in this checkout'
    write(`${artifact.name} — ${artifact.provenance} — ${rebuild}`, { size: 8, leading: 4 })
  }

  return doc
}

/** Filename a reader will recognise in a downloads folder three weeks later. */
export function evidenceBundleFilename(generatedAt: Date = new Date()): string {
  return `measurement-validity-evidence-${generatedAt.toISOString().slice(0, 10)}.pdf`
}

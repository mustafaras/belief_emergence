// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildEvidenceBundle,
  claimsForRoute,
  evidenceBundleFilename,
  formatBundleValue,
  isPdfEncodable,
  pdfSafe,
} from '../src/export/evidenceBundle'
import { listClaims } from '../src/claims/registry'

/** jsPDF keeps the document's text stream; reading it is how we check what was written. */
function pdfText(doc: ReturnType<typeof buildEvidenceBundle>): string {
  const output = doc.output('arraybuffer')
  return Buffer.from(output).toString('latin1')
}

describe('the evidence bundle', () => {
  it('prints the values of the claims the routes actually display', () => {
    const claims = listClaims()
    const text = pdfText(buildEvidenceBundle({ url: 'http://localhost/?v=overview', commit: 'abc1234', claims }))

    // Sampled from what the manifest says each route shows. A claim the interface never
    // prints has no business in the bundle: `eval.paired.median` is registered but no route
    // displays it, so its twenty-one digits must not appear.
    const displayed = [
      'overview', 'data', 'audit', 'gates', 'model', 'evaluation', 'limits', 'reproduce',
    ].flatMap((id) => claimsForRoute(id, claims))
    expect(displayed.length).toBeGreaterThan(50)

    for (const claim of displayed) {
      expect(text).toContain(formatBundleValue(claim))
    }

    const hidden = claims.find((claim) => claim.id === 'eval.paired.median')
    expect(hidden).toBeDefined()
    expect(text).not.toContain(String(hidden?.value))
  })

  it('carries the commit and the source URL, and says so when there is no commit', () => {
    const withCommit = pdfText(buildEvidenceBundle({ url: 'http://x/?v=data', commit: 'deadbee', claims: listClaims() }))
    expect(withCommit).toContain('deadbee')
    expect(withCommit).toContain('http://x/?v=data')

    const without = pdfText(buildEvidenceBundle({ url: 'http://x/?v=data', claims: listClaims() }))
    expect(without).toContain('unversioned build')
  })

  it('gives every route with claims its own section, and no section to a route without any', () => {
    const claims = listClaims()
    // Every route with direct claims is headed; a route without claims gets nothing, because
    // an empty page under a section title tells a reader the section had no evidence.
    for (const id of ['overview', 'data', 'audit', 'gates', 'model', 'evaluation', 'limits', 'reproduce']) {
      expect(claimsForRoute(id, claims).length).toBeGreaterThan(0)
    }
    for (const id of ['countries', 'geometry', 'glossary']) {
      expect(claimsForRoute(id, claims)).toHaveLength(0)
    }
    // A long section legitimately runs onto a second page; the count is therefore at least
    // the cover, one page per section and the artifact index, never fewer.
    const sections = 8
    expect(buildEvidenceBundle({ url: 'http://x/', claims }).getNumberOfPages()).toBeGreaterThanOrEqual(1 + sections + 1)
  })

  it('writes an unreadably long exact value in scientific notation', () => {
    const longExact = listClaims().find((claim) => claim.format === 'exact' && Math.abs(claim.value) < 1e-5)
    expect(longExact).toBeDefined()
    const rendered = formatBundleValue(longExact as NonNullable<typeof longExact>)
    expect(rendered).toMatch(/e-\d+$/)
    expect(rendered.length).toBeLessThan(12)
    // A short exact value keeps its digits rather than being converted for no reason.
    const short = { ...(longExact as NonNullable<typeof longExact>), value: 207, id: 'x', label: 'x' }
    expect(formatBundleValue(short)).toBe('207')
  })

  it('resolves route claims from the generated manifest, not from a hand list', () => {
    const claims = listClaims()
    const ids = claimsForRoute('gates', claims).map((claim) => claim.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => claims.some((claim) => claim.id === id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('replaces the characters a standard PDF font cannot encode', () => {
    // U+2212 is the typographic minus `formatClaim` prints; WinAnsi has no slot for it.
    expect(pdfSafe('\u22120.69')).toBe('-0.69')
    expect(isPdfEncodable('-0.69')).toBe(true)
    expect(isPdfEncodable('\u22120.69')).toBe(false)
  })

  it('refuses to emit text it cannot encode, instead of emitting a broken glyph', () => {
    const claim = { ...listClaims()[0], label: 'Has a codepoint with no WinAnsi slot: \u4e2d', value: 1 }
    expect(() => buildEvidenceBundle({ url: 'http://x/', claims: [claim] })).toThrow(/cannot encode/)
  })

  it('names the file by date so two exports are distinguishable', () => {
    expect(evidenceBundleFilename(new Date('2026-11-18T00:00:00Z'))).toBe('measurement-validity-evidence-2026-11-18.pdf')
  })
})

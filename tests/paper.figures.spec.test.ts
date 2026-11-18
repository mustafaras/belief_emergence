// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { FIGURES } from '../scripts/capture_paper_figures'

/**
 * The capture spec and the README must describe the same set of images.
 *
 * This is the cheap half of P34's problem: it cannot tell whether a screenshot shows the
 * current application, but it can tell whether the two lists agree, which is what drifted.
 */
describe('paper figure specs', () => {
  const readme = readFileSync('README.md', 'utf8')
  const shown = [...readme.matchAll(/figures\/screenshots\/([A-Za-z0-9_.-]+\.png)/g)].map((m) => m[1])

  it('covers every screenshot the README shows, and only those', () => {
    const specFiles = FIGURES.map((figure) => figure.file).sort()
    expect([...new Set(shown)].sort()).toEqual(specFiles)
  })

  it('names a route for every figure', () => {
    for (const figure of FIGURES) {
      expect(figure.query.startsWith('?v='), `${figure.file} has no route`).toBe(true)
      expect(figure.caption.length).toBeGreaterThan(10)
    }
  })

  it('captures at a size a README can display', () => {
    for (const figure of FIGURES) {
      const height = figure.maxHeight ?? figure.height ?? 1000
      // A full-page capture of an unbounded document produced a 2,880 x 14,676 PNG.
      expect(height).toBeLessThanOrEqual(1600)
      expect((figure.width ?? 1440)).toBeLessThanOrEqual(2000)
    }
  })

  it('points at files that all exist after a capture run', () => {
    const missing = FIGURES.map((f) => `figures/screenshots/${f.file}`).filter((path) => !existsSync(path))
    expect(missing).toEqual([])
    for (const figure of FIGURES) {
      const bytes = statSync(`figures/screenshots/${figure.file}`).size
      // Anything under 15 KiB is a blank or near-blank rectangle.
      expect(bytes, `${figure.file} is suspiciously small`).toBeGreaterThan(15 * 1024)
    }
  })
})

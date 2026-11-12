import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Dependency hygiene: removed what is dead, kept what only *looks* dead.
 *
 * Prompt 8's whole point is that grep evidence cannot tell those apart. `html2canvas` has
 * no static import and is required; `plotly.js-basic-dist-min` and `three` had neither and
 * were not. A test asserting the dependency list is cheap and fails loudly if either
 * mistake is made again.
 */
const REPO_ROOT = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

/** Every source file that could import a dependency. */
function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (/\.(ts|tsx|cjs|mjs|js)$/.test(entry.name)) out.push(full)
    }
  }
  walk(path.join(REPO_ROOT, 'src'))
  walk(path.join(REPO_ROOT, 'scripts'))
  return out
}

const files = sourceFiles()

/** Static `from 'pkg'` imports. */
const staticallyImported = (name: string) =>
  files.filter((f) => {
    const text = fs.readFileSync(f, 'utf8')
    return new RegExp(`from\\s+['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(text)
  })

/** `import('pkg')` or `require('pkg')` anywhere. */
const dynamicallyImported = (name: string) =>
  files.filter((f) => {
    const text = fs.readFileSync(f, 'utf8')
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:import|require)\\(\\s*['"]${escaped}['"]\\s*\\)`).test(text)
  })

describe('dead dependencies stay removed', () => {
  it('drops plotly.js-basic-dist-min, which was never imported', () => {
    expect(pkg.dependencies['plotly.js-basic-dist-min']).toBeUndefined()
    expect(staticallyImported('plotly.js-basic-dist-min')).toEqual([])
    expect(dynamicallyImported('plotly.js-basic-dist-min')).toEqual([])
  })

  it('drops three, which was never imported', () => {
    expect(pkg.dependencies.three).toBeUndefined()
    expect(staticallyImported('three')).toEqual([])
    expect(dynamicallyImported('three')).toEqual([])
  })

  it('drops the orphaned @types/three alongside it', () => {
    // Removing the runtime package while leaving its types is the half-removal that makes
    // a later `import * as THREE` compile and then fail at runtime.
    expect(pkg.devDependencies['@types/three']).toBeUndefined()
  })
})

describe('html2canvas is kept, and the reason is checkable', () => {
  it('has no static import — the reason it looks removable', () => {
    expect(staticallyImported('html2canvas')).toEqual([])
  })

  it('is imported dynamically by the PDF exporter', () => {
    const importers = dynamicallyImported('html2canvas')
    expect(importers.length).toBeGreaterThan(0)
    expect(importers.some((f) => f.includes('exportBehavioralDynamicsReport'))).toBe(true)
  })

  it('is still a declared dependency', () => {
    expect(pkg.dependencies.html2canvas).toBeDefined()
  })

  it('carries an in-file warning where the next reader will look', () => {
    const exporter = fs.readFileSync(
      path.join(REPO_ROOT, 'src', 'utils', 'pdf', 'exportBehavioralDynamicsReport.ts'),
      'utf8',
    )
    expect(exporter).toMatch(/DO NOT REMOVE the `html2canvas` dependency/)
  })
})

describe('the surviving plotly package is the one that is used', () => {
  it('keeps plotly.js-dist-min and finds a static import for it', () => {
    expect(pkg.dependencies['plotly.js-dist-min']).toBeDefined()
    const importers = staticallyImported('plotly.js-dist-min')
    expect(importers.length).toBeGreaterThan(0)
  })

  it('does not carry two packages one character apart', () => {
    // The trap Prompt 8 names: a package one word away from the one in use will attract a
    // second implementation.
    const plotlyPackages = Object.keys(pkg.dependencies).filter((d) => d.startsWith('plotly'))
    expect(plotlyPackages).toEqual(['plotly.js-dist-min'])
  })
})

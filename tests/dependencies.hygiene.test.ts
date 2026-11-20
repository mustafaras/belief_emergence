import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx|cjs|mjs|js)$/.test(entry.name)) out.push(full)
    }
  }
  walk(path.join(REPO_ROOT, 'src'))
  walk(path.join(REPO_ROOT, 'scripts'))
  return out
}

const files = sourceFiles()
const escapedPackage = (name: string) => name.replace(/[.*+?^$|(){}[\]\\]/g, '\\$&')
const importers = (name: string, mode: 'static' | 'dynamic') => files.filter((file) => {
  const text = fs.readFileSync(file, 'utf8')
  const escaped = escapedPackage(name)
  const pattern = mode === 'static'
    ? new RegExp("from\\s+['\"]" + escaped + "['\"]")
    : new RegExp("(?:import|require)\\(\\s*['\"]" + escaped + "['\"]\\s*\\)")
  return pattern.test(text)
})

describe('P16 legacy dependencies stay removed', () => {
  const removed = [
    'react-markdown',
    'remark-gfm',
    'remark-math',
    'rehype-katex',
    'react-katex',
    'html2canvas',
    'framer-motion',
  ]

  it.each(removed)('%s is absent from the manifest and source import graph', (name) => {
    expect(pkg.dependencies[name]).toBeUndefined()
    expect(importers(name, 'static')).toEqual([])
    expect(importers(name, 'dynamic')).toEqual([])
  })

  it('removes the KaTeX React type package with its runtime wrapper', () => {
    expect(pkg.devDependencies['@types/react-katex']).toBeUndefined()
  })
})

describe('planned Geometry Lab dependency', () => {
  it('retains Plotly for the planned P29 surface implementation', () => {
    expect(pkg.dependencies['plotly.js-dist-min']).toBeDefined()
    expect(pkg.dependencies['react-plotly.js']).toBeDefined()
    expect(pkg.devDependencies['@types/react-plotly.js']).toBeDefined()
  })
})

describe('previously dead dependencies stay removed', () => {
  it.each(['plotly.js-basic-dist-min', 'three'])('%s is absent and has no importers', (name) => {
    expect(pkg.dependencies[name]).toBeUndefined()
    expect(importers(name, 'static')).toEqual([])
    expect(importers(name, 'dynamic')).toEqual([])
  })

  it('drops @types/three alongside the runtime package', () => {
    expect(pkg.devDependencies['@types/three']).toBeUndefined()
  })
})

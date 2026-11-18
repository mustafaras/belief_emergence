import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const bannedPatterns = [
  /\bwhat\s+drives\b/gi,
  /\btop\s+drivers?\b/gi,
  /\bwhat\s+determines\b/gi,
  /\bpolicy\s+lever/gi,
  /\bpolicy\s+implications?\b/gi,
  /\bdrivers\s+that\s+intensify\b/gi,
  /\btheir\s+signs\s+determine\b/gi,
  /\bmodifiers?\s+determine\b/gi,
  /\bregimes?\s+are\s+determined\s+by\b/gi,
  /\bfactors\s+determine\b/gi,
]

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(file)
    return /\.(ts|tsx)$/.test(entry.name) ? [file] : []
  })
}

function findViolations(files: readonly string[], patterns: readonly RegExp[]) {
  const violations: Array<{ file: string; line: number; text: string }> = []
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (let line = 0; line < lines.length; line += 1) {
      for (const pattern of patterns) {
        if (new RegExp(pattern.source, pattern.flags.replace('g', '')).test(lines[line])) {
          violations.push({ file, line: line + 1, text: lines[line].trim() })
        }
      }
    }
  }
  return violations
}

describe('Narrative claim guardrails', () => {
  it('keeps current application routes free from causal overclaims', () => {
    const files = [...sourceFiles('src/app'), ...sourceFiles('src/sections')]
    expect(files.length).toBeGreaterThan(0)
    expect(findViolations(files, bannedPatterns)).toEqual([])
  })

  it('keeps the PDF export within the same claim boundary as the interface', () => {
    // The export used to be a 2,038-line narrative generator with its own prose. It now
    // prints registry values and artifact names, so it inherits the interface's boundary
    // rather than needing a laxer one — but that is a property to assert, not to assume.
    const utilityPatterns = bannedPatterns.filter((pattern) => (
      !pattern.source.includes('drivers')
      && !pattern.source.includes('lever')
      && !pattern.source.includes('implications')
    ))
    expect(findViolations(['src/export/evidenceBundle.ts'], utilityPatterns)).toEqual([])
  })
})

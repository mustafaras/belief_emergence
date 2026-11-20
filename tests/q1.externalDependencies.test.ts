// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * The external list must come from the provenance artifact, not from memory.
 *
 * The first version of `check:submission-state` carried four items written from the roadmap:
 * CRED, an OECD extract-size limit, O3 raw access, and panel redistribution. Checking them
 * against `data_code_provenance.json` found three were wrong — the restricted sources are
 * WVS/EVS, the OECD wealth column is empty in every panel row, and O3 is not a data source at
 * all. These tests pin the list to the artifact so it cannot drift back.
 */
function report(): string {
  try {
    return execFileSync('npx', ['tsx', 'scripts/check_submission_state.ts'], { encoding: 'utf8' })
  } catch (error) {
    return String((error as { stdout?: string }).stdout ?? '')
  }
}

const provenance = JSON.parse(
  readFileSync('src/data/analysis/data_code_provenance.json', 'utf8'),
) as {
  compliance_summary: { action_items: Array<{ priority: string; item: string; resolution?: string }> }
}

describe('external dependencies', () => {
  it('lists only the action items the artifact leaves unresolved', () => {
    const open = provenance.compliance_summary.action_items.filter(
      (entry) => entry.priority.toLowerCase() !== 'resolved' && !(entry.resolution ?? '').trim(),
    )
    const output = report()
    expect(output).toContain(`BLOCKING — EXTERNAL DEPENDENCY (${open.length})`)
    for (const entry of open) {
      // The item name appears in the output, matched on its first words.
      const stem = entry.item.split(/\s+/).slice(0, 3).join(' ')
      expect(output.toLowerCase()).toContain(stem.toLowerCase())
    }
  })

  it('does not re-introduce the invented items', () => {
    const output = report().toLowerCase()
    // Each of these was in the hand-written list and is contradicted by the artifacts.
    expect(output).not.toContain('cred')
    expect(output).not.toContain('o3')
    expect(output).not.toContain('oecd-size')
  })

  it('treats a resolved-priority item as closed', () => {
    // "Repository LICENSE file" is marked `resolved` with an empty resolution paragraph. The
    // first version listed it among the blockers because it looked only at the resolution text.
    expect(report()).not.toContain('Repository LICENSE file — no resolution')
  })

  it('states that the restricted sources are WVS/EVS, not CRED', () => {
    const sources = JSON.parse(
      readFileSync('src/data/analysis/data_code_provenance.json', 'utf8'),
    ) as { data_sources: Array<{ name: string; license?: string }> }
    const restricted = sources.data_sources.filter((source) => /redistribution restricted/i.test(source.license ?? ''))
    expect(restricted.length).toBeGreaterThan(0)
    for (const source of restricted) expect(source.name).toMatch(/WVS|Values Survey/i)
  })

  it('confirms the OECD wealth column is empty, which is why no OECD limit binds', () => {
    const csv = readFileSync('public/data/panel_canonical_v2.csv', 'utf8').trim().split(/\r?\n/)
    const header = csv[0].split(',')
    const gIndex = header.indexOf('G')
    expect(gIndex).toBeGreaterThan(-1)
    const filled = csv
      .slice(1)
      .map((line) => line.split(',')[gIndex])
      .filter((value) => value !== '' && value !== 'NA' && value !== 'nan')
    expect(filled).toEqual([])
  })
})

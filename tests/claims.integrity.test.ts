import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listClaims } from '../src/claims/registry'
import type { Claim } from '../src/claims/types'

function locateArtifact(artifact: string): string | undefined {
  const candidates = [
    resolve(process.cwd(), 'src/data/analysis', artifact),
    resolve(process.cwd(), 'src/data', artifact),
    resolve(process.cwd(), 'public/data', artifact)
  ]
  return candidates.find(existsSync)
}

function resolveJsonPath(value: unknown, claimPath: string): unknown {
  const parts = [...claimPath.matchAll(/([^.[\]]+)|\[([^\]]+)\]/g)].map(match => match[1] ?? match[2] ?? '')
  if (parts.join('') === '') return value

  let current = value
  for (const part of parts) {
    if (Array.isArray(current)) {
      if (part === 'length') {
        current = current.length
        continue
      }
      const [field, expected, ...rest] = part.split('=')
      if (rest.length > 0) throw new Error(`Invalid array selector in path: ${part}`)
      const selectorField = expected === undefined ? 'label' : field
      const selectorValue = expected === undefined ? field : expected
      current = current.find(item => item !== null && typeof item === 'object' &&
        String((item as Record<string, unknown>)[selectorField]) === selectorValue)
      continue
    }

    if (current !== null && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
      continue
    }

    return undefined
  }
  return current
}

function resolveCsvPath(csv: string, claimPath: string): unknown {
  const lines = csv.trim().split(/\r?\n/)
  const headers = lines[0]?.split(',') ?? []
  const iso3Index = headers.indexOf('iso3')
  if (iso3Index < 0) return undefined
  const rows = lines.slice(1).map(line => line.split(','))
  if (claimPath === 'rows') return rows.length
  if (claimPath === 'iso3') return [...new Set(rows.map(row => row[iso3Index]).filter(Boolean))]
  return undefined
}

function resolveClaimPath(claim: Claim, file: string): unknown {
  if (file.endsWith('.json')) return resolveJsonPath(JSON.parse(readFileSync(file, 'utf8')), claim.path)
  if (file.endsWith('.csv')) return resolveCsvPath(readFileSync(file, 'utf8'), claim.path)
  return undefined
}

describe('claim registry integrity', () => {
  const claims = listClaims()

  it('has unique claim ids and finite numeric values', () => {
    const ids = claims.map(claim => claim.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const claim of claims) expect(Number.isFinite(claim.value), `${claim.id} must be finite`).toBe(true)
  })

  it('points every claim to an existing artifact and a resolvable source path', () => {
    for (const claim of claims) {
      const file = locateArtifact(claim.artifact)
      expect(file, `${claim.id} artifact ${claim.artifact} must exist`).toBeDefined()
      if (!file) continue
      const resolved = resolveClaimPath(claim, file)
      expect(resolved, `${claim.id} path ${claim.path} must resolve in ${claim.artifact}`).toBeDefined()
    }
  })

  it('uses a nonempty section for every paper reference', () => {
    for (const claim of claims) {
      if (claim.paperRef !== undefined) expect(claim.paperRef.section.trim(), `${claim.id} paperRef.section`).not.toBe('')
    }
  })
})

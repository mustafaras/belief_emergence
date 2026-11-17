import type { Claim } from './types'
import { auditClaims } from './selectors/audit'
import { dataClaims } from './selectors/data'
import { gatesClaims } from './selectors/gates'
import { evaluationClaims } from './selectors/evaluation'
import { limitsClaims } from './selectors/limits'
import { modelClaims } from './selectors/model'

const claimList = [...auditClaims, ...dataClaims, ...evaluationClaims, ...gatesClaims, ...limitsClaims, ...modelClaims]
const claimIds = new Set<string>()
for (const claim of claimList) {
  if (claimIds.has(claim.id)) throw new Error(`Duplicate claim id: ${claim.id}`)
  claimIds.add(claim.id)
}

const CLAIMS: Record<string, Claim> = Object.fromEntries(claimList.map(claim => [claim.id, claim]))

export function getClaim(id: string): Claim {
  if (!Object.prototype.hasOwnProperty.call(CLAIMS, id)) {
    throw new Error(`Unknown claim id: ${id}`)
  }
  return CLAIMS[id]
}

export function listClaims(): Claim[] {
  return Object.values(CLAIMS)
}

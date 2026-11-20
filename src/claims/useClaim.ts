import { getClaim } from './registry'
import type { Claim } from './types'

export function useClaim(id: string): Claim {
  return getClaim(id)
}

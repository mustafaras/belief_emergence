import type { ClaimFormat } from '../claims/types'
import { formatClaim } from '../claims/format'
import { useClaim } from '../claims/useClaim'
import { useClaimInspector } from '../claims/InspectorContext'
import { ErrorState } from './ErrorState'
import styles from './Interactive.module.css'

type NumProps = { id: string; format?: ClaimFormat }

export function Num({ id, format }: NumProps) {
  const { openClaim } = useClaimInspector()
  try {
    const claim = useClaim(id)
    const title = [claim.artifact, claim.path, claim.note].filter(Boolean).join(' · ')
    const value = formatClaim(claim.value, format ?? claim.format)
    return (
      <button aria-label={`${claim.label}: ${value}`} className={styles.num} data-claim-id={id} onClick={event => openClaim(id, event.currentTarget)} title={title} type="button">
        {value}
      </button>
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown claim registry error.'
    return <ErrorState artifact={id} message={message} />
  }
}

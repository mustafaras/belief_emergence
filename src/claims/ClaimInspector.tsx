import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react'
import { formatClaim } from './format'
import { getClaim } from './registry'
import type { Claim } from './types'
import { Popover } from '../ui/Popover'
import { InspectorContext } from './InspectorContext'
import styles from './ClaimInspector.module.css'

type FocusReturnElement = HTMLElement | SVGElement

function artifactHref(artifact: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('v', 'reproduce')
  url.searchParams.set('artifact', artifact)
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`
}

function ClaimInspector({ claimId, close, returnFocusRef }: {
  claimId: string | null
  close: () => void
  returnFocusRef: RefObject<FocusReturnElement | null>
}) {
  const [copied, setCopied] = useState(false)
  let claim: Claim | undefined
  if (claimId) {
    try {
      claim = getClaim(claimId)
    } catch {
      claim = undefined
    }
  }

  const copyArtifact = useCallback(async () => {
    if (!claim) return
    try {
      await navigator.clipboard.writeText(claim.artifact)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [claim])

  return (
    <Popover
      hideTrigger
      label="Claim inspector"
      onOpenChange={open => { if (!open) close() }}
      open={claim !== undefined}
      returnFocusRef={returnFocusRef}
    >
      {claim ? (
        <article className={styles.inspector}>
          <p className={styles.eyebrow}>CLAIM INSPECTOR</p>
          <h2>{claim.label}</h2>
          <p className={styles.value}>{formatClaim(claim.value, claim.format)}</p>
          <dl className={styles.details}>
            <div>
              <dt>Artifact</dt>
              <dd><code>{claim.artifact}</code><button aria-label="Copy artifact filename" onClick={copyArtifact} type="button">{copied ? 'Copied' : 'Copy'}</button></dd>
            </div>
            <div><dt>JSON path</dt><dd><code>{claim.path}</code></dd></div>
            {claim.generator && <div><dt>Generator</dt><dd><code>{claim.generator}</code></dd></div>}
            {claim.paperRef && <div><dt>Paper</dt><dd>{claim.paperRef.section}{claim.paperRef.line ? ` · line ${claim.paperRef.line}` : ''}</dd></div>}
          </dl>
          {claim.note && <p className={styles.note}>{claim.note}</p>}
          <a className={styles.openArtifact} href={artifactHref(claim.artifact)}>Open artifact</a>
        </article>
      ) : null}
    </Popover>
  )
}

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [claimId, setClaimId] = useState<string | null>(null)
  const returnFocusRef = useRef<FocusReturnElement | null>(null)
  const openClaim = useCallback((id: string, returnTarget?: FocusReturnElement | null) => {
    const activeElement = document.activeElement
    const activeTarget = activeElement instanceof HTMLElement || activeElement instanceof SVGElement ? activeElement : null
    returnFocusRef.current = returnTarget ?? activeTarget
    setClaimId(id)
  }, [])
  const closeClaim = useCallback(() => setClaimId(null), [])
  const value = { openClaim, closeClaim }

  return (
    <InspectorContext.Provider value={value}>
      {children}
      <ClaimInspector claimId={claimId} close={closeClaim} returnFocusRef={returnFocusRef} />
    </InspectorContext.Provider>
  )
}

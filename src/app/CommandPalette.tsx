import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Search } from 'lucide-react'
import { formatClaim } from '../claims/format'
import { useClaimInspector } from '../claims/InspectorContext'
import { listClaims } from '../claims/registry'
import type { Claim } from '../claims/types'
import { ARTIFACT_DESCRIPTIONS } from '../evidence/artifactDescriptions'
import { APP_ROUTES, type AppRouteId } from './routes'
import styles from './CommandPalette.module.css'

type PaletteItem = {
  key: string
  kind: 'route' | 'claim' | 'artifact'
  title: string
  detail: string
  route?: AppRouteId
  claim?: Claim
  artifact?: string
}

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  navigate: (route: AppRouteId, options?: { replace?: boolean }) => void
  returnFocusRef: RefObject<HTMLElement | null>
}

function scoreMatch(query: string, value: string): number | undefined {
  const needle = query.trim().toLowerCase()
  const text = value.toLowerCase()
  if (!needle) return 1
  const substringIndex = text.indexOf(needle)
  if (substringIndex >= 0) return 100 - substringIndex
  let position = 0
  let gaps = 0
  for (const character of needle) {
    const found = text.indexOf(character, position)
    if (found < 0) return undefined
    gaps += found - position
    position = found + 1
  }
  return 40 - gaps
}

function routeForClaim(id: string): AppRouteId {
  const prefix = id.split('.')[0]
  const destinations: Record<string, AppRouteId> = {
    audit: 'audit',
    data: 'data',
    eval: 'evaluation',
    limits: 'limits',
    model: 'model'
  }
  return destinations[prefix] ?? 'overview'
}

export function CommandPalette({ open, onOpenChange, navigate, returnFocusRef }: CommandPaletteProps) {
  const { openClaim } = useClaimInspector()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo<PaletteItem[]>(() => [
    ...APP_ROUTES.map(route => ({
      key: `route:${route.id}`,
      kind: 'route' as const,
      title: route.id === 'overview' ? 'Overview' : route.title,
      detail: `Section · ${route.paperRef}`,
      route: route.id
    })),
    ...listClaims().map(claim => ({
      key: `claim:${claim.id}`,
      kind: 'claim' as const,
      title: claim.label,
      detail: `${formatClaim(claim.value, claim.format)} · ${claim.id}`,
      route: routeForClaim(claim.id),
      claim
    })),
    ...Object.entries(ARTIFACT_DESCRIPTIONS).map(([artifact, description]) => ({
      key: `artifact:${artifact}`,
      kind: 'artifact' as const,
      title: artifact,
      detail: `Artifact · ${description}`,
      route: 'reproduce' as const,
      artifact
    }))
  ], [])

  const results = useMemo(() => items
    .map(item => ({ item, score: Math.max(
      scoreMatch(query, item.title) ?? -Infinity,
      scoreMatch(query, item.detail) ?? -Infinity,
      scoreMatch(query, item.key) ?? -Infinity
    ) }))
    .filter(result => Number.isFinite(result.score))
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, 18)
    .map(result => result.item), [items, query])

  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
      }
      if (open && event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [onOpenChange, open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const chooseItem = useCallback((item: PaletteItem) => {
    onOpenChange(false)
    if (item.kind === 'claim' && item.claim) {
      const url = new URL(window.location.href)
      url.searchParams.delete('artifact')
      window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
      navigate(item.route ?? 'overview')
      openClaim(item.claim.id, returnFocusRef.current)
    } else if (item.kind === 'artifact' && item.artifact) {
      const url = new URL(window.location.href)
      url.searchParams.set('artifact', `${item.artifact}.json`)
      window.history.pushState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
      navigate('reproduce', { replace: true })
    } else if (item.route) {
      navigate(item.route)
    }
  }, [navigate, onOpenChange, openClaim, returnFocusRef])

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex(index => Math.min(index + 1, Math.max(results.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex(index => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const selected = results[selectedIndex]
      if (selected) chooseItem(selected)
    }
  }

  if (!open) return null

  return (
    <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onOpenChange(false) }}>
      <section aria-label="Command palette" aria-modal="true" className={styles.palette} role="dialog">
        <label className={styles.searchRow}>
          <Search aria-hidden="true" size={18} />
          <input aria-label="Search routes, claims, and artifacts" onChange={event => { setQuery(event.target.value); setSelectedIndex(0) }} onKeyDown={onInputKeyDown} placeholder="Search routes, claims, and artifacts…" ref={inputRef} value={query} />
          <kbd>Esc</kbd>
        </label>
        <ul aria-label="Search results" className={styles.results}>
          {results.map((item, index) => (
            <li key={item.key}>
              <button aria-current={index === selectedIndex ? 'true' : undefined} className={styles.result} onClick={() => chooseItem(item)} onMouseEnter={() => setSelectedIndex(index)} type="button">
                <span className={styles.kind}>{item.kind}</span>
                <span className={styles.resultText}><strong>{item.title}</strong><small>{item.detail}</small></span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className={styles.empty} role="status">No matching routes, claims, or artifacts.</li>}
        </ul>
        <footer className={styles.footer}><span>Navigate</span><kbd>↑</kbd><kbd>↓</kbd><span>select</span><kbd>↵</kbd><span>close</span><kbd>Esc</kbd></footer>
      </section>
    </div>
  )
}

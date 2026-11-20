import { useCallback, useEffect, useState } from 'react'

/**
 * URL state for the Data labs.
 *
 * The labs are arguments, not decoration: a reader who reaches a conclusion at ±2 years
 * must be able to hand that view to someone else. So the two controls live in the query
 * string (`gw` for the Gini window, `zf` for the zero-fill toggle) and the route does not
 * own them — navigating away and back keeps the last reading.
 *
 * Written to replace only its own keys, so a claim inspector deep link or an artifact
 * query survives a lab change.
 */
const GINI_KEY = 'gw'
const ZERO_FILL_KEY = 'zf'

const read = (): { window: string; zeroFill: boolean } => {
  if (typeof window === 'undefined') return { window: '5', zeroFill: false }
  const params = new URLSearchParams(window.location.search)
  return {
    window: params.get(GINI_KEY) ?? '5',
    zeroFill: params.get(ZERO_FILL_KEY) === '1',
  }
}

export function useLabUrlState() {
  const [state, setState] = useState(read)

  useEffect(() => {
    const onPopState = () => setState(read())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const write = useCallback((next: { window: string; zeroFill: boolean }) => {
    const url = new URL(window.location.href)
    if (next.window === '5') url.searchParams.delete(GINI_KEY)
    else url.searchParams.set(GINI_KEY, next.window)
    if (next.zeroFill) url.searchParams.set(ZERO_FILL_KEY, '1')
    else url.searchParams.delete(ZERO_FILL_KEY)
    window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
    setState(next)
  }, [])

  return {
    giniWindow: state.window,
    zeroFill: state.zeroFill,
    setGiniWindow: (windowValue: string) => write({ window: windowValue, zeroFill: state.zeroFill }),
    setZeroFill: (zeroFill: boolean) => write({ window: state.window, zeroFill }),
  }
}

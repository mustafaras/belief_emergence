import { useCallback, useEffect, useState } from 'react'
import { LANDING_ROUTE, parseAppRoute, type AppRoute } from './routes'
import { readRouteFromUrl, writeRouteToUrl } from '../utils/urlState'

/**
 * Minimal history-integrated router.
 *
 * Deliberately not `react-router`: the app has no nested layouts, no data loaders and
 * no path params, and the deployment is a static sub-path where path-based deep links
 * cannot resolve. What a router must provide here is (a) a current route, (b) a way to
 * change it without reloading, and (c) back/forward support. That is the whole surface.
 *
 * Route writes go through `writeRouteToUrl` in the export serialiser, so the query
 * string is still produced in exactly one place.
 */
export function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(() => readRouteFromUrl())

  // Keep state in sync with the address bar for back/forward and manual edits.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPopState = () => setRoute(readRouteFromUrl())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  /**
   * Navigate to a route.
   *
   * `replace: true` is used by effects that merely restore state, so a reader does not
   * collect one history entry per render. Deliberate navigation pushes, so Back works.
   */
  const navigate = useCallback((next: AppRoute, opts?: { replace?: boolean }) => {
    const resolved = parseAppRoute(next)
    setRoute(resolved)
    writeRouteToUrl(resolved, { replace: opts?.replace ?? false })
  }, [])

  /** Restore a route from the URL without adding a history entry. */
  const syncFromUrl = useCallback(() => {
    setRoute(readRouteFromUrl())
  }, [])

  return { route, navigate, syncFromUrl }
}

export { LANDING_ROUTE }
export type { AppRoute }

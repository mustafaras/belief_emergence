import { useCallback, useEffect, useState } from 'react'
import { resolveAppRoute } from './redirects'
import { ROUTE_QUERY_KEY, type AppRouteId } from './routes'

const ROUTE_KEY = ROUTE_QUERY_KEY

function readRoute(): AppRouteId {
  if (typeof window === 'undefined') return 'overview'
  return resolveAppRoute(new URL(window.location.href).searchParams.get(ROUTE_KEY))
}

function normalizeLegacyRoute(): AppRouteId {
  const route = readRoute()
  if (typeof window === 'undefined') return route
  const url = new URL(window.location.href)
  const rawRoute = url.searchParams.get(ROUTE_KEY)
  if (rawRoute && rawRoute !== route) {
    url.searchParams.set(ROUTE_KEY, route)
    window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }
  return route
}

export function useRoute() {
  const [route, setRoute] = useState<AppRouteId>(normalizeLegacyRoute)

  useEffect(() => {
    const onPopState = () => setRoute(normalizeLegacyRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((next: AppRouteId, options?: { replace?: boolean }) => {
    const url = new URL(window.location.href)
    url.searchParams.set(ROUTE_KEY, next)
    const nextUrl = `${url.pathname}?${url.searchParams.toString()}${url.hash}`
    if (options?.replace) window.history.replaceState(null, '', nextUrl)
    else window.history.pushState(null, '', nextUrl)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

  return { route, navigate }
}

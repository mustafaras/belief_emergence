import { LANDING_ROUTE, SITEMAP, type AppRoute, type SitemapEntry } from '../../router/routes'
import './RouteNav.css'

interface RouteNavProps {
  route: AppRoute
  onNavigate: (route: AppRoute) => void
}

const GROUPS: Array<{ kind: SitemapEntry['kind']; label: string }> = [
  { kind: 'analysis', label: 'Analysis' },
  { kind: 'menu', label: 'Parameters' },
  { kind: 'modal', label: 'Reference' },
]

/**
 * The route strip.
 *
 * Rendered from `SITEMAP` rather than a hand-written list, so a route that exists in
 * the taxonomy is necessarily reachable from the interface. Buttons (not anchors) are
 * used deliberately: navigation is an in-page state change, and a real anchor would
 * force a full reload from the static sub-path.
 */
export default function RouteNav({ route, onNavigate }: RouteNavProps) {
  const isLanding = route === LANDING_ROUTE

  return (
    <nav className="route-nav" aria-label="Application views">
      <div className="route-nav-group">
        <div className="route-nav-items">
          <button
            type="button"
            className={`route-nav-item route-nav-landing${isLanding ? ' is-active' : ''}`}
            aria-current={isLanding ? 'page' : undefined}
            title="All analysis panels at once"
            onClick={() => onNavigate(LANDING_ROUTE)}
          >
            Overview
          </button>
        </div>
      </div>
      {GROUPS.map((group) => {
        const entries = SITEMAP.filter((entry) => entry.kind === group.kind)
        if (entries.length === 0) return null
        return (
          <div className="route-nav-group" key={group.kind}>
            <span className="route-nav-group-label">{group.label}</span>
            <div className="route-nav-items">
              {entries.map((entry) => {
                const isActive = entry.id === route
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`route-nav-item${isActive ? ' is-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    title={entry.description}
                    onClick={() => onNavigate(entry.id)}
                  >
                    {entry.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

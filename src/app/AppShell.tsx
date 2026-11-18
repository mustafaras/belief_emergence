import { lazy, Suspense, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Menu, Moon, Search, Sun } from 'lucide-react'
import '../design/fonts'
import '../design/tokens.css'
import '../design/reset.css'
import { InspectorProvider } from '../claims/ClaimInspector'
import { ThemeProvider } from '../contexts/ThemeContext'
import { useTheme } from '../contexts/useTheme'
import { Drawer, Kbd } from '../ui'
import { APP_ROUTES, getAppRoute, type AppRouteId } from './routes'
import { useRoute } from './useRoute'
import { CommandPalette } from './CommandPalette'
import { ExportBundleButton } from './ExportBundleButton'
import styles from './AppShell.module.css'

function routeHref(route: AppRouteId): string {
  const url = new URL(window.location.href)
  url.searchParams.set('v', route)
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`
}

function RouteLink({ route, active, navigate, children }: {
  route: AppRouteId
  active: boolean
  navigate: (route: AppRouteId) => void
  children: ReactNode
}) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    navigate(route)
  }

  return (
    <a aria-current={active ? 'page' : undefined} className={styles.routeLink} href={routeHref(route)} onClick={onClick}>
      {children}
    </a>
  )
}

function RouteNavigation({ active, navigate }: { active: AppRouteId; navigate: (route: AppRouteId) => void }) {
  return (
    <nav aria-label="Contents" className={styles.routeNav}>
      {APP_ROUTES.map(route => (
        <RouteLink active={active === route.id} key={route.id} navigate={navigate} route={route.id}>
          <span aria-hidden="true" className={styles.routeNumber}>{route.number}</span>
          <span>{route.id === 'overview' ? 'Overview' : route.title}</span>
        </RouteLink>
      ))}
    </nav>
  )
}

function ShellContent() {
  const { route, navigate } = useRoute()
  const currentRoute = getAppRoute(route)
  const Section = useMemo(() => lazy(currentRoute.load), [currentRoute])
  const { theme, toggleTheme } = useTheme()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const routeIndex = APP_ROUTES.findIndex(item => item.id === route)
  const readingProgress = Math.min(100, ((routeIndex + scrollProgress) / APP_ROUTES.length) * 100)
  const previousRoute = APP_ROUTES[routeIndex - 1]
  const nextRoute = APP_ROUTES[routeIndex + 1]

  useEffect(() => {
    const updateProgress = () => {
      const root = document.documentElement
      const range = root.scrollHeight - window.innerHeight
      setScrollProgress(range > 0 ? Math.max(0, Math.min(1, window.scrollY / range)) : 0)
    }
    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)
    return () => {
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [route])

  useEffect(() => {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [route])

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <header className={styles.topbar}>
        <a className={styles.brand} href={routeHref('overview')} onClick={event => { event.preventDefault(); navigate('overview') }}>
          <span aria-hidden="true" className={styles.brandMark}>◆</span>
          {/*
            The title is elided with an ellipsis below 768px, so the full string is not on
            screen there. `title` makes it available on hover and to the platform's tooltip;
            without it a reader sees "Measurement Validity Before Mode…" and nothing says what
            was cut. Found by `check:layout`, rule 4.
          */}
          <span title="Measurement Validity Before Model Geometry">Measurement Validity Before Model Geometry</span>
        </a>
        <div className={styles.headerActions}>
          <button aria-label="Search ⌘K" className={styles.searchButton} onClick={() => setPaletteOpen(true)} ref={searchButtonRef} type="button">
            <Search aria-hidden="true" size={16} /><span>Search</span><Kbd>⌘K</Kbd>
          </button>
          <a className={styles.paperLink} href="#paper-reference">Paper</a>
          <ExportBundleButton />
          <button aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-pressed={theme === 'dark'} className={styles.themeButton} onClick={toggleTheme} type="button">
            {theme === 'light' ? <Moon aria-hidden="true" size={18} /> : <Sun aria-hidden="true" size={18} />}
          </button>
          <div className={styles.mobileContents}>
            <Drawer key={route} title="Contents" trigger={<><Menu aria-hidden="true" size={18} /><span>Contents</span></>}>
              <RouteNavigation active={route} navigate={navigate} />
            </Drawer>
          </div>
        </div>
      </header>
      <div aria-hidden="true" className={styles.headerProgress} style={{ transform: `scaleX(${readingProgress / 100})` }} />

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeading}>CONTENTS</div>
          <RouteNavigation active={route} navigate={navigate} />
          <div aria-label={`Reading progress ${Math.round(readingProgress)} percent`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(readingProgress)} className={styles.progressBlock} role="progressbar">
            <span className={styles.progressTrack}><span style={{ width: `${readingProgress}%` }} /></span>
            <span>{Math.round(readingProgress)}% read</span>
          </div>
        </aside>

        <main className={styles.main} id="main-content" tabIndex={-1}>
          <div className={styles.routeMeta}>
            <span id="paper-reference">{currentRoute.paperRef}</span>
          </div>
          <Suspense fallback={<p aria-live="polite" className={styles.loading}>Loading section…</p>}>
            <Section />
          </Suspense>
          <nav aria-label="Section navigation" className={styles.sectionNavigation}>
            {previousRoute ? <RouteLink active={false} navigate={navigate} route={previousRoute.id}><ArrowLeft aria-hidden="true" size={16} /><span>{previousRoute.title}</span></RouteLink> : <span />}
            {nextRoute ? <RouteLink active={false} navigate={navigate} route={nextRoute.id}><span>{nextRoute.title}</span><ArrowRight aria-hidden="true" size={16} /></RouteLink> : <span />}
          </nav>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} navigate={navigate} returnFocusRef={searchButtonRef} />
    </div>
  )
}

export default function AppShell() {
  return <ThemeProvider><InspectorProvider><ShellContent /></InspectorProvider></ThemeProvider>
}

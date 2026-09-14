import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  FlaskConical,
  House,
  MapPin,
  SlidersHorizontal,
  UserRound,
  WifiOff,
} from 'lucide-react'
import { useCare } from './state'
import { scenarios } from './data/demo'
import type { AIState, Scenario } from './data/demo'
import { Badge, Brand, PrototypeNote, ThemeToggle } from './components/UI'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Alerts from './pages/Alerts'
import Location from './pages/Location'
import Profile from './pages/Profile'
const navigation = [
  { path: '/', label: 'Dashboard', icon: House },
  { path: '/alerts', label: 'Alerts', icon: Bell },
  { path: '/location', label: 'Location', icon: MapPin },
  { path: '/profile', label: 'Profile', icon: UserRound },
]
export default function App() {
  const { online, alerts, scenario, setScenario, aiState, setAiState } = useCare()
  const [controls, setControls] = useState(false)
  const location = useLocation()
  const main = useRef<HTMLElement>(null)
  const initial = useRef(true)
  const newCount = alerts.filter((a) => a.status === 'New').length
  useEffect(() => {
    if (initial.current) {
      initial.current = false
      return
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    main.current?.focus({ preventScroll: true })
    if (location.hash)
      requestAnimationFrame(() =>
        document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' }),
      )
  }, [location.pathname, location.hash])
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div className="header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Main navigation">
            {navigation.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  isActive || (path === '/' && location.pathname === '/history') ? 'active' : ''
                }
              >
                <Icon size={18} />
                {label}
                {label === 'Alerts' && newCount > 0 && (
                  <span className="nav-count">{newCount}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            <Link
              to="/alerts"
              className="icon-button header-bell"
              aria-label={`Alerts, ${newCount} new`}
            >
              <Bell size={20} />
              {newCount > 0 && <i />}
            </Link>
            <Link to="/profile" className="header-avatar" aria-label="Omair’s profile">
              O
            </Link>
          </div>
        </div>
      </header>
      <div className="demo-strip">
        <div>
          <span>
            <FlaskConical size={13} />
            Demo — sample data
          </span>
          <span className="sample-clock">
            14 Sep 2026 · 12:00 GST <i />
            Fixed sample timeline
          </span>
        </div>
      </div>
      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff size={18} />
          You’re offline. This is the cached app with demo readings, not live monitoring.
        </div>
      )}
      <main ref={main} tabIndex={-1} id="main-content" className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/location" element={<Location />} />
          <Route path="/profile" element={<Profile />} />
          <Route
            path="*"
            element={
              <div className="empty-state">
                <h1>Let’s get you back to care.</h1>
                <p>This page isn’t available.</p>
                <Link className="button primary" to="/">
                  Go to dashboard
                </Link>
              </div>
            }
          />
        </Routes>
        <section className="demo-controls">
          <button
            className="demo-controls-toggle"
            aria-expanded={controls}
            aria-controls="demo-controls-panel"
            onClick={() => setControls(!controls)}
          >
            <span>
              <SlidersHorizontal size={16} />
              Demo controls<Badge tone="muted">Prototype tools</Badge>
            </span>
            <span>
              {scenarios.find((s) => s.value === scenario)?.label}
              <ChevronDown size={16} className={controls ? 'rotated' : ''} />
            </span>
          </button>
          {controls && (
            <div id="demo-controls-panel" className="demo-controls-panel">
              <p>Explore sample states. These controls do not change a real wearable or patient.</p>
              <div className="demo-controls-fields">
                <label>
                  Device & data scenario
                  <select
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value as Scenario)}
                  >
                    {scenarios.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  AI presentation preview
                  <select value={aiState} onChange={(e) => setAiState(e.target.value as AIState)}>
                    <option value="awaiting">Awaiting analysis — not connected</option>
                    <option value="learning">Demo: Learning baseline</option>
                    <option value="usual">Demo: Usual pattern</option>
                    <option value="unusual">Demo: Unusual pattern</option>
                    <option value="insufficient">Demo: Insufficient data</option>
                    <option value="unavailable">Demo: Service unavailable</option>
                  </select>
                </label>
              </div>
              <p className="data-note" role="status">
                Active scenario: {scenarios.find((s) => s.value === scenario)?.label}. Scenario
                changes reset alert actions. Sample clock stays fixed.
              </p>
            </div>
          )}
        </section>
        <footer className="app-footer">
          <PrototypeNote />
          <span>
            CareLink <span className="text-accent">♥</span> Care, connected.
          </span>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              isActive || (path === '/' && location.pathname === '/history') ? 'active' : ''
            }
          >
            <span>
              <Icon size={23} />
              {label === 'Alerts' && newCount > 0 && <i className="mobile-alert-dot" />}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

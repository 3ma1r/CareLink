import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { demoSource } from './data/demo'
import type { AIState, AlertStatus, Patient, Scenario } from './data/demo'
import { useConnectivity } from './hooks/useConnectivity'
type Theme = 'system' | 'light' | 'dark'
function useStore() {
  const [scenario, setScenario] = useState<Scenario>('typical')
  const [aiState, setAiState] = useState<AIState>('awaiting')
  const [patient, setPatient] = useState<Patient>({
    name: 'Ahmed',
    age: 72,
    city: 'Muscat',
    avatar: true,
  })
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('carelink-theme')
      return saved === 'light' || saved === 'dark' ? saved : 'system'
    } catch {
      return 'system'
    }
  })
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const online = useConnectivity()
  const [statuses, setStatuses] = useState<Record<string, AlertStatus>>({})
  const snapshot = useMemo(() => demoSource.getSnapshot(scenario), [scenario])
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const change = () => setSystemDark(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'dark' ? '#0c2229' : '#007b78')
    try {
      localStorage.setItem('carelink-theme', theme)
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }, [theme, resolvedTheme])
  const alerts = snapshot.alerts.map((a) => ({ ...a, status: statuses[a.id] ?? a.status }))
  function changeScenario(value: Scenario) {
    setScenario(value)
    setStatuses({})
  }
  return {
    ...snapshot,
    alerts,
    scenario,
    setScenario: changeScenario,
    aiState,
    setAiState,
    patient,
    setPatient,
    theme,
    setTheme,
    resolvedTheme,
    online,
    updateAlert: (id: string, status: AlertStatus) => setStatuses((s) => ({ ...s, [id]: status })),
  }
}
const CareContext = createContext<ReturnType<typeof useStore> | null>(null)
export function CareProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  return <CareContext.Provider value={store}>{children}</CareContext.Provider>
}
// Shared store hook intentionally lives alongside its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useCare() {
  const value = useContext(CareContext)
  if (!value) throw new Error('CareProvider is required')
  return value
}

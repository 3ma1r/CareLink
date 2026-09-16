import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { demoSource } from './data/demo'
import type { AIState, AlertStatus, Patient, Scenario } from './data/demo'
import { useConnectivity } from './hooks/useConnectivity'
import { useAuth } from './auth/AuthProvider'
import { calculateAge } from './auth/validation'
import { useDevice } from './device/DeviceProvider'
import type { Reading } from './data/demo'
import { findLatestGps, mapMeasurement } from './device/measurements'
type Theme = 'system' | 'light' | 'dark'
function useStore() {
  const [scenario, setScenario] = useState<Scenario>('typical')
  const [aiState, setAiState] = useState<AIState>('awaiting')
  const auth = useAuth()
  const wearable = useDevice()
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
  const sampleMode = import.meta.env.MODE === 'test'
  const sampleSnapshot = useMemo(() => demoSource.getSnapshot(scenario), [scenario])
  const realReadings = useMemo<Reading[]>(
    () => wearable.measurements.map(mapMeasurement),
    [wearable.measurements],
  )
  const latestGps = useMemo(
    () => findLatestGps(wearable.measurements),
    [wearable.measurements],
  )
  const snapshot = sampleMode ? sampleSnapshot : {
    readings: realReadings,
    alerts: [],
    lastContact: wearable.device?.last_contact_at ? Date.parse(wearable.device.last_contact_at) : 0,
    location: {
      coordinates: latestGps ? [latestGps.latitude!, latestGps.longitude!] as [number, number] : null,
      time: latestGps?.gps_fix_at ? Date.parse(latestGps.gps_fix_at) : null,
      stale: !latestGps?.gps_fix_at || Date.now() - Date.parse(latestGps.gps_fix_at) > 15 * 60_000,
    },
  }
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
  const patient: Patient = {
    name: auth.patient?.full_name ?? '',
    age: auth.patient ? (calculateAge(auth.patient.date_of_birth) ?? 0) : 0,
    city: 'Muscat',
    avatar: false,
  }
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
    theme,
    setTheme,
    resolvedTheme,
    online,
    sampleMode,
    dataNow: sampleMode ? Date.parse('2026-09-14T12:00:00+04:00') : Date.now(),
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

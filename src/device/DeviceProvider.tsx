import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

export type Device = Database['public']['Tables']['devices']['Row']
export type Measurement = Database['public']['Tables']['device_measurements']['Row']
export type StoredAlert = Database['public']['Tables']['care_alerts']['Row']
export type PersonalizedBaseline = Database['public']['Tables']['personalized_baselines']['Row']
export type PersonalizedInsight = Database['public']['Tables']['personalized_insights']['Row']
export const DEVICE_OFFLINE_AFTER_MS = 120_000
const HISTORY_DAYS = 30
const HISTORY_LIMIT = 2_000
const REFRESH_MS = 60_000
const SUMMARY_DAYS = 7
const SUMMARY_PAGE_SIZE = 1_000
const SUMMARY_MAX_ROWS = 10_000
const isTest = import.meta.env.MODE === 'test'
const now = () => new Date().toISOString()

type Ctx = {
  device: Device | null
  latest: Measurement | null
  measurements: Measurement[]
  alerts: StoredAlert[]
  personalizedBaselines: PersonalizedBaseline[]
  personalizedInsights: PersonalizedInsight[]
  summarySnapshot: { patientId: string; deviceId: string | null; measurements: Measurement[]; alerts: StoredAlert[]; baselines: PersonalizedBaseline[]; insights: PersonalizedInsight[]; asOf: number; updatedAt: number } | null
  summaryLoading: boolean
  summaryError: string
  loading: boolean
  error: string
  alertsLoading: boolean
  alertError: string
  insightsLoading: boolean
  insightError: string
  connection: 'none' | 'awaiting' | 'online' | 'offline'
  refresh(): Promise<void>
  pair(id: string, code: string): Promise<string | null>
  unpair(): Promise<string | null>
  updateAlertStatus(id: string, status: 'acknowledged' | 'resolved'): Promise<string | null>
}

const DeviceContext = createContext<Ctx | null>(null)
const testDevice: Device = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', device_identifier: 'CL-TEST00000001',
  display_name: 'CareLink Test Band', device_model: 'CL-BAND-DEV', provisioned_at: now(),
  paired_patient_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', paired_at: now(),
  last_contact_at: now(), firmware_version: 'simulator-1', status: 'active',
  created_at: now(), updated_at: now(),
}

function testMeasurement(deviceId: string): Measurement {
  return {
    id: 1, device_id: deviceId, message_id: 'test-message',
    measured_at: new Date(Date.now() - 30_000).toISOString(),
    received_at: new Date(Date.now() - 25_000).toISOString(),
    heart_rate: 72, spo2: 97, sensor_temperature: 34.2, movement: 18,
    latitude: null, longitude: null, gps_fix_at: null, quality: 'good',
    heart_rate_quality: 'good', spo2_quality: 'good', temperature_quality: 'good', confirmed_fall: false,
    battery_percent: null, created_at: now(),
  }
}

export function DeviceProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  const [device, setDevice] = useState<Device | null>(null)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [alerts, setAlerts] = useState<StoredAlert[]>([])
  const [personalizedBaselines, setPersonalizedBaselines] = useState<PersonalizedBaseline[]>([])
  const [personalizedInsights, setPersonalizedInsights] = useState<PersonalizedInsight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertError, setAlertError] = useState('')
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightError, setInsightError] = useState('')
  const [summarySnapshot, setSummarySnapshot] = useState<Ctx['summarySnapshot']>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [tick, setTick] = useState(0)
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (auth.status !== 'signed-in' || !auth.patient) {
      setDevice(null); setMeasurements([]); setAlerts([])
      setPersonalizedBaselines([]); setPersonalizedInsights([])
      setSummarySnapshot(null); setSummaryLoading(false); setSummaryError(''); return
    }
    setLoading(true); setAlertsLoading(true); setInsightsLoading(true)
    setSummaryLoading(true)
    setError(''); setAlertError(''); setInsightError('')
    setSummaryError('')
    if (isTest) {
      const state = localStorage.getItem('carelink-test-device')
      if (state === 'none') { setDevice(null); setMeasurements([]) }
      else {
        const nextDevice = { ...testDevice, last_contact_at: state === 'awaiting' ? null : state === 'offline' ? new Date(Date.now() - 300_000).toISOString() : now() }
        setDevice(nextDevice)
        setMeasurements(state === 'awaiting' ? [] : [testMeasurement(nextDevice.id)])
      }
      setAlerts([]); setPersonalizedBaselines([]); setPersonalizedInsights([])
      setSummarySnapshot(null); setSummaryLoading(false)
      setLoading(false); setAlertsLoading(false); setInsightsLoading(false); return
    }
    if (!supabase) { setSummaryError('CareLink is not configured.'); setSummaryLoading(false); setLoading(false); setAlertsLoading(false); setInsightsLoading(false); return }
    const asOf = Date.now()
    const [deviceResult, alertsResult, baselinesResult, insightsResult] = await Promise.all([
      supabase.from('devices').select('*').eq('paired_patient_id', auth.patient.id).maybeSingle(),
      supabase.from('care_alerts').select('*').eq('patient_id', auth.patient.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('personalized_baselines').select('*').eq('patient_id', auth.patient.id).order('metric'),
      supabase.from('personalized_insights').select('*').eq('patient_id', auth.patient.id).order('last_observed_at', { ascending: false }).limit(50),
    ])
    if (currentRequest !== requestId.current) return
    if (alertsResult.error) { setAlertError('Unable to load alerts.'); setAlerts([]) }
    else setAlerts(alertsResult.data ?? [])
    setAlertsLoading(false)
    if (baselinesResult.error || insightsResult.error) {
      setInsightError('Unable to load personalized insights.')
      setPersonalizedBaselines([]); setPersonalizedInsights([])
    } else {
      setPersonalizedBaselines(baselinesResult.data ?? [])
      setPersonalizedInsights(insightsResult.data ?? [])
    }
    setInsightsLoading(false)
    if (deviceResult.error) { setError('Unable to load wearable status.'); setSummaryError('Unable to refresh the summary.'); setSummaryLoading(false); setLoading(false); return }
    setDevice(deviceResult.data)
    if (!deviceResult.data) {
      setMeasurements([])
      setSummarySnapshot({ patientId: auth.patient.id, deviceId: null, measurements: [], alerts: [], baselines: [], insights: [], asOf, updatedAt: Date.now() })
      setSummaryLoading(false); setLoading(false); return
    }
    const deviceId = deviceResult.data.id
    const summarySince = new Date(asOf - SUMMARY_DAYS * 86_400_000).toISOString()
    const [activeAlertsResult, resolvedAlertsResult, activeInsightsResult, resolvedInsightsResult] = await Promise.all([
      supabase.from('care_alerts').select('*').eq('patient_id', auth.patient.id).eq('device_id', deviceId)
        .in('status', ['active', 'acknowledged']).order('id').limit(1_001),
      supabase.from('care_alerts').select('*').eq('patient_id', auth.patient.id).eq('device_id', deviceId)
        .eq('status', 'resolved').gte('resolved_at', summarySince).lte('resolved_at', new Date(asOf).toISOString()).order('id').limit(1_001),
      supabase.from('personalized_insights').select('*').eq('patient_id', auth.patient.id).eq('device_id', deviceId)
        .eq('status', 'active').order('id').limit(1_001),
      supabase.from('personalized_insights').select('*').eq('patient_id', auth.patient.id).eq('device_id', deviceId)
        .eq('status', 'resolved').gte('resolved_at', summarySince).lte('resolved_at', new Date(asOf).toISOString()).order('id').limit(1_001),
    ])
    if (currentRequest !== requestId.current) return
    // The dashboard's 30-day history is intentionally capped and cannot establish 7-day coverage.
    // Page the complete 7-day slice; refuse a partial result instead of summarizing it.
    let summaryRows: Measurement[] = []
    let summaryFetchError = ''
    for (let offset = 0; offset <= SUMMARY_MAX_ROWS; offset += SUMMARY_PAGE_SIZE) {
      const page = await supabase.from('device_measurements').select('*')
        .eq('device_id', deviceId)
        .gte('measured_at', summarySince)
        .lte('measured_at', new Date(asOf).toISOString())
        .order('measured_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + SUMMARY_PAGE_SIZE - 1)
      if (currentRequest !== requestId.current) return
      if (page.error) { summaryFetchError = 'Unable to refresh summary readings.'; break }
      summaryRows = summaryRows.concat(page.data ?? [])
      if ((page.data?.length ?? 0) < SUMMARY_PAGE_SIZE) break
      if (offset + SUMMARY_PAGE_SIZE >= SUMMARY_MAX_ROWS) { summaryFetchError = 'Too many readings to summarize completely.'; break }
    }
    if (baselinesResult.error || activeAlertsResult.error || resolvedAlertsResult.error ||
      activeInsightsResult.error || resolvedInsightsResult.error ||
      [activeAlertsResult, resolvedAlertsResult, activeInsightsResult, resolvedInsightsResult]
        .some((result) => (result.data?.length ?? 0) >= 1_000)) {
      summaryFetchError ||= 'Unable to verify complete alert or personalized insight context.'
    }
    if (summaryFetchError) setSummaryError(summaryFetchError)
    else setSummarySnapshot({
      patientId: auth.patient.id, deviceId, measurements: summaryRows,
      alerts: [...(activeAlertsResult.data ?? []), ...(resolvedAlertsResult.data ?? [])],
      baselines: baselinesResult.data ?? [],
      insights: [...(activeInsightsResult.data ?? []), ...(resolvedInsightsResult.data ?? [])],
      asOf, updatedAt: Date.now(),
    })
    setSummaryLoading(false)
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString()
    const [historyResult, latestResult] = await Promise.all([
      supabase.from('device_measurements').select('*').eq('device_id', deviceId).gte('measured_at', since).order('measured_at', { ascending: true }).limit(HISTORY_LIMIT),
      supabase.from('device_measurements').select('*').eq('device_id', deviceId).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (currentRequest !== requestId.current) return
    if (historyResult.error || latestResult.error) setError('Unable to load wearable readings.')
    else {
      const history = historyResult.data ?? []
      const latest = latestResult.data
      setMeasurements(latest && !history.some((row) => row.id === latest.id)
        ? [latest, ...history].sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at))
        : history)
    }
    setLoading(false)
  }, [auth.status, auth.patient])

  useEffect(() => () => { requestId.current += 1 }, [])
  useEffect(() => { if (document.visibilityState === 'visible') void refresh() }, [location.pathname, refresh])
  useEffect(() => {
    const update = () => { setTick((value) => value + 1); if (document.visibilityState === 'visible' && navigator.onLine) void refresh() }
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = window.setInterval(update, REFRESH_MS)
    document.addEventListener('visibilitychange', visible); window.addEventListener('online', update)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', update) }
  }, [refresh])

  async function pair(id: string, code: string) {
    if (!navigator.onLine) return 'You are offline. Reconnect before pairing.'
    if (isTest) { if (code !== 'VALIDCODE') return 'Invalid pairing details.'; localStorage.removeItem('carelink-test-device'); await refresh(); return null }
    if (!supabase) return 'CareLink is not configured.'
    const result = await supabase.functions.invoke('pair-device', { body: { device_id: id.trim().toUpperCase(), pairing_code: code.trim().toUpperCase() } })
    if (result.error || !result.data?.ok) return 'Invalid pairing details.'
    await refresh(); return null
  }

  async function unpair() {
    if (!navigator.onLine) return 'You are offline. Reconnect before unpairing.'
    if (!device) return 'No wearable is paired.'
    if (isTest) { localStorage.setItem('carelink-test-device', 'none'); await refresh(); return null }
    if (!supabase) return 'CareLink is not configured.'
    const result = await supabase.functions.invoke('pair-device', { body: { action: 'unpair', device_id: device.id } })
    if (result.error || !result.data?.ok) return 'Unable to unpair wearable.'
    await refresh(); return null
  }

  async function updateAlertStatus(id: string, status: 'acknowledged' | 'resolved') {
    if (isTest) return null
    if (!navigator.onLine) return 'You are offline. Reconnect before updating the alert.'
    if (!supabase) return 'CareLink is not configured.'
    const result = await supabase.from('care_alerts').update({ status }).eq('id', id).select('id').maybeSingle()
    if (result.error || !result.data) return 'Unable to update this alert.'
    await refresh(); return null
  }

  const latest = measurements.at(-1) ?? null
  const connection = useMemo<Ctx['connection']>(() => {
    void tick
    if (!device) return 'none'
    if (!device.last_contact_at) return 'awaiting'
    return Date.now() - Date.parse(device.last_contact_at) <= DEVICE_OFFLINE_AFTER_MS ? 'online' : 'offline'
  }, [device, tick])
  return <DeviceContext.Provider value={{ device, latest, measurements, alerts, personalizedBaselines, personalizedInsights, summarySnapshot, summaryLoading, summaryError, loading, error, alertsLoading, alertError, insightsLoading, insightError, connection, refresh, pair, unpair, updateAlertStatus }}>{children}</DeviceContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDevice() { const value = useContext(DeviceContext); if (!value) throw new Error('DeviceProvider required'); return value }

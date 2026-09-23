import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

export type Device = Database['public']['Tables']['devices']['Row']
export type Measurement = Database['public']['Tables']['device_measurements']['Row']
export type StoredAlert = Database['public']['Tables']['care_alerts']['Row']
export const DEVICE_OFFLINE_AFTER_MS = 120_000
const HISTORY_DAYS = 30
const HISTORY_LIMIT = 2_000
const REFRESH_MS = 60_000
const isTest = import.meta.env.MODE === 'test'
const now = () => new Date().toISOString()

type Ctx = {
  device: Device | null
  latest: Measurement | null
  measurements: Measurement[]
  alerts: StoredAlert[]
  loading: boolean
  error: string
  alertsLoading: boolean
  alertError: string
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertError, setAlertError] = useState('')
  const [tick, setTick] = useState(0)
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (auth.status !== 'signed-in' || !auth.patient) {
      setDevice(null); setMeasurements([]); setAlerts([]); return
    }
    setLoading(true); setAlertsLoading(true); setError(''); setAlertError('')
    if (isTest) {
      const state = localStorage.getItem('carelink-test-device')
      if (state === 'none') { setDevice(null); setMeasurements([]) }
      else {
        const nextDevice = { ...testDevice, last_contact_at: state === 'awaiting' ? null : state === 'offline' ? new Date(Date.now() - 300_000).toISOString() : now() }
        setDevice(nextDevice)
        setMeasurements(state === 'awaiting' ? [] : [testMeasurement(nextDevice.id)])
      }
      setAlerts([]); setLoading(false); setAlertsLoading(false); return
    }
    if (!supabase) { setLoading(false); setAlertsLoading(false); return }
    const [deviceResult, alertsResult] = await Promise.all([
      supabase.from('devices').select('*').maybeSingle(),
      supabase.from('care_alerts').select('*').eq('patient_id', auth.patient.id).order('created_at', { ascending: false }).limit(200),
    ])
    if (currentRequest !== requestId.current) return
    if (alertsResult.error) { setAlertError('Unable to load alerts.'); setAlerts([]) }
    else setAlerts(alertsResult.data ?? [])
    setAlertsLoading(false)
    if (deviceResult.error) { setError('Unable to load wearable status.'); setLoading(false); return }
    setDevice(deviceResult.data)
    if (!deviceResult.data) { setMeasurements([]); setLoading(false); return }
    const deviceId = deviceResult.data.id
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
  return <DeviceContext.Provider value={{ device, latest, measurements, alerts, loading, error, alertsLoading, alertError, connection, refresh, pair, unpair, updateAlertStatus }}>{children}</DeviceContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDevice() { const value = useContext(DeviceContext); if (!value) throw new Error('DeviceProvider required'); return value }

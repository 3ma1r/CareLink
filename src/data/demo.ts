export type Metric = 'heartRate' | 'spo2' | 'temperature'
export type Quality = 'Good' | 'Unstable' | 'Missing'
export type Scenario =
  'typical' | 'offline' | 'unstable' | 'staleGps' | 'noGps' | 'sos' | 'fall' | 'empty'
export type AlertStatus = 'New' | 'Viewed' | 'Resolved'
export type AIState = 'awaiting' | 'learning' | 'usual' | 'unusual' | 'insufficient' | 'unavailable'
export interface Reading {
  id: string
  time: number
  heartRate: number | null
  spo2: number | null
  temperature: number | null
  movement: number | null
  quality: Record<Metric, Quality>
}
export interface Patient {
  name: string
  age: number
  city: string
  avatar: boolean
}
export interface CareAlert {
  id: string
  type: 'fall' | 'sos' | 'reading'
  title: string
  description: string
  severity: 'High' | 'Moderate' | 'Low'
  status: AlertStatus
  time: number
  cancelled?: boolean
  readingId: string
  gpsTime: number | null
  coordinates: [number, number] | null
}
export interface LocationFix {
  coordinates: [number, number] | null
  time: number | null
  stale: boolean
}
export const SAMPLE_NOW = Date.parse('2026-09-14T12:00:00+04:00')
export const TODAY = '2026-09-14'
export const FIRST_DAY = '2026-08-16'
export const DAY = 86400000
export const metrics = {
  heartRate: {
    label: 'Heart rate',
    unit: 'bpm',
    color: 'var(--coral)',
    decimals: 0,
    domain: [55, 110],
  },
  spo2: { label: 'SpO₂', unit: '%', color: 'var(--blue)', decimals: 0, domain: [88, 100] },
  temperature: {
    label: 'Sensor temperature',
    unit: '°C',
    color: 'var(--amber)',
    decimals: 1,
    domain: [32, 37],
  },
} as const
export const scenarios: { value: Scenario; label: string }[] = [
  { value: 'typical', label: 'Typical valid readings' },
  { value: 'offline', label: 'Device offline' },
  { value: 'unstable', label: 'Missing / unstable vitals' },
  { value: 'staleGps', label: 'Stale GPS' },
  { value: 'noGps', label: 'GPS unavailable' },
  { value: 'sos', label: 'New SOS alert' },
  { value: 'fall', label: 'New suspected fall' },
  { value: 'empty', label: 'Empty history' },
]
export function dateKey(time: number) {
  return new Date(time + 4 * 3600000).toISOString().slice(0, 10)
}
export function dayStart(day: string) {
  return Date.parse(`${day}T00:00:00+04:00`)
}
export function timeLabel(time: number, seconds = false) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Muscat',
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' as const } : {}),
  }).format(time)
}
export function dateLabel(time: number, long = false) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Muscat',
    day: 'numeric',
    month: long ? 'long' : 'short',
    ...(long ? { year: 'numeric' as const } : {}),
  }).format(time)
}
export function stamp(time: number | null, seconds = false) {
  return time === null ? 'Unavailable' : `${dateLabel(time)} · ${timeLabel(time, seconds)} GST`
}
export function formatValue(value: number | null, metric: Metric) {
  return value === null ? '—' : value.toFixed(metrics[metric].decimals)
}
export function validValue(reading: Reading, metric: Metric): number | null {
  const value = reading[metric]
  return reading.quality[metric] === 'Good' && value !== null && Number.isFinite(value)
    ? value
    : null
}
export function summarize(readings: Reading[], metric: Metric) {
  const values = readings.flatMap((r) => {
    const v = validValue(r, metric)
    return v === null ? [] : [v]
  })
  return {
    min: values.length ? Math.min(...values) : null,
    avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    max: values.length ? Math.max(...values) : null,
    count: values.length,
  }
}
export function filterReadings(readings: Reading[], start: number, end: number) {
  return readings.filter((r) => r.time >= start && r.time <= end)
}
export function validCoordinates(
  coordinates: [number, number] | null,
): coordinates is [number, number] {
  return (
    !!coordinates &&
    coordinates.every(Number.isFinite) &&
    Math.abs(coordinates[0]) <= 90 &&
    Math.abs(coordinates[1]) <= 180 &&
    !(coordinates[0] === 0 && coordinates[1] === 0)
  )
}

function createReadings(scenario: Scenario): Reading[] {
  if (scenario === 'empty') return []
  const end = scenario === 'offline' ? SAMPLE_NOW - 3 * 3600000 : SAMPLE_NOW - 60000
  const rows: Reading[] = []
  for (let time = dayStart(FIRST_DAY) + 14 * 60000, i = 0; time <= end; time += 15 * 60000, i++) {
    const unstable = scenario === 'unstable' && time > SAMPLE_NOW - 6 * 3600000
    const missing = i % 71 === 0 || (unstable && i % 3 !== 0)
    const quality: Quality = missing ? 'Missing' : unstable ? 'Unstable' : 'Good'
    rows.push({
      id: `r-${time}`,
      time,
      heartRate: missing ? null : Math.round(77 + Math.sin(i * 0.61) * 5 + Math.sin(i * 0.17) * 3),
      spo2: missing ? null : Math.round(97 + Math.sin(i * 0.3)),
      temperature: missing ? null : Math.round((34.7 + Math.sin(i * 0.5) * 0.4) * 10) / 10,
      movement: missing ? null : Math.round(12 + Math.abs(Math.sin(i * 0.72)) * 68),
      quality: { heartRate: quality, spo2: quality, temperature: quality },
    })
  }
  const latest = rows.at(-1)
  if (latest && scenario !== 'unstable') {
    latest.heartRate = 78
    latest.spo2 = 97
    latest.temperature = 34.8
    latest.movement = 12
    latest.quality = { heartRate: 'Good', spo2: 'Good', temperature: 'Good' }
  }
  return rows
}
const COORDINATES: [number, number] = [23.588, 58.4059]
function createAlerts(readings: Reading[], scenario: Scenario): CareAlert[] {
  const at = (hours: number) =>
    readings.filter((r) => r.time <= SAMPLE_NOW - hours * 3600000).at(-1)
  const make = (
    id: string,
    hours: number,
    details: Pick<
      CareAlert,
      'type' | 'title' | 'description' | 'severity' | 'status' | 'cancelled'
    >,
  ): CareAlert => {
    const row = at(hours)
    const time = row?.time ?? SAMPLE_NOW - hours * 3600000
    return {
      id,
      time,
      readingId: row?.id ?? '',
      coordinates: COORDINATES,
      gpsTime: time - 2 * 60000,
      ...details,
    }
  }
  const rows = [
    make('a-1', 2, {
      type: 'reading',
      title: 'Unstable sensor reading',
      description:
        'The wearable reported a low-quality signal. This sample reading is excluded from health summaries; it does not confirm a health condition.',
      severity: 'Moderate',
      status: 'New',
    }),
    make('a-2', 22, {
      type: 'fall',
      title: 'Suspected fall · cancelled',
      description:
        'The patient cancelled the suspected-fall countdown on the wearable. This event was not escalated.',
      severity: 'Low',
      status: 'Resolved',
      cancelled: true,
    }),
    make('a-3', 26, {
      type: 'sos',
      title: 'SOS button pressed',
      description:
        'A sample manual SOS event was recorded by the wearable. This demo sends no notifications and initiates no calls.',
      severity: 'High',
      status: 'Viewed',
    }),
    make('a-4', 50, {
      type: 'fall',
      title: 'Suspected fall · escalated',
      description:
        'The wearable countdown was not cancelled, so this suspected fall was escalated. A fall has not been independently verified.',
      severity: 'High',
      status: 'Resolved',
      cancelled: false,
    }),
    make('a-5', 18, {
      type: 'reading',
      title: 'Heart rate above demo range',
      description:
        'The sample heart rate was 108 bpm, above the illustrative demo threshold of 100 bpm. This example alert does not establish a medical condition.',
      severity: 'Moderate',
      status: 'Resolved',
    }),
  ]
  const abnormalReading = readings.find((r) => r.id === rows[4].readingId)
  if (abnormalReading) {
    abnormalReading.heartRate = 108
    abnormalReading.quality.heartRate = 'Good'
  }
  const unstableReading = readings.find((r) => r.id === rows[0].readingId)
  if (unstableReading)
    unstableReading.quality = { heartRate: 'Unstable', spo2: 'Unstable', temperature: 'Good' }
  if (scenario === 'sos' || scenario === 'fall')
    rows.unshift(
      make(
        `demo-${scenario}`,
        0,
        scenario === 'sos'
          ? {
              type: 'sos',
              title: 'SOS button pressed',
              description: 'A new sample manual SOS event. No notification or call has been sent.',
              severity: 'High',
              status: 'New',
            }
          : {
              type: 'fall',
              title: 'Suspected fall · escalated',
              description:
                'The countdown was not cancelled. This is an escalated suspected fall, not an independently verified fall.',
              severity: 'High',
              status: 'New',
              cancelled: false,
            },
      ),
    )
  return rows.sort((a, b) => b.time - a.time)
}
// Replace this adapter with a protected backend client in a later stage.
export interface CareDataSource {
  getSnapshot(scenario: Scenario): {
    readings: Reading[]
    alerts: CareAlert[]
    location: LocationFix
    lastContact: number
  }
}
export const demoSource: CareDataSource = {
  getSnapshot(scenario) {
    const readings = createReadings(scenario)
    const alerts = createAlerts(readings, scenario)
    return {
      readings,
      alerts,
      lastContact: SAMPLE_NOW - (scenario === 'offline' ? 3 * 3600000 : 15000),
      location: {
        coordinates: scenario === 'noGps' ? null : COORDINATES,
        time:
          scenario === 'noGps'
            ? null
            : SAMPLE_NOW -
              (scenario === 'staleGps' || scenario === 'offline' ? 3 * 3600000 : 2 * 60000),
        stale: scenario === 'staleGps' || scenario === 'offline',
      },
    }
  },
}

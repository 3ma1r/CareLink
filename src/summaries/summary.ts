import type { Metric } from '../data/demo'
import { metrics, stamp, validValue } from '../data/demo'
import type {
  PersonalizedBaseline,
  PersonalizedInsight,
  StoredAlert,
  Measurement,
} from '../device/DeviceProvider'
import { mapMeasurement } from '../device/measurements'

export const SUMMARY_RULE_VERSION = 'carelink_summary_v1'
export type SummaryPeriod = '24h' | '7d'
export type SummarySource = {
  patientId: string
  deviceId: string | null
  measurements: Measurement[]
  alerts: StoredAlert[]
  baselines: PersonalizedBaseline[]
  insights: PersonalizedInsight[]
  asOf: number
  updatedAt: number
}
export type MetricSummary = {
  metric: Metric
  text: string
  good: number
  unstable: number
  missing: number
  trend: 'increasing' | 'decreasing' | 'little change' | 'insufficient'
  detail: string
}
export type HealthSummary = {
  period: SummaryPeriod
  start: number
  end: number
  overview: string
  metrics: MetricSummary[]
  activeAlerts: number
  acknowledgedAlerts: number
  resolvedAlerts: number
  activeInsights: number
  resolvedInsights: number
  updatedAt: number
}

const periodMs = { '24h': 86_400_000, '7d': 7 * 86_400_000 } as const
const keys: Metric[] = ['heartRate', 'spo2', 'temperature']
const storedKey = { heartRate: 'heart_rate', spo2: 'spo2', temperature: 'temperature' } as const
const resolution = { heartRate: 1, spo2: 1, temperature: 0.1 } as const
// Value-acceptance bounds mirror the versioned Part 1 metric config in
// 20260927160000_carelink_ai_part1_personalized_insights.sql. They are filters,
// not anomaly, health-alert, readiness or resolution thresholds.
export const PART1_ACCEPTED_RANGES = {
  heartRate: [30, 220],
  spo2: [70, 100],
  temperature: [25, 45],
} as const
const acceptedValue = (value: number | null, metric: Metric): value is number =>
  value !== null &&
  value >= PART1_ACCEPTED_RANGES[metric][0] &&
  value <= PART1_ACCEPTED_RANGES[metric][1]
const qualityForMetric = (row: Measurement, metric: Metric) => {
  const stored =
    metric === 'heartRate'
      ? row.heart_rate_quality
      : metric === 'spo2'
        ? row.spo2_quality
        : row.temperature_quality
  // Fall back only for old packets with no independent quality field.
  return stored ?? row.quality
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const isIn = (date: string | null, start: number, end: number) => {
  if (!date) return false
  const value = Date.parse(date)
  return Number.isFinite(value) && value >= start && value <= end
}

// Descriptive trend, separate from Part 1's anomaly/readiness rules. Both UTC halves need
// >= 3 accepted observations spanning >= 10% of the period; overall span >= 50%.
// A median shift must exceed both sensor resolution and 3 pooled MADs. One outlier
// cannot move a half-window median with three observations.
export function describeTrend(
  values: { time: number; value: number }[],
  metric: Metric,
  start: number,
  end: number,
): MetricSummary['trend'] {
  const duration = end - start
  const midpoint = start + duration / 2
  const accepted = values.filter(
    (row) =>
      Number.isFinite(row.time) &&
      Number.isFinite(row.value) &&
      row.time >= start &&
      row.time <= end,
  )
  const first = accepted.filter((row) => row.time < midpoint).sort((a, b) => a.time - b.time)
  const second = accepted.filter((row) => row.time >= midpoint).sort((a, b) => a.time - b.time)
  if (
    first.length < 3 ||
    second.length < 3 ||
    first.at(-1)!.time - first[0].time < duration * 0.1 ||
    second.at(-1)!.time - second[0].time < duration * 0.1 ||
    second.at(-1)!.time - first[0].time < duration * 0.5
  )
    return 'insufficient'
  const early = median(first.map((row) => row.value))
  const late = median(second.map((row) => row.value))
  const deviations = [...first, ...second].map((row) =>
    Math.abs(row.value - (row.time < midpoint ? early : late)),
  )
  const floor = resolution[metric] * 2
  const threshold = Math.max(floor, 3 * median(deviations))
  const change = late - early
  return change > threshold ? 'increasing' : change < -threshold ? 'decreasing' : 'little change'
}

export function createHealthSummary(source: SummarySource, period: SummaryPeriod): HealthSummary {
  const end = source.asOf
  const start = end - periodMs[period]
  const rows = source.deviceId
    ? source.measurements.filter(
        (row) => row.device_id === source.deviceId && isIn(row.measured_at, start, end),
      )
    : []
  const scoped = <T extends { patient_id: string; device_id: string }>(items: T[]) =>
    source.deviceId
      ? items.filter(
          (item) => item.patient_id === source.patientId && item.device_id === source.deviceId,
        )
      : []
  const alerts = scoped(source.alerts).filter(
    (alert) =>
      alert.alert_type === 'vital' &&
      (alert.status !== 'resolved' || isIn(alert.resolved_at, start, end)),
  )
  const insights = scoped(source.insights).filter(
    (insight) => insight.status === 'active' || isIn(insight.resolved_at, start, end),
  )
  const baselines = scoped(source.baselines)
  const summaries = keys.map((metric): MetricSummary => {
    const label = metrics[metric].label
    const key = storedKey[metric]
    const baseline = baselines.find((row) => row.metric === key)
    const metricInsights = insights.filter((row) => row.metric === key)
    const metricAlerts = alerts.filter((row) => row.metric === key)
    const accepted = rows.flatMap((row) => {
      const mapped = mapMeasurement(row)
      const value = validValue(mapped, metric)
      return acceptedValue(value, metric) && qualityForMetric(row, metric) === 'good'
        ? [{ time: mapped.time, value }]
        : []
    })
    const unstable = rows.filter(
      (row) =>
        qualityForMetric(row, metric) === 'unstable' &&
        acceptedValue(validValue(mapMeasurement(row), metric), metric),
    ).length
    const missing = rows.length - accepted.length - unstable
    const trend = describeTrend(accepted, metric, start, end)
    const parts: string[] = []
    if (!baseline || baseline.readiness !== 'ready' || baseline.baseline_median === null) {
      parts.push(
        `${label} is still learning its personal baseline; more good-quality readings are needed.`,
      )
    } else {
      const value = baseline.baseline_median.toFixed(metrics[metric].decimals)
      parts.push(`${label}'s established personal baseline is ${value} ${metrics[metric].unit}.`)
    }
    if (accepted.length === 0)
      parts.push(`No good-quality ${label.toLowerCase()} readings were available in this period.`)
    else if (trend === 'insufficient')
      parts.push('There is insufficient recent good-quality data for a trend conclusion.')
    else
      parts.push(
        `The reliable readings showed ${trend === 'little change' ? 'little change in their median' : `a ${trend} median`} across this period.`,
      )
    if (unstable)
      parts.push(
        `${unstable} ${unstable === 1 ? 'reading had' : 'readings had'} unstable quality and ${unstable === 1 ? 'was' : 'were'} excluded from the trend.`,
      )
    if (missing)
      parts.push(
        `${missing} ${missing === 1 ? 'reading was' : 'readings were'} missing or unusable for this metric.`,
      )
    const active = metricInsights.filter((row) => row.status === 'active')
    const resolved = metricInsights.filter((row) => row.status === 'resolved')
    if (baseline?.latest_evaluation_state === 'insufficient_recent_data')
      parts.push(
        'CareLink’s latest personalized evaluation had insufficient recent good-quality data for a baseline comparison.',
      )
    if (
      baseline?.latest_evaluation_state === 'usual' &&
      isIn(baseline.latest_evaluated_at, start, end) &&
      !active.length &&
      accepted.length
    )
      parts.push(
        'At the latest personalized evaluation in this period, readings were close to the personal baseline.',
      )
    if (active.length)
      parts.push(
        `CareLink's personalized analysis has ${active.length} active unusual ${label.toLowerCase()} ${active.length === 1 ? 'change' : 'changes'} relative to the personal baseline; last observed ${stamp(Math.max(...active.map((row) => Date.parse(row.last_observed_at))))}.`,
      )
    const verifiedReturn = resolved.filter(
      (row) =>
        baseline?.latest_evaluation_state === 'usual' &&
        baseline.latest_evaluated_at === row.resolved_at &&
        !active.length,
    )
    if (verifiedReturn.length)
      parts.push(
        `CareLink's latest personalized evaluation recorded a return close to the personal baseline at ${stamp(Date.parse(verifiedReturn[0].resolved_at!))}.`,
      )
    if (resolved.length > verifiedReturn.length)
      parts.push(
        `${resolved.length - verifiedReturn.length} personalized ${label.toLowerCase()} ${resolved.length - verifiedReturn.length === 1 ? 'change was' : 'changes were'} resolved during this period; the available latest evaluation does not verify a return to baseline for ${resolved.length - verifiedReturn.length === 1 ? 'it' : 'them'}.`,
      )
    const liveAlerts = metricAlerts.filter((row) => row.status !== 'resolved')
    const resolvedAlerts = metricAlerts.filter((row) => row.status === 'resolved')
    if (liveAlerts.length)
      parts.push(
        `${liveAlerts.length} fixed-rule ${label.toLowerCase()} health ${liveAlerts.length === 1 ? 'alert is' : 'alerts are'} active or acknowledged; last seen ${stamp(Math.max(...liveAlerts.map((row) => Date.parse(row.last_seen_at))))}. Review the Alerts page for status.`,
      )
    if (resolvedAlerts.length)
      parts.push(
        `${resolvedAlerts.length} fixed-rule ${label.toLowerCase()} health ${resolvedAlerts.length === 1 ? 'alert was' : 'alerts were'} resolved during this period. This does not establish a return to the personal baseline.`,
      )
    return {
      metric,
      text: parts.join(' '),
      good: accepted.length,
      unstable,
      missing,
      trend,
      detail: `Good readings: ${accepted.length}. Unstable: ${unstable}. Missing or unusable: ${missing}. Trend: ${trend}. Baseline state: ${baseline?.readiness ?? 'unavailable'}. Latest Part 1 evaluation: ${baseline?.latest_evaluation_state ?? 'unavailable'}.`,
    }
  })
  const activeAlerts = alerts.filter((row) => row.status === 'active').length
  const acknowledgedAlerts = alerts.filter((row) => row.status === 'acknowledged').length
  const resolvedAlerts = alerts.filter((row) => row.status === 'resolved').length
  const activeInsights = insights.filter((row) => row.status === 'active').length
  const resolvedInsights = insights.filter((row) => row.status === 'resolved').length
  const label = period === '24h' ? 'past 24 hours' : 'past 7 days'
  const overview =
    rows.length === 0
      ? `No wearable readings were recorded in the ${label}. No health conclusion can be drawn from this period.`
      : `In the ${label}, ${rows.length} wearable ${rows.length === 1 ? 'reading was' : 'readings were'} recorded. ${activeInsights ? `${activeInsights} personalized ${activeInsights === 1 ? 'change remains' : 'changes remain'} active. ` : ''}${activeAlerts || acknowledgedAlerts ? `${activeAlerts + acknowledgedAlerts} fixed-rule health ${activeAlerts + acknowledgedAlerts === 1 ? 'alert is' : 'alerts are'} active or acknowledged. ` : ''}See each metric for reliable-data coverage and analysis.`
  return {
    period,
    start,
    end,
    overview,
    metrics: summaries,
    activeAlerts,
    acknowledgedAlerts,
    resolvedAlerts,
    activeInsights,
    resolvedInsights,
    updatedAt: source.updatedAt,
  }
}

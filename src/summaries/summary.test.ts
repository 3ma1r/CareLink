import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type {
  Measurement,
  PersonalizedBaseline,
  PersonalizedInsight,
  StoredAlert,
} from '../device/DeviceProvider'
import {
  createHealthSummary,
  describeTrend,
  PART1_ACCEPTED_RANGES,
  SUMMARY_RULE_VERSION,
} from './summary'
import type { SummarySource } from './summary'

const NOW = Date.parse('2026-09-14T12:00:00.000Z')
const PATIENT = 'patient-a'
const DEVICE = 'device-a'
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString()
const reading = (hoursAgo: number, overrides: Partial<Measurement> = {}): Measurement => ({
  id: Math.round(hoursAgo * 100 + 10_000),
  device_id: DEVICE,
  message_id: `m-${hoursAgo}`,
  measured_at: at(hoursAgo),
  received_at: at(hoursAgo),
  heart_rate: 72,
  spo2: 97,
  sensor_temperature: 36.4,
  movement: 0,
  latitude: null,
  longitude: null,
  gps_fix_at: null,
  quality: 'good',
  heart_rate_quality: 'good',
  spo2_quality: 'good',
  temperature_quality: 'good',
  confirmed_fall: false,
  battery_percent: null,
  created_at: at(hoursAgo),
  ...overrides,
})
const baseline = (
  metric: PersonalizedBaseline['metric'],
  overrides: Partial<PersonalizedBaseline> = {},
): PersonalizedBaseline => ({
  id: `base-${metric}`,
  patient_id: PATIENT,
  device_id: DEVICE,
  metric,
  readiness: 'ready',
  sample_count: 40,
  required_sample_count: 30,
  distinct_day_count: 4,
  required_day_count: 3,
  coverage_hours: 72,
  required_coverage_hours: 48,
  baseline_median: metric === 'heart_rate' ? 72 : metric === 'spo2' ? 97 : 36.4,
  median_absolute_deviation: 1,
  robust_scale: 1,
  baseline_window_start: at(72),
  baseline_window_end: at(24),
  baseline_excluded_before: at(24),
  latest_evaluation_state: 'usual',
  latest_recent_sample_count: 3,
  latest_evaluated_at: at(1),
  algorithm_version: 'carelink_personalized_mad_v1',
  calculated_at: at(1),
  updated_at: at(1),
  ...overrides,
})
const insight = (
  status: PersonalizedInsight['status'],
  overrides: Partial<PersonalizedInsight> = {},
): PersonalizedInsight => ({
  id: `insight-${status}`,
  patient_id: PATIENT,
  device_id: DEVICE,
  metric: 'spo2',
  direction: 'lower',
  status,
  confidence: 'high',
  evaluation_window_start: at(4),
  evaluation_window_end: at(3),
  baseline_sample_count: 40,
  recent_sample_count: 3,
  baseline_median: 97,
  recent_median: 93,
  deviation: -4,
  robust_score: 4,
  direction_consistency: 1,
  first_observed_at: at(3),
  last_observed_at: at(3),
  occurrence_count: 1,
  first_source_measurement_id: 1,
  last_source_measurement_id: 1,
  first_evaluation_id: 'e1',
  last_evaluation_id: 'e2',
  resolved_at: status === 'resolved' ? at(1) : null,
  algorithm_version: 'carelink_personalized_mad_v1',
  created_at: at(3),
  updated_at: at(1),
  ...overrides,
})
const alert = (
  status: StoredAlert['status'],
  overrides: Partial<StoredAlert> = {},
): StoredAlert => ({
  id: `alert-${status}`,
  patient_id: PATIENT,
  device_id: DEVICE,
  source_measurement_id: 1,
  rule_id: 'fixed-rule',
  rule_version: 1,
  alert_type: 'vital',
  metric: 'heart_rate',
  severity: 'high',
  title: 'Heart rate alert',
  message: 'Stored fixed rule',
  observed_value: 120,
  unit: 'bpm',
  measurement_quality: 'good',
  threshold_metadata: {},
  measurement_at: at(2),
  first_triggered_at: at(2),
  last_seen_at: at(2),
  occurrence_count: 1,
  status,
  acknowledged_at: null,
  acknowledged_by: null,
  resolved_at: status === 'resolved' ? at(1) : null,
  created_at: at(2),
  updated_at: at(1),
  ...overrides,
})
const source = (overrides: Partial<SummarySource> = {}): SummarySource => ({
  patientId: PATIENT,
  deviceId: DEVICE,
  measurements: [20, 17, 14, 10, 7, 4, 1].map((hour) => reading(hour)),
  baselines: [baseline('heart_rate'), baseline('spo2'), baseline('temperature')],
  insights: [],
  alerts: [],
  asOf: NOW,
  updatedAt: NOW,
  ...overrides,
})

describe('CareLink deterministic health summaries', () => {
  it('uses a versioned rule and all-ready, usual Part 1 results without diagnosis', () => {
    const result = createHealthSummary(source(), '24h')
    expect(SUMMARY_RULE_VERSION).toBe('carelink_summary_v1')
    expect(result.metrics).toHaveLength(3)
    expect(result.metrics.every((metric) => metric.good === 7)).toBe(true)
    expect(result.metrics[0].text).toContain('close to the personal baseline')
    expect(result.overview).not.toMatch(/healthy|safe|diagnos/i)
  })

  it('keeps learning and ready metrics independent', () => {
    const result = createHealthSummary(
      source({
        baselines: [
          baseline('heart_rate', { readiness: 'learning', baseline_median: null }),
          baseline('spo2'),
          baseline('temperature', { readiness: 'learning' }),
        ],
      }),
      '24h',
    )
    expect(result.metrics[0].text).toContain('still learning')
    expect(result.metrics[1].text).toContain('established personal baseline')
    expect(result.metrics[2].text).toContain('still learning')
  })

  it('distinguishes an active personalized change from a fixed-rule alert', () => {
    const result = createHealthSummary(
      source({ insights: [insight('active')], alerts: [alert('active')] }),
      '24h',
    )
    expect(result.activeInsights).toBe(1)
    expect(result.activeAlerts).toBe(1)
    expect(result.metrics[1].text).toContain('relative to the personal baseline')
    expect(result.metrics[0].text).toContain('fixed-rule')
    expect(result.metrics[0].text).not.toContain('returned close')
  })

  it('only asserts a return to baseline when the latest usual evaluation matches resolution', () => {
    const verified = createHealthSummary(
      source({
        insights: [insight('resolved')],
        baselines: [
          baseline('heart_rate'),
          baseline('spo2', { latest_evaluated_at: at(1) }),
          baseline('temperature'),
        ],
      }),
      '24h',
    )
    expect(verified.metrics[1].text).toContain('return close to the personal baseline')
    const reversed = createHealthSummary(
      source({
        insights: [insight('resolved')],
        baselines: [
          baseline('spo2', { latest_evaluation_state: 'unusual', latest_evaluated_at: at(1) }),
        ],
      }),
      '24h',
    )
    expect(reversed.metrics[1].text).toContain('does not verify a return')
  })

  it('excludes unstable and missing values from reliable trends', () => {
    const rows = [
      reading(20, { heart_rate: 200, heart_rate_quality: 'unstable' }),
      reading(17, { heart_rate: null, heart_rate_quality: 'missing' }),
      reading(1),
    ]
    const result = createHealthSummary(source({ measurements: rows }), '24h')
    expect(result.metrics[0]).toMatchObject({
      good: 1,
      unstable: 1,
      missing: 1,
      trend: 'insufficient',
    })
    expect(result.metrics[0].text).toContain('insufficient recent good-quality data')
    expect(result.metrics[0].text).not.toContain('health alert')
  })

  it('honors explicit independent missing quality even when row-level quality is good', () => {
    const result = createHealthSummary(
      source({
        measurements: [
          reading(1, { heart_rate: 72, heart_rate_quality: 'missing', quality: 'good' }),
          reading(2, { spo2_quality: 'unstable', heart_rate_quality: 'good' }),
        ],
      }),
      '24h',
    )
    expect(result.metrics[0]).toMatchObject({ good: 1, missing: 1 })
    expect(result.metrics[1]).toMatchObject({ good: 1, unstable: 1 })
  })

  it('uses the same accepted-value filters as the versioned Part 1 SQL', () => {
    const sql = readFileSync(
      new URL(
        '../../supabase/migrations/20260927160000_carelink_ai_part1_personalized_insights.sql',
        import.meta.url,
      ),
      'utf8',
    )
    for (const [metric, sqlKey] of [
      ['heartRate', 'heart_rate'],
      ['spo2', 'spo2'],
      ['temperature', 'temperature'],
    ] as const) {
      const [minimum, maximum] = PART1_ACCEPTED_RANGES[metric]
      expect(sql).toContain(`'carelink_personalized_mad_v1','${sqlKey}'`)
      expect(sql).toMatch(
        new RegExp(`'carelink_personalized_mad_v1','${sqlKey}',[^\\n]*,${minimum},${maximum},`),
      )
    }
    const result = createHealthSummary(
      source({ measurements: [reading(1, { heart_rate: 25, heart_rate_quality: 'good' })] }),
      '24h',
    )
    expect(result.metrics[0]).toMatchObject({ good: 0, missing: 1, trend: 'insufficient' })
  })

  it('does not let one outlier set a trend', () => {
    const values = [20, 18, 16, 8, 6, 4].map((hour) => ({
      time: Date.parse(at(hour)),
      value: hour === 4 ? 140 : 72,
    }))
    expect(describeTrend(values, 'heartRate', NOW - 24 * 3_600_000, NOW)).toBe('little change')
    expect(describeTrend(values.slice(0, 1), 'heartRate', NOW - 24 * 3_600_000, NOW)).toBe(
      'insufficient',
    )
  })

  it('describes sustained median directions only with enough time-distributed evidence', () => {
    const hours = [20, 18, 16, 8, 6, 4]
    const increasing = hours.map((hour, index) => ({
      time: Date.parse(at(hour)),
      value: index < 3 ? 70 : 80,
    }))
    const decreasing = hours.map((hour, index) => ({
      time: Date.parse(at(hour)),
      value: index < 3 ? 98 : 94,
    }))
    expect(describeTrend(increasing, 'heartRate', NOW - 24 * 3_600_000, NOW)).toBe('increasing')
    expect(describeTrend(decreasing, 'spo2', NOW - 24 * 3_600_000, NOW)).toBe('decreasing')
    expect(
      describeTrend(
        increasing.map((row) => ({ ...row, time: NOW - 60_000 })),
        'heartRate',
        NOW - 24 * 3_600_000,
        NOW,
      ),
    ).toBe('insufficient')
  })

  it('applies inclusive UTC 24-hour and 7-day boundaries', () => {
    const rows = [reading(24), reading(24.001), reading(168), reading(168.001)]
    expect(createHealthSummary(source({ measurements: rows }), '24h').metrics[0].good).toBe(1)
    expect(createHealthSummary(source({ measurements: rows }), '7d').metrics[0].good).toBe(3)
  })

  it('reports acknowledged and in-period resolved fixed alerts without inferring baseline recovery', () => {
    const result = createHealthSummary(
      source({
        alerts: [
          alert('acknowledged'),
          alert('resolved'),
          alert('resolved', { id: 'older', resolved_at: at(30) }),
        ],
      }),
      '24h',
    )
    expect(result.acknowledgedAlerts).toBe(1)
    expect(result.resolvedAlerts).toBe(1)
    expect(result.metrics[0].text).toContain('does not establish a return to the personal baseline')
  })

  it('isolates another patient and device even if the caller passes mixed rows', () => {
    const result = createHealthSummary(
      source({
        measurements: [reading(1, { device_id: 'device-b' })],
        baselines: [baseline('heart_rate', { patient_id: 'patient-b' })],
        insights: [insight('active', { patient_id: 'patient-b' })],
        alerts: [alert('active', { device_id: 'device-b' })],
      }),
      '24h',
    )
    expect(result.metrics[0].good).toBe(0)
    expect(result.metrics[0].text).toContain('still learning')
    expect(result.activeInsights).toBe(0)
    expect(result.activeAlerts).toBe(0)
  })

  it('does not fabricate a conclusion or alerts in an empty production snapshot', () => {
    const result = createHealthSummary(
      source({ measurements: [], alerts: [], insights: [] }),
      '24h',
    )
    expect(result.overview).toContain('No wearable readings')
    expect(result.activeAlerts).toBe(0)
    expect(result.metrics.every((metric) => metric.trend === 'insufficient')).toBe(true)
  })
})

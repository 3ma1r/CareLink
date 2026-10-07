import { describe, expect, it } from 'vitest'
import { alertValue, mapStoredAlert } from './alerts'
import type { StoredAlert } from '../device/DeviceProvider'

const stored: StoredAlert = {
  id: 'alert-1',
  patient_id: 'patient-1',
  device_id: 'device-1',
  source_measurement_id: 42,
  rule_id: 'spo2_low',
  rule_version: 1,
  alert_type: 'vital',
  metric: 'spo2',
  severity: 'critical',
  title: 'Low blood oxygen',
  message: 'A good-quality reading crossed the prototype threshold.',
  observed_value: 88,
  unit: '%',
  measurement_quality: 'good',
  threshold_metadata: { threshold: 90 },
  measurement_at: '2026-09-22T08:00:00Z',
  first_triggered_at: '2026-09-22T07:59:00Z',
  last_seen_at: '2026-09-22T08:00:00Z',
  occurrence_count: 2,
  status: 'active',
  acknowledged_at: null,
  acknowledged_by: null,
  resolved_at: null,
  created_at: '2026-09-22T08:00:01Z',
  updated_at: '2026-09-22T08:00:01Z',
}

describe('stored alert mapping', () => {
  it.each([
    ['temperature_low', 'lt', 22.69, 35, 'Low temperature', '22.7 °C', 'Below 35.0 °C'],
    ['temperature_high', 'gt', 41.97, 38, 'High temperature', '42.0 °C', 'Above 38.0 °C'],
  ])(
    'rebuilds malformed %s prose from unchanged numeric evidence',
    (rule, comparison, value, threshold, title, display, limit) => {
      const row = {
        ...stored,
        metric: 'temperature' as const,
        rule_id: String(rule),
        observed_value: Number(value),
        unit: 'Ã‚Â°C',
        title: 'Sensor temperature',
        message: 'prototype threshold 22.69Ã‚Â°C',
        threshold_metadata: { comparison, threshold },
      }
      const alert = mapStoredAlert(row)
      expect(alert.title).toBe(title)
      expect(alertValue(alert)).toBe(display)
      expect(alert.thresholdText).toBe(limit)
      expect(alert.description).toMatch(/CareLink alert range/)
      expect(alert.description).not.toMatch(/prototype|Ã|Â/)
      expect(alert.observedValue).toBe(value)
      expect(alert.time).toBe(Date.parse(stored.measurement_at))
      expect(row.unit).toBe('Ã‚Â°C')
    },
  )
  it('preserves lifecycle, severity and explainability fields', () => {
    expect(mapStoredAlert(stored)).toMatchObject({
      status: 'Active',
      severity: 'Critical',
      observedValue: 88,
      unit: '%',
      readingId: '42',
      occurrenceCount: 2,
    })
  })
})

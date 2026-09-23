import { describe, expect, it } from 'vitest'
import { mapStoredAlert } from './alerts'
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

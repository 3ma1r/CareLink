import { describe, expect, it } from 'vitest'
import type { Measurement } from './DeviceProvider'
import { findLatestGps, mapMeasurement } from './measurements'

function row(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: 1, device_id: 'device', message_id: 'message-1',
    measured_at: '2026-09-15T08:00:00Z', received_at: '2026-09-15T08:00:02Z',
    heart_rate: 72, spo2: 97, sensor_temperature: 34.4, movement: 12,
    latitude: null, longitude: null, gps_fix_at: null, quality: 'good',
    heart_rate_quality: null, spo2_quality: null, temperature_quality: null,
    battery_percent: null, created_at: '2026-09-15T08:00:02Z', ...overrides,
  }
}

describe('wearable measurement adapter', () => {
  it('preserves unstable numeric values and independent per-metric quality', () => {
    expect(mapMeasurement(row({
      heart_rate: 89.6, quality: 'unstable', heart_rate_quality: 'unstable',
      spo2_quality: 'good', temperature_quality: 'missing', sensor_temperature: null,
    }))).toMatchObject({
      heartRate: 89.6, spo2: 97, temperature: null,
      quality: { heartRate: 'Unstable', spo2: 'Good', temperature: 'Missing' },
    })
  })

  it('maps legacy row quality while treating null metrics as missing', () => {
    expect(mapMeasurement(row({ heart_rate: null, quality: 'unstable' }))).toMatchObject({
      quality: { heartRate: 'Missing', spo2: 'Unstable', temperature: 'Unstable' },
    })
  })

  it('selects the latest valid non-zero GPS fix and ignores invalid coordinates', () => {
    const latest = findLatestGps([
      row({ id: 1, latitude: 23.5, longitude: 58.4, gps_fix_at: '2026-09-15T07:00:00Z' }),
      row({ id: 2, latitude: 0, longitude: 0, gps_fix_at: '2026-09-15T08:00:00Z' }),
    ])
    expect(latest?.id).toBe(1)
  })
})


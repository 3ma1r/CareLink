import { describe, expect, it } from 'vitest'
import type { Measurement } from './DeviceProvider'
import { findLatestGps, mapMeasurement } from './measurements'

function row(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: 1, device_id: 'device', message_id: 'message-1',
    measured_at: '2026-09-15T08:00:00Z', received_at: '2026-09-15T08:00:02Z',
    heart_rate: 72, spo2: 97, sensor_temperature: 34.4, movement: 12,
    latitude: null, longitude: null, gps_fix_at: null, quality: 'good',
    battery_percent: null, created_at: '2026-09-15T08:00:02Z', ...overrides,
  }
}

describe('wearable measurement adapter', () => {
  it('preserves nullable sensor values and excludes unstable values from valid chart data', () => {
    expect(mapMeasurement(row({ heart_rate: null, quality: 'unstable' }))).toMatchObject({
      heartRate: null, spo2: 97,
      quality: { heartRate: 'Unstable', spo2: 'Unstable', temperature: 'Unstable' },
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


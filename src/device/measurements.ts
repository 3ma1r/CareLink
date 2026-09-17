import type { Reading, Quality } from '../data/demo'
import type { Measurement } from './DeviceProvider'

export function mapMeasurement(row: Measurement): Reading {
  const legacyQuality: Quality =
    row.quality === 'good' ? 'Good' : row.quality === 'unstable' ? 'Unstable' : 'Missing'
  const metricQuality = (stored: string | null, value: number | null): Quality => {
    if (value === null || !Number.isFinite(value)) return 'Missing'
    if (stored === 'good') return 'Good'
    if (stored === 'unstable') return 'Unstable'
    return legacyQuality === 'Missing' ? 'Unstable' : legacyQuality
  }
  return {
    id: String(row.id),
    time: Date.parse(row.measured_at),
    heartRate: row.heart_rate,
    spo2: row.spo2,
    temperature: row.sensor_temperature,
    movement: row.movement,
    quality: {
      heartRate: metricQuality(row.heart_rate_quality, row.heart_rate),
      spo2: metricQuality(row.spo2_quality, row.spo2),
      temperature: metricQuality(row.temperature_quality, row.sensor_temperature),
    },
  }
}

export function findLatestGps(rows: Measurement[]): Measurement | undefined {
  return rows.slice().reverse().find((row) =>
    row.latitude !== null && row.longitude !== null && row.gps_fix_at !== null &&
    Number.isFinite(row.latitude) && Number.isFinite(row.longitude) &&
    Math.abs(row.latitude) <= 90 && Math.abs(row.longitude) <= 180 &&
    !(row.latitude === 0 && row.longitude === 0))
}


import type { Reading, Quality } from '../data/demo'
import type { Measurement } from './DeviceProvider'

export function mapMeasurement(row: Measurement): Reading {
  const quality: Quality =
    row.quality === 'good' ? 'Good' : row.quality === 'unstable' ? 'Unstable' : 'Missing'
  return {
    id: String(row.id),
    time: Date.parse(row.measured_at),
    heartRate: row.heart_rate,
    spo2: row.spo2,
    temperature: row.sensor_temperature,
    movement: row.movement,
    quality: { heartRate: quality, spo2: quality, temperature: quality },
  }
}

export function findLatestGps(rows: Measurement[]): Measurement | undefined {
  return rows.slice().reverse().find((row) =>
    row.latitude !== null && row.longitude !== null && row.gps_fix_at !== null &&
    Number.isFinite(row.latitude) && Number.isFinite(row.longitude) &&
    Math.abs(row.latitude) <= 90 && Math.abs(row.longitude) <= 180 &&
    !(row.latitude === 0 && row.longitude === 0))
}


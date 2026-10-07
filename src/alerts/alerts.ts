import type { CareAlert } from '../data/demo'
import type { Measurement, StoredAlert } from '../device/DeviceProvider'
import { formatTemperature } from '../data/format'

export function alertValue(alert: Pick<CareAlert, 'metric' | 'observedValue' | 'unit'>) {
  if (alert.metric === 'temperature') return formatTemperature(alert.observedValue)
  return typeof alert.observedValue === 'number' && Number.isFinite(alert.observedValue)
    ? `${alert.observedValue.toFixed(0)} ${alert.metric === 'heart_rate' ? 'bpm' : alert.metric === 'spo2' ? '%' : ''}`.trim()
    : '—'
}

export function mapStoredAlert(row: StoredAlert, measurement?: Measurement): CareAlert {
  const label =
    row.metric === 'temperature'
      ? 'Temperature'
      : row.metric === 'heart_rate'
        ? 'Heart rate'
        : 'SpO₂'
  const comparison = row.threshold_metadata.comparison
  const direction =
    comparison === 'lt' || row.rule_id.endsWith('_low')
      ? 'Below'
      : comparison === 'gt' || row.rule_id.endsWith('_high')
        ? 'Above'
        : null
  const threshold = row.threshold_metadata.threshold
  const vital = row.alert_type === 'vital'
  const severity =
    row.severity === 'critical' ? 'Critical' : row.severity === 'high' ? 'High' : 'Moderate'
  const status =
    row.status === 'active' ? 'Active' : row.status === 'acknowledged' ? 'Acknowledged' : 'Resolved'
  return {
    id: row.id,
    type: row.alert_type === 'fall' ? 'fall' : 'reading',
    title: vital
      ? `${direction === 'Below' ? 'Low' : direction === 'Above' ? 'High' : 'Unusual'} ${label.toLowerCase()}`
      : 'Fall alert',
    description: vital
      ? `${label} ${direction === 'Below' ? 'dropped below' : direction === 'Above' ? 'rose above' : 'crossed'} the CareLink alert range.`
      : 'A fall signal needs your attention.',
    thresholdText:
      vital && direction && typeof threshold === 'number' && Number.isFinite(threshold)
        ? `${direction} ${alertValue({ metric: row.metric, observedValue: threshold })}`
        : undefined,
    severity,
    status,
    time: Date.parse(row.measurement_at),
    alertTime: Date.parse(row.created_at),
    firstTriggeredAt: Date.parse(row.first_triggered_at),
    lastSeenAt: Date.parse(row.last_seen_at),
    occurrenceCount: row.occurrence_count,
    observedValue: row.observed_value,
    unit:
      row.metric === 'temperature'
        ? '\u00b0C'
        : row.metric === 'heart_rate'
          ? 'bpm'
          : row.metric === 'spo2'
            ? '%'
            : null,
    metric: row.metric,
    ruleId: row.rule_id,
    ruleVersion: row.rule_version,
    readingId: String(row.source_measurement_id),
    deviceId: row.device_id,
    acknowledgedAt: row.acknowledged_at ? Date.parse(row.acknowledged_at) : null,
    resolvedAt: row.resolved_at ? Date.parse(row.resolved_at) : null,
    gpsTime: measurement?.gps_fix_at ? Date.parse(measurement.gps_fix_at) : null,
    coordinates:
      measurement?.latitude != null && measurement.longitude != null
        ? [measurement.latitude, measurement.longitude]
        : null,
  }
}

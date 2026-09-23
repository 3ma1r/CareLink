import type { CareAlert } from '../data/demo'
import type { Measurement, StoredAlert } from '../device/DeviceProvider'

export function mapStoredAlert(row: StoredAlert, measurement?: Measurement): CareAlert {
  const severity =
    row.severity === 'critical' ? 'Critical' : row.severity === 'high' ? 'High' : 'Moderate'
  const status =
    row.status === 'active' ? 'Active' : row.status === 'acknowledged' ? 'Acknowledged' : 'Resolved'
  return {
    id: row.id,
    type: row.alert_type === 'fall' ? 'fall' : 'reading',
    title: row.title,
    description: row.message,
    severity,
    status,
    time: Date.parse(row.measurement_at),
    alertTime: Date.parse(row.created_at),
    firstTriggeredAt: Date.parse(row.first_triggered_at),
    lastSeenAt: Date.parse(row.last_seen_at),
    occurrenceCount: row.occurrence_count,
    observedValue: row.observed_value,
    unit: row.unit,
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

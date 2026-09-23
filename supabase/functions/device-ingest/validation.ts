export function validReading(v: unknown) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const x = v as Record<string, unknown>
  if (
    typeof x.message_id !== 'string' ||
    x.message_id.length < 8 ||
    x.message_id.length > 80 ||
    typeof x.measured_at !== 'string'
  )
    return false
  if (!['good', 'unstable', 'missing'].includes(String(x.quality ?? 'missing'))) return false
  if (x.confirmed_fall != null && typeof x.confirmed_fall !== 'boolean') return false
  const range = (key: string, minimum: number, maximum: number) =>
    x[key] == null ||
    (typeof x[key] === 'number' &&
      Number.isFinite(x[key]) &&
      x[key] >= minimum &&
      x[key] <= maximum)
  if (
    !range('heart_rate', 20, 250) ||
    !range('spo2', 50, 100) ||
    !range('sensor_temperature', -20, 85) ||
    !range('movement', 0, 1e6) ||
    !range('battery_percent', 0, 100)
  )
    return false
  const qualityKeys = ['heart_rate_quality', 'spo2_quality', 'temperature_quality']
  const supplied = qualityKeys.filter((key) => x[key] != null)
  if (supplied.length !== 0 && supplied.length !== qualityKeys.length) return false
  if (supplied.length) {
    const qualities = qualityKeys.map((key) => String(x[key]))
    if (qualities.some((quality) => !['good', 'unstable', 'missing'].includes(quality)))
      return false
    const valueKeys = ['heart_rate', 'spo2', 'sensor_temperature']
    if (
      qualities.some((quality, index) => (x[valueKeys[index]] == null) !== (quality === 'missing'))
    )
      return false
    const expected = qualities.every((quality) => quality === 'missing')
      ? 'missing'
      : qualities.every((quality) => quality === 'good')
        ? 'good'
        : 'unstable'
    if (String(x.quality ?? 'missing') !== expected) return false
  }
  const hasLat = x.latitude != null
  const hasLng = x.longitude != null
  const hasFix = x.gps_fix_at != null
  if (hasLat || hasLng || hasFix) {
    if (!(
      hasLat &&
      hasLng &&
      hasFix &&
      range('latitude', -90, 90) &&
      range('longitude', -180, 180) &&
      typeof x.gps_fix_at === 'string'
    ))
      return false
  }
  const time = Date.parse(x.measured_at)
  return (
    Number.isFinite(time) && time >= Date.now() - 30 * 86400000 && time <= Date.now() + 5 * 60000
  )
}

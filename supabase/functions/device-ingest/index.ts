import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { clients, json } from '../_shared/server.ts'

const MAX_BYTES = 32768,
  MAX_BATCH = 10
function validReading(v: unknown) {
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
  const range = (k: string, min: number, max: number) =>
    x[k] == null ||
    (typeof x[k] === 'number' && Number.isFinite(x[k]) && x[k] >= min && x[k] <= max)
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
  const hasLat = x.latitude != null,
    hasLng = x.longitude != null,
    hasFix = x.gps_fix_at != null
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
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (req.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return json({ error: 'JSON required' }, 415)
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES)
    return json({ error: 'Request too large' }, 413)
  const identifier = req.headers.get('x-carelink-device-id') ?? ''
  const authorization = req.headers.get('authorization') ?? ''
  const credential = authorization.startsWith('Device ') ? authorization.slice(7) : ''
  if (!/^CL-[A-Z0-9]{12}$/.test(identifier) || !/^[a-f0-9]{64}$/.test(credential))
    return json({ error: 'Device authentication failed' }, 401)
  let text = ''
  try {
    text = await req.text()
  } catch {
    return json({ error: 'Invalid request' }, 400)
  }
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    return json({ error: 'Request too large' }, 413)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const measurements = body.measurements
  if (
    !Array.isArray(measurements) ||
    measurements.length < 1 ||
    measurements.length > MAX_BATCH ||
    !measurements.every(validReading) ||
    typeof (body.firmware_version ?? '') !== 'string' ||
    String(body.firmware_version ?? '').length > 40
  )
    return json({ error: 'Invalid measurement payload' }, 400)
  const { admin } = clients()
  const result = await admin.rpc('ingest_carelink_measurements', {
    p_device_identifier: identifier,
    p_device_credential: credential,
    p_firmware_version: String(body.firmware_version ?? ''),
    p_measurements: measurements,
  })
  if (result.error || !result.data?.ok) {
    if (result.data?.invalid_payload) return json({ error: 'Invalid measurement payload' }, 400)
    return json({ error: 'Device authentication failed' }, 401)
  }
  return json({ inserted: result.data.inserted, duplicates: result.data.duplicates }, 200)
})

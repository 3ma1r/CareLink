import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { clients, json } from '../_shared/server.ts'
import { validReading } from './validation.ts'

const MAX_BYTES = 32768,
  MAX_BATCH = 10
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

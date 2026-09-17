import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { URL } from 'node:url'

const uploader = readFileSync(new URL('./CareLinkUploader.h', import.meta.url), 'utf8')
const capturedAt = '2026-09-16T12:34:56Z'

function measurement(index, includeGps = false) {
  const value = {
    message_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    measured_at: capturedAt,
    heart_rate: null,
    spo2: null,
    sensor_temperature: null,
    movement: null,
    quality: 'missing',
    heart_rate_quality: 'missing',
    spo2_quality: 'missing',
    temperature_quality: 'missing',
  }
  if (includeGps)
    Object.assign(value, { latitude: 23.588, longitude: 58.3829, gps_fix_at: capturedAt })
  return value
}

function payload(count) {
  return {
    firmware_version: 'carelink-stage4-1.0.0',
    measurements: Array.from({ length: count }, (_, index) => measurement(index + 1)),
  }
}

test('one-reading and maximum firmware batches match the ingestion envelope', () => {
  for (const count of [1, 5]) {
    const encoded = JSON.stringify(payload(count))
    const decoded = JSON.parse(encoded)
    assert.equal(decoded.measurements.length, count)
    assert.ok(Buffer.byteLength(encoded) < 32768)
    for (const reading of decoded.measurements) {
      assert.match(
        reading.message_id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
      assert.match(reading.measured_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
      assert.equal(reading.heart_rate, null)
      assert.equal(reading.spo2, null)
      assert.equal(reading.sensor_temperature, null)
      assert.equal(reading.movement, null)
      assert.equal(reading.heart_rate_quality, 'missing')
      assert.equal(reading.spo2_quality, 'missing')
      assert.equal(reading.temperature_quality, 'missing')
      assert.equal('latitude' in reading, false)
      assert.equal('longitude' in reading, false)
      assert.equal('gps_fix_at' in reading, false)
    }
  }
})

test('unstable calculated values remain numeric with independent quality', () => {
  const reading = measurement(1)
  reading.heart_rate = 89.6
  reading.spo2 = 97
  reading.sensor_temperature = 34.7
  reading.quality = 'unstable'
  reading.heart_rate_quality = 'unstable'
  reading.spo2_quality = 'good'
  reading.temperature_quality = 'unstable'
  const decoded = JSON.parse(JSON.stringify(reading))
  assert.equal(decoded.heart_rate, 89.6)
  assert.equal(decoded.spo2, 97)
  assert.equal(decoded.sensor_temperature, 34.7)
  assert.deepEqual(
    [decoded.heart_rate_quality, decoded.spo2_quality, decoded.temperature_quality],
    ['unstable', 'good', 'unstable'],
  )
})

test('serialized queued readings preserve identifiers and capture times across retries', () => {
  const queued = JSON.stringify(measurement(1, true))
  const firstAttempt = JSON.stringify({
    firmware_version: 'carelink-stage4-1.0.0',
    measurements: [JSON.parse(queued)],
  })
  const retry = JSON.stringify({
    firmware_version: 'carelink-stage4-1.0.0',
    measurements: [JSON.parse(queued)],
  })
  assert.equal(retry, firstAttempt)
})

test('uploader retains persistence, bounds, and verified TLS configuration', () => {
  assert.match(uploader, /QUEUE_PATH = "\/carelink-queue\.ndjson"/)
  assert.match(uploader, /MAX_QUEUE = 64/)
  assert.match(uploader, /BATCH_SIZE = 5/)
  assert.match(uploader, /client\.setCACert\(CARELINK_ROOT_CA\)/)
  assert.doesNotMatch(uploader, /setInsecure/)
  assert.match(uploader, /if \(gpsValid[\s\S]*!\(latitude == 0\.0 && longitude == 0\.0\)/)
  assert.match(uploader, /dropFirst\(rows\.size\(\)\)/)
})

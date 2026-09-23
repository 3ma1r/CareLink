import { describe, expect, it } from 'vitest'
import { validReading } from '../../supabase/functions/device-ingest/validation'

const valid = {
  message_id: 'stage5a-test-message',
  measured_at: new Date().toISOString(),
  heart_rate: 72,
  spo2: 97,
  sensor_temperature: 36.5,
  quality: 'good',
  heart_rate_quality: 'good',
  spo2_quality: 'good',
  temperature_quality: 'good',
}

describe('device-ingest Stage 5A validation', () => {
  it('keeps existing packets compatible and accepts a boolean confirmed fall', () => {
    expect(validReading(valid)).toBe(true)
    expect(validReading({ ...valid, confirmed_fall: false })).toBe(true)
    expect(validReading({ ...valid, confirmed_fall: true })).toBe(true)
  })

  it('rejects non-boolean confirmed fall values', () => {
    expect(validReading({ ...valid, confirmed_fall: 'true' })).toBe(false)
    expect(validReading({ ...valid, confirmed_fall: 1 })).toBe(false)
  })
})

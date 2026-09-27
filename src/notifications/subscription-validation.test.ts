import { describe, expect, it } from 'vitest'
import { validEndpoint, validLabel, validSubscription } from '../../supabase/functions/push-subscriptions/validation'

describe('push subscription input validation', () => {
  const valid = { endpoint: 'https://push.example/subscription/opaque-value', keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(22) } }
  it('accepts a bounded HTTPS Web Push subscription', () => expect(validSubscription(valid)).toBe(true))
  it('rejects insecure endpoints and malformed keys', () => {
    expect(validEndpoint('http://push.example/subscription/opaque-value')).toBe(false)
    expect(validSubscription({ ...valid, keys: { ...valid.keys, auth: 'not valid!' } })).toBe(false)
  })
  it('bounds optional browser labels', () => {
    expect(validLabel(undefined)).toBe(true)
    expect(validLabel('Android browser')).toBe(true)
    expect(validLabel('x'.repeat(81))).toBe(false)
  })
})

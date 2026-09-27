import { describe, expect, it, vi } from 'vitest'
import { base64UrlEncode } from '../../supabase/functions/_shared/webpush'
import { classifyPushResponse, MAX_PUSH_ATTEMPTS, sendClaimedDelivery } from '../../supabase/functions/push-worker/worker'

async function keys() {
  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const receiverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))
  const vapidPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const vapidPublic = new Uint8Array(await crypto.subtle.exportKey('raw', vapidPair.publicKey))
  const vapidPrivate = await crypto.subtle.exportKey('jwk', vapidPair.privateKey)
  return {
    target: { delivery_id: crypto.randomUUID(), subscription_id: crypto.randomUUID(), attempt_number: 1, endpoint: 'https://push.example/send/opaque', p256dh: base64UrlEncode(receiverPublic), auth_key: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))) },
    vapid: { publicKey: base64UrlEncode(vapidPublic), privateKey: vapidPrivate.d!, subject: 'mailto:push@example.test' },
  }
}

describe('push delivery worker', () => {
  it('classifies success, expired endpoints, temporary failures, and the retry cap', () => {
    expect(classifyPushResponse(201, 1).outcome).toBe('delivered')
    expect(classifyPushResponse(410, 1)).toMatchObject({ outcome: 'permanent_failure', errorCategory: 'expired_endpoint' })
    expect(classifyPushResponse(503, 2)).toMatchObject({ outcome: 'retryable', errorCategory: 'temporary' })
    expect(classifyPushResponse(503, MAX_PUSH_ATTEMPTS)).toMatchObject({ outcome: 'permanent_failure', errorCategory: 'max_attempts' })
  })

  it('encrypts a fixed safe payload and uses VAPID when posting to the push endpoint', async () => {
    const fixture = await keys()
    const send = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect((init?.headers as Record<string,string>).Authorization).toMatch(/^vapid t=/)
      expect((init?.headers as Record<string,string>)['Content-Encoding']).toBe('aes128gcm')
      expect((init?.body as Uint8Array).byteLength).toBeGreaterThan(90)
      return new Response(null, { status: 201 })
    })
    await expect(sendClaimedDelivery(fixture.target, fixture.vapid, send)).resolves.toMatchObject({ outcome: 'delivered' })
    expect(send).toHaveBeenCalledOnce()
  })

  it('treats a mocked network failure as retryable until the maximum attempt', async () => {
    const fixture = await keys()
    const send = vi.fn(async () => { throw new Error('network') })
    await expect(sendClaimedDelivery(fixture.target, fixture.vapid, send)).resolves.toMatchObject({ outcome: 'retryable' })
    await expect(sendClaimedDelivery({ ...fixture.target, attempt_number: MAX_PUSH_ATTEMPTS }, fixture.vapid, send)).resolves.toMatchObject({ outcome: 'permanent_failure', errorCategory: 'max_attempts' })
  })
})

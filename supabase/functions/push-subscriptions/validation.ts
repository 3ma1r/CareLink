export type SubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

function base64Url(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string'
    && value.length >= minimum
    && value.length <= maximum
    && /^[A-Za-z0-9_-]+={0,2}$/.test(value)
}

export function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 2048) return false
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export function validSubscription(value: unknown): value is SubscriptionInput {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  return validEndpoint(candidate.endpoint)
    && !!candidate.keys
    && base64Url(candidate.keys.p256dh, 40, 180)
    && base64Url(candidate.keys.auth, 12, 80)
}

export function validLabel(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 80)
}

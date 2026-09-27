import { createWebPushRequest } from '../_shared/webpush.ts'
import type { PushTarget, VapidConfiguration } from '../_shared/webpush.ts'

export const MAX_PUSH_ATTEMPTS = 5

export type ClaimedDelivery = PushTarget & {
  delivery_id: string
  subscription_id: string
  attempt_number: number
}

export type DeliveryOutcome = {
  outcome: 'delivered' | 'retryable' | 'permanent_failure'
  httpStatus: number | null
  errorCategory: 'temporary' | 'expired_endpoint' | 'invalid_request' | 'configuration' | 'max_attempts' | null
}

export function classifyPushResponse(status: number, attempt: number): DeliveryOutcome {
  if (status >= 200 && status < 300) return { outcome: 'delivered', httpStatus: status, errorCategory: null }
  if (status === 404 || status === 410) return { outcome: 'permanent_failure', httpStatus: status, errorCategory: 'expired_endpoint' }
  if (status === 400 || status === 401 || status === 403 || status === 413) {
    return { outcome: 'permanent_failure', httpStatus: status, errorCategory: 'invalid_request' }
  }
  if (attempt >= MAX_PUSH_ATTEMPTS) return { outcome: 'permanent_failure', httpStatus: status, errorCategory: 'max_attempts' }
  return { outcome: 'retryable', httpStatus: status, errorCategory: 'temporary' }
}

export async function sendClaimedDelivery(
  delivery: ClaimedDelivery,
  vapid: VapidConfiguration,
  send: typeof fetch = fetch,
): Promise<DeliveryOutcome> {
  try {
    const request = await createWebPushRequest(delivery, vapid)
    const response = await send(delivery.endpoint, { method: 'POST', headers: request.headers, body: request.body })
    return classifyPushResponse(response.status, delivery.attempt_number)
  } catch {
    if (delivery.attempt_number >= MAX_PUSH_ATTEMPTS) {
      return { outcome: 'permanent_failure', httpStatus: null, errorCategory: 'max_attempts' }
    }
    return { outcome: 'retryable', httpStatus: null, errorCategory: 'temporary' }
  }
}

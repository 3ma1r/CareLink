import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { clients, json } from '../_shared/server.ts'
import { sendClaimedDelivery } from './worker.ts'
import type { ClaimedDelivery } from './worker.ts'

function bearer(req: Request) {
  const value = req.headers.get('authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}

function sameSecret(left: string, right: string) {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const workerSecret = Deno.env.get('PUSH_WORKER_SECRET') ?? ''
  if (!workerSecret || !sameSecret(bearer(req), workerSecret)) return json({ error: 'Authentication required' }, 401)

  const vapid = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? '',
  }
  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) return json({ error: 'Push delivery is not configured' }, 503)

  const { admin } = clients()
  const workerToken = crypto.randomUUID()
  const claimed = await admin.rpc('claim_carelink_push_deliveries', { p_worker_token: workerToken, p_limit: 20 })
  if (claimed.error) return json({ error: 'Unable to claim deliveries' }, 500)

  const summary = { claimed: claimed.data?.length ?? 0, delivered: 0, retryable: 0, permanent_failure: 0 }
  for (const delivery of (claimed.data ?? []) as ClaimedDelivery[]) {
    const outcome = await sendClaimedDelivery(delivery, vapid)
    const completed = await admin.rpc('complete_carelink_push_delivery', {
      p_delivery_id: delivery.delivery_id,
      p_worker_token: workerToken,
      p_outcome: outcome.outcome,
      p_http_status: outcome.httpStatus,
      p_error_category: outcome.errorCategory,
    })
    if (!completed.error && completed.data) summary[outcome.outcome] += 1
  }
  return json(summary)
})

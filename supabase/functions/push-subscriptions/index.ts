import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { clients, corsForConfiguredOrigins, json } from '../_shared/server.ts'
import { validEndpoint, validLabel, validSubscription } from './validation.ts'

Deno.serve(async (req: Request) => {
  const corsHeaders = corsForConfiguredOrigins(req)
  if (req.method === 'OPTIONS') {
    if (!('Access-Control-Allow-Origin' in corsHeaders)) return json({ error: 'Origin not allowed' }, 403, corsHeaders)
    return new Response(null, { status: 204, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } })
  }
  if (!('Access-Control-Allow-Origin' in corsHeaders)) return json({ error: 'Origin not allowed' }, 403, corsHeaders)

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders)
    if (req.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'JSON required' }, 415, corsHeaders)
    const authorization = req.headers.get('authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401, corsHeaders)
    const { user, admin } = clients(authorization)
    const verified = await user.auth.getUser()
    if (verified.error || !verified.data.user) return json({ error: 'Authentication required' }, 401, corsHeaders)

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400, corsHeaders) }
    const caregiverId = verified.data.user.id

    if (body.action === 'status') {
      if (!validEndpoint(body.endpoint)) return json({ error: 'Invalid request' }, 400, corsHeaders)
      const result = await admin.from('push_subscriptions').select('active')
        .eq('caregiver_id', caregiverId).eq('endpoint', body.endpoint).maybeSingle()
      if (result.error) return json({ error: 'Unable to check notification status' }, 500, corsHeaders)
      return json({ registered: result.data?.active === true }, 200, corsHeaders)
    }

    if (body.action === 'unregister') {
      if (!validEndpoint(body.endpoint)) return json({ error: 'Invalid request' }, 400, corsHeaders)
      const result = await admin.from('push_subscriptions').update({ active: false, revoked_at: new Date().toISOString() })
        .eq('caregiver_id', caregiverId).eq('endpoint', body.endpoint)
      if (result.error) return json({ error: 'Unable to disable notifications' }, 500, corsHeaders)
      return json({ ok: true }, 200, corsHeaders)
    }

    if (body.action === 'register') {
      if (!validSubscription(body.subscription) || !validLabel(body.device_label)) {
        return json({ error: 'Invalid subscription' }, 400, corsHeaders)
      }
      const subscription = body.subscription
      const existing = await admin.from('push_subscriptions').select('caregiver_id')
        .eq('endpoint', subscription.endpoint).maybeSingle()
      if (existing.error) return json({ error: 'Unable to enable notifications' }, 500, corsHeaders)
      if (existing.data && existing.data.caregiver_id !== caregiverId) {
        return json({ error: 'This browser subscription belongs to another account. Disable browser notifications, then try again.' }, 409, corsHeaders)
      }
      const values = {
        caregiver_id: caregiverId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        device_label: typeof body.device_label === 'string' ? body.device_label.trim() : null,
        active: true,
        revoked_at: null,
        failure_count: 0,
      }
      const result = existing.data
        ? await admin.from('push_subscriptions').update(values).eq('caregiver_id', caregiverId).eq('endpoint', subscription.endpoint)
        : await admin.from('push_subscriptions').insert(values)
      if (result.error) return json({ error: 'Unable to enable notifications' }, 500, corsHeaders)
      return json({ ok: true }, 200, corsHeaders)
    }

    return json({ error: 'Invalid request' }, 400, corsHeaders)
  } catch {
    return json({ error: 'Unable to manage notifications' }, 500, corsHeaders)
  }
})

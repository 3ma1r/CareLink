import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { browserLabel, decodeApplicationServerKey, notificationCapability, requestPermissionAfterUserAction } from './platform'

export type NotificationStatus =
  | 'loading' | 'unsupported' | 'ios-install-required' | 'not-requested'
  | 'enabled' | 'denied' | 'expired' | 'unavailable' | 'error'

type Result = { error: string | null }
type Context = {
  status: NotificationStatus
  busy: boolean
  error: string | null
  enable(): Promise<Result>
  disable(): Promise<Result>
  refresh(): Promise<void>
}

const NotificationContext = createContext<Context | null>(null)
const publicKey = import.meta.env.VITE_CARELINK_VAPID_PUBLIC_KEY?.trim() ?? ''

function capability() {
  const standalone = matchMedia('(display-mode: standalone)').matches
  return notificationCapability(
    navigator,
    standalone,
    'Notification' in window,
    'PushManager' in window,
    'serviceWorker' in navigator,
  )
}

async function invoke(body: Record<string, unknown>) {
  if (!supabase) throw new Error('CareLink is not configured.')
  const result = await supabase.functions.invoke('push-subscriptions', { body })
  if (result.error) throw new Error('The notification service could not complete the request.')
  return result.data as Record<string, unknown>
}

function subscriptionBody(subscription: PushSubscription) {
  const value = subscription.toJSON()
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) throw new Error('The browser returned an incomplete push subscription.')
  return { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [status, setStatus] = useState<NotificationStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (auth.status !== 'signed-in') { setStatus('loading'); setError(null); return }
    if (auth.testMode) {
      const testStatus = localStorage.getItem('carelink-test-push') as NotificationStatus | null
      setStatus(testStatus ?? 'not-requested'); setError(testStatus === 'error' ? 'Temporary notification service error.' : null); return
    }
    const support = capability()
    if (support !== 'supported') { setStatus(support); setError(null); return }
    if (Notification.permission === 'denied') { setStatus('denied'); setError(null); return }
    if (Notification.permission === 'default') { setStatus('not-requested'); setError(null); return }
    if (!publicKey) { setStatus('unavailable'); setError('Push notifications are not configured for this deployment.'); return }
    try {
      const installed = await navigator.serviceWorker.getRegistration()
      if (!installed) { setStatus('expired'); setError(null); return }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) { setStatus('expired'); setError(null); return }
      const data = await invoke({ action: 'status', endpoint: subscription.endpoint })
      setStatus(data.registered === true ? 'enabled' : 'expired')
      setError(null)
    } catch {
      setStatus('error'); setError('CareLink could not check notification status. Try again when you are online.')
    }
  }, [auth.status, auth.testMode])

  useEffect(() => { void refresh() }, [refresh, auth.user?.id])

  const enable = useCallback(async (): Promise<Result> => {
    if (auth.testMode) {
      setBusy(true); localStorage.setItem('carelink-test-push', 'enabled'); setStatus('enabled'); setError(null); setBusy(false)
      return { error: null }
    }
    const support = capability()
    if (support !== 'supported') { setStatus(support); return { error: 'Push notifications are unavailable on this browser.' } }
    if (!publicKey) { const message = 'Push notifications are not configured for this deployment.'; setStatus('unavailable'); setError(message); return { error: message } }
    setBusy(true); setError(null)
    try {
      const permission = await requestPermissionAfterUserAction(Notification.permission, () => Notification.requestPermission())
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'denied' : 'not-requested'); return { error: permission === 'denied' ? 'Notifications are blocked in browser settings.' : null } }
      const installed = await navigator.serviceWorker.getRegistration()
      if (!installed) throw new Error('Service worker is not registered')
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(publicKey) as BufferSource,
      })
      await invoke({ action: 'register', subscription: subscriptionBody(subscription), device_label: browserLabel(navigator) })
      setStatus('enabled')
      return { error: null }
    } catch {
      const message = 'CareLink could not enable notifications. Check your connection and try again.'
      setStatus('error'); setError(message); return { error: message }
    } finally { setBusy(false) }
  }, [auth.testMode])

  const disable = useCallback(async (): Promise<Result> => {
    if (auth.testMode) {
      localStorage.setItem('carelink-test-push', 'not-requested'); setStatus('not-requested'); setError(null)
      return { error: null }
    }
    const support = capability()
    if (support !== 'supported') { setStatus(support); return { error: null } }
    setBusy(true); setError(null)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) { setStatus(Notification.permission === 'denied' ? 'denied' : 'not-requested'); return { error: null } }
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) { setStatus(Notification.permission === 'denied' ? 'denied' : 'not-requested'); return { error: null } }
      await invoke({ action: 'unregister', endpoint: subscription.endpoint })
      const removed = await subscription.unsubscribe()
      if (!removed) throw new Error('Browser subscription could not be removed')
      setStatus('not-requested')
      return { error: null }
    } catch {
      const message = 'CareLink could not fully disable notifications. Try again before signing out.'
      setStatus('error'); setError(message); return { error: message }
    } finally { setBusy(false) }
  }, [auth.testMode])

  const value = useMemo(() => ({ status, busy, error, enable, disable, refresh }), [status, busy, error, enable, disable, refresh])
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const value = useContext(NotificationContext)
  if (!value) throw new Error('NotificationProvider is required')
  return value
}

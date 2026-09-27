/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { focusOrOpenAlerts, PUSH_NOTIFICATION_BODY, PUSH_NOTIFICATION_ROUTE, PUSH_NOTIFICATION_TITLE } from './notifications/serviceWorkerHelpers'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string } | string> }

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification(PUSH_NOTIFICATION_TITLE, {
    body: PUSH_NOTIFICATION_BODY,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { route: PUSH_NOTIFICATION_ROUTE },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    await focusOrOpenAlerts(self.location.origin, windows, (url) => self.clients.openWindow(url))
  })())
})

export {}

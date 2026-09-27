export type NotificationCapability = 'supported' | 'unsupported' | 'ios-install-required'

type PlatformNavigator = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> & {
  standalone?: boolean
}

export function isIosDevice(navigatorValue: PlatformNavigator) {
  return /iPad|iPhone|iPod/.test(navigatorValue.userAgent)
    || (navigatorValue.platform === 'MacIntel' && navigatorValue.maxTouchPoints > 1)
}

export function notificationCapability(
  navigatorValue: PlatformNavigator,
  standaloneDisplay: boolean,
  hasNotification: boolean,
  hasPushManager: boolean,
  hasServiceWorker: boolean,
): NotificationCapability {
  if (isIosDevice(navigatorValue) && !standaloneDisplay && !navigatorValue.standalone) {
    return 'ios-install-required'
  }
  return hasNotification && hasPushManager && hasServiceWorker ? 'supported' : 'unsupported'
}

export function decodeApplicationServerKey(value: string) {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  const raw = atob(padded)
  const decoded = Uint8Array.from(raw, (character) => character.charCodeAt(0))
  if (decoded.length !== 65 || decoded[0] !== 4) throw new Error('Invalid VAPID public key')
  return decoded
}

export function browserLabel(navigatorValue: PlatformNavigator) {
  if (isIosDevice(navigatorValue)) return 'iPhone or iPad Home Screen'
  if (/Android/i.test(navigatorValue.userAgent)) return 'Android browser'
  return 'Desktop browser'
}

export async function requestPermissionAfterUserAction(
  current: NotificationPermission,
  request: () => Promise<NotificationPermission>,
) {
  return current === 'default' ? request() : current
}

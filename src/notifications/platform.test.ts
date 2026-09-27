import { describe, expect, it, vi } from 'vitest'
import { decodeApplicationServerKey, notificationCapability, requestPermissionAfterUserAction } from './platform'

const desktop = { userAgent: 'Desktop', platform: 'Win32', maxTouchPoints: 0 }
const iphone = { userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', maxTouchPoints: 5 }

describe('notification platform states', () => {
  it('requires an iPhone or iPad app to be launched from the Home Screen', () => {
    expect(notificationCapability(iphone, false, true, true, true)).toBe('ios-install-required')
    expect(notificationCapability({ ...iphone, standalone: true }, false, true, true, true)).toBe('supported')
  })

  it('reports missing browser APIs without requesting permission', () => {
    expect(notificationCapability(desktop, false, true, false, true)).toBe('unsupported')
    expect(notificationCapability(desktop, false, true, true, true)).toBe('supported')
  })

  it('requests permission only from the explicit-action helper when permission is undecided', async () => {
    const request = vi.fn(async () => 'granted' as NotificationPermission)
    await expect(requestPermissionAfterUserAction('default', request)).resolves.toBe('granted')
    expect(request).toHaveBeenCalledOnce()
    request.mockClear()
    await expect(requestPermissionAfterUserAction('denied', request)).resolves.toBe('denied')
    expect(request).not.toHaveBeenCalled()
  })

  it('accepts only an uncompressed P-256 application server key', () => {
    const valid = new Uint8Array(65); valid[0] = 4
    const encoded = btoa(String.fromCharCode(...valid)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeApplicationServerKey(encoded)).toEqual(valid)
    expect(() => decodeApplicationServerKey('not-a-key')).toThrow()
  })
})

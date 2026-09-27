import { describe, expect, it, vi } from 'vitest'
import { focusOrOpenAlerts, PUSH_NOTIFICATION_BODY, PUSH_NOTIFICATION_ROUTE, PUSH_NOTIFICATION_TITLE } from './serviceWorkerHelpers'

describe('push notification privacy and routing', () => {
  it('uses fixed text with no patient or measurement detail', () => {
    expect(PUSH_NOTIFICATION_TITLE).toBe('CareLink health alert')
    expect(PUSH_NOTIFICATION_BODY).toBe('A new health alert needs your attention.')
    expect(`${PUSH_NOTIFICATION_TITLE} ${PUSH_NOTIFICATION_BODY}`).not.toMatch(/bpm|SpO|temperature|patient|Ahmed/i)
    expect(PUSH_NOTIFICATION_ROUTE).toBe('/alerts')
  })

  it('focuses an existing CareLink window and navigates to alerts', async () => {
    const focus = vi.fn(async () => undefined)
    const navigate = vi.fn(async () => undefined)
    const open = vi.fn(async () => undefined)
    await expect(focusOrOpenAlerts('https://care.example', [{ url: 'https://care.example/profile', focus, navigate }], open)).resolves.toBe('focused')
    expect(navigate).toHaveBeenCalledWith('https://care.example/alerts')
    expect(focus).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()
  })

  it('opens alerts when no CareLink window exists', async () => {
    const open = vi.fn(async () => undefined)
    await expect(focusOrOpenAlerts('https://care.example', [], open)).resolves.toBe('opened')
    expect(open).toHaveBeenCalledWith('https://care.example/alerts')
  })
})

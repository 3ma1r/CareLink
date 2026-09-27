export const PUSH_NOTIFICATION_TITLE = 'CareLink health alert'
export const PUSH_NOTIFICATION_BODY = 'A new health alert needs your attention.'
export const PUSH_NOTIFICATION_ROUTE = '/alerts'

export type WindowClientLike = {
  url: string
  focus(): Promise<unknown>
  navigate?(url: string): Promise<unknown>
}

export async function focusOrOpenAlerts(
  origin: string,
  windows: readonly WindowClientLike[],
  openWindow: (url: string) => Promise<unknown>,
) {
  const target = `${origin}${PUSH_NOTIFICATION_ROUTE}`
  const existing = windows.find((client) => new URL(client.url).origin === origin)
  if (existing) {
    if (existing.navigate) await existing.navigate(target)
    await existing.focus()
    return 'focused'
  }
  await openWindow(target)
  return 'opened'
}

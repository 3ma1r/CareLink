export function isIosPdfPreview(
  navigatorInfo: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>,
) {
  return (
    /iPad|iPhone|iPod/.test(navigatorInfo.userAgent) ||
    (navigatorInfo.platform === 'MacIntel' && navigatorInfo.maxTouchPoints > 1)
  )
}

export function deliverReport(buffer: ArrayBuffer, filename: string, preview: Window | null) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
  if (preview) preview.location.href = url
  else {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.target = '_blank'
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 300000)
}

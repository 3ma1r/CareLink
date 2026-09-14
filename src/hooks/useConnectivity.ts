import { useEffect, useState } from 'react'

// A browser can report onLine=true while only the service-worker cache is reachable.
// This same-origin static resource is intentionally excluded from the precache.
export function useConnectivity() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    let mounted = true
    let controller: AbortController | undefined
    async function check() {
      controller?.abort()
      if (!navigator.onLine) {
        setOnline(false)
        return
      }
      const request = new AbortController()
      controller = request
      const timeout = window.setTimeout(() => request.abort(), 3000)
      try {
        const response = await fetch('/connectivity.txt', {
          method: 'HEAD',
          cache: 'no-store',
          signal: request.signal,
        })
        if (mounted && controller === request) setOnline(response.ok)
      } catch {
        if (mounted && controller === request) setOnline(false)
      } finally {
        window.clearTimeout(timeout)
      }
    }
    void check()
    const change = () => {
      void check()
    }
    window.addEventListener('online', change)
    window.addEventListener('offline', change)
    window.addEventListener('focus', change)
    const interval = window.setInterval(change, 30000)
    return () => {
      mounted = false
      controller?.abort()
      window.clearInterval(interval)
      window.removeEventListener('online', change)
      window.removeEventListener('offline', change)
      window.removeEventListener('focus', change)
    }
  }, [])
  return online
}

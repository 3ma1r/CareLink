export const CORS_ALLOWED_HEADERS = 'authorization, apikey, content-type, x-client-info'
export const CORS_ALLOWED_METHODS = 'POST, OPTIONS'

export function corsHeadersForOrigin(origin: string | null, configuredOrigin: string | undefined) {
  const allowedOrigin = configuredOrigin?.trim()
  if (!allowedOrigin || origin !== allowedOrigin) return {}

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

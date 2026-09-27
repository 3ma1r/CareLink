export const CORS_ALLOWED_HEADERS = 'authorization, apikey, content-type, x-client-info'
export const CORS_ALLOWED_METHODS = 'POST, OPTIONS'

export function configuredOrigins(value: string | undefined) {
  return [...new Set((value ?? '').split(',').map((origin) => origin.trim()).filter(Boolean))]
}

export function corsHeadersForOrigins(origin: string | null, configured: string | undefined) {
  const allowedOrigins = configuredOrigins(configured)
  if (!origin || !allowedOrigins.includes(origin)) return {}

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

export function corsHeadersForOrigin(origin: string | null, configuredOrigin: string | undefined) {
  return corsHeadersForOrigins(origin, configuredOrigin)
}

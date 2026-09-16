import { describe, expect, it } from 'vitest'
import { CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS, corsHeadersForOrigin } from './cors'

describe('pair-device CORS headers', () => {
  it('allows only the configured origin and the headers sent by supabase-js', () => {
    expect(corsHeadersForOrigin('http://localhost:3000', 'http://localhost:3000')).toEqual({
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
      'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS,
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    })
    expect(CORS_ALLOWED_HEADERS).toBe('authorization, apikey, content-type, x-client-info')
    expect(CORS_ALLOWED_METHODS).toBe('POST, OPTIONS')
  })

  it('does not reflect another localhost port or use a wildcard', () => {
    expect(corsHeadersForOrigin('http://localhost:5173', 'http://localhost:3000')).toEqual({})
    expect(corsHeadersForOrigin('https://example.com', 'http://localhost:3000')).toEqual({})
  })
})

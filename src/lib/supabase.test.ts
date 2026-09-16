import { describe, expect, it } from 'vitest'
import { validateSupabaseConfiguration } from './supabase'

describe('Supabase configuration', () => {
  it('reports missing browser environment variables without a fallback account', () => {
    const error=validateSupabaseConfiguration(undefined,undefined)
    expect(error).toContain('VITE_SUPABASE_URL')
    expect(error).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
  })
})

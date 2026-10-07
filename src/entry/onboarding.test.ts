import { describe, expect, it } from 'vitest'
import {
  hasCompletedOnboarding,
  markOnboardingCompleted,
  ONBOARDING_COMPLETION_KEY,
} from './onboarding'

describe('versioned onboarding completion', () => {
  it('stores only a non-sensitive completion marker', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    }
    expect(hasCompletedOnboarding(storage)).toBe(false)
    expect(markOnboardingCompleted(storage)).toBe(true)
    expect(hasCompletedOnboarding(storage)).toBe(true)
    expect([...values]).toEqual([[ONBOARDING_COMPLETION_KEY, 'complete']])
  })

  it('fails gracefully when browser storage is restricted', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(hasCompletedOnboarding(blocked)).toBe(false)
    expect(markOnboardingCompleted(blocked)).toBe(false)
    expect(hasCompletedOnboarding(null)).toBe(false)
    expect(markOnboardingCompleted(null)).toBe(false)
  })
})

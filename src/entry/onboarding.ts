export const ONBOARDING_COMPLETION_KEY = 'carelink-onboarding-completed-v1'
const COMPLETED = 'complete'

export function hasCompletedOnboarding(storage: Pick<Storage, 'getItem'> | null = safeStorage()) {
  try {
    return storage?.getItem(ONBOARDING_COMPLETION_KEY) === COMPLETED
  } catch {
    return false
  }
}

export function markOnboardingCompleted(storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(ONBOARDING_COMPLETION_KEY, COMPLETED)
    return storage !== null
  } catch {
    return false
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

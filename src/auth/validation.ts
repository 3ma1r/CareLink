export type PatientDraft = {
  full_name: string
  date_of_birth: string
  gender: string
  emergency_contact_name: string
  emergency_contact_phone: string
  health_notes: string
}

export function calculateAge(dateOfBirth: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth)
  if (!match) return null
  const birth = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (
    birth.getUTCFullYear() !== Number(match[1]) ||
    birth.getUTCMonth() !== Number(match[2]) - 1 ||
    birth.getUTCDate() !== Number(match[3])
  ) return null
  let age = today.getUTCFullYear() - birth.getUTCFullYear()
  if (
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())
  ) age--
  return age
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function validatePassword(password: string) {
  return password.length >= 8
}

export function validatePhone(phone: string) {
  return !phone.trim() || /^[+\d][\d\s().-]{5,31}$/.test(phone.trim())
}

export function validatePatient(draft: PatientDraft, today = new Date()) {
  const errors: Partial<Record<keyof PatientDraft, string>> = {}
  const age = calculateAge(draft.date_of_birth, today)
  if (!draft.full_name.trim()) errors.full_name = 'Enter the patient’s full name.'
  else if (draft.full_name.trim().length > 100) errors.full_name = 'Use 100 characters or fewer.'
  if (age === null) errors.date_of_birth = 'Enter a valid date of birth.'
  else if (age < 0) errors.date_of_birth = 'Date of birth cannot be in the future.'
  else if (age > 126) errors.date_of_birth = 'Check the date of birth.'
  if (draft.emergency_contact_name.trim().length > 100) errors.emergency_contact_name = 'Use 100 characters or fewer.'
  if (!validatePhone(draft.emergency_contact_phone)) errors.emergency_contact_phone = 'Enter a valid phone number.'
  if (draft.health_notes.trim().length > 1000) errors.health_notes = 'Use 1,000 characters or fewer.'
  return errors
}

export function optional(value: string) {
  return value.trim() || null
}

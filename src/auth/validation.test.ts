import { describe, expect, it } from 'vitest'
import { calculateAge, validateEmail, validatePatient } from './validation'

const valid = { full_name:'Fatima Ali', date_of_birth:'1950-09-16', gender:'', emergency_contact_name:'', emergency_contact_phone:'', health_notes:'' }

describe('Stage 2 validation', () => {
  it('calculates age around the birthday boundary', () => {
    expect(calculateAge('1950-09-16', new Date('2026-09-15T12:00:00Z'))).toBe(75)
    expect(calculateAge('1950-09-15', new Date('2026-09-15T12:00:00Z'))).toBe(76)
  })
  it('rejects future and malformed dates', () => {
    expect(validatePatient({...valid,date_of_birth:'2027-01-01'},new Date('2026-09-15T12:00:00Z')).date_of_birth).toContain('future')
    expect(validatePatient({...valid,date_of_birth:'2026-02-30'},new Date('2026-09-15T12:00:00Z')).date_of_birth).toContain('valid')
  })
  it('validates required fields, phone and note limits', () => {
    const errors=validatePatient({...valid,full_name:'',emergency_contact_phone:'abc',health_notes:'x'.repeat(1001)})
    expect(errors.full_name).toBeTruthy(); expect(errors.emergency_contact_phone).toBeTruthy(); expect(errors.health_notes).toBeTruthy()
    expect(validateEmail('caregiver@example.com')).toBe(true)
    expect(validateEmail('bad-address')).toBe(false)
  })
})

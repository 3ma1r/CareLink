import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigurationError } from '../lib/supabase'
import type { Database } from '../lib/database.types'
import type { PatientDraft } from './validation'
import { optional } from './validation'

type Profile = Database['public']['Tables']['profiles']['Row']
type Patient = Database['public']['Tables']['patients']['Row']
type AuthStatus = 'loading' | 'configured-error' | 'signed-out' | 'signed-in' | 'offline'
type SaveResult = { error: string | null }
type Context = {
  status: AuthStatus; user: User | null; profile: Profile | null; patient: Patient | null
  error: string | null; recovery: boolean; testMode: boolean
  signIn(email: string, password: string): Promise<SaveResult>
  register(fullName: string, email: string, password: string): Promise<{ error: string | null; confirmationRequired: boolean }>
  requestReset(email: string): Promise<SaveResult>; updatePassword(password: string): Promise<SaveResult>
  signOut(): Promise<SaveResult>; saveProfile(fullName: string, phone: string): Promise<SaveResult>
  savePatient(draft: PatientDraft): Promise<SaveResult>; retry(): Promise<void>
}

const AuthContext = createContext<Context | null>(null)
const isTest = import.meta.env.MODE === 'test'
const now = '2026-09-15T00:00:00.000Z'
const testUser = { id: '11111111-1111-4111-8111-111111111111', email: 'caregiver@example.test', user_metadata: { full_name: 'Omair' }, app_metadata: {}, aud: 'authenticated', created_at: now } as User
const testProfile: Profile = { id: testUser.id, full_name: 'Omair', phone: null, created_at: now, updated_at: now }
const testPatient: Patient = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', caregiver_id: testUser.id, full_name: 'Ahmed', date_of_birth: '1954-03-12', gender: null, emergency_contact_name: null, emergency_contact_phone: null, health_notes: null, avatar_path: null, created_at: now, updated_at: now }

function friendlyError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login')) return 'The email or password is incorrect.'
  if (lower.includes('email not confirmed')) return 'Confirm your email before signing in.'
  if (lower.includes('fetch') || lower.includes('network')) return 'CareLink could not reach the service. Check your connection and try again.'
  return message || 'Something went wrong. Please try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(false)

  const loadAccount = useCallback(async (nextUser: User) => {
    if (!supabase) return
    const [profileResult, patientResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', nextUser.id).maybeSingle(),
      supabase.from('patients').select('*').eq('caregiver_id', nextUser.id).maybeSingle(),
    ])
    if (profileResult.error || patientResult.error) throw profileResult.error ?? patientResult.error
    let nextProfile = profileResult.data
    if (!nextProfile) {
      const fallback = String(nextUser.user_metadata.full_name ?? 'Caregiver').trim().slice(0, 100) || 'Caregiver'
      const result = await supabase.from('profiles').upsert({ id: nextUser.id, full_name: fallback }, { onConflict: 'id' }).select().single()
      if (result.error) throw result.error
      nextProfile = result.data
    }
    setUser(nextUser); setProfile(nextProfile); setPatient(patientResult.data); setStatus('signed-in'); setError(null)
  }, [])

  const restore = useCallback(async () => {
    setStatus('loading'); setError(null)
    if (isTest) {
      const state = localStorage.getItem('carelink-test-auth')
      if (state === 'signed-out') { setUser(null); setProfile(null); setPatient(null); setStatus('signed-out'); return }
      setUser(testUser); setProfile(testProfile); setPatient(state === 'no-patient' ? null : testPatient); setStatus('signed-in'); return
    }
    if (supabaseConfigurationError || !supabase) { setError(supabaseConfigurationError); setStatus('configured-error'); return }
    if (!navigator.onLine) { setStatus('offline'); return }
    try {
      const code = new URLSearchParams(location.search).get('code')
      const sessionResult = await supabase.auth.getSession()
      if (sessionResult.error) throw sessionResult.error
      if (code && !sessionResult.data.session) {
        const exchanged = await supabase.auth.exchangeCodeForSession(code)
        if (exchanged.error) throw exchanged.error
      }
      if (code) history.replaceState({}, '', location.pathname)
      const result = await supabase.auth.getUser()
      if (result.error || !result.data.user) { setStatus('signed-out'); return }
      await loadAccount(result.data.user)
    } catch (caught) {
      setError(friendlyError(caught instanceof Error ? caught.message : 'Unable to restore session.'))
      setStatus('signed-out')
    }
  }, [loadAccount])

  useEffect(() => {
    void restore()
    if (!supabase || isTest) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') { setUser(null); setProfile(null); setPatient(null); setStatus('signed-out') }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(() => void restore(), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [restore])

  async function signIn(email: string, password: string): Promise<SaveResult> {
    if (isTest) {
      if (password === 'wrong-password') return { error: 'The email or password is incorrect.' }
      localStorage.removeItem('carelink-test-auth'); await restore(); return { error: null }
    }
    if (!supabase) return { error: supabaseConfigurationError }
    if (!navigator.onLine) return { error: 'You are offline. Connect to the internet to sign in.' }
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (result.error) return { error: friendlyError(result.error.message) }
    if (result.data.user) await loadAccount(result.data.user)
    return { error: null }
  }

  async function register(fullName: string, email: string, password: string) {
    if (isTest) return { error: null, confirmationRequired: true }
    if (!supabase) return { error: supabaseConfigurationError, confirmationRequired: false }
    if (!navigator.onLine) return { error: 'You are offline. Connect to create an account.', confirmationRequired: false }
    const result = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${location.origin}/auth/callback` } })
    if (result.error) return { error: friendlyError(result.error.message), confirmationRequired: false }
    if (result.data.session && result.data.user) await loadAccount(result.data.user)
    return { error: null, confirmationRequired: !result.data.session }
  }

  async function requestReset(email: string): Promise<SaveResult> {
    if (isTest) return { error: null }
    if (!supabase) return { error: supabaseConfigurationError }
    if (!navigator.onLine) return { error: 'You are offline. Connect to request a reset email.' }
    const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset-password` })
    return { error: result.error ? friendlyError(result.error.message) : null }
  }

  async function updatePassword(password: string): Promise<SaveResult> {
    if (isTest) { setRecovery(false); return { error: null } }
    if (!supabase || !user) return { error: 'This reset link is invalid or has expired.' }
    const result = await supabase.auth.updateUser({ password })
    if (!result.error) setRecovery(false)
    return { error: result.error ? friendlyError(result.error.message) : null }
  }

  async function signOut(): Promise<SaveResult> {
    if (isTest) { localStorage.setItem('carelink-test-auth', 'signed-out'); await restore(); return { error: null } }
    if (!supabase) return { error: supabaseConfigurationError }
    const result = await supabase.auth.signOut()
    if (!result.error) { setUser(null); setProfile(null); setPatient(null); setStatus('signed-out') }
    return { error: result.error ? friendlyError(result.error.message) : null }
  }

  async function saveProfile(fullName: string, phone: string): Promise<SaveResult> {
    if (!user) return { error: 'Sign in again to save changes.' }
    if (isTest) { setProfile((value) => value && ({ ...value, full_name: fullName.trim(), phone: optional(phone) })); return { error: null } }
    if (!supabase || !navigator.onLine) return { error: 'You are offline. Reconnect before saving.' }
    const result = await supabase.from('profiles').update({ full_name: fullName.trim(), phone: optional(phone) }).eq('id', user.id).select().single()
    if (!result.error) setProfile(result.data)
    return { error: result.error ? friendlyError(result.error.message) : null }
  }

  async function savePatient(draft: PatientDraft): Promise<SaveResult> {
    if (!user) return { error: 'Sign in again to save patient details.' }
    const values = { full_name: draft.full_name.trim(), date_of_birth: draft.date_of_birth, gender: optional(draft.gender), emergency_contact_name: optional(draft.emergency_contact_name), emergency_contact_phone: optional(draft.emergency_contact_phone), health_notes: optional(draft.health_notes) }
    if (isTest) {
      setPatient((value) => value ? { ...value, ...values } : { ...testPatient, ...values, caregiver_id: user.id })
      localStorage.removeItem('carelink-test-auth'); return { error: null }
    }
    if (!supabase || !navigator.onLine) return { error: 'You are offline. Reconnect before saving.' }
    const result = patient
      ? await supabase.from('patients').update(values).eq('id', patient.id).eq('caregiver_id', user.id).select().single()
      : await supabase.from('patients').insert({ ...values, caregiver_id: user.id }).select().single()
    if (!result.error) setPatient(result.data)
    return { error: result.error ? friendlyError(result.error.message) : null }
  }

  const value: Context = { status, user, profile, patient, error, recovery, testMode: isTest, signIn, register, requestReset, updatePassword, signOut, saveProfile, savePatient, retry: restore }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required')
  return value
}

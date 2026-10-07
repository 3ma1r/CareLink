import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Bell, BookOpen, Check, LogOut, Settings2, UserRound, Watch } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useCare } from '../state'
import { useAuth } from '../auth/AuthProvider'
import type { PatientDraft } from '../auth/validation'
import { validatePatient, validatePhone } from '../auth/validation'
import { useDevice } from '../device/DeviceProvider'
import { Badge, PageHeading, SectionTitle, Segments } from '../components/UI'
import { PatientFields } from './PatientSetup'
import { useNotifications } from '../notifications/NotificationProvider'

export default function Profile() {
  const { theme, setTheme, online } = useCare()
  const auth = useAuth()
  const navigate = useNavigate()
  const deviceState = useDevice()
  const notifications = useNotifications()
  const [caregiver, setCaregiver] = useState({
    full_name: auth.profile?.full_name ?? '',
    phone: auth.profile?.phone ?? '',
  })
  const [patient, setPatient] = useState<PatientDraft>({
    full_name: auth.patient?.full_name ?? '',
    date_of_birth: auth.patient?.date_of_birth ?? '',
    gender: auth.patient?.gender ?? '',
    emergency_contact_name: auth.patient?.emergency_contact_name ?? '',
    emergency_contact_phone: auth.patient?.emergency_contact_phone ?? '',
    health_notes: auth.patient?.health_notes ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof PatientDraft, string>>>({})
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (auth.profile)
      setCaregiver({ full_name: auth.profile.full_name, phone: auth.profile.phone ?? '' })
  }, [auth.profile])
  useEffect(() => {
    if (auth.patient)
      setPatient({
        full_name: auth.patient.full_name,
        date_of_birth: auth.patient.date_of_birth,
        gender: auth.patient.gender ?? '',
        emergency_contact_name: auth.patient.emergency_contact_name ?? '',
        emergency_contact_phone: auth.patient.emergency_contact_phone ?? '',
        health_notes: auth.patient.health_notes ?? '',
      })
  }, [auth.patient])
  async function save(e: FormEvent) {
    e.preventDefault()
    const patientErrors = validatePatient(patient)
    setErrors(patientErrors)
    let validation = ''
    if (!caregiver.full_name.trim()) validation = 'Enter your full name.'
    else if (caregiver.full_name.trim().length > 100)
      validation = 'Use 100 characters or fewer for your name.'
    else if (!validatePhone(caregiver.phone)) validation = 'Enter a valid caregiver phone number.'
    if (validation || Object.keys(patientErrors).length) {
      setFailure(validation || 'Check the highlighted patient details.')
      return
    }
    setBusy(true)
    setFailure('')
    setMessage('')
    const profileResult = await auth.saveProfile(caregiver.full_name, caregiver.phone)
    if (profileResult.error) {
      setFailure(profileResult.error)
      setBusy(false)
      return
    }
    const patientResult = await auth.savePatient(patient)
    setBusy(false)
    if (patientResult.error) setFailure(patientResult.error)
    else setMessage('Account and patient details saved.')
  }
  async function logout() {
    setBusy(true)
    setFailure('')
    const disabled = await notifications.disable()
    if (disabled.error) {
      setFailure(disabled.error)
      setBusy(false)
      return
    }
    const result = await auth.signOut()
    setBusy(false)
    if (result.error) setFailure(result.error)
    else navigate('/sign-in', { replace: true })
  }
  async function unpair() {
    if (
      !deviceState.device ||
      !window.confirm(
        'Unpair this wearable? It will stop sending readings to your account and will need to be set up again.',
      )
    )
      return
    setBusy(true)
    setFailure('')
    const result = await deviceState.unpair()
    setBusy(false)
    if (result) setFailure(result)
    else setMessage('Wearable unpaired.')
  }
  const initials = (auth.profile?.full_name || 'C').slice(0, 1).toUpperCase()
  const notificationCopy = {
    loading: {
      badge: 'Checking',
      tone: 'muted' as const,
      title: 'Checking this browser',
      detail: 'CareLink is confirming whether this browser is registered.',
    },
    unsupported: {
      badge: 'Unavailable',
      tone: 'muted' as const,
      title: 'Push is not supported',
      detail: 'Try a browser that supports CareLink notifications.',
    },
    'ios-install-required': {
      badge: 'Install first',
      tone: 'amber' as const,
      title: 'Add CareLink to your Home Screen',
      detail:
        'On iPhone or iPad, open Share, choose Add to Home Screen, launch CareLink from its icon, then return here to enable notifications.',
    },
    'not-requested': {
      badge: 'Off',
      tone: 'muted' as const,
      title: 'Notifications are off',
      detail: 'CareLink will ask for browser permission only after you press Enable notifications.',
    },
    enabled: {
      badge: 'On',
      tone: 'teal' as const,
      title: 'Notifications are enabled',
      detail: 'This browser is subscribed and registered to your signed-in caregiver account.',
    },
    denied: {
      badge: 'Blocked',
      tone: 'red' as const,
      title: 'Permission is blocked',
      detail:
        'Allow notifications for CareLink in your browser or device settings, then reload this page.',
    },
    expired: {
      badge: 'Needs attention',
      tone: 'amber' as const,
      title: 'Subscription is unavailable',
      detail:
        'The browser permission remains available, but this subscription is missing or no longer registered. Enable it again.',
    },
    unavailable: {
      badge: 'Setup needed',
      tone: 'amber' as const,
      title: 'Push service is unavailable',
      detail: notifications.error ?? 'Notifications could not be enabled. Please try again later.',
    },
    error: {
      badge: 'Try again',
      tone: 'amber' as const,
      title: 'Temporary notification error',
      detail: notifications.error ?? 'CareLink could not confirm notification status.',
    },
  }[notifications.status]
  const canEnable = ['not-requested', 'expired', 'unavailable', 'error'].includes(
    notifications.status,
  )
  return (
    <>
      <PageHeading
        title="Profile & settings"
        subtitle="Manage your account, patient information and CareLink preferences."
      />
      <header className="caregiver-header">
        <span className="caregiver-avatar">{initials}</span>
        <div>
          <h2>{auth.profile?.full_name}</h2>
          <p>{auth.user?.email}</p>
        </div>
      </header>
      <div className="profile-layout profile-hybrid">
        <form className="card patient-settings" onSubmit={save} noValidate>
          <SectionTitle title="Personal & patient information" icon={<UserRound size={21} />} />
          <p className="section-subtitle">
            Keep your information up to date for a safer care experience.
          </p>
          <fieldset className="profile-fieldset">
            <legend>Caregiver information</legend>
            <div className="patient-form-grid">
              <label htmlFor="caregiver-name">
                Full name <small>Required</small>
                <input
                  id="caregiver-name"
                  value={caregiver.full_name}
                  onChange={(e) => setCaregiver({ ...caregiver, full_name: e.target.value })}
                  maxLength={100}
                />
              </label>
              <label htmlFor="caregiver-phone">
                Phone <small>Optional</small>
                <input
                  id="caregiver-phone"
                  type="tel"
                  value={caregiver.phone}
                  onChange={(e) => setCaregiver({ ...caregiver, phone: e.target.value })}
                  maxLength={32}
                />
              </label>
              <label className="wide" htmlFor="caregiver-email">
                Email <small>Read only</small>
                <input id="caregiver-email" value={auth.user?.email ?? ''} readOnly />
              </label>
            </div>
          </fieldset>
          <fieldset className="profile-fieldset">
            <legend>Patient information</legend>
            <PatientFields draft={patient} setDraft={setPatient} errors={errors} grouped />
          </fieldset>
          {failure && (
            <p className="form-error" role="alert">
              {failure}
            </p>
          )}
          <div className="save-row">
            <button className="button primary" disabled={busy || !online}>
              <Check size={17} />
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <span className="action-feedback" role="status">
              {message}
            </span>
          </div>
          {!online && <p className="data-note">Reconnect before saving account changes.</p>}
        </form>
        <aside className="profile-side">
          <section className="card profile-settings">
            <SectionTitle title="Settings" icon={<Settings2 size={21} />} />
            <div className="setting-row">
              <div>
                <h3>Appearance</h3>
                <p>A comfortable view, day or night.</p>
              </div>
              <Segments
                label="Theme preference"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </div>
            <div className="setting-row notification-card">
              <div>
                <h3>
                  <Bell size={18} />
                  Notifications
                </h3>
                <p>Receive important health alerts.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="CareLink health alert notifications"
                aria-checked={notifications.status === 'enabled'}
                disabled={
                  notifications.busy ||
                  !online ||
                  (!canEnable && notifications.status !== 'enabled')
                }
                className={`switch ${notifications.status === 'enabled' ? 'active' : ''}`}
                onClick={() =>
                  void (notifications.status === 'enabled'
                    ? notifications.disable()
                    : notifications.enable())
                }
              >
                <span />
              </button>
              <div className="notification-status" aria-live="polite">
                <strong>{notificationCopy.title}</strong>
                <p>{notificationCopy.detail}</p>
              </div>
              {notifications.status === 'enabled' ? (
                <button
                  type="button"
                  className="text-link"
                  disabled={notifications.busy || !online}
                  onClick={() => void notifications.disable()}
                >
                  {notifications.busy ? 'Disabling…' : 'Disable notifications'}
                </button>
              ) : (
                canEnable && (
                  <button
                    type="button"
                    className="text-link"
                    disabled={notifications.busy || !online}
                    onClick={() => void notifications.enable()}
                  >
                    {notifications.busy ? 'Enabling…' : 'Enable notifications'}
                  </button>
                )
              )}
            </div>
            <div className="setting-row">
              <div>
                <h3>
                  <BookOpen size={18} />
                  Onboarding & help
                </h3>
                <p>Learn how to get the most out of CareLink.</p>
              </div>
              <Link className="introduction-replay" to="/introduction?replay=1">
                View introduction
              </Link>
            </div>
          </section>
          <section className="card profile-device" id="device">
            <SectionTitle
              title="Your wearable"
              icon={<Watch size={22} />}
              action={
                <Badge
                  tone={
                    deviceState.connection === 'online'
                      ? 'teal'
                      : deviceState.connection === 'offline'
                        ? 'amber'
                        : 'muted'
                  }
                >
                  {deviceState.connection === 'none'
                    ? 'Not paired'
                    : deviceState.connection === 'awaiting'
                      ? 'Awaiting first connection'
                      : deviceState.connection}
                </Badge>
              }
            />
            {deviceState.device ? (
              <>
                <div className="profile-device-content">
                  <img src="/assets/wearable.svg" alt="Illustration of CareLink Band" />
                  <div>
                    <h3>{deviceState.device.display_name ?? 'CareLink Band'}</h3>
                    <Badge tone="teal">Securely paired</Badge>
                  </div>
                </div>
                <p className="device-last-contact">
                  Last contact{' '}
                  <strong>
                    {deviceState.device.last_contact_at
                      ? new Date(deviceState.device.last_contact_at).toLocaleString()
                      : 'Not available'}
                  </strong>
                </p>
                <details className="device-details">
                  <summary>Device details</summary>
                  <div className="device-facts">
                    <span>
                      Device ID
                      <strong>•••• {deviceState.device.device_identifier.slice(-4)}</strong>
                    </span>
                    <span>
                      Paired
                      <strong>
                        {deviceState.device.paired_at
                          ? new Date(deviceState.device.paired_at).toLocaleDateString()
                          : '—'}
                      </strong>
                    </span>
                    <span>
                      Last measured
                      <strong>
                        {deviceState.latest
                          ? new Date(deviceState.latest.measured_at).toLocaleString()
                          : 'No measurements'}
                      </strong>
                    </span>
                    <span>
                      Firmware
                      <strong>{deviceState.device.firmware_version ?? 'Not reported'}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || !online}
                    onClick={() => void unpair()}
                  >
                    Unpair wearable
                  </button>
                </details>
              </>
            ) : (
              <div className="empty-device">
                <h3>No wearable paired</h3>
                <p>Connect your CareLink wearable to start monitoring.</p>
                <Link className="button primary" to="/pair-device">
                  Pair Wearable
                </Link>
              </div>
            )}
          </section>
          <section className="card profile-account">
            <div>
              <h2>Account</h2>
              <p>Manage your CareLink account.</p>
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() => void logout()}
              disabled={busy}
            >
              <LogOut size={17} />
              Log out
            </button>
          </section>
        </aside>
      </div>
    </>
  )
}

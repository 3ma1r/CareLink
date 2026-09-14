import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bell,
  Check,
  Heart,
  Info,
  Monitor,
  Moon,
  Settings2,
  Sun,
  UserRound,
  Watch,
} from 'lucide-react'
import { useCare } from '../state'
import { stamp } from '../data/demo'
import { Avatar, Badge, PageHeading, SectionTitle, Segments } from '../components/UI'
export default function Profile() {
  const { patient, setPatient, theme, setTheme, scenario, lastContact } = useCare()
  const [draft, setDraft] = useState(patient)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  function save(e: FormEvent) {
    e.preventDefault()
    if (
      !draft.name.trim() ||
      !draft.city.trim() ||
      !Number.isInteger(draft.age) ||
      draft.age < 1 ||
      draft.age > 120
    ) {
      setError('Enter a name, city and age between 1 and 120.')
      return
    }
    setPatient({ ...draft, name: draft.name.trim(), city: draft.city.trim() })
    setSaved(true)
    setError('')
  }
  return (
    <>
      <PageHeading
        title="Profile & settings"
        subtitle="Your care circle, just the way you like it."
      />
      <div className="profile-layout">
        <div>
          <section className="card caregiver-card">
            <span className="caregiver-avatar">O</span>
            <div>
              <span className="eyebrow">CAREGIVER</span>
              <h2>Omair</h2>
              <p>A little care makes a big difference.</p>
            </div>
            <Badge tone="muted">Demo profile</Badge>
          </section>
          <section className="card patient-settings">
            <SectionTitle
              title="Patient details"
              icon={<UserRound size={21} />}
              action={<Badge>Local demo</Badge>}
            />
            <div className="patient-avatar-settings">
              <Avatar size="large" show={draft.avatar} />
              <div>
                <strong>A familiar face</strong>
                <p>Illustrated sample avatar</p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.avatar}
                    onChange={(e) => {
                      setDraft({ ...draft, avatar: e.target.checked })
                      setSaved(false)
                    }}
                  />
                  Show patient avatar
                </label>
              </div>
            </div>
            <form onSubmit={save}>
              <div className="form-grid">
                <label className="wide">
                  Patient name
                  <input
                    required
                    maxLength={50}
                    value={draft.name}
                    onChange={(e) => {
                      setDraft({ ...draft, name: e.target.value })
                      setSaved(false)
                    }}
                  />
                </label>
                <label>
                  Age
                  <input
                    required
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    value={draft.age || ''}
                    onChange={(e) => {
                      setDraft({ ...draft, age: Number(e.target.value) })
                      setSaved(false)
                    }}
                  />
                </label>
                <label>
                  City
                  <input
                    required
                    maxLength={60}
                    value={draft.city}
                    onChange={(e) => {
                      setDraft({ ...draft, city: e.target.value })
                      setSaved(false)
                    }}
                  />
                </label>
              </div>
              <p className="data-note">
                Edits update the app for this session and reset on reload. The sample GPS
                coordinates stay fixed.
              </p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="save-row">
                <button type="submit" className="button primary">
                  <Check size={17} />
                  Save changes
                </button>
                <span className="action-feedback" role="status">
                  {saved ? 'Demo details saved' : ''}
                </span>
              </div>
            </form>
          </section>
          <section className="card profile-device" id="device">
            <SectionTitle title="Your wearable" icon={<Watch size={22} />} />
            <div className="profile-device-content">
              <img src="/assets/wearable.svg" alt="Illustration of CareLink Band" />
              <div>
                <h3>CareLink Band</h3>
                <p>One wearable. A closer connection.</p>
                <Badge tone={scenario === 'offline' ? 'amber' : 'teal'}>
                  {scenario === 'offline' ? 'Offline' : 'Connected'} · Demo
                </Badge>
              </div>
            </div>
            <div className="device-facts">
              <span>
                Device ID<strong>CL-DEMO-001</strong>
              </span>
              <span>
                Last contact<strong>{stamp(lastContact, true)}</strong>
              </span>
              <span>
                Data source<strong>Local sample data</strong>
              </span>
            </div>
          </section>
        </div>
        <div>
          <section className="card appearance-card">
            <SectionTitle title="Appearance" icon={<Settings2 size={21} />} />
            <p className="section-subtitle">A comfortable view, day or night.</p>
            <div className="theme-preview-grid">
              {(
                [
                  { value: 'system', icon: Monitor, label: 'System' },
                  { value: 'light', icon: Sun, label: 'Light' },
                  { value: 'dark', icon: Moon, label: 'Dark' },
                ] as const
              ).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  className={`theme-preview ${value} ${theme === value ? 'active' : ''}`}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  <div className="mini-window">
                    <i />
                    <span />
                    <span />
                    <b />
                  </div>
                  <span>
                    <Icon size={15} />
                    {label}
                    {theme === value && <Check size={14} />}
                  </span>
                </button>
              ))}
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
            <p className="data-note">Your theme preference is saved on this browser.</p>
          </section>
          <section className="card notification-card">
            <SectionTitle
              title="Notifications"
              icon={<Bell size={21} />}
              action={<Badge tone="muted">Not connected</Badge>}
            />
            <p className="section-subtitle">A preview of settings planned for a later stage.</p>
            {['SOS & suspected falls', 'Unusual readings', 'Device connection'].map((label) => (
              <div className="notification-row" key={label}>
                <span>{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-label={`${label} notifications, not connected`}
                  aria-checked="false"
                  disabled
                  className="switch"
                >
                  <span />
                </button>
              </div>
            ))}
            <p className="data-note">
              No browser permission requested. Push delivery and background monitoring are not
              active.
            </p>
          </section>
          <section className="about-card">
            <span className="icon-tile">
              <Heart size={24} />
            </span>
            <h3>Made for a little peace of mind.</h3>
            <p>
              CareLink brings a patient’s wearable readings into one thoughtful space for their
              caregiver.
            </p>
            <div>
              <Badge tone="muted">Stage 1 · v0.1.0</Badge>
            </div>
            <p className="data-note">
              <Info size={15} />
              Monitoring prototype with fictional sample data. No real account, authentication, or
              medical assessment.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}

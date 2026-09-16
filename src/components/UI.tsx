import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Heart,
  MapPin,
  Minus,
  Moon,
  Sun,
  Watch,
  WifiOff,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCare } from '../state'
import { formatValue, metrics, stamp, summarize } from '../data/demo'
import type { Metric, Reading } from '../data/demo'
import { useDevice } from '../device/DeviceProvider'

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="CareLink dashboard">
      <span className="brand-symbol">
        <Heart size={23} strokeWidth={2.3} />
        <span />
      </span>
      <span>
        Care<span className="text-accent">Link</span>
        <small>CARE, CONNECTED.</small>
      </span>
    </Link>
  )
}
export function Avatar({
  size = '',
  name,
  show,
}: {
  size?: string
  name?: string
  show?: boolean
}) {
  const { patient } = useCare()
  const label = name ?? patient.name
  return (show ?? patient.avatar) ? (
    <img
      className={`avatar ${size}`}
      src="/assets/patient-avatar.svg"
      alt={`${label}'s sample avatar`}
    />
  ) : (
    <span className={`avatar initials ${size}`} role="img" aria-label={`${label}'s initials`}>
      {label.slice(0, 2).toUpperCase()}
    </span>
  )
}
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useCare()
  return (
    <div className="theme-toggle" role="group" aria-label={`Color theme: ${theme}`}>
      <button
        aria-label="Use light theme"
        aria-pressed={resolvedTheme === 'light'}
        onClick={() => setTheme('light')}
      >
        <Sun size={19} />
      </button>
      <button
        aria-label="Use dark theme"
        aria-pressed={resolvedTheme === 'dark'}
        onClick={() => setTheme('dark')}
      >
        <Moon size={18} />
      </button>
    </div>
  )
}
export function Badge({
  children,
  tone = 'teal',
}: {
  children: ReactNode
  tone?: 'teal' | 'red' | 'amber' | 'muted' | 'blue'
}) {
  return <span className={`badge ${tone}`}>{children}</span>
}
export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">YOUR CARE COMPANION</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  )
}
export function SectionTitle({
  icon,
  title,
  action,
}: {
  icon?: ReactNode
  title: string
  action?: ReactNode
}) {
  return (
    <div className="section-title">
      <h2>
        {icon}
        {title}
      </h2>
      {action}
    </div>
  )
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ChevronRight size={16} />
    </Link>
  )
}
export function Segments<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div className={`segments ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={value === o.value}
          className={value === o.value ? 'selected' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
export function DeviceCard({ compact = false }: { compact?: boolean }) {
  const { device, connection, loading, error, refresh } = useDevice()
  if (error) return <section className={`device-card ${compact ? 'compact' : ''}`} role="status"><span className="device-status-icon"><WifiOff size={22}/></span><div><strong>Wearable data unavailable</strong><p>{error}</p><button type="button" className="text-link" onClick={() => void refresh()}>Try again</button></div></section>
  const offline = connection === 'offline'
  const status = loading ? 'Checking wearable…' : connection === 'none' ? 'No wearable paired' : connection === 'awaiting' ? 'Paired — awaiting first connection' : offline ? 'Wearable offline' : 'Wearable online'
  const when = device?.last_contact_at ? new Date(device.last_contact_at).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }) : 'No contact yet'
  return (
    <Link
      to={device ? '/profile#device' : '/pair-device'}
      className={`device-card ${compact ? 'compact' : ''} ${offline ? 'device-offline' : ''}`}
    >
      <span className="device-status-icon">
        {offline ? <WifiOff size={22} /> : <Check size={23} />}
      </span>
      <div>
        <strong>{status}</strong>
        <p>Last contact · {when}</p>
        <small>
          {device ? `${device.display_name ?? device.device_model} · Real pairing status` : 'Pairing required · Monitoring is not active'}
        </small>
      </div>
      {!compact && (
        <img src="/assets/wearable.svg" alt="Illustration of the teal CareLink wearable" />
      )}
      <ChevronRight className="device-arrow" size={20} />
    </Link>
  )
}
export function Stats({ readings, metric }: { readings: Reading[]; metric: Metric }) {
  const stats = summarize(readings, metric)
  return (
    <div className="stats-grid">
      {[
        { label: 'Minimum', value: stats.min, icon: <ArrowDownLeft size={17} /> },
        { label: 'Average', value: stats.avg, icon: <Minus size={17} /> },
        { label: 'Maximum', value: stats.max, icon: <ArrowUpRight size={17} /> },
      ].map((s) => (
        <div className="stat" key={s.label}>
          <span>
            {s.label}
            {s.icon}
          </span>
          <strong>
            {formatValue(s.value, metric)} <small>{metrics[metric].unit}</small>
          </strong>
        </div>
      ))}
    </div>
  )
}
export function EmptyState({
  title = 'No readings for this period',
  detail,
}: {
  title?: string
  detail?: string
}) {
  const { sampleMode } = useCare()
  return (
    <div className="empty-state">
      <span className="icon-tile">
        <Activity size={27} />
      </span>
      <h3>{title}</h3>
      <p>{detail ?? (sampleMode ? 'Choose another date or change the demo scenario to explore sample readings.' : 'No wearable measurements were recorded in the selected period.')}</p>
    </div>
  )
}
export function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal()
    else if (!open && ref.current?.open) ref.current.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose()
        }
      }}
    >
      <div className="modal-header">
        <h2 id={id}>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function LocationSummary() {
  const { location, patient, sampleMode } = useCare()
  return (
    <Link to="/location" className="location-summary">
      <span className="icon-tile">
        <MapPin size={22} />
      </span>
      <div>
        <strong>{location.coordinates ? `${sampleMode ? 'Sample' : 'Last known'} location · ${patient.city}, Oman` : 'Location unavailable'}</strong>
        <p>
          {location.time ? `Last GPS fix · ${stamp(location.time)}` : 'Waiting for a valid GPS fix'}
        </p>
      </div>
      <ChevronRight size={18} />
    </Link>
  )
}
export function PrototypeNote() {
  const { sampleMode } = useCare()
  return (
    <div className="prototype-note">
      <Watch size={16} />
      <span>Monitoring prototype · {sampleMode ? 'Sample data only' : 'Wearable sensor data'} · Not a medical device</span>
    </div>
  )
}

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  MapPin,
  Radio,
  ShieldCheck,
  Signal,
  TriangleAlert,
} from 'lucide-react'
import { useCare } from '../state'
import {
  formatValue,
  metrics,
  qualityText,
  stamp,
  validCoordinates,
  validValue,
} from '../data/demo'
import type { AlertStatus, Metric } from '../data/demo'
import { Badge, EmptyState, Modal, PageHeading, Segments } from '../components/UI'

const eventIcons = { fall: TriangleAlert, sos: Radio, reading: Signal }
const severityTone = (severity: string) =>
  severity === 'Critical' || severity === 'High'
    ? 'red'
    : severity === 'Moderate'
      ? 'amber'
      : 'teal'

export default function Alerts() {
  const { alerts, readings, updateAlert, patient, sampleMode, alertsLoading, alertError } =
    useCare()
  const [filter, setFilter] = useState<'All' | AlertStatus>('All')
  const [params, setParams] = useSearchParams()
  const [announcement, setAnnouncement] = useState('')
  const [busy, setBusy] = useState(false)
  const selected = alerts.find((alert) => alert.id === params.get('event'))
  const filtered = alerts.filter((alert) => filter === 'All' || alert.status === filter)
  const activeCount = alerts.filter((alert) => alert.status === 'Active').length

  async function action(status: AlertStatus) {
    if (!selected) return
    setBusy(true)
    const error = await updateAlert(selected.id, status)
    setBusy(false)
    setAnnouncement(
      error ?? `Alert ${status === 'Acknowledged' ? 'acknowledged' : 'resolved'} successfully.`,
    )
  }

  const reading = readings.find((row) => row.id === selected?.readingId)
  return (
    <>
      <PageHeading
        title="Alerts"
        subtitle={<>A clear view of the moments that need your attention.</>}
        action={
          <Badge tone={activeCount ? 'amber' : 'teal'}>
            <Bell size={14} />
            {activeCount} active {activeCount === 1 ? 'alert' : 'alerts'}
          </Badge>
        }
      />
      <div className="alerts-overview">
        <span className="icon-tile">
          <ShieldCheck size={27} />
        </span>
        <div>
          <h2>Keeping you in the loop</h2>
          <p>
            {sampleMode
              ? `Review sample events from ${patient.name}’s wearable. Demo actions stay in this test session.`
              : `Review deterministic monitoring alerts from ${patient.name}’s paired wearable.`}
          </p>
        </div>
        <Badge tone="muted">No notifications sent</Badge>
      </div>
      <div className="alerts-toolbar">
        <Segments
          label="Alert status"
          options={(['All', 'Active', 'Acknowledged', 'Resolved'] as const).map((value) => ({
            value,
            label: `${value} (${
              value === 'All'
                ? alerts.length
                : alerts.filter((alert) => alert.status === value).length
            })`,
          }))}
          value={filter}
          onChange={setFilter}
        />
        <span className="period-label">Event times · Muscat, GST</span>
      </div>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {alertError && (
        <p className="form-error" role="alert">
          {alertError} Existing measurements remain available.
        </p>
      )}
      <div className="alerts-list" aria-busy={alertsLoading}>
        {alertsLoading && !alerts.length ? (
          <section className="card">
            <EmptyState
              title="Loading alerts"
              detail="Checking the latest authorized alert history."
            />
          </section>
        ) : filtered.length ? (
          filtered.map((alert) => {
            const Icon = eventIcons[alert.type]
            return (
              <Link
                key={alert.id}
                className={`alert-card card ${alert.status === 'Active' ? 'unread' : ''}`}
                to={`?event=${alert.id}`}
              >
                <span className={`alert-type-icon ${alert.severity.toLowerCase()}`}>
                  <Icon size={24} />
                </span>
                <div className="alert-card-content">
                  <div className="alert-title">
                    <h2>{alert.title}</h2>
                    <Badge tone={severityTone(alert.severity)}>{alert.severity} severity</Badge>
                  </div>
                  <p>{alert.description}</p>
                  {alert.observedValue != null && (
                    <p className="alert-observed">
                      Observed · {alert.observedValue} {alert.unit}
                    </p>
                  )}
                  <div className="alert-meta">
                    <span>
                      <Clock3 size={13} />
                      Measured {stamp(alert.time)}
                    </span>
                    <span className={`alert-status ${alert.status.toLowerCase()}`}>
                      {alert.status === 'Resolved' ? (
                        <CheckCheck size={14} />
                      ) : alert.status === 'Acknowledged' ? (
                        <Check size={14} />
                      ) : (
                        <span className="status-dot" />
                      )}
                      {alert.status}
                    </span>
                  </div>
                </div>
                <ChevronRight className="alert-chevron" size={21} />
              </Link>
            )
          })
        ) : (
          <section className="card">
            <EmptyState
              title={`No ${filter.toLowerCase()} alerts`}
              detail={
                sampleMode
                  ? 'Choose another filter to see sample events.'
                  : filter === 'All'
                    ? 'No automatic alerts have been generated for this patient.'
                    : 'Choose another filter to review the alert history.'
              }
            />
          </section>
        )}
      </div>
      <p className="data-note alert-note">
        <Bell size={16} />
        This prototype creates in-app records only. It does not deliver notifications or initiate
        calls.
      </p>
      <Modal open={!!selected} onClose={() => setParams({})} title="Alert details">
        {selected && (
          <div className="alert-detail">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={severityTone(selected.severity)}>{selected.severity} severity</Badge>
              <Badge tone="muted">{selected.status}</Badge>
              {sampleMode && <Badge tone="muted">Sample event</Badge>}
            </div>
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
            <div className="detail-time">
              <Clock3 size={17} />
              Measurement time · {stamp(selected.time)}
            </div>
            {selected.alertTime && (
              <div className="detail-time">
                <Bell size={17} />
                Alert created · {stamp(selected.alertTime)}
              </div>
            )}
            {selected.occurrenceCount && selected.occurrenceCount > 1 && (
              <p className="inline-notice">
                This condition was seen {selected.occurrenceCount} times. Last seen{' '}
                {stamp(selected.lastSeenAt ?? selected.time)}.
              </p>
            )}
            {selected.type === 'fall' && (
              <div className="inline-notice">
                <TriangleAlert size={19} />
                {sampleMode
                  ? selected.cancelled
                    ? 'Cancelled on wearable · Not escalated'
                    : 'Uncancelled countdown · Escalated suspicion · Not independently verified'
                  : 'Confirmed fall signal · Requires deliberate caregiver acknowledgement or resolution'}
              </div>
            )}
            <h4>Related measurements</h4>
            {reading ? (
              <>
                <div className="related-readings">
                  {(Object.keys(metrics) as Metric[]).map((metric) => (
                    <div key={metric}>
                      <small>{metrics[metric].label}</small>
                      <strong>
                        {formatValue(validValue(reading, metric), metric)}{' '}
                        <small>{metrics[metric].unit}</small>
                      </strong>
                      <span>{qualityText(reading, metric)}</span>
                    </div>
                  ))}
                </div>
                <p className="data-note">Measured · {stamp(reading.time)}</p>
              </>
            ) : (
              <p className="inline-notice">
                The related measurement is outside the loaded history window.
              </p>
            )}
            <h4>Location at the event</h4>
            <div className="detail-location">
              <MapPin size={22} />
              <div>
                <strong>
                  {validCoordinates(selected.coordinates)
                    ? `${selected.coordinates[0].toFixed(4)}, ${selected.coordinates[1].toFixed(4)}`
                    : 'Location unavailable'}
                </strong>
                <p>Last GPS fix · {stamp(selected.gpsTime)}</p>
                <small>
                  {selected.gpsTime
                    ? `Fix was ${Math.round((selected.time - selected.gpsTime) / 60000)} minutes old at the event`
                    : 'No valid fix at this event'}
                  {sampleMode ? ' · Sample location' : ''}
                </small>
              </div>
            </div>
            <div aria-live="polite" className="action-feedback">
              {announcement}
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                disabled={busy || selected.status !== 'Active'}
                onClick={() => void action('Acknowledged')}
              >
                <Check size={18} />
                {selected.status === 'Acknowledged' ? 'Acknowledged' : 'Acknowledge'}
              </button>
              <button
                className="button primary"
                disabled={busy || selected.status === 'Resolved'}
                onClick={() => void action('Resolved')}
              >
                <CheckCheck size={18} />
                {selected.status === 'Resolved' ? 'Resolved' : 'Resolve'}
              </button>
            </div>
            <p className="data-note">
              {sampleMode
                ? 'Demo actions are local to this test session.'
                : 'Acknowledgement records the signed-in caregiver and time. Resolving an alert preserves its history.'}
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}

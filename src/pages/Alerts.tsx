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
import { formatValue, metrics, stamp, validCoordinates, validValue } from '../data/demo'
import type { AlertStatus, Metric } from '../data/demo'
import { Badge, EmptyState, Modal, PageHeading, Segments } from '../components/UI'
const eventIcons = { fall: TriangleAlert, sos: Radio, reading: Signal }
export default function Alerts() {
  const { alerts, readings, updateAlert, patient } = useCare()
  const [filter, setFilter] = useState<'All' | AlertStatus>('All')
  const [params, setParams] = useSearchParams()
  const [announcement, setAnnouncement] = useState('')
  const selected = alerts.find((a) => a.id === params.get('event'))
  const filtered = alerts.filter((a) => filter === 'All' || a.status === filter)
  const newCount = alerts.filter((a) => a.status === 'New').length
  function action(status: AlertStatus) {
    if (selected) {
      updateAlert(selected.id, status)
      setAnnouncement(`Alert ${status.toLowerCase()} in demo state.`)
    }
  }
  const reading = readings.find((r) => r.id === selected?.readingId)
  return (
    <>
      <PageHeading
        title="Alerts"
        subtitle={<>A clear view of the moments that need your attention.</>}
        action={
          <Badge tone={newCount ? 'amber' : 'teal'}>
            <Bell size={14} />
            {newCount} new {newCount === 1 ? 'alert' : 'alerts'}
          </Badge>
        }
      />
      <div className="alerts-overview">
        <span className="icon-tile">
          <ShieldCheck size={27} />
        </span>
        <div>
          <h2>Keeping you in the loop</h2>
          <p>Review sample events from {patient.name}’s wearable. Actions only update this demo.</p>
        </div>
        <Badge tone="muted">No notifications sent</Badge>
      </div>
      <div className="alerts-toolbar">
        <Segments
          label="Alert status"
          options={(['All', 'New', 'Viewed', 'Resolved'] as const).map((value) => ({
            value,
            label: `${value} (${value === 'All' ? alerts.length : alerts.filter((a) => a.status === value).length})`,
          }))}
          value={filter}
          onChange={setFilter}
        />
        <span className="period-label">Event times · Muscat, GST</span>
      </div>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div className="alerts-list">
        {filtered.length ? (
          filtered.map((a) => {
            const Icon = eventIcons[a.type]
            return (
              <Link
                key={a.id}
                className={`alert-card card ${a.status === 'New' ? 'unread' : ''}`}
                to={`?event=${a.id}`}
              >
                <span className={`alert-type-icon ${a.severity.toLowerCase()}`}>
                  <Icon size={24} />
                </span>
                <div className="alert-card-content">
                  <div className="alert-title">
                    <h2>{a.title}</h2>
                    <Badge
                      tone={
                        a.severity === 'High' ? 'red' : a.severity === 'Moderate' ? 'amber' : 'teal'
                      }
                    >
                      {a.severity} severity
                    </Badge>
                  </div>
                  <p>{a.description}</p>
                  <div className="alert-meta">
                    <span>
                      <Clock3 size={13} />
                      {stamp(a.time)}
                    </span>
                    <span className={`alert-status ${a.status.toLowerCase()}`}>
                      {a.status === 'Resolved' ? (
                        <CheckCheck size={14} />
                      ) : a.status === 'Viewed' ? (
                        <Check size={14} />
                      ) : (
                        <span className="status-dot" />
                      )}
                      {a.status}
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
              detail="You’re all caught up in this demo view. Choose another filter to see more events."
            />
          </section>
        )}
      </div>
      <p className="data-note alert-note">
        <Bell size={16} />
        This prototype does not deliver notifications, monitor in the background, or initiate calls.
      </p>
      <Modal open={!!selected} onClose={() => setParams({})} title="Alert details">
        {selected && (
          <div className="alert-detail">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={selected.severity === 'High' ? 'red' : 'amber'}>
                {selected.severity} severity
              </Badge>
              <Badge tone="muted">{selected.status}</Badge>
              <Badge tone="muted">Sample event</Badge>
            </div>
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
            <div className="detail-time">
              <Clock3 size={17} />
              Event time · {stamp(selected.time)}
            </div>
            {selected.type === 'fall' && (
              <div className="inline-notice">
                <TriangleAlert size={19} />
                {selected.cancelled
                  ? 'Cancelled on wearable · Not escalated'
                  : 'Uncancelled countdown · Escalated suspicion · Not independently verified'}
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
                      <span>{reading.quality[metric]} quality</span>
                    </div>
                  ))}
                </div>
                <p className="data-note">Measured · {stamp(reading.time)}</p>
              </>
            ) : (
              <p className="inline-notice">
                No related measurement is available in this demo scenario.
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
                    : 'No valid fix at this event'}{' '}
                  · Sample location
                </small>
              </div>
            </div>
            <div aria-live="polite" className="action-feedback">
              {announcement}
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                disabled={selected.status !== 'New'}
                onClick={() => action('Viewed')}
              >
                <Check size={18} />
                Mark as viewed
              </button>
              <button
                className="button primary"
                disabled={selected.status === 'Resolved'}
                onClick={() => action('Resolved')}
              >
                <CheckCheck size={18} />
                {selected.status === 'Resolved' ? 'Resolved' : 'Resolve'}
              </button>
            </div>
            <p className="data-note">
              These actions save locally for this session. Resolving an alert does not confirm the
              patient’s safety.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}

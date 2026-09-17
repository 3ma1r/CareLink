import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Droplets,
  Footprints,
  Heart,
  MapPin,
  ShieldCheck,
  Thermometer,
  TriangleAlert,
} from 'lucide-react'
import { useCare } from '../state'
import { useAuth } from '../auth/AuthProvider'
import {
  DAY,
  dateKey,
  dateLabel,
  dayStart,
  filterReadings,
  formatValue,
  metrics,
  qualityText,
  stamp,
  validValue,
} from '../data/demo'
import type { Metric } from '../data/demo'
import {
  Avatar,
  Badge,
  DeviceCard,
  PageHeading,
  SectionTitle,
  Segments,
  TextLink,
} from '../components/UI'
import { HealthChart, MovementChart } from '../components/Charts'
import { AIInsights } from '../components/AIInsights'
import { useDevice } from '../device/DeviceProvider'
const icons = { heartRate: Heart, spo2: Droplets, temperature: Thermometer }
export default function Dashboard() {
  const { patient, readings, scenario, alerts, sampleMode, dataNow } = useCare()
  const { profile } = useAuth()
  const { connection } = useDevice()
  const today = dateKey(dataNow)
  const firstDay = dateKey(dataNow - 29 * DAY)
  const [day, setDay] = useState(today)
  const [range, setRange] = useState('6H')
  const end = Math.min(dayStart(day) + DAY - 1, dataNow)
  const selected = filterReadings(readings, dayStart(day), end)
  const latest = selected.at(-1)
  const chartRows = filterReadings(selected, end - Number.parseInt(range) * 3600000, end)
  const newEvent = alerts.find((a) => a.status !== 'Resolved' && a.id.startsWith('demo-'))
  return (
    <>
      <PageHeading
        title={`Good morning, ${profile?.full_name?.split(/\s+/)[0] || 'Caregiver'}`}
        subtitle={<>A little closer, even from afar. Here’s {patient.name}’s latest update.</>}
        action={
          <div className="heading-date">
            <CalendarDays size={19} />
            <span>
              {dateLabel(dataNow, true)}
              <small>{sampleMode ? 'Sample timeline' : 'Current data'} · Muscat, GST</small>
            </span>
          </div>
        }
      />
      <div className="summary-grid">
        <section className="patient-card card">
          <Avatar size="large" />
          <div className="patient-name">
            <span className="eyebrow">YOU’RE CARING FOR</span>
            <h2>{patient.name}</h2>
            <p>
              {patient.age} years <span>·</span> <MapPin size={14} />
              {sampleMode ? 'Sample location' : 'Last known area'} · {patient.city}, Oman
            </p>
          </div>
          <Link to="/profile" className="icon-button" aria-label="View patient profile">
            <ChevronRight size={22} />
          </Link>
        </section>
        <DeviceCard />
      </div>
      <div className="overview-heading">
        <h2>
          Your daily overview <span className="subtle-count">{selected.length} measurements</span>
        </h2>
        <div className="date-controls">
          <Segments
            label="Dashboard day"
            value={day}
            options={[
              { value: today, label: 'Today' },
              { value: dateKey(dataNow - DAY), label: 'Yesterday' },
            ]}
            onChange={setDay}
          />
          <label className="date-input">
            <CalendarDays size={16} />
            <input
              type="date"
              aria-label="Dashboard date"
              value={day}
              min={firstDay}
              max={today}
              onChange={(e) => e.target.value && setDay(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="vitals-grid">
        {(Object.keys(metrics) as Metric[]).map((metric) => {
          const Icon = icons[metric]
          const value = latest ? validValue(latest, metric) : null
          return (
            <Link
              key={metric}
              className={`vital-card ${metric}`}
              to={`/history?metric=${metric}&date=${day}`}
            >
              <div className="vital-heading">
                <span className="vital-icon">
                  <Icon size={21} fill={metric === 'heartRate' ? 'currentColor' : 'none'} />
                </span>
                <h3>{metrics[metric].label}</h3>
                <ChevronRight size={17} />
              </div>
              <div className="vital-value">
                {formatValue(value, metric)}
                <span>{metrics[metric].unit}</span>
              </div>
              <div className="vital-caption">
                {latest ? qualityText(latest, metric) : 'No reading'}
              </div>
              <HealthChart readings={selected.slice(-16)} metric={metric} small />
            </Link>
          )
        })}
        <Link className="vital-card movement" to={`/history?metric=heartRate&date=${day}#movement`}>
          <div className="vital-heading">
            <span className="vital-icon">
              <Footprints size={22} />
            </span>
            <h3>Movement</h3>
            <ChevronRight size={17} />
          </div>
          <div className="vital-value text-value">
            {latest?.movement == null ? 'Unavailable' : latest.movement < 25 ? 'Resting' : 'Active'}
          </div>
          <div className="vital-caption">
            {latest?.movement == null ? 'No movement reading' : 'Latest activity reading'}
          </div>
          <MovementChart readings={selected.slice(-16)} small />
        </Link>
      </div>
      <div className="measurement-note">
        <Clock3 size={13} />
        Last measured · {latest ? stamp(latest.time) : 'No measurements'}{' '}
        <span>
          · {day === today ? 'Today' : dateLabel(dayStart(day))} ·{' '}
          {sampleMode ? 'Sample data' : 'Wearable data'}
          {scenario === 'offline' || (!sampleMode && connection === 'offline')
            ? ' · Device offline, readings are stale'
            : ''}
        </span>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="card trend-card">
            <SectionTitle
              title="Heart rate trend"
              icon={<Activity size={22} />}
              action={<TextLink to={`/history?date=${day}`}>View History</TextLink>}
            />
            <div className="trend-summary">
              <div>
                <strong>
                  {latest ? formatValue(validValue(latest, 'heartRate'), 'heartRate') : '—'}
                  <small> bpm</small>
                </strong>
                <span>
                  <i className="legend-dot" />
                  Heart rate · {latest ? qualityText(latest, 'heartRate') : 'No reading'} ·{' '}
                  {sampleMode ? 'sample readings' : 'wearable readings'}
                </span>
              </div>
              <Segments
                label="Dashboard chart range"
                value={range}
                onChange={setRange}
                options={['1H', '6H', '24H'].map((value) => ({ value, label: value }))}
              />
            </div>
            <HealthChart readings={chartRows} alerts={alerts} />
            <div className="chart-footnote">
              {chartRows.filter((r) => validValue(r, 'heartRate') !== null).length} calculated
              readings <span>Unstable values are included; gaps indicate missing readings</span>
            </div>
          </section>
        </div>
        <aside className="dashboard-aside">
          <Link to="/alerts" className={`fall-card ${newEvent ? 'attention' : ''}`}>
            <span className="icon-tile">
              {newEvent ? <TriangleAlert size={25} /> : <ShieldCheck size={26} />}
            </span>
            <div>
              <strong>
                {newEvent
                  ? newEvent.type === 'sos'
                    ? 'New SOS alert'
                    : 'Suspected fall · escalated'
                  : !readings.length
                    ? 'Fall status unavailable'
                    : 'No current fall alert'}
              </strong>
              <p>
                {newEvent
                  ? 'Review this sample event'
                  : !readings.length
                    ? 'No wearable measurements'
                    : scenario === 'offline'
                      ? 'Last known sample · Device offline'
                      : 'Latest wearable sample'}
              </p>
            </div>
            {newEvent ? (
              <ChevronRight size={20} />
            ) : (
              <span className="round-check">
                <Check size={19} />
              </span>
            )}
          </Link>
          <AIInsights />
        </aside>
      </div>
      <div className="page-bottom-note">
        <Badge tone="muted">{sampleMode ? 'Demo — sample data' : 'Paired wearable data'}</Badge>
        <span>Thoughtfully connected. Always with care.</span>
      </div>
    </>
  )
}

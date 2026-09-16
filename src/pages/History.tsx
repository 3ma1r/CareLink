import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, FileText, Footprints, Heart, Info } from 'lucide-react'
import { useCare } from '../state'
import {
  DAY,
  dateKey,
  dateLabel,
  dayStart,
  filterReadings,
  formatValue,
  metrics,
  stamp,
  summarize,
  validValue,
} from '../data/demo'
import type { Metric } from '../data/demo'
import {
  Badge,
  EmptyState,
  Modal,
  PageHeading,
  SectionTitle,
  Segments,
  Stats,
} from '../components/UI'
import { HealthChart, MovementChart } from '../components/Charts'
type Period = 'today' | 'week' | 'month' | 'custom'
export default function History() {
  const { patient, readings, alerts, sampleMode, dataNow } = useCare()
  const today = dateKey(dataNow)
  const firstDay = dateKey(dataNow - 29 * DAY)
  const [params, setParams] = useSearchParams()
  const queryMetric = params.get('metric')
  const metric: Metric =
    queryMetric === 'spo2' || queryMetric === 'temperature' ? queryMetric : 'heartRate'
  const queryDay = params.get('date')
  const initialDay =
    queryDay && /^\d{4}-\d{2}-\d{2}$/.test(queryDay) && queryDay >= firstDay && queryDay <= today
      ? queryDay
      : today
  const [period, setPeriod] = useState<Period>(initialDay === today ? 'today' : 'custom')
  const [startDate, setStartDate] = useState(initialDay)
  const [endDate, setEndDate] = useState(initialDay)
  const [range, setRange] = useState('24H')
  const [report, setReport] = useState(false)
  const [all, setAll] = useState(false)
  const invalidDates = period === 'custom' && (!startDate || !endDate || startDate > endDate)
  const start =
    period === 'custom'
      ? dayStart(startDate)
      : dayStart(today) - (period === 'week' ? 6 : period === 'month' ? 29 : 0) * DAY
  const end = period === 'custom' ? Math.min(dayStart(endDate) + DAY - 1, dataNow) : dataNow
  const selected = useMemo(
    () => (invalidDates ? [] : filterReadings(readings, start, end)),
    [readings, start, end, invalidDates],
  )
  const multiDay = end - start > DAY
  const chartRows = multiDay
    ? selected
    : filterReadings(selected, Math.max(start, end - parseInt(range) * 3600000), end)
  const selectedAlerts = alerts.filter((a) => a.time >= start && a.time <= end)
  const latest = selected.at(-1)
  const stats = summarize(selected, metric)
  const periodLabel = invalidDates
    ? 'Invalid date range'
    : `${dateLabel(start, true)}${multiDay ? ` – ${dateLabel(end, true)}` : ''}`
  function changePeriod(value: Period) {
    setPeriod(value)
    setAll(false)
  }
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={17} />
        Back to dashboard
      </Link>
      <PageHeading
        title="Health trends"
        subtitle={<>{patient.name}’s health, a little clearer over time.</>}
        action={
          <button
            className="button primary"
            disabled={invalidDates}
            onClick={() => setReport(true)}
          >
            <Download size={18} />
            Download PDF Report
          </button>
        }
      />
      <section className="history-filters card">
        <Segments
          label="Health metric"
          className="metric-tabs"
          options={(Object.keys(metrics) as Metric[]).map((value) => ({
            value,
            label: metrics[value].label,
          }))}
          value={metric}
          onChange={(value) => {
            const next = new URLSearchParams(params)
            next.set('metric', value)
            setParams(next, { replace: true })
          }}
        />
        <div className="history-period-row">
          <Segments
            label="History period"
            options={[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Last 7 days' },
              { value: 'month', label: 'Last 30 days' },
              { value: 'custom', label: 'Custom' },
            ]}
            value={period}
            onChange={changePeriod}
          />
          <span className="period-label">{periodLabel}</span>
        </div>
        {period === 'custom' && (
          <div className="custom-dates">
            <label>
              From
              <input
                type="date"
                aria-label="History start date"
                min={firstDay}
                max={today}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                aria-label="History end date"
                min={firstDay}
                max={today}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            {invalidDates && (
              <p className="form-error" role="alert">
                Choose an end date on or after the start date.
              </p>
            )}
          </div>
        )}
      </section>
      <div className="history-layout">
        <div>
          <section className="card history-chart-card">
            <SectionTitle
              title={metrics[metric].label}
              icon={<Heart size={21} />}
              action={<Badge tone="muted">{sampleMode ? 'Sample readings' : 'Wearable readings'}</Badge>}
            />
            <div className="trend-summary">
              <div>
                <strong>
                  {latest ? formatValue(validValue(latest, metric), metric) : '—'}
                  <small> {metrics[metric].unit}</small>
                </strong>
                <span>Last measured · {latest ? stamp(latest.time) : 'No readings'}</span>
              </div>
              {!multiDay && (
                <Segments
                  label="History chart range"
                  options={['1H', '6H', '24H'].map((value) => ({ value, label: value }))}
                  value={range}
                  onChange={setRange}
                />
              )}
            </div>
            <HealthChart
              readings={chartRows}
              metric={metric}
              multiDay={multiDay}
              alerts={selectedAlerts}
            />
            <div className="chart-footnote">
              {!multiDay ? `${range} chart window` : 'Full selected period'}
              <span>All times in Muscat · GST (UTC+4)</span>
            </div>
            <Stats readings={selected} metric={metric} />
            <p className="data-note">
              <Info size={14} />
              Period statistics include {stats.count} valid readings. Missing and unstable values
              are excluded.
            </p>
            {metric === 'temperature' && (
              <p className="inline-notice">
                Sensor temperature is a wearable sensor reading, not validated core body
                temperature.
              </p>
            )}
          </section>
          <section className="card movement-section" id="movement">
            <SectionTitle title="Movement activity" icon={<Footprints size={22} />} />
            <p className="section-subtitle">
              {multiDay
                ? `Daily average ${sampleMode ? 'sample' : 'wearable'} intensity · 0–100`
                : `${sampleMode ? 'Sample' : 'Wearable'} movement intensity · 0–100`}
            </p>
            <MovementChart readings={selected} multiDay={multiDay} />
          </section>
          <section className="card events-card">
            <SectionTitle
              title="Events in this period"
              action={
                <Link className="text-link" to="/alerts">
                  All alerts →
                </Link>
              }
            />
            {selectedAlerts.length ? (
              selectedAlerts.map((a) => (
                <Link key={a.id} to={`/alerts?event=${a.id}`} className="event-row">
                  <span className={`event-dot ${a.severity === 'High' ? 'high' : ''}`} />
                  <div>
                    <strong>{a.title}</strong>
                    <small>{stamp(a.time)}</small>
                  </div>
                  <Badge tone={a.severity === 'High' ? 'red' : 'amber'}>{a.severity}</Badge>
                </Link>
              ))
            ) : (
              <p className="section-subtitle">No events in the selected period.</p>
            )}
          </section>
        </div>
        <section className="card readings-card">
          <SectionTitle
            title="Recent readings"
            action={<span className="subtle-count">{selected.length}</span>}
          />
          <p className="section-subtitle">{metrics[metric].label} · newest first</p>
          {selected.length ? (
            <>
              <div className="reading-list">
                {selected
                  .slice()
                  .reverse()
                  .slice(0, all ? 60 : 10)
                  .map((r) => (
                    <div key={r.id} className="reading-row">
                      <div>
                        <strong>{stamp(r.time)}</strong>
                        <small className={r.quality[metric] === 'Good' ? '' : 'text-warning'}>
                          {r.quality[metric]} quality
                        </small>
                      </div>
                      <span className="reading-value">
                        {formatValue(validValue(r, metric), metric)}
                        <small> {metrics[metric].unit}</small>
                      </span>
                    </div>
                  ))}
              </div>
              {selected.length > 10 && (
                <button className="button secondary full" onClick={() => setAll(!all)}>
                  {all
                    ? 'Show fewer readings'
                    : `Show ${Math.min(60, selected.length)} recent readings`}
                </button>
              )}
              {all && selected.length > 60 && (
                <p className="data-note">
                  Showing the newest 60 of {selected.length} samples. Use a shorter period to
                  inspect older readings.
                </p>
              )}
            </>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>
      <Modal
        open={report}
        onClose={() => setReport(false)}
        title="Health report preview"
        className="report-modal"
      >
        <div className="report-cover">
          <span className="icon-tile">
            <FileText size={30} />
          </span>
          <Badge>{sampleMode ? 'Demo — sample report' : 'Wearable report preview'}</Badge>
          <h3>{patient.name}’s health summary</h3>
          <p>
            {patient.age} years · Sample location: {patient.city}, Oman
          </p>
          <strong>{periodLabel}</strong>
        </div>
        <div className="report-content">
          <h3>{metrics[metric].label}</h3>
          <Stats readings={selected} metric={metric} />
          <div className="report-facts">
            <span>
              Valid readings<strong>{stats.count}</strong>
            </span>
            <span>
              Sample events<strong>{selectedAlerts.length}</strong>
            </span>
            <span>
              Time zone<strong>Muscat · GST</strong>
            </span>
          </div>
          <p className="inline-notice">
            <Info size={18} />
            PDF export will be added in the reporting stage. This is a preview; no file has been
            downloaded.
          </p>
          <p className="data-note">
            {sampleMode ? 'Sample data only. ' : ''}Invalid readings are excluded. This monitoring prototype does not
            provide a medical assessment.
          </p>
          <button className="button primary full" onClick={() => setReport(false)}>
            Done
          </button>
        </div>
      </Modal>
    </>
  )
}

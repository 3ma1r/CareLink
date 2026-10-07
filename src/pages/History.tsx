import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Footprints, Heart, Info } from 'lucide-react'
import { useCare } from '../state'
import { useAuth } from '../auth/AuthProvider'
import { useDevice } from '../device/DeviceProvider'
import { alertValue } from '../alerts/alerts'
import { isIosPdfPreview, deliverReport } from '../reports/download'
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
  summarize,
  validValue,
} from '../data/demo'
import type { Metric } from '../data/demo'
import { Badge, EmptyState, PageHeading, SectionTitle, Segments, Stats } from '../components/UI'
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
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')
  const auth = useAuth()
  const device = useDevice()
  const reportOwner = useRef('')
  useEffect(() => {
    reportOwner.current = `${auth.user?.id}:${auth.patient?.id}:${device.device?.id}`
    return () => {
      reportOwner.current = ''
    }
  }, [auth.user?.id, auth.patient?.id, device.device?.id])
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
  async function downloadReport() {
    if (reportBusy || !auth.user || !auth.patient || auth.status !== 'signed-in') return
    const owner = reportOwner.current
    const patientId = auth.patient.id
    const deviceId = device.device?.id ?? null
    if (
      auth.patient.caregiver_id !== auth.user.id ||
      (device.device && device.device.paired_patient_id !== patientId)
    )
      return
    setReportBusy(true)
    setReportError('')
    const ios = isIosPdfPreview(navigator)
    const preview = ios ? window.open('', '_blank') : null
    if (preview) {
      preview.opener = null
      preview.document.title = 'Preparing CareLink report'
      preview.document.body.textContent = 'Preparing report…'
    }
    try {
      const [{ generateReport, reportFilename }, { loadReportSource }] = await Promise.all([
        import('../reports/report'),
        import('../reports/source'),
      ])
      const generatedAt = Date.now()
      const source =
        import.meta.env.MODE === 'test'
          ? {
              patientId,
              deviceId,
              measurements: device.measurements,
              alerts: device.alerts,
              baselines: device.personalizedBaselines,
              insights: device.personalizedInsights,
              asOf: end,
              updatedAt: generatedAt,
            }
          : await loadReportSource(patientId, deviceId, start, end)
      const fontResponse = await fetch('/assets/report-font.ttf')
      if (!fontResponse.ok) throw new Error('Report font unavailable')
      const bytes = new Uint8Array(await fontResponse.arrayBuffer())
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const buffer = generateReport(
        {
          patientName: auth.patient.full_name,
          source,
          start,
          end,
          generatedAt,
          testOnly: import.meta.env.MODE === 'test',
        },
        btoa(binary),
      )
      if (!owner || reportOwner.current !== owner) {
        preview?.close()
        return
      }
      deliverReport(buffer, reportFilename(generatedAt), preview)
    } catch {
      preview?.close()
      if (reportOwner.current === owner)
        setReportError(
          'Your report could not be prepared. Check your connection or choose a shorter period, then try again.',
        )
    } finally {
      setReportBusy(false)
    }
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
            disabled={invalidDates || reportBusy || device.loading}
            onClick={() => void downloadReport()}
          >
            <Download size={18} />
            {reportBusy ? 'Preparing report…' : 'Download PDF Report'}
          </button>
        }
      />
      {reportError && (
        <p className="form-error" role="alert">
          {reportError}
        </p>
      )}
      <span role="status" className="sr-only">
        {reportBusy ? 'Preparing report…' : ''}
      </span>
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
              action={
                <Badge tone="muted">{sampleMode ? 'Sample readings' : 'Wearable readings'}</Badge>
              }
            />
            <div className="trend-summary">
              <div>
                <strong>
                  {latest ? formatValue(validValue(latest, metric), metric) : '—'}
                  <small> {metrics[metric].unit}</small>
                </strong>
                <span>
                  Last measured · {latest ? stamp(latest.time) : 'No readings'} ·{' '}
                  {latest ? qualityText(latest, metric) : 'No reading'}
                </span>
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
              Period statistics include {stats.count} calculated readings. Unstable numerical values
              are included; missing readings are excluded.
            </p>
            {metric === 'temperature' && (
              <p className="inline-notice">
                Temperature is a wearable reading, not validated core body temperature.
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
                  <span
                    className={`event-dot ${a.severity === 'High' || a.severity === 'Critical' ? 'high' : ''}`}
                  />
                  <div>
                    <strong>{a.title}</strong>
                    <small>
                      Measured {stamp(a.time)}
                      {a.observedValue != null ? ` · ${alertValue(a)}` : ''}
                    </small>
                  </div>
                  <Badge
                    tone={a.severity === 'High' || a.severity === 'Critical' ? 'red' : 'amber'}
                  >
                    {a.severity}
                  </Badge>
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
                          {qualityText(r, metric)}
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
    </>
  )
}

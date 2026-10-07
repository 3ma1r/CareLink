import { useMemo, useState } from 'react'
import { Activity, Droplets, Heart, Thermometer } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { stamp } from '../data/demo'
import { useDevice } from '../device/DeviceProvider'
import { createHealthSummary } from '../summaries/summary'
import type { SummaryPeriod } from '../summaries/summary'
import { useCare } from '../state'
import { Badge, Segments } from './UI'

const icons = { heartRate: Heart, spo2: Droplets, temperature: Thermometer }
const names = { heartRate: 'Heart rate', spo2: 'SpO₂', temperature: 'Sensor temperature' }

export function PersonalizedHealthSummary() {
  const [period, setPeriod] = useState<SummaryPeriod>('24h')
  const { patient } = useAuth()
  const { sampleMode, online } = useCare()
  const { device, summarySnapshot, summaryLoading, summaryError } = useDevice()
  const snapshot =
    summarySnapshot &&
    summarySnapshot.patientId === patient?.id &&
    summarySnapshot.deviceId === (device?.id ?? null)
      ? summarySnapshot
      : null
  const result = useMemo(
    () => (snapshot ? createHealthSummary(snapshot, period) : null),
    [snapshot, period],
  )
  const offline = !online
  const stale = offline || !!summaryError

  return (
    <section className="health-summary-section card" aria-labelledby="health-summary-title">
      <div className="health-summary-heading">
        <div>
          <span className="eyebrow">PERSONALIZED CAREGIVER OVERVIEW</span>
          <h2 id="health-summary-title">
            <Activity size={21} /> Personalized Health Summary
          </h2>
          <p>Based on CareLink’s personalized statistical analysis and verified wearable data.</p>
        </div>
        <Segments
          label="Health summary period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: '24h', label: 'Past 24 hours' },
            { value: '7d', label: 'Past 7 days' },
          ]}
        />
      </div>
      {sampleMode ? (
        <p className="health-summary-notice" role="status">
          Sample mode: no production health summary is shown. Sign in to a production account to see
          caregiver-owned data.
        </p>
      ) : null}
      {!sampleMode && !snapshot && summaryLoading ? (
        <p className="health-summary-notice" role="status">
          Loading the personalized health summary…
        </p>
      ) : null}
      {!sampleMode && !snapshot && !summaryLoading && (summaryError || offline) ? (
        <p className="health-summary-notice" role="alert">
          Summary unavailable.{' '}
          {offline
            ? 'You are offline and no verified summary is cached in this session.'
            : summaryError}
        </p>
      ) : null}
      {!sampleMode && !snapshot && !summaryLoading && !summaryError && !offline ? (
        <p className="health-summary-notice" role="status">
          Waiting for CareLink data. No summary is available yet.
        </p>
      ) : null}
      {!sampleMode && result ? (
        <>
          {stale ? (
            <p className="health-summary-notice" role="status">
              {offline ? 'Offline' : 'Refresh failed'} — showing the last successfully fetched
              summary, not current data.
            </p>
          ) : null}
          {summaryLoading && !stale ? (
            <p className="health-summary-refresh" role="status">
              Checking for new readings…
            </p>
          ) : null}
          <p className="health-summary-overview">{result.overview}</p>
          <div className="health-summary-context" aria-label="Analysis and health alert context">
            <span>
              <b>Personalized changes</b> {result.activeInsights} active · {result.resolvedInsights}{' '}
              resolved in period
            </span>
            <span>
              <b>Fixed-rule health alerts</b> {result.activeAlerts} active ·{' '}
              {result.acknowledgedAlerts} acknowledged · {result.resolvedAlerts} resolved in period
            </span>
          </div>
          <div className="health-summary-metrics">
            {result.metrics.map((item) => {
              const Icon = icons[item.metric]
              return (
                <article className="health-summary-metric" key={item.metric}>
                  <h3>
                    <Icon size={18} />
                    {names[item.metric]}
                  </h3>
                  <p>{item.text}</p>
                  <details>
                    <summary>Data and rule details</summary>
                    <p>{item.detail}</p>
                  </details>
                </article>
              )
            })}
          </div>
          <div className="health-summary-footer">
            <span>
              Selected period: {stamp(result.start)} to {stamp(result.end)}
            </span>
            <span>Last updated: {stamp(result.updatedAt)}</span>
          </div>
        </>
      ) : null}
      <div className="health-summary-disclaimer">
        <Badge tone="muted">Decision support</Badge>
        <p>
          This summary supports caregiver awareness. It is not a medical diagnosis and does not
          replace professional medical advice. Personalized changes are distinct from fixed-rule
          health alerts.
        </p>
      </div>
    </section>
  )
}

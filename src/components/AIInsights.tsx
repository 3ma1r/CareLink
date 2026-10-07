import { Activity, CheckCircle2, Clock3, ShieldCheck, Sparkles } from 'lucide-react'
import { useCare } from '../state'
import { Badge } from './UI'
import {
  evaluationStateLabel,
  formatPersonalizedValue,
  insightEvidence,
  insightMessage,
  personalizedMetric,
  selectPersonalizedPresentation,
} from '../insights/insights'
import type { PersonalizedBaseline, PersonalizedInsight } from '../device/DeviceProvider'

const metricOrder: PersonalizedBaseline['metric'][] = ['heart_rate', 'spo2', 'temperature']
const time = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat',
})

function BaselineCard({ metric, baseline }: { metric: PersonalizedBaseline['metric']; baseline?: PersonalizedBaseline }) {
  const definition = personalizedMetric[metric]
  if (!baseline) {
    return (
      <article className="baseline-card empty">
        <h3>{definition.label}</h3>
        <strong>No baseline data yet</strong>
        <p>Waiting for the first secure analysis refresh.</p>
      </article>
    )
  }
  const sampleProgress = Math.min(100, (baseline.sample_count / baseline.required_sample_count) * 100)
  const ready = baseline.readiness === 'ready'
  return (
    <article className={`baseline-card ${ready ? 'ready' : 'learning'}`}>
      <div className="baseline-heading">
        <span className="insight-metric-icon"><Activity size={17} /></span>
        <div>
          <h3>{definition.label}</h3>
          <strong>{ready ? 'Personal baseline ready' : `Learning ${definition.learningLabel} baseline`}</strong>
        </div>
        <Badge tone={ready ? 'blue' : 'muted'}>{ready ? 'Ready' : 'Learning'}</Badge>
      </div>
      <progress value={sampleProgress} max="100" aria-label={`${definition.label} baseline progress`} />
      <div className="baseline-requirements">
        <span><b>{baseline.sample_count}</b> of {baseline.required_sample_count} good readings</span>
        <span><b>{baseline.distinct_day_count}</b> of {baseline.required_day_count} UTC observation days</span>
        <span><b>{Math.floor(baseline.coverage_hours)}</b> of {Math.floor(baseline.required_coverage_hours)} coverage hours</span>
      </div>
      <p className="baseline-state">{evaluationStateLabel(baseline.latest_evaluation_state)}</p>
      <details>
        <summary>Technical baseline details</summary>
        <dl>
          <div><dt>Observed median</dt><dd>{baseline.baseline_median === null ? 'Not available' : formatPersonalizedValue(metric, baseline.baseline_median)}</dd></div>
          <div><dt>Median absolute deviation</dt><dd>{baseline.median_absolute_deviation ?? 'Not available'}</dd></div>
          <div><dt>Algorithm</dt><dd>{baseline.algorithm_version}</dd></div>
        </dl>
      </details>
    </article>
  )
}

function InsightCard({ insight }: { insight: PersonalizedInsight }) {
  const active = insight.status === 'active'
  return (
    <article className={`personalized-insight ${insight.status}`}>
      <div className="personalized-insight-heading">
        <span className="insight-metric-icon">{active ? <Sparkles size={18} /> : <CheckCircle2 size={18} />}</span>
        <div>
          <h3>{insightMessage(insight)}</h3>
          <p>{insightEvidence(insight)}</p>
        </div>
        <Badge tone={active ? 'amber' : 'muted'}>{active ? 'Active insight' : 'Resolved'}</Badge>
      </div>
      <div className="insight-context">
        <span><Clock3 size={14} />Last observed {time.format(new Date(insight.last_observed_at))}</span>
        <span>Data confidence: {insight.confidence}</span>
      </div>
      <p className="confidence-note">Confidence describes data sufficiency and consistency, not the probability of illness.</p>
      <details>
        <summary>Why this was flagged</summary>
        <dl>
          <div><dt>Recent median</dt><dd>{formatPersonalizedValue(insight.metric, insight.recent_median)}</dd></div>
          <div><dt>Baseline median</dt><dd>{formatPersonalizedValue(insight.metric, insight.baseline_median)}</dd></div>
          <div><dt>Difference</dt><dd>{formatPersonalizedValue(insight.metric, insight.deviation)}</dd></div>
          <div><dt>Robust deviation score</dt><dd>{insight.robust_score.toFixed(2)}</dd></div>
          <div><dt>Baseline evidence</dt><dd>{insight.baseline_sample_count} good readings</dd></div>
          <div><dt>Algorithm</dt><dd>{insight.algorithm_version}</dd></div>
        </dl>
      </details>
    </article>
  )
}

export function AIInsights() {
  const {
    aiState, sampleMode, personalizedBaselines, personalizedInsights,
    insightsLoading, insightError,
  } = useCare()
  const { baselines, insights, error } = selectPersonalizedPresentation(
    sampleMode,
    aiState,
    personalizedBaselines,
    personalizedInsights,
    insightError,
  )
  const active = insights.filter((insight) => insight.status === 'active')
  const resolved = insights.filter((insight) => insight.status === 'resolved')
  const hasUsual = baselines.some((baseline) => baseline.latest_evaluation_state === 'usual')
  const needsRecent = baselines.some((baseline) => baseline.latest_evaluation_state === 'insufficient_recent_data')

  return (
    <section className="personalized-section card" aria-labelledby="personalized-insights-title">
      <div className="personalized-title">
        <div>
          <span className="eyebrow">PROTOTYPE DECISION SUPPORT</span>
          <h2 id="personalized-insights-title"><Sparkles size={21} />Personalized Insights</h2>
          <p>Compares good-quality readings with this patient’s own recent observed pattern.</p>
        </div>
        <Badge tone="muted">No external AI service</Badge>
      </div>
      <div className="insight-boundary" role="note">
        <span><ShieldCheck size={18} /><b>Health alert</b> Fixed safety rule requires attention.</span>
        <span><Sparkles size={18} /><b>Personalized insight</b> Unusual change from this patient’s recent pattern.</span>
      </div>

      {insightsLoading && !sampleMode ? <p className="insight-empty">Loading personalized analysis…</p> : null}
      {error ? <p className="insight-error" role="alert">Personalized analysis is temporarily unavailable. Health alerts continue to work independently.</p> : null}
      {!insightsLoading && !error ? (
        <>
          <div className="baseline-grid">
            {metricOrder.map((metric) => (
              <BaselineCard key={metric} metric={metric} baseline={baselines.find((row) => row.metric === metric)} />
            ))}
          </div>
          {active.length ? (
            <div className="insight-list" aria-label="Active personalized insights">
              <h3>Changes to review</h3>
              {active.map((insight) => <InsightCard key={insight.id} insight={insight} />)}
            </div>
          ) : (
            <div className="insight-empty">
              <strong>{needsRecent ? 'More recent good-quality data is needed' : hasUsual ? 'Latest evaluated patterns were close to baseline' : 'No personalized insight yet'}</strong>
              <p>{needsRecent ? 'Missing or unstable readings are not treated as healthy and cannot resolve an insight.' : hasUsual ? 'This describes statistical similarity only; it is not a medical assessment.' : 'Learning progress appears per metric as trustworthy history becomes available.'}</p>
            </div>
          )}
          {resolved.length ? (
            <details className="resolved-insights">
              <summary>Resolved personalized insights ({resolved.length})</summary>
              <div className="insight-list">
                {resolved.map((insight) => <InsightCard key={insight.id} insight={insight} />)}
              </div>
            </details>
          ) : null}
        </>
      ) : null}
      <p className="personalized-disclaimer">Personalized insights describe this patient’s recent sensor pattern. They are not medically validated normal ranges, do not diagnose illness, and do not replace professional medical advice.</p>
    </section>
  )
}

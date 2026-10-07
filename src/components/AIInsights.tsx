import { useState } from 'react'
import { Activity, Sparkles } from 'lucide-react'
import { useCare } from '../state'
import { stamp } from '../data/demo'
import { Badge } from './UI'
import { PersonalizedHealthSummary } from './PersonalizedHealthSummary'
import {
  evaluationStateLabel,
  formatPersonalizedValue,
  insightEvidence,
  insightMessage,
  personalizedMetric,
  selectPersonalizedPresentation,
} from '../insights/insights'

export function AIInsights() {
  const care = useCare()
  const [expanded, setExpanded] = useState(false)
  const { baselines, insights, error } = selectPersonalizedPresentation(
    care.sampleMode,
    care.aiState,
    care.personalizedBaselines,
    care.personalizedInsights,
    care.insightError,
  )
  const active = insights.filter((item) => item.status === 'active')
  const resolved = insights.filter((item) => item.status === 'resolved')
  return (
    <section className="personalized-section card" aria-labelledby="personalized-insights-title">
      <div className="personalized-title">
        <div>
          <h2 id="personalized-insights-title">
            <Sparkles size={21} />
            Personalized Insights
          </h2>
          <p>A clearer view of changes from your patient's usual pattern.</p>
        </div>
      </div>
      {care.insightsLoading && !care.sampleMode && <p role="status">Checking recent readings…</p>}
      {error ? (
        <p className="insight-error" role="alert">
          Personalized analysis is temporarily unavailable. Health alerts continue to work
          independently.
        </p>
      ) : (
        <>
          <div className="baseline-grid">
            {(['heart_rate', 'spo2', 'temperature'] as const).map((metric) => {
              const baseline = baselines.find((item) => item.metric === metric)
              const changed = active.some((item) => item.metric === metric)
              const ready = baseline?.readiness === 'ready'
              return (
                <article
                  key={metric}
                  className={`baseline-card ${ready ? 'ready' : baseline ? 'learning' : 'empty'}`}
                >
                  <div className="baseline-heading">
                    <span className="insight-metric-icon">
                      <Activity size={17} />
                    </span>
                    <h3>{personalizedMetric[metric].label}</h3>
                    <Badge tone={changed ? 'amber' : ready ? 'teal' : 'muted'}>
                      {changed ? 'Change detected' : ready ? 'Baseline ready' : 'Learning'}
                    </Badge>
                  </div>
                  <details>
                    <summary>View details</summary>
                    <p>
                      {ready
                        ? 'Personal baseline ready.'
                        : 'More good-quality readings are needed to establish this baseline.'}
                    </p>
                    {baseline && (
                      <>
                        <p>{evaluationStateLabel(baseline.latest_evaluation_state)}</p>
                        <dl>
                          <div>
                            <dt>Median absolute deviation</dt>
                            <dd>{baseline.median_absolute_deviation ?? 'Not available'}</dd>
                          </div>
                          <div>
                            <dt>Good readings</dt>
                            <dd>
                              {baseline.sample_count} / {baseline.required_sample_count}
                            </dd>
                          </div>
                          <div>
                            <dt>Observation days (UTC)</dt>
                            <dd>
                              {baseline.distinct_day_count} / {baseline.required_day_count}
                            </dd>
                          </div>
                          <div>
                            <dt>Coverage hours</dt>
                            <dd>
                              {Math.floor(baseline.coverage_hours)} /{' '}
                              {baseline.required_coverage_hours}
                            </dd>
                          </div>
                          <div>
                            <dt>Personal baseline</dt>
                            <dd>
                              {baseline.baseline_median == null
                                ? 'Not available'
                                : formatPersonalizedValue(metric, baseline.baseline_median)}
                            </dd>
                          </div>
                        </dl>
                      </>
                    )}
                  </details>
                </article>
              )
            })}
          </div>
          {!!active.length && (
            <div className="insight-list" aria-label="Active personalized insights">
              <h3>Changes to review</h3>
              {active.map((item) => (
                <article className="personalized-insight active" key={item.id}>
                  <h3>{insightMessage(item)}</h3>
                  <details>
                    <summary>View details</summary>
                    <p>{insightEvidence(item)}</p>
                    <p>Last observed: {stamp(Date.parse(item.last_observed_at))}</p>
                    <p>Robust deviation score: {item.robust_score.toFixed(2)}</p>
                    <p>
                      Recent: {formatPersonalizedValue(item.metric, item.recent_median)} · Personal
                      baseline: {formatPersonalizedValue(item.metric, item.baseline_median)}
                    </p>
                    <p>
                      Data confidence: {item.confidence}. This describes the available evidence, not
                      the probability of illness.
                    </p>
                  </details>
                </article>
              ))}
            </div>
          )}
          {!!resolved.length && (
            <details className="resolved-insights">
              <summary>Resolved personalized insights ({resolved.length})</summary>
              {resolved.map((item) => (
                <article className="personalized-insight resolved" key={item.id}>
                  <h3>{insightMessage(item)}</h3>
                  <p>Resolved · {insightEvidence(item)}</p>
                </article>
              ))}
            </details>
          )}
        </>
      )}
      <button
        type="button"
        className="button secondary summary-toggle"
        aria-expanded={expanded}
        aria-controls="personalized-health-summary"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Hide health summary' : 'View health summary'}
      </button>
      <div id="personalized-health-summary" hidden={!expanded}>
        <PersonalizedHealthSummary />
      </div>
    </section>
  )
}

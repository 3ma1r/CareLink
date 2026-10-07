import type { AIState } from '../data/demo'
import type { PersonalizedBaseline, PersonalizedInsight } from '../device/DeviceProvider'

export const personalizedMetric = {
  heart_rate: { label: 'Heart rate', learningLabel: 'heart-rate', unit: 'bpm', decimals: 0 },
  spo2: { label: 'SpO₂', learningLabel: 'SpO₂', unit: '%', decimals: 0 },
  temperature: { label: 'Temperature', learningLabel: 'temperature', unit: '°C', decimals: 1 },
} as const

export function insightMessage(insight: PersonalizedInsight) {
  const metric = personalizedMetric[insight.metric].label
  return `${metric} has been consistently ${insight.direction} than this patient’s recent baseline.`
}

export function insightEvidence(insight: PersonalizedInsight) {
  const minutes = Math.max(
    1,
    Math.round(
      (Date.parse(insight.evaluation_window_end) - Date.parse(insight.evaluation_window_start)) /
        60_000,
    ),
  )
  return `Based on ${insight.recent_sample_count} recent good-quality readings over ${minutes} minutes.`
}

export function formatPersonalizedValue(metric: PersonalizedInsight['metric'], value: number) {
  const definition = personalizedMetric[metric]
  return `${value.toFixed(definition.decimals)} ${definition.unit}`
}

export function evaluationStateLabel(state: PersonalizedBaseline['latest_evaluation_state']) {
  if (state === 'usual') return 'Latest pattern was close to baseline'
  if (state === 'unusual') return 'Latest pattern differed from baseline'
  if (state === 'insufficient_recent_data') return 'More recent good-quality readings needed'
  if (state === 'learning') return 'Still learning this baseline'
  return 'Waiting for a new post-deployment evaluation'
}

const SAMPLE_TIME = '2026-09-14T08:00:00.000Z'

function sampleBaseline(
  metric: PersonalizedBaseline['metric'],
  readiness: PersonalizedBaseline['readiness'],
  sampleCount: number,
  dayCount: number,
  coverageHours: number,
  latest: PersonalizedBaseline['latest_evaluation_state'],
): PersonalizedBaseline {
  const median = metric === 'heart_rate' ? 72 : metric === 'spo2' ? 97 : 36.4
  return {
    id: `sample-baseline-${metric}`, patient_id: 'sample-patient', device_id: 'sample-device',
    metric, readiness, sample_count: sampleCount, required_sample_count: 30,
    distinct_day_count: dayCount, required_day_count: 3, coverage_hours: coverageHours,
    required_coverage_hours: 48, baseline_median: median,
    median_absolute_deviation: metric === 'temperature' ? 0 : 1,
    robust_scale: metric === 'heart_rate' ? 2 : metric === 'spo2' ? 1 : 0.2,
    baseline_window_start: '2026-09-07T08:00:00.000Z',
    baseline_window_end: '2026-09-14T07:45:00.000Z',
    baseline_excluded_before: '2026-09-14T07:45:00.000Z',
    latest_evaluation_state: latest,
    latest_recent_sample_count: latest ? 3 : null,
    latest_evaluated_at: latest ? SAMPLE_TIME : null,
    algorithm_version: 'carelink_personalized_mad_v1',
    calculated_at: SAMPLE_TIME, updated_at: SAMPLE_TIME,
  }
}

function sampleInsight(status: PersonalizedInsight['status']): PersonalizedInsight {
  const resolved = status === 'resolved'
  return {
    id: `sample-insight-${status}`, patient_id: 'sample-patient', device_id: 'sample-device',
    metric: resolved ? 'temperature' : 'heart_rate', direction: resolved ? 'lower' : 'higher',
    status, confidence: resolved ? 'high' : 'moderate',
    evaluation_window_start: '2026-09-14T07:45:00.000Z', evaluation_window_end: SAMPLE_TIME,
    baseline_sample_count: resolved ? 74 : 42, recent_sample_count: 3,
    baseline_median: resolved ? 36.4 : 72, recent_median: resolved ? 35.6 : 91,
    deviation: resolved ? -0.8 : 19, robust_score: resolved ? 4 : 9.5,
    direction_consistency: 1, first_observed_at: '2026-09-14T07:50:00.000Z',
    last_observed_at: SAMPLE_TIME, occurrence_count: resolved ? 2 : 1,
    first_source_measurement_id: 1, last_source_measurement_id: 3,
    first_evaluation_id: 'sample-evaluation-1', last_evaluation_id: 'sample-evaluation-3',
    resolved_at: resolved ? '2026-09-14T08:30:00.000Z' : null,
    algorithm_version: 'carelink_personalized_mad_v1', created_at: SAMPLE_TIME, updated_at: SAMPLE_TIME,
  }
}

export function personalizedPreview(state: AIState): {
  baselines: PersonalizedBaseline[]
  insights: PersonalizedInsight[]
  error: string
} {
  if (state === 'awaiting') return { baselines: [], insights: [], error: '' }
  if (state === 'unavailable') return { baselines: [], insights: [], error: 'Unable to load personalized insights.' }
  if (state === 'learning') return {
    baselines: [
      sampleBaseline('heart_rate', 'learning', 18, 2, 31, 'learning'),
      sampleBaseline('spo2', 'ready', 36, 6, 120, 'usual'),
      sampleBaseline('temperature', 'learning', 24, 4, 70, 'learning'),
    ], insights: [], error: '',
  }
  const latest = state === 'insufficient' ? 'insufficient_recent_data' : state === 'unusual' ? 'unusual' : 'usual'
  const baselines = (['heart_rate','spo2','temperature'] as const).map((metric) =>
    sampleBaseline(metric, 'ready', metric === 'temperature' ? 74 : 42, 6, 120, latest),
  )
  return {
    baselines,
    insights: state === 'unusual' ? [sampleInsight('active')] : state === 'resolved' ? [sampleInsight('resolved')] : [],
    error: '',
  }
}

export function selectPersonalizedPresentation(
  sampleMode: boolean,
  state: AIState,
  baselines: PersonalizedBaseline[],
  insights: PersonalizedInsight[],
  error: string,
) {
  return sampleMode ? personalizedPreview(state) : { baselines, insights, error }
}

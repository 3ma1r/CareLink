import { describe, expect, it } from 'vitest'
import {
  evaluationStateLabel,
  formatPersonalizedValue,
  insightEvidence,
  insightMessage,
  personalizedPreview,
  selectPersonalizedPresentation,
} from './insights'

describe('personalized insight presentation', () => {
  it('uses plain language and explains recent evidence', () => {
    const insight = personalizedPreview('unusual').insights[0]
    expect(insightMessage(insight)).toBe(
      'Heart rate has been consistently higher than this patient’s recent baseline.',
    )
    expect(insightEvidence(insight)).toBe(
      'Based on 3 recent good-quality readings over 15 minutes.',
    )
  })

  it('keeps learning readiness independent per metric', () => {
    const rows = personalizedPreview('learning').baselines
    expect(rows.map(({ metric, readiness }) => [metric, readiness])).toEqual([
      ['heart_rate', 'learning'], ['spo2', 'ready'], ['temperature', 'learning'],
    ])
  })

  it('formats metric values and honest evaluation states', () => {
    expect(formatPersonalizedValue('temperature', 36.45)).toBe('36.5 °C')
    expect(evaluationStateLabel('insufficient_recent_data')).toContain('More recent')
    expect(personalizedPreview('awaiting').insights).toEqual([])
    expect(personalizedPreview('resolved').insights[0].status).toBe('resolved')
  })

  it('never substitutes preview insights for production data', () => {
    const production = personalizedPreview('usual')
    const result = selectPersonalizedPresentation(
      false,
      'unusual',
      production.baselines,
      [],
      '',
    )

    expect(result.baselines).toBe(production.baselines)
    expect(result.insights).toEqual([])
  })
})

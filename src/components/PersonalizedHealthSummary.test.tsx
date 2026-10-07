import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SummarySource } from '../summaries/summary'

const mocked = vi.hoisted(() => ({
  patientId: 'patient-a',
  deviceId: 'device-a',
  online: true,
  sampleMode: false,
  snapshot: null as SummarySource | null,
  loading: false,
  error: '',
}))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ patient: { id: mocked.patientId } }) }))
vi.mock('../state', () => ({
  useCare: () => ({ sampleMode: mocked.sampleMode, online: mocked.online }),
}))
vi.mock('../device/DeviceProvider', () => ({
  useDevice: () => ({
    device: { id: mocked.deviceId },
    summarySnapshot: mocked.snapshot,
    summaryLoading: mocked.loading,
    summaryError: mocked.error,
  }),
}))

import { PersonalizedHealthSummary } from './PersonalizedHealthSummary'

const snapshot = (): SummarySource => ({
  patientId: 'patient-a',
  deviceId: 'device-a',
  measurements: [],
  alerts: [],
  baselines: [],
  insights: [],
  asOf: Date.parse('2026-09-14T12:00:00Z'),
  updatedAt: Date.parse('2026-09-14T12:01:00Z'),
})
const render = () => renderToStaticMarkup(<PersonalizedHealthSummary />)

describe('personalized summary UI states', () => {
  it('shows loading, error and offline states without inventing data', () => {
    mocked.sampleMode = false
    mocked.snapshot = null
    mocked.online = true
    mocked.error = ''
    mocked.loading = true
    expect(render()).toContain('Loading the personalized health summary')
    mocked.loading = false
    mocked.error = 'Refresh failed.'
    expect(render()).toContain('Summary unavailable')
    mocked.error = ''
    mocked.online = false
    expect(render()).toContain('no verified summary is cached')
    expect(render()).not.toContain('wearable readings were recorded')
  })

  it('labels a retained snapshot stale after a failed refresh or offline transition', () => {
    mocked.snapshot = snapshot()
    mocked.online = true
    mocked.error = 'Refresh failed.'
    expect(render()).toContain('showing the last successfully fetched summary, not current data')
    expect(render()).toContain('Last updated')
    mocked.error = ''
    mocked.online = false
    expect(render()).toContain('Offline — showing the last successfully fetched summary')
  })

  it('never reveals a mismatched patient or device snapshot', () => {
    mocked.online = true
    mocked.error = ''
    mocked.snapshot = { ...snapshot(), patientId: 'patient-b' }
    expect(render()).not.toContain('Last updated')
    mocked.snapshot = { ...snapshot(), deviceId: 'device-b' }
    expect(render()).not.toContain('Last updated')
  })

  it('never renders a production summary in sample mode', () => {
    mocked.sampleMode = true
    mocked.snapshot = snapshot()
    expect(render()).toContain('Sample mode: no production health summary is shown')
    expect(render()).not.toContain('Last updated')
  })
})

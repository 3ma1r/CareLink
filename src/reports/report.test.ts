import { describe, it, expect } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { generateReport, reportSections, reportFilename } from './report'
import { isIosPdfPreview } from './download'
import { formatTemperature } from '../data/format'
import type { SummarySource } from '../summaries/summary'
import type { Measurement } from '../device/DeviceProvider'

const end = Date.parse('2026-10-07T12:00:00Z')
const source: SummarySource = {
  patientId: 'secret-patient-id',
  deviceId: 'secret-device-id',
  measurements: [],
  alerts: [],
  baselines: [],
  insights: [],
  asOf: end,
  updatedAt: end,
}
const input = {
  patientName: 'Report Test Patient',
  source,
  start: end - 86400000,
  end,
  generatedAt: end,
}
const measurement: Measurement = {
  id: 1,
  device_id: source.deviceId!,
  message_id: 'secret-message-id',
  measured_at: new Date(end).toISOString(),
  received_at: new Date(end).toISOString(),
  created_at: new Date(end).toISOString(),
  heart_rate: 72,
  spo2: 97,
  sensor_temperature: 22.69,
  movement: null,
  latitude: null,
  longitude: null,
  gps_fix_at: null,
  quality: 'good',
  heart_rate_quality: 'good',
  spo2_quality: 'good',
  temperature_quality: 'good',
  confirmed_fall: false,
  battery_percent: null,
}

describe('private local PDF report', () => {
  it('renders embedded-font QA reports from synthetic evidence', () => {
    const font = readFileSync('public/assets/report-font.ttf').toString('base64')
    mkdirSync('qa/pdf', { recursive: true })
    for (const [name, measurements] of [
      ['empty', []],
      ['readings', [measurement]],
    ] as const) {
      const bytes = generateReport(
        { ...input, source: { ...source, measurements: [...measurements] } },
        font,
      )
      writeFileSync(`qa/pdf/${name}.pdf`, new Uint8Array(bytes))
      expect(bytes.byteLength).toBeGreaterThan(5000)
    }
  })
  it('creates a valid nonempty PDF and a date-specific filename', () => {
    const bytes = generateReport(input)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(3000)
    expect(new TextDecoder().decode(bytes)).toContain('%%EOF')
    expect(reportFilename(end)).toBe('CareLink-Health-Report-2026-10-07.pdf')
  })
  it('uses selected, owned numeric evidence and never serializes internal fields', () => {
    const content = JSON.stringify(
      reportSections({
        ...input,
        source: {
          ...source,
          measurements: [
            measurement,
            { ...measurement, device_id: 'another-device', sensor_temperature: 80 },
          ],
        },
      }),
    )
    expect(content).toContain('22.7 °C')
    expect(content).not.toContain('80.0')
    expect(content).not.toMatch(/secret-|message_id|device_id|patient_id|token|credential|Supabase/)
    expect(content).toContain('Report Test Patient')
  })
  it('handles missing data without sample substitution or healthy conclusions', () => {
    const content = JSON.stringify(reportSections(input))
    expect(content).toContain('No readings in this period')
    expect(content).toContain('No health conclusion')
    expect(content).not.toMatch(/Ahmed|sample|normal health/i)
  })
  it('keeps temperature display finite, correctly encoded and one decimal', () => {
    expect(formatTemperature(22.69)).toBe('22.7 °C')
    expect(formatTemperature(41.97)).toBe('42.0 °C')
    for (const value of [null, undefined, NaN, Infinity]) expect(formatTemperature(value)).toBe('—')
  })
  it('recognizes iPhone and desktop-mode iPad PDF preview paths', () => {
    expect(isIosPdfPreview({ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 })).toBe(
      true,
    )
    expect(isIosPdfPreview({ userAgent: 'Safari', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(
      true,
    )
    expect(
      isIosPdfPreview({ userAgent: 'Chrome Android', platform: 'Linux', maxTouchPoints: 5 }),
    ).toBe(false)
  })
})

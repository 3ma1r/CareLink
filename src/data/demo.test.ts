import { describe, expect, it } from 'vitest'
import {
  DAY,
  FIRST_DAY,
  SAMPLE_NOW,
  TODAY,
  dateKey,
  dayStart,
  demoSource,
  filterReadings,
  healthStatus,
  qualityText,
  scenarios,
  summarize,
  validCoordinates,
  validValue,
} from './demo'
import type { Metric, Reading } from './demo'

describe('sample timeline and data integrity', () => {
  it('uses Muscat dates regardless of the browser timezone', () => {
    expect(dateKey(Date.parse('2026-09-13T21:00:00Z'))).toBe(TODAY)
    expect(dayStart(TODAY)).toBe(Date.parse('2026-09-13T20:00:00Z'))
  })
  it('keeps measurements, device contact, and the sample clock distinct', () => {
    const data = demoSource.getSnapshot('typical')
    expect(data.readings.at(-1)?.time).toBe(SAMPLE_NOW - 60000)
    expect(data.lastContact).toBe(SAMPLE_NOW - 15000)
    expect(data.location.time).toBe(SAMPLE_NOW - 120000)
    expect(demoSource.getSnapshot('typical').readings).toEqual(data.readings)
  })
  it('stops offline readings before the last device contact', () => {
    const data = demoSource.getSnapshot('offline')
    expect(data.lastContact).toBe(SAMPLE_NOW - 3 * 3600000)
    expect(data.readings.at(-1)!.time).toBeLessThanOrEqual(data.lastContact)
    expect(data.location.stale).toBe(true)
  })
  it('actually changes dates, ranges and period summaries', () => {
    const { readings } = demoSource.getSnapshot('typical')
    const today = filterReadings(readings, dayStart(TODAY), SAMPLE_NOW)
    const week = filterReadings(readings, dayStart(TODAY) - 6 * DAY, SAMPLE_NOW)
    const month = filterReadings(readings, dayStart(FIRST_DAY), SAMPLE_NOW)
    expect(today.length).toBeLessThan(week.length)
    expect(week.length).toBeLessThan(month.length)
    expect(summarize(today, 'heartRate').avg).not.toBe(summarize(week, 'heartRate').avg)
    const lastHour = filterReadings(today, SAMPLE_NOW - 3600000, SAMPLE_NOW)
    expect(lastHour).toHaveLength(4)
  })
  it('never plots an invalid value as zero or includes it in statistics', () => {
    const base = demoSource.getSnapshot('typical').readings.at(-1)!
    const rows: Reading[] = [
      base,
      { ...base, heartRate: 0, quality: { ...base.quality, heartRate: 'Unstable' } },
      { ...base, heartRate: null, quality: { ...base.quality, heartRate: 'Missing' } },
      { ...base, heartRate: NaN },
    ]
    expect(rows.map((r) => validValue(r, 'heartRate'))).toEqual([78, null, null, null])
    expect(summarize(rows, 'heartRate')).toEqual({ min: 78, avg: 78, max: 78, count: 1 })
  })
  it('preserves unstable gaps across all vital metrics', () => {
    const { readings } = demoSource.getSnapshot('unstable')
    for (const metric of ['heartRate', 'spo2', 'temperature'] as Metric[]) {
      const latest = readings.at(-1)!
      if (latest[metric] === null) expect(validValue(latest, metric)).toBeNull()
      else expect(validValue(latest, metric)).toBe(latest[metric])
      expect(readings.some((r) => r.quality[metric] === 'Missing')).toBe(true)
      expect(readings.some((r) => r.quality[metric] === 'Unstable')).toBe(true)
    }
  })
  it('keeps value, quality, and health status independent', () => {
    const base = demoSource.getSnapshot('typical').readings.at(-1)!
    const stableHigh = {
      ...base,
      heartRate: 125,
      quality: { ...base.quality, heartRate: 'Good' as const },
    }
    const unstableNormal = {
      ...base,
      heartRate: 89.6,
      quality: { ...base.quality, heartRate: 'Unstable' as const },
    }
    const missing = {
      ...base,
      heartRate: null,
      quality: { ...base.quality, heartRate: 'Missing' as const },
    }
    expect(validValue(stableHigh, 'heartRate')).toBe(125)
    expect(qualityText(stableHigh, 'heartRate')).toBe('Good quality')
    expect(healthStatus(stableHigh, 'heartRate')).toBe('High')
    expect(validValue(unstableNormal, 'heartRate')).toBe(89.6)
    expect(qualityText(unstableNormal, 'heartRate')).toBe('Unstable quality')
    expect(healthStatus(unstableNormal, 'heartRate')).toBe('Normal')
    expect(validValue(missing, 'heartRate')).toBeNull()
    expect(qualityText(missing, 'heartRate')).toBe('No reading')
  })
  it('handles empty history without false zero summary readings', () => {
    const { readings } = demoSource.getSnapshot('empty')
    expect(readings).toEqual([])
    expect(summarize(readings, 'heartRate')).toEqual({ min: null, avg: null, max: null, count: 0 })
  })
  it('links alert details to the exact chart measurement', () => {
    for (const scenario of scenarios.filter((s) => s.value !== 'empty')) {
      const snapshot = demoSource.getSnapshot(scenario.value)
      for (const alert of snapshot.alerts) {
        const reading = snapshot.readings.find((r) => r.id === alert.readingId)
        expect(reading?.time).toBe(alert.time)
        expect(alert.gpsTime).toBeLessThanOrEqual(alert.time)
      }
    }
  })
  it('distinguishes cancelled and escalated suspected falls', () => {
    const { alerts } = demoSource.getSnapshot('fall')
    expect(alerts[0].cancelled).toBe(false)
    expect(alerts[0].status).toBe('New')
    expect(alerts[0].description).toContain('not an independently verified fall')
    expect(alerts.some((a) => a.cancelled === true && a.status === 'Resolved')).toBe(true)
  })
  it('rejects unavailable, non-finite, out-of-range and zero placeholder coordinates', () => {
    for (const coordinates of [null, [0, 0], [NaN, 58], [Infinity, 1], [91, 58], [23, -181]] as (
      [number, number] | null
    )[])
      expect(validCoordinates(coordinates)).toBe(false)
    expect(validCoordinates([23.588, 58.4059])).toBe(true)
    expect(demoSource.getSnapshot('noGps').location).toEqual({
      coordinates: null,
      time: null,
      stale: false,
    })
  })
})

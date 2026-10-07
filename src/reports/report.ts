import { jsPDF } from 'jspdf'
import {
  formatValue,
  metrics,
  stamp,
  summarize,
  validValue,
  dateKey,
  dateLabel,
  timeLabel,
} from '../data/demo'
import { mapMeasurement } from '../device/measurements'
import { alertValue, mapStoredAlert } from '../alerts/alerts'
import { createHealthSummary } from '../summaries/summary'
import type { SummarySource } from '../summaries/summary'
import { insightMessage } from '../insights/insights'

export type ReportInput = {
  patientName: string
  source: SummarySource
  start: number
  end: number
  generatedAt: number
  testOnly?: boolean
}
export function reportFilename(time: number) {
  return `CareLink-Health-Report-${dateKey(time)}.pdf`
}
const reportTime = (time: number) => `${dateLabel(time, true)} · ${timeLabel(time)} GST`

/** Explicit allowlist of caregiver-visible content: never serialize source records. */
export function reportSections(input: ReportInput) {
  const { source, start, end } = input
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
    throw new Error('Invalid report period')
  const readings = source.measurements
    .filter((row) => row.device_id === source.deviceId)
    .map(mapMeasurement)
    .filter((row) => row.time >= start && row.time <= end)
  const sections = [
    {
      title: 'Health report',
      lines: [
        input.testOnly ? 'TEST DATA - not a production health report' : 'Personal care record',
        `Patient: ${input.patientName}`,
        `Reporting period: ${reportTime(start)} to ${reportTime(end)}`,
        `Generated: ${reportTime(input.generatedAt)}`,
        source.deviceId
          ? `${readings.length} wearable readings in this period.`
          : 'No wearable is paired. Health readings are unavailable.',
      ],
    },
    {
      title: 'Vitals and reading quality',
      lines: Object.keys(metrics).flatMap((key) => {
        const metric = key as keyof typeof metrics
        const stats = summarize(readings, metric)
        const good = readings.filter(
          (row) => validValue(row, metric) !== null && row.quality[metric] === 'Good',
        ).length
        const unstable = readings.filter(
          (row) => validValue(row, metric) !== null && row.quality[metric] === 'Unstable',
        ).length
        const display = (value: number | null) =>
          value === null ? 'No reading' : `${formatValue(value, metric)} ${metrics[metric].unit}`
        return [
          `${metrics[metric].label}: Average ${display(stats.avg)} | Low ${display(stats.min)} | High ${display(stats.max)}`,
          `Quality: ${good} good, ${unstable} unstable, ${readings.length - good - unstable} missing. Statistics include calculated unstable readings; missing values are excluded.`,
        ]
      }),
    },
    {
      title: 'Recent readings',
      lines: readings.length
        ? readings
            .slice(-12)
            .reverse()
            .map(
              (row) =>
                `${stamp(row.time)} | Heart rate ${formatValue(validValue(row, 'heartRate'), 'heartRate')} bpm | SpO₂ ${formatValue(validValue(row, 'spo2'), 'spo2')} % | Temperature ${formatValue(validValue(row, 'temperature'), 'temperature')} °C`,
            )
        : ['No readings in this period.'],
    },
  ]
  const scoped = <T extends { patient_id: string; device_id: string }>(items: T[]) =>
    items.filter((row) => row.patient_id === source.patientId && row.device_id === source.deviceId)
  const alerts = scoped(source.alerts)
    .filter(
      (row) =>
        (Date.parse(row.measurement_at) >= start && Date.parse(row.measurement_at) <= end) ||
        row.status !== 'resolved',
    )
    .map((row) => mapStoredAlert(row))
  sections.push({
    title: 'Health alerts',
    lines: alerts.length
      ? alerts.flatMap((row) => [
          `${row.title} - ${row.status}. ${stamp(row.time)}`,
          row.description,
          `Recorded value: ${alertValue(row)}${row.thresholdText ? `. Alert threshold: ${row.thresholdText}` : ''}`,
        ])
      : ['No health alerts in this period or currently open.'],
  })
  const insights = scoped(source.insights).filter(
    (row) =>
      row.status === 'active' ||
      (Date.parse(row.last_observed_at) >= start && Date.parse(row.last_observed_at) <= end),
  )
  sections.push({
    title: 'Personalized insights',
    lines: insights.length
      ? insights.map(
          (row) =>
            `${insightMessage(row)} ${row.status}. Last observed ${stamp(Date.parse(row.last_observed_at))}.`,
        )
      : ['No personalized changes available for this period.'],
  })
  const summary = createHealthSummary(source, '7d')
  sections.push({
    title: 'Personalized health summary',
    lines: [
      `Past 7 days ending ${stamp(summary.end)}. Baselines and open statuses reflect the latest available analysis.`,
      summary.overview,
      ...summary.metrics.map((item) => item.text),
      `Last updated: ${stamp(summary.updatedAt)}`,
    ],
  })
  sections.push({
    title: 'About this report',
    lines: [
      'CareLink supports caregiver awareness and does not replace professional medical advice.',
      'Temperature is a wearable reading, not a validated core body temperature. Keep this report private and share it only with people you trust.',
    ],
  })
  return sections
}

export function generateReport(input: ReportInput, font?: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false })
  if (font) {
    doc.addFileToVFS('CareLink.ttf', font)
    doc.addFont('CareLink.ttf', 'CareLink', 'normal')
    doc.setFont('CareLink')
  }
  let y = 27
  const header = () => {
    doc.setFillColor(14, 40, 48)
    doc.rect(0, 0, 210, 17, 'F')
    doc.setTextColor(145, 243, 221)
    doc.setFontSize(14)
    doc.text('CareLink', 18, 11)
  }
  header()
  for (const section of reportSections(input)) {
    if (y > 245) {
      doc.addPage()
      header()
      y = 27
    }
    doc.setTextColor(0, 111, 104)
    doc.setFontSize(14)
    doc.text(section.title, 18, y)
    y += 8
    doc.setTextColor(24, 43, 66)
    doc.setFontSize(10)
    for (const paragraph of section.lines) {
      const text = paragraph.replace(/₂/g, '2').replace(/[–—]/g, '-').replace(/[’]/g, "'")
      const lines = doc.splitTextToSize(text, 174) as string[]
      if (y + lines.length * 5 > 274 && lines.length * 5 < 240) {
        doc.addPage()
        header()
        y = 27
        doc.setTextColor(24, 43, 66)
        doc.setFontSize(10)
      }
      for (const line of lines) {
        if (y > 274) {
          doc.addPage()
          header()
          y = 27
          doc.setTextColor(24, 43, 66)
          doc.setFontSize(10)
        }
        doc.text(line, 18, y)
        y += 5
      }
      y += 3
    }
    y += 5
  }
  const count = doc.getNumberOfPages()
  for (let page = 1; page <= count; page++) {
    doc.setPage(page)
    doc.setTextColor(90, 110, 120)
    doc.setFontSize(9)
    doc.text(`CareLink | Private health report | ${page} / ${count}`, 18, 288)
  }
  return doc.output('arraybuffer')
}

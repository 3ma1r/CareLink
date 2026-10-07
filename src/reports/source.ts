import { supabase } from '../lib/supabase'
import type { SummarySource } from '../summaries/summary'

// Uses the existing authenticated client and RLS. No privileged credentials.
export async function loadReportSource(
  patientId: string,
  deviceId: string | null,
  start: number,
  end: number,
): Promise<SummarySource> {
  if (!supabase) throw new Error('Report unavailable')
  const source: SummarySource = {
    patientId,
    deviceId,
    measurements: [],
    alerts: [],
    baselines: [],
    insights: [],
    asOf: end,
    updatedAt: Date.now(),
  }
  if (!deviceId) return source
  const since = new Date(Math.min(start, end - 7 * 86400000)).toISOString()
  for (let offset = 0; ; offset += 1000) {
    if (offset >= 50000) throw new Error('Choose a shorter reporting period')
    const result = await supabase
      .from('device_measurements')
      .select('*')
      .eq('device_id', deviceId)
      .gte('measured_at', since)
      .lte('measured_at', new Date(end).toISOString())
      .order('measured_at')
      .order('id')
      .range(offset, offset + 999)
    if (result.error) throw result.error
    source.measurements.push(...result.data)
    if (result.data.length < 1000) break
  }
  const baselines = await supabase
    .from('personalized_baselines')
    .select('*')
    .eq('patient_id', patientId)
    .eq('device_id', deviceId)
  if (baselines.error) throw baselines.error
  source.baselines = baselines.data
  for (let offset = 0; ; offset += 1000) {
    if (offset >= 10000) throw new Error('Report history is too large')
    const [alerts, insights] = await Promise.all([
      supabase
        .from('care_alerts')
        .select('*')
        .eq('patient_id', patientId)
        .eq('device_id', deviceId)
        .order('created_at')
        .order('id')
        .range(offset, offset + 999),
      supabase
        .from('personalized_insights')
        .select('*')
        .eq('patient_id', patientId)
        .eq('device_id', deviceId)
        .order('created_at')
        .order('id')
        .range(offset, offset + 999),
    ])
    if (alerts.error || insights.error) throw alerts.error ?? insights.error
    source.alerts.push(...alerts.data)
    source.insights.push(...insights.data)
    if (alerts.data.length < 1000 && insights.data.length < 1000) break
  }
  return source
}

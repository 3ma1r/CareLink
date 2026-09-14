import { useId } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { dateLabel, formatValue, metrics, stamp, timeLabel, validValue } from '../data/demo'
import type { CareAlert, Metric, Reading } from '../data/demo'
import { EmptyState } from './UI'
type ChartPoint = Reading & { value: number | null; bucketEnd?: number }
function ChartTooltip({
  active,
  payload,
  metric,
  movement,
}: {
  active?: boolean
  payload?: { payload: ChartPoint }[]
  metric: Metric
  movement?: boolean
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="chart-tooltip">
      <strong>
        {movement ? (row.movement ?? '—') : formatValue(row.value, metric)}{' '}
        <span>{movement ? '/ 100 intensity' : metrics[metric].unit}</span>
      </strong>
      <p>
        {row.bucketEnd ? `Daily average · ${dateLabel(row.time)}` : `Measured · ${stamp(row.time)}`}
      </p>
      {row.bucketEnd && (
        <p>
          Samples · {timeLabel(row.time)}–{timeLabel(row.bucketEnd)} GST
        </p>
      )}
      <small>
        Quality: {movement ? (row.movement === null ? 'Missing' : 'Good') : row.quality[metric]} ·
        Demo
      </small>
    </div>
  )
}
export function HealthChart({
  readings,
  metric = 'heartRate',
  small = false,
  alerts = [],
  multiDay = false,
}: {
  readings: Reading[]
  metric?: Metric
  small?: boolean
  alerts?: CareAlert[]
  multiDay?: boolean
}) {
  const gradientId = useId().replace(/:/g, '')
  const data: ChartPoint[] = readings.map((row) => ({ ...row, value: validValue(row, metric) }))
  const hasValues = data.some((r) => r.value !== null)
  if (!hasValues)
    return small ? (
      <div className="sparkline-empty">No valid readings</div>
    ) : (
      <EmptyState
        title={readings.length ? 'No valid readings in this range' : undefined}
        detail={
          readings.length
            ? 'Missing and unstable signals are excluded. No values have been estimated.'
            : undefined
        }
      />
    )
  const color = small ? metrics[metric].color : 'var(--accent)'
  return (
    <div
      className={small ? 'sparkline' : 'health-chart'}
      role={small ? 'img' : 'group'}
      aria-label={`${metrics[metric].label} ${small ? 'sparkline' : 'chart, use arrow keys to explore readings'}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={data}
          margin={
            small
              ? { top: 5, bottom: 2, left: 1, right: 1 }
              : { top: 15, bottom: 4, left: -18, right: 10 }
          }
          accessibilityLayer={!small}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={small ? 0.12 : 0.23} />
              <stop offset="100%" stopColor={color} stopOpacity={0.005} />
            </linearGradient>
          </defs>
          {small && <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />}
          {!small && (
            <>
              <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 5" />
              <XAxis
                type="number"
                dataKey="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value) => (multiDay ? dateLabel(value) : timeLabel(value))}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                dy={10}
              />
              <YAxis
                domain={metrics[metric].domain as unknown as [number, number]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                tickCount={4}
              />
              <Tooltip
                content={<ChartTooltip metric={metric} />}
                cursor={{ stroke: 'var(--accent)', strokeDasharray: '3 3' }}
              />
              {alerts
                .filter(
                  (a) =>
                    data.length && a.time >= data[0].time && a.time <= data[data.length - 1].time,
                )
                .map((a) => (
                  <ReferenceLine
                    key={a.id}
                    x={a.time}
                    stroke={a.severity === 'High' ? 'var(--coral)' : 'var(--amber)'}
                    strokeDasharray="4 4"
                    label={{
                      value: a.type === 'sos' ? 'SOS' : a.type === 'fall' ? 'Fall' : 'Alert',
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: 'var(--muted)',
                    }}
                  />
                ))}
            </>
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={small ? 2 : 2.5}
            fill={`url(#${gradientId})`}
            connectNulls={false}
            isAnimationActive={false}
            activeDot={small ? false : { r: 5, stroke: 'var(--surface)', strokeWidth: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
export function MovementChart({
  readings,
  small = false,
  multiDay = false,
}: {
  readings: Reading[]
  small?: boolean
  multiDay?: boolean
}) {
  if (!readings.some((r) => r.movement !== null))
    return small ? (
      <div className="sparkline-empty">No movement data</div>
    ) : (
      <EmptyState title="No movement data in this period" />
    )
  // Aggregate full periods into daily averages; never convert missing movement into zero.
  const data = multiDay
    ? Array.from(
        readings.reduce((groups, row) => {
          const key = dateLabel(row.time)
          groups.set(key, [...(groups.get(key) ?? []), row])
          return groups
        }, new Map<string, Reading[]>()),
        ([, rows]) => {
          const values = rows.flatMap((r) => (r.movement === null ? [] : [r.movement]))
          return {
            ...rows[0],
            bucketEnd: rows[rows.length - 1].time,
            movement: values.length
              ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
              : null,
          }
        },
      )
    : readings
  return (
    <div
      className={small ? 'sparkline' : 'movement-chart'}
      role={small ? 'img' : 'group'}
      aria-label="Movement intensity chart"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={data}
          margin={small ? { top: 6, bottom: 0 } : { top: 8, right: 5, left: -18, bottom: 3 }}
          accessibilityLayer={!small}
        >
          {!small && (
            <>
              <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 5" />
              <XAxis
                dataKey="time"
                tickFormatter={(value) => (multiDay ? dateLabel(value) : timeLabel(value))}
                tickLine={false}
                axisLine={false}
                minTickGap={35}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tickFormatter={(v) => (v === 0 ? 'Low' : v === 100 ? 'High' : '')}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
              />
              <Tooltip
                content={<ChartTooltip metric="heartRate" movement />}
                cursor={{ fill: 'var(--accent-soft)' }}
              />
            </>
          )}
          <Bar
            dataKey="movement"
            fill="var(--mint-bar)"
            radius={[4, 4, 0, 0]}
            maxBarSize={small ? 10 : 20}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

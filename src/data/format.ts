/** Display only: never modifies measurement evidence or stored values. */
export function formatTemperature(value: number | null | undefined, unit = true): string {
  return typeof value !== 'number' || !Number.isFinite(value)
    ? '—'
    : `${value.toFixed(1)}${unit ? ' \u00b0C' : ''}`
}

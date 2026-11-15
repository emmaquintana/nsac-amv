import type { AppliedFilters, TimeSeriesSummary } from '../types/app'

const DAY_MS = 86_400_000

export function buildTimeSeries(summary: TimeSeriesSummary | null, filters: AppliedFilters) {
  const counts = new Map(filters.regions.map((region) => [region, new Map<string, number>()]))
  const availableDays = new Set(summary?.available_days ?? [])
  let represented = 0

  for (const item of summary?.counts ?? []) {
    const regionCounts = counts.get(item.continent)
    const day = item.day
    if (!regionCounts || (filters.startDate && day < filters.startDate)
      || (filters.endDate && day > filters.endDate)) continue
    regionCounts.set(day, (regionCounts.get(day) ?? 0) + item.count)
    represented += item.count
  }

  const sortedDays = [...availableDays].sort()
  const start = filters.startDate || sortedDays[0]
  const end = filters.endDate || sortedDays.at(-1)
  const days: string[] = []
  if (start && end) {
    const endTimestamp = Date.parse(`${end}T00:00:00Z`)
    for (let timestamp = Date.parse(`${start}T00:00:00Z`);
      timestamp <= endTimestamp; timestamp += DAY_MS) {
      days.push(new Date(timestamp).toISOString().slice(0, 10))
    }
  }

  const series = [...counts].map(([region, dailyCounts]) => ({
    region,
    counts: days.map((day) => availableDays.has(day) ? dailyCounts.get(day) ?? 0 : null),
  }))
  let maximum = 1
  for (const { counts: values } of series) {
    for (const count of values) maximum = Math.max(maximum, count ?? 0)
  }
  return { days, series, maximum, represented, missingDays: days.filter((day) => !availableDays.has(day)).length }
}

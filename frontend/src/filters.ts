import type { AppliedFilters, Period } from './types/app'
import { regions } from './types/app.ts'

export const DEFAULT_PERIOD = '30' satisfies Period

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function filtersForPeriod(
  period: Exclude<Period, 'custom'> = DEFAULT_PERIOD,
  selectedRegions = regions,
  today = new Date(),
): AppliedFilters {
  const start = new Date(today)
  start.setDate(today.getDate() - Number(period) + 1)
  return { regions: [...selectedRegions], startDate: formatDate(start), endDate: formatDate(today) }
}

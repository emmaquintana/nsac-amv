import type { AppliedFilters, MapViewport } from '../types/app'
import { regions } from '../types/app.ts'

export function normalizeViewport(viewport: MapViewport): MapViewport {
  const wrap = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180
  const wholeWorld = viewport.east - viewport.west >= 360
  return {
    west: wholeWorld ? -180 : wrap(viewport.west),
    east: wholeWorld ? 180 : wrap(viewport.east),
    south: Math.max(-90, Math.min(90, viewport.south)),
    north: Math.max(-90, Math.min(90, viewport.north)),
    zoom: Math.max(0, Math.min(19, Math.round(viewport.zoom))),
  }
}

export function mapQuery(filters: AppliedFilters, viewport: MapViewport) {
  const params = new URLSearchParams()
  Object.entries(normalizeViewport(viewport)).forEach(([key, value]) => params.set(key, String(value)))
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (!regions.every((region) => filters.regions.includes(region))) {
    filters.regions.forEach((region) => params.append('continent', region))
  }
  return params.toString()
}

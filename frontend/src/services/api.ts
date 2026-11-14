import type { AppliedFilters } from '../types/app'

export type Observation = {
  id: string
  source: 'MODIS' | 'VIIRS'
  satellite: string | null
  latitude: number
  longitude: number
  detected_at: string
  brightness: number | null
  confidence: string | number | null
  frp: number | null
  daynight: 'D' | 'N' | null
  continent: string | null
}

export async function getObservations(filters: AppliedFilters, continent?: string): Promise<Observation[]> {
  const params = new URLSearchParams({ limit: '5000' })
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (continent) params.set('continent', continent)

  const response = await fetch(`/api/v1/observations?${params}`)
  if (!response.ok) throw new Error(`Error de API (${response.status})`)
  return response.json() as Promise<Observation[]>
}

export async function getContinents(): Promise<string[]> {
  const response = await fetch('/api/v1/continents')
  if (!response.ok) throw new Error(`Error de API (${response.status})`)
  return response.json() as Promise<string[]>
}

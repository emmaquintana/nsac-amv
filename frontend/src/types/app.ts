export type View = 'map' | 'series'

export type Period = '7' | '30' | '90' | 'custom'

export type AppliedFilters = {
  regions: string[]
  startDate: string
  endDate: string
}

export type MapViewport = {
  west: number
  south: number
  east: number
  north: number
  zoom: number
}

export type MapPoint = {
  latitude: number
  longitude: number
  count: number
  modis: number
  viirs: number
  first_detection: string
  last_detection: string
  max_frp: number | null
}

export type MapObservations = {
  points: MapPoint[]
  total: number
}

// Contrato JSON de Observation en backend/app/schemas.py.
export type Observation = {
  id: string
  source: 'MODIS' | 'VIIRS'
  satellite: string | null
  product: string | null
  version: string | null
  data_kind: 'archive' | 'nrt' | null
  file_name: string | null
  latitude: number
  longitude: number
  detected_at: string
  brightness: number | null
  confidence: string | number | null
  frp: number | null
  daynight: 'D' | 'N' | null
  continent: string | null
}

export const regions = [
  'Sudamérica',
  'África',
  'Asia',
  'Europa',
  'Norteamérica',
  'Oceanía',
]

export type DailyCount = {
  day: string
  continent: string
  count: number
}

export type TimeSeriesSummary = {
  counts: DailyCount[]
  total: number
  unassigned: number
  first_day: string | null
  last_day: string | null
  observed_days: number
  available_days: string[]
}

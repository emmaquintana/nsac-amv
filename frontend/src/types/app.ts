export type View = 'map' | 'series'

export type Period = '7' | '30' | '90' | 'custom'

export type AppliedFilters = {
  regions: string[]
  startDate: string
  endDate: string
}

// Contrato JSON de Observation en backend/app/schemas.py.
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

export const regions = [
  'Sudamérica',
  'África',
  'Asia',
  'Europa',
  'Norteamérica',
  'Oceanía',
]

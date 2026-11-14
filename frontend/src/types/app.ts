export type View = 'map' | 'series'

export type Period = '7' | '30' | '90' | 'custom'

export type AppliedFilters = {
  regions: string[]
  startDate: string
  endDate: string
}

export const regions = [
  'Sudamérica',
  'África',
  'Asia',
  'Europa',
  'Norteamérica',
  'Oceanía',
]

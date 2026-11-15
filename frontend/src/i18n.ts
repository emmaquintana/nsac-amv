export type Language = 'en' | 'es'
export const LANGUAGE_STORAGE_KEY = 'nsac-language'
export const locales: Record<Language, string> = { en: 'en-US', es: 'es-AR' }

const en = {
  appTitle: 'NSAC - MODIS and VIIRS Harmonization',
  center: 'SATELLITE ANALYSIS CENTER',
  dashboard: 'DASHBOARD',
  map: 'World map',
  series: 'Time series',
  mapIntro: 'Explore global thermal activity and detected hotspots.',
  seriesIntro: 'Compare fire activity across regions over time.',
  footer: 'NSAC · Satellite data harmonization',
  commonData: 'COMMON DATA LAYER',
  analysis: 'ANALYSIS',
  views: 'Views',
  harmonization: 'MODIS · VIIRS harmonization',
  configuration: 'CONFIGURATION',
  filters: 'Filters',
  regions: 'Regions',
  region: 'Region',
  selectRegions: 'Select one or more regions',
  allRegions: 'All regions',
  period: 'Period',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  custom: 'Custom',
  startDate: 'Start date',
  endDate: 'End date',
  futureDate: 'The end date cannot be later than today.',
  invalidDates: 'The start date must be on or before the end date.',
  applyFilters: 'Apply filters',
  sources: 'Harmonized sources',
  southAmerica: 'South America',
  africa: 'Africa',
  asia: 'Asia',
  europe: 'Europe',
  northAmerica: 'North America',
  oceania: 'Oceania',
  noData: 'No data to display',
  darkMode: 'Dark mode',
  lightMode: 'Light mode',
  switchDark: 'Switch to dark mode',
  switchLight: 'Switch to light mode',
  switchLanguage: 'Cambiar a español',
  globalDistribution: 'GLOBAL DISTRIBUTION',
  hotspots: 'Thermal hotspots',
  retry: 'Retry',
  retryTotal: 'Retry total',
  mapEmpty: 'No observations in this area with the selected filters. Pan or zoom out to explore other areas.',
  periodTotal: '{count} observations in the period',
  calculatingTotal: 'Calculating period total…',
  unavailableTotal: 'Period total unavailable',
  visibleError: 'Could not update the visible area',
  visibleTotal: '{count} observations in the visible area · {points} points on the map',
  zoomHint: 'Zoom in to expand grouped hotspots.',
  allDates: 'Entire available period',
  groupedObservations: 'grouped observations',
  observation: 'observation',
  until: 'Until',
  maxFrp: 'Maximum FRP',
  noValue: 'N/A',
  detailHint: 'Zoom in for more detail.',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  temporalEvolution: 'TEMPORAL EVOLUTION',
  hotspotActivity: 'Thermal hotspot activity',
  seriesDescription: 'Fires detected by region over time',
  seriesEmpty: 'No observations available for the selected filters.',
  representedRegions: 'Regions shown',
  chartLabel: 'Daily observations by region, in UTC',
  chartDescription: 'Each line represents a selected region. Values count all available MODIS and VIIRS observations per UTC day. Days without records in the files are shown as gaps.',
  observations: 'Observations',
  observationCount: '{count} observations',
  seriesTotal: '{count} observations · complete totals by region and UTC day',
  availableRecords: 'Available records: {first} — {last} · {days} days with records.',
  missingDays: '{days} days without records in the files: shown as gaps rather than zeros.',
  missingDay: '1 day without records in the files: shown as a gap rather than zero.',
  unassigned: '{count} observations without an identified region are not shown.',
  loadingMap: 'Loading FIRMS observations…',
  updatingMap: 'Updating hotspots in the visible area…',
  loadingSeries: 'Calculating daily totals for the entire period…',
  preparingMap: 'Preparing map details',
  preparingData: 'Preparing data',
  preparingSeries: 'Calculating daily totals',
  progress: '{action}: {completed}/{total} files ({progress}%){file}',
  timeout: 'The server did not respond within 30 seconds. Check the backend and try again.',
  httpError: 'Could not load data (HTTP {status}).',
  mapError: 'Could not load map hotspots. Check your connection and try again.',
  seriesError: 'Could not load daily totals. Check your connection and try again.',
  mapSlow: 'Initial preparation is taking longer than expected. You can retry; the server is still working.',
  seriesSlow: 'The initial calculation is taking longer than expected. You can retry; the server is still working.',
}

export type TranslationKey = keyof typeof en
const es: Record<TranslationKey, string> = {
  appTitle: 'NSAC - Armonización de MODIS y VIIRS',
  center: 'CENTRO DE ANÁLISIS SATELITAL',
  dashboard: 'ESCRITORIO',
  map: 'Planisferio',
  series: 'Serie temporal',
  mapIntro: 'Explora la actividad térmica global y sus focos detectados.',
  seriesIntro: 'Compara la evolución de incendios entre regiones.',
  footer: 'NSAC · Armonización de datos satelitales',
  commonData: 'CAPA COMÚN DE DATOS',
  analysis: 'ANÁLISIS',
  views: 'Vistas',
  harmonization: 'Armonización MODIS · VIIRS',
  configuration: 'CONFIGURACIÓN',
  filters: 'Filtros',
  regions: 'Regiones',
  region: 'Región',
  selectRegions: 'Selecciona una o más regiones',
  allRegions: 'Todas las regiones',
  period: 'Periodo',
  last7: 'Últimos 7 días',
  last30: 'Últimos 30 días',
  last90: 'Últimos 90 días',
  custom: 'Personalizado',
  startDate: 'Fecha de inicio',
  endDate: 'Fecha de fin',
  futureDate: 'La fecha de fin no puede ser posterior a la fecha actual.',
  invalidDates: 'La fecha de inicio debe ser anterior o igual a la fecha de fin.',
  applyFilters: 'Aplicar filtros',
  sources: 'Fuentes armonizadas',
  southAmerica: 'Sudamérica',
  africa: 'África',
  asia: 'Asia',
  europe: 'Europa',
  northAmerica: 'Norteamérica',
  oceania: 'Oceanía',
  noData: 'No hay datos para mostrar',
  darkMode: 'Modo oscuro',
  lightMode: 'Modo claro',
  switchDark: 'Cambiar a modo oscuro',
  switchLight: 'Cambiar a modo claro',
  switchLanguage: 'Switch to English',
  globalDistribution: 'DISTRIBUCIÓN GLOBAL',
  hotspots: 'Focos térmicos',
  retry: 'Reintentar',
  retryTotal: 'Reintentar total',
  mapEmpty: 'No hay observaciones en esta área con los filtros seleccionados. Desplaza el mapa o aleja el zoom para explorar otras zonas.',
  periodTotal: '{count} observaciones en el período',
  calculatingTotal: 'Calculando total del período…',
  unavailableTotal: 'Total del período no disponible',
  visibleError: 'No se pudo actualizar el área visible',
  visibleTotal: '{count} observaciones en el área visible · {points} puntos en el mapa',
  zoomHint: 'Acerca el mapa para desplegar los focos agrupados.',
  allDates: 'Todo el período disponible',
  groupedObservations: 'observaciones agrupadas',
  observation: 'observación',
  until: 'Hasta',
  maxFrp: 'FRP máxima',
  noValue: 's/d',
  detailHint: 'Acerca el mapa para ver más detalle.',
  zoomIn: 'Acercar',
  zoomOut: 'Alejar',
  temporalEvolution: 'EVOLUCIÓN TEMPORAL',
  hotspotActivity: 'Actividad de focos térmicos',
  seriesDescription: 'Incendios detectados por región a lo largo del tiempo',
  seriesEmpty: 'No hay observaciones disponibles para los filtros seleccionados.',
  representedRegions: 'Regiones representadas',
  chartLabel: 'Observaciones diarias por región, en fecha UTC',
  chartDescription: 'Cada línea representa una región seleccionada. Los valores cuentan todas las observaciones disponibles de MODIS y VIIRS por día UTC. Los días sin registros en los archivos se muestran como huecos.',
  observations: 'Observaciones',
  observationCount: '{count} observaciones',
  seriesTotal: '{count} observaciones · totales completos por región y día UTC',
  availableRecords: 'Registros disponibles: {first} — {last} · {days} días con registros.',
  missingDays: '{days} días sin registros en los archivos: se muestran como huecos, sin asignarles cero.',
  missingDay: '1 día sin registros en los archivos: se muestra como un hueco, sin asignarle cero.',
  unassigned: '{count} observaciones sin región identificada no se representan.',
  loadingMap: 'Cargando observaciones FIRMS…',
  updatingMap: 'Actualizando focos del área visible…',
  loadingSeries: 'Calculando totales diarios de todo el período…',
  preparingMap: 'Preparando detalle del mapa',
  preparingData: 'Preparando datos',
  preparingSeries: 'Calculando totales diarios',
  progress: '{action}: {completed}/{total} archivos ({progress}%){file}',
  timeout: 'El servidor no respondió en 30 segundos. Comprueba el backend y vuelve a intentar.',
  httpError: 'No se pudieron cargar los datos (HTTP {status}).',
  mapError: 'No se pudieron cargar los focos del mapa. Comprueba tu conexión y vuelve a intentar.',
  seriesError: 'No se pudieron cargar los totales diarios. Comprueba tu conexión y vuelve a intentar.',
  mapSlow: 'La preparación inicial está tardando más de lo esperado. Puedes reintentar; el servidor continúa trabajando.',
  seriesSlow: 'El cálculo inicial está tardando más de lo esperado. Puedes reintentar; el servidor continúa trabajando.',
}

export type MessageValues = Record<string, string | number>
export type Message = { key: TranslationKey; values?: MessageValues }
export type Progress = {
  action: TranslationKey
  completed: number
  total: number
  progress: number
  current_file?: string | null
}

export function resolveLanguage(saved: string | null, languages: readonly string[]): Language {
  if (saved === 'en' || saved === 'es') return saved
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0]
    if (base === 'en' || base === 'es') return base
  }
  return 'en'
}

export function translate(language: Language, key: TranslationKey, values: MessageValues = {}) {
  return ({ en, es })[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name]
    return value === undefined ? placeholder : typeof value === 'number' ? value.toLocaleString(locales[language]) : value
  })
}

// Region values are API identifiers; only the displayed labels are translated.
const regionKeys: Record<string, TranslationKey> = {
  Sudamérica: 'southAmerica', África: 'africa', Asia: 'asia',
  Europa: 'europe', Norteamérica: 'northAmerica', Oceanía: 'oceania',
}
export function translateRegion(language: Language, region: string) {
  return regionKeys[region] ? translate(language, regionKeys[region]) : region
}

export class LocalizedError extends Error {
  messageDescriptor: Message
  constructor(key: TranslationKey, values?: MessageValues) {
    super(key)
    this.messageDescriptor = { key, values }
  }
}

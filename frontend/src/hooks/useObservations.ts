import { useEffect, useState } from 'react'
import type { AppliedFilters, MapObservations, MapViewport } from '../types/app'
import { mapQuery } from '../components/mapViewport'

const EMPTY_DATA: MapObservations = { points: [], total: 0 }
const LOADING_MESSAGE = 'Cargando observaciones FIRMS…'

type DataStatus = {
  stage: 'catalog' | 'map'
  completed: number
  total: number
  progress: number
  current_file: string | null
  error: string | null
}

export async function fetchWithTimeout(url: string, signal: AbortSignal) {
  const request = new AbortController()
  const abort = () => request.abort(signal.reason)
  if (signal.aborted) abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => request.abort(new Error(
    'El servidor no respondió en 30 segundos. Comprueba el backend y vuelve a intentar.',
  )), 30_000)
  try {
    return await fetch(url, { signal: request.signal })
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export async function waitForRetry(signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 2000)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

export async function checkResponse(response: Response) {
  if (response.ok) return
  const body = await response.json().catch(() => null) as { detail?: unknown } | null
  throw new Error(typeof body?.detail === 'string'
    ? body.detail : `No se pudieron cargar los datos (HTTP ${response.status})`)
}

type Result = {
  filters: AppliedFilters
  query: string | null
  data: MapObservations
  error: string
  loading: boolean
  loadingMessage: string
}

export function useObservations(filters: AppliedFilters, viewport: MapViewport | null, active: boolean) {
  const query = viewport ? mapQuery(filters, viewport) : null
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result>({
    filters, query: null, data: EMPTY_DATA, error: '', loading: true, loadingMessage: LOADING_MESSAGE,
  })

  useEffect(() => {
    if (!active || !filters.regions.length || query === null) return
    const controller = new AbortController()
    const started = Date.now()

    async function load() {
      try {
        while (!controller.signal.aborted) {
          const response = await fetchWithTimeout(`/api/v1/map?${query}`, controller.signal)
          await checkResponse(response)
          if (response.status === 202) {
            const status: DataStatus = await response.json()
            const action = status.stage === 'map' ? 'Preparando detalle del mapa' : 'Preparando datos'
            if (!controller.signal.aborted) setResult({ filters, query, data: EMPTY_DATA, error: '', loading: true,
              loadingMessage: `${action}: ${status.completed}/${status.total} archivos (${status.progress}%)`,
            })
            if (Date.now() - started > 10 * 60_000) throw new Error(
              'La preparación inicial está tardando más de lo esperado. Puedes reintentar; el servidor continúa trabajando.',
            )
            await waitForRetry(controller.signal)
            continue
          }
          const data: MapObservations = await response.json()
          if (!controller.signal.aborted) setResult({ filters, query, data, error: '', loading: false, loadingMessage: '' })
          return
        }
      } catch (reason: unknown) {
        if (!controller.signal.aborted) setResult({ filters, query, data: EMPTY_DATA, loading: false, loadingMessage: '',
          error: reason instanceof Error ? reason.message : 'No se pudieron cargar los focos del mapa',
        })
      }
    }

    // Espera breve para combinar movimientos y cancela consultas de vistas anteriores.
    const timer = setTimeout(() => { void load() }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [filters, query, active, attempt])

  const current = !filters.regions.length
    ? { data: EMPTY_DATA, error: '', loading: false, loadingMessage: '' }
    : result.filters === filters && result.query === query
      ? result
      : { data: result.filters === filters ? result.data : EMPTY_DATA,
          error: '', loading: true, loadingMessage: 'Actualizando focos del área visible…' }
  return { ...current, retry: () => {
    setResult({ filters, query, data: EMPTY_DATA, error: '', loading: true, loadingMessage: LOADING_MESSAGE })
    setAttempt((value) => value + 1)
  } }
}

import { useEffect, useState } from 'react'
import type { AppliedFilters, MapObservations, MapViewport } from '../types/app'
import { mapQuery } from '../components/mapViewport'
import { useLanguage } from '../context/LanguageContext'
import { LocalizedError } from '../i18n'
import type { Message, Progress, TranslationKey } from '../i18n'

const EMPTY_DATA: MapObservations = { points: [], total: 0 }
const LOADING_MESSAGE = 'loadingMap' as const

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
  const timer = setTimeout(() => request.abort(new LocalizedError('timeout')), 30_000)
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
  throw new LocalizedError('httpError', { status: String(response.status) })
}

type Result = {
  filters: AppliedFilters
  query: string | null
  data: MapObservations
  error: Message | null
  loading: boolean
  loadingMessage: TranslationKey | ''
  progress?: Progress
}

export function useObservations(filters: AppliedFilters, viewport: MapViewport | null, active: boolean) {
  const { t, formatProgress } = useLanguage()
  const query = viewport ? mapQuery(filters, viewport) : null
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result>({
    filters, query: null, data: EMPTY_DATA, error: null, loading: true, loadingMessage: LOADING_MESSAGE,
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
            const action = status.stage === 'map' ? 'preparingMap' : 'preparingData'
            if (!controller.signal.aborted) setResult({ filters, query, data: EMPTY_DATA, error: null, loading: true,
              loadingMessage: '', progress: { ...status, action },
            })
            if (Date.now() - started > 10 * 60_000) throw new LocalizedError('mapSlow')
            await waitForRetry(controller.signal)
            continue
          }
          const data: MapObservations = await response.json()
          if (!controller.signal.aborted) setResult({ filters, query, data, error: null, loading: false, loadingMessage: '' })
          return
        }
      } catch (reason: unknown) {
        if (!controller.signal.aborted) setResult({ filters, query, data: EMPTY_DATA, loading: false, loadingMessage: '',
          error: reason instanceof LocalizedError ? reason.messageDescriptor : { key: 'mapError' },
        })
      }
    }

    // Espera breve para combinar movimientos y cancela consultas de vistas anteriores.
    const timer = setTimeout(() => { void load() }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [filters, query, active, attempt])

  const current: Pick<Result, 'data' | 'error' | 'loading' | 'loadingMessage' | 'progress'> = !filters.regions.length
    ? { data: EMPTY_DATA, error: null, loading: false, loadingMessage: '' }
    : result.filters === filters && result.query === query
      ? result
      : { data: result.filters === filters ? result.data : EMPTY_DATA,
          error: null, loading: true, loadingMessage: 'updatingMap' }
  return {
    ...current,
    error: current.error ? t(current.error.key, current.error.values) : '',
    loadingMessage: current.progress ? formatProgress(current.progress) : current.loadingMessage ? t(current.loadingMessage) : '',
    retry: () => {
      setResult({ filters, query, data: EMPTY_DATA, error: null, loading: true, loadingMessage: LOADING_MESSAGE })
      setAttempt((value) => value + 1)
    },
  }
}

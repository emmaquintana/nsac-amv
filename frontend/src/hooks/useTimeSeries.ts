import { useEffect, useState } from 'react'
import type { AppliedFilters, TimeSeriesSummary } from '../types/app'
import { checkResponse, fetchWithTimeout, waitForRetry } from './useObservations'

const LOADING_MESSAGE = 'Calculando totales diarios de todo el período…'

type Result = {
  filters: AppliedFilters
  scope: 'regions' | 'global'
  summary: TimeSeriesSummary | null
  error: string
  loading: boolean
  loadingMessage: string
}

export function useTimeSeries(filters: AppliedFilters, scope: Result['scope'] = 'regions') {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result>({ filters, scope, summary: null, error: '', loading: true, loadingMessage: LOADING_MESSAGE })

  useEffect(() => {
    if (!filters.regions.length) return
    const controller = new AbortController()
    const started = Date.now()
    const params = new URLSearchParams()
    if (filters.startDate) params.set('start_date', filters.startDate)
    if (filters.endDate) params.set('end_date', filters.endDate)
    if (scope === 'regions') filters.regions.forEach((region) => params.append('continent', region))

    async function load() {
      try {
        while (!controller.signal.aborted) {
          const response = await fetchWithTimeout(`/api/v1/time-series?${params}`, controller.signal)
          await checkResponse(response)
          if (response.status === 202) {
            const status = await response.json() as {
              stage: 'catalog' | 'summary'
              completed: number
              total: number
              progress: number
              current_file: string | null
            }
            const action = status.stage === 'catalog' ? 'Preparando datos' : 'Calculando totales diarios'
            if (!controller.signal.aborted) setResult({ filters, scope, summary: null, error: '', loading: true,
              loadingMessage: `${action}: ${status.completed}/${status.total} archivos (${status.progress}%)${status.current_file ? ` · ${status.current_file}` : ''}`,
            })
            if (Date.now() - started > 10 * 60_000) throw new Error(
              'El cálculo inicial está tardando más de lo esperado. Puedes reintentar; el servidor continúa trabajando.',
            )
            await waitForRetry(controller.signal)
            continue
          }
          const summary: TimeSeriesSummary = await response.json()
          if (!controller.signal.aborted) setResult({ filters, scope, summary, error: '', loading: false, loadingMessage: '' })
          return
        }
      } catch (reason: unknown) {
        if (!controller.signal.aborted) setResult({ filters, scope, summary: null, loading: false, loadingMessage: '',
          error: reason instanceof Error ? reason.message : 'No se pudieron cargar los totales diarios',
        })
      }
    }

    void load()
    return () => controller.abort()
  }, [filters, scope, attempt])

  const current = !filters.regions.length
    ? { summary: null, error: '', loading: false, loadingMessage: '' }
    : result.filters === filters && result.scope === scope
      ? result
      : { summary: null, error: '', loading: true, loadingMessage: LOADING_MESSAGE }
  return { ...current, retry: () => {
    setResult({ filters, scope, summary: null, error: '', loading: true, loadingMessage: LOADING_MESSAGE })
    setAttempt((value) => value + 1)
  } }
}

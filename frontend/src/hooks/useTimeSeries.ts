import { useEffect, useState } from 'react'
import type { AppliedFilters, TimeSeriesSummary } from '../types/app'
import { checkResponse, fetchWithTimeout, waitForRetry } from './useObservations'
import { useLanguage } from '../context/LanguageContext'
import { LocalizedError } from '../i18n'
import type { Message, Progress, TranslationKey } from '../i18n'

const LOADING_MESSAGE = 'loadingSeries' as const

type Result = {
  filters: AppliedFilters
  scope: 'regions' | 'global'
  summary: TimeSeriesSummary | null
  error: Message | null
  loading: boolean
  loadingMessage: TranslationKey | ''
  progress?: Progress
}

export function useTimeSeries(filters: AppliedFilters, scope: Result['scope'] = 'regions') {
  const { t, formatProgress } = useLanguage()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result>({ filters, scope, summary: null, error: null, loading: true, loadingMessage: LOADING_MESSAGE })

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
            const action = status.stage === 'catalog' ? 'preparingData' : 'preparingSeries'
            if (!controller.signal.aborted) setResult({ filters, scope, summary: null, error: null, loading: true,
              loadingMessage: '', progress: { ...status, action },
            })
            if (Date.now() - started > 10 * 60_000) throw new LocalizedError('seriesSlow')
            await waitForRetry(controller.signal)
            continue
          }
          const summary: TimeSeriesSummary = await response.json()
          if (!controller.signal.aborted) setResult({ filters, scope, summary, error: null, loading: false, loadingMessage: '' })
          return
        }
      } catch (reason: unknown) {
        if (!controller.signal.aborted) setResult({ filters, scope, summary: null, loading: false, loadingMessage: '',
          error: reason instanceof LocalizedError ? reason.messageDescriptor : { key: 'seriesError' },
        })
      }
    }

    void load()
    return () => controller.abort()
  }, [filters, scope, attempt])

  const current: Pick<Result, 'summary' | 'error' | 'loading' | 'loadingMessage' | 'progress'> = !filters.regions.length
    ? { summary: null, error: null, loading: false, loadingMessage: '' }
    : result.filters === filters && result.scope === scope
      ? result
      : { summary: null, error: null, loading: true, loadingMessage: LOADING_MESSAGE }
  return {
    ...current,
    error: current.error ? t(current.error.key, current.error.values) : '',
    loadingMessage: current.progress ? formatProgress(current.progress) : current.loadingMessage ? t(current.loadingMessage) : '',
    retry: () => {
      setResult({ filters, scope, summary: null, error: null, loading: true, loadingMessage: LOADING_MESSAGE })
      setAttempt((value) => value + 1)
    },
  }
}

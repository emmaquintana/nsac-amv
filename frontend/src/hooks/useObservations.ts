import { useEffect, useState } from 'react'
import type { AppliedFilters, Observation } from '../types/app'
import { regions } from '../types/app'

const PAGE_SIZE = 5000
const NO_OBSERVATIONS: Observation[] = []

export function useObservations(filters: AppliedFilters) {
  const [result, setResult] = useState({ filters, observations: NO_OBSERVATIONS, error: '' })

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      // Una consulta sin continente incluye todas las regiones; las selecciones
      // parciales se filtran en Python antes de aplicar la paginación.
      const continents = regions.every((region) => filters.regions.includes(region))
        ? [undefined]
        : filters.regions
      const rows: Observation[] = []

      for (const continent of continents) {
        let offset = 0
        while (true) {
          const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
          if (filters.startDate) params.set('start_date', filters.startDate)
          if (filters.endDate) params.set('end_date', filters.endDate)
          if (continent) params.set('continent', continent)

          const response = await fetch(`/api/v1/observations?${params}`, { signal: controller.signal })
          if (!response.ok) throw new Error(`No se pudieron cargar los datos (HTTP ${response.status})`)
          const page: Observation[] = await response.json()
          rows.push(...page)
          if (page.length < PAGE_SIZE) break
          offset += page.length
        }
      }

      return rows
    }

    void load()
      .then((observations) => {
        if (!controller.signal.aborted) setResult({ filters, observations, error: '' })
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            filters,
            observations: NO_OBSERVATIONS,
            error: reason instanceof Error ? reason.message : 'No se pudieron cargar los datos',
          })
        }
      })

    return () => controller.abort()
  }, [filters])

  return result.filters === filters ? result : { observations: NO_OBSERVATIONS, error: '' }
}

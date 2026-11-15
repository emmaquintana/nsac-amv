import { EmptyState } from './EmptyState'
import type { AppliedFilters } from '../types/app'
import { useObservations } from '../hooks/useObservations'
import './TimeSeries.css'

type TimeSeriesProps = {
  filters: AppliedFilters
}

export function TimeSeries({ filters }: TimeSeriesProps) {
  const { observations, error } = useObservations(filters)

  const counts = new Map<string, number>()
  observations.forEach((item) => {
    const day = item.detected_at.slice(0, 10)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  })
  const days = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
  const maximum = Math.max(1, ...days.map(([, count]) => count))

  return (
    <section className="time-series" aria-labelledby="time-series-title">
      <header className="time-series__header">
        <div>
          <span className="time-series__eyebrow">EVOLUCIÓN TEMPORAL</span>
          <h2 id="time-series-title">Actividad de focos térmicos</h2>
          <p>Incendios detectados por región a lo largo del tiempo</p>
          {filters.startDate && filters.endDate && (
            <span className="time-series__date-range">
              {filters.startDate} — {filters.endDate}
            </span>
          )}
        </div>
      </header>

      {error ? <p role="alert">{error}. Comprueba que el backend esté activo.</p>
        : days.length === 0 ? <EmptyState detail="No hay observaciones disponibles para los filtros seleccionados." />
          : <div className="time-series__chart" role="img" aria-label="Observaciones por día">
            <div className="time-series__bars">{days.map(([day, count]) => <div className="time-series__bar-column" key={day} title={`${day}: ${count} observaciones`}>
              <span>{count.toLocaleString('es-AR')}</span><div style={{ height: `${Math.max(3, count / maximum * 100)}%` }} />
            </div>)}</div>
            <div className="time-series__labels">{days.map(([day]) => <span key={day}>{day.slice(5)}</span>)}</div>
            <p>{observations.length.toLocaleString('es-AR')} observaciones · agrupadas por fecha UTC</p>
          </div>}
    </section>
  )
}

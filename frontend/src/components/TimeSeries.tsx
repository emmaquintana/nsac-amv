import { EmptyState } from './EmptyState'
import type { AppliedFilters } from '../types/app'
import './TimeSeries.css'

type TimeSeriesProps = {
  filters: AppliedFilters
}

export function TimeSeries({ filters }: TimeSeriesProps) {
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

      <EmptyState detail="No hay una serie temporal disponible para los filtros seleccionados." />
    </section>
  )
}

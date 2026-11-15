import { useId, useState } from 'react'
import type { AppliedFilters, Period, View } from '../types/app'
import { regions } from '../types/app'
import { DEFAULT_PERIOD, filtersForPeriod } from '../filters'
import './FilterPanel.css'

type FilterPanelProps = {
  view: View
  onApply: (filters: AppliedFilters) => void
}

export function FilterPanel({ view, onApply }: FilterPanelProps) {
  const id = useId()
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)
  const [selectedRegions, setSelectedRegions] = useState<string[]>(regions)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState('')

  function toggleRegion(region: string) {
    setSelectedRegions((currentRegions) => currentRegions.includes(region)
      ? currentRegions.filter((currentRegion) => currentRegion !== region)
      : [...currentRegions, region])
  }

  function applyFilters() {
    if (period === 'custom' && (!startDate || !endDate || startDate > endDate)) {
      setError('La fecha de inicio debe ser anterior o igual a la fecha de fin.')
      return
    }

    setError('')
    onApply(period === 'custom' ? {
      regions: selectedRegions,
      startDate,
      endDate,
    } : filtersForPeriod(period, selectedRegions))
  }

  return (
    <section className="filter-panel" aria-labelledby={`${id}-title`}>
      <header className="filter-panel__header">
        <div>
          <span className="filter-panel__eyebrow">CONFIGURACIÓN</span>
          <h2 id={`${id}-title`}>Filtros</h2>
        </div>
        <span className="filter-panel__header-icon" aria-hidden="true">⌘</span>
      </header>

      {view === 'series' ? (
        <fieldset className="filter-panel__regions">
          <legend>Regiones</legend>
          <span className="filter-panel__hint">Selecciona una o más regiones</span>
          {regions.map((region) => (
            <label className="filter-panel__checkbox" key={region}>
              <input
                type="checkbox"
                checked={selectedRegions.includes(region)}
                onChange={() => toggleRegion(region)}
              />
              <span>{region}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="filter-panel__field">
          <label htmlFor={`${id}-region`}>Región</label>
          <select
            id={`${id}-region`}
            value={selectedRegions.length === regions.length ? '' : selectedRegions[0] ?? ''}
            onChange={(event) => setSelectedRegions(event.target.value ? [event.target.value] : regions)}
          >
            <option value="">Todas las regiones</option>
            {regions.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </div>
      )}

      <div className="filter-panel__field">
        <label htmlFor={`${id}-period`}>Periodo</label>
        <select
          id={`${id}-period`}
          value={period}
          onChange={(event) => setPeriod(event.target.value as Period)}
        >
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>

      {period === 'custom' && (
        <div className="filter-panel__date-range">
          <div className="filter-panel__field">
            <label htmlFor={`${id}-start`}>Fecha de inicio</label>
            <input
              id={`${id}-start`}
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="filter-panel__field">
            <label htmlFor={`${id}-end`}>Fecha de fin</label>
            <input
              id={`${id}-end`}
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
      )}

      {error && <p className="filter-panel__error" role="alert">{error}</p>}

      <button className="filter-panel__apply" type="button" onClick={applyFilters}>
        Aplicar filtros <span aria-hidden="true">→</span>
      </button>

      <div className="filter-panel__source">
        <span aria-hidden="true">◈</span>
        <div>
          <strong>Fuentes armonizadas</strong>
          <span>MODIS · VIIRS</span>
        </div>
      </div>
    </section>
  )
}

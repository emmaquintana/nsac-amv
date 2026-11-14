import { useState } from 'react'
import type { AppliedFilters, Period, View } from '../types/app'
import { regions } from '../types/app'
import './FilterPanel.css'

type FilterPanelProps = {
  view: View
  onApply: (filters: AppliedFilters) => void
}

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function FilterPanel({ view, onApply }: FilterPanelProps) {
  const [period, setPeriod] = useState<Period>('30')
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

    const end = new Date()
    const start = new Date(end)

    if (period !== 'custom') {
      start.setDate(end.getDate() - Number(period) + 1)
    }

    setError('')
    onApply({
      regions: selectedRegions,
      startDate: period === 'custom' ? startDate : formatDate(start),
      endDate: period === 'custom' ? endDate : formatDate(end),
    })
  }

  return (
    <section className="filter-panel" aria-labelledby="filter-panel-title">
      <header className="filter-panel__header">
        <div>
          <span className="filter-panel__eyebrow">CONFIGURACIÓN</span>
          <h2 id="filter-panel-title">Filtros</h2>
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
          <label htmlFor="region-filter">Región</label>
          <select
            id="region-filter"
            value={selectedRegions.length === regions.length ? '' : selectedRegions[0] ?? ''}
            onChange={(event) => setSelectedRegions(event.target.value ? [event.target.value] : [])}
          >
            <option value="">Todas las regiones</option>
            {regions.map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </div>
      )}

      <div className="filter-panel__field">
        <label htmlFor="period-filter">Periodo</label>
        <select
          id="period-filter"
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
            <label htmlFor="start-date">Fecha de inicio</label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="filter-panel__field">
            <label htmlFor="end-date">Fecha de fin</label>
            <input
              id="end-date"
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

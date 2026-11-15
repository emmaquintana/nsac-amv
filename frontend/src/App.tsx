import { useState } from 'react'
import { FilterPanel } from './components/FilterPanel'
import { Sidebar } from './components/Sidebar'
import { ThemeToggle } from './components/ThemeToggle'
import { TimeSeries } from './components/TimeSeries'
import { WorldMap } from './components/WorldMap'
import type { AppliedFilters, View } from './types/app'
import { regions } from './types/app'
import './App.css'

export default function App() {
  const [view, setView] = useState<View>('map')
  const [filters, setFilters] = useState<AppliedFilters>({
    regions,
    startDate: '',
    endDate: '',
  })

  function handleApplyFilters(nextFilters: AppliedFilters) {
    setFilters(nextFilters)
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} onViewChange={setView} />

      <main className="app-main">
        <header className="app-header">
          <div className="app-header__title">
            <span className="app-header__overline">CENTRO DE ANÁLISIS SATELITAL</span>
            <h1>NSAC - Armonizacion de MODIS y VIIRS</h1>
          </div>
          <ThemeToggle />
        </header>

        <div className="app-content">
          <div className="app-content__intro">
            <div>
              <span className="app-content__breadcrumb">
                ESCRITORIO <b>/</b> {view === 'map' ? 'PLANISFERIO' : 'SERIE TEMPORAL'}
              </span>
              <p>
                {view === 'map'
                  ? 'Explora la actividad térmica global y sus focos detectados.'
                  : 'Compara la evolución de incendios entre regiones.'}
              </p>
            </div>
          </div>

          <div className="app-content__layout">
            <FilterPanel key={view} view={view} onApply={handleApplyFilters} />

            {view === 'map'
              ? <WorldMap filters={filters} />
              : <TimeSeries filters={filters} />}
          </div>

          <footer className="app-footer">
            <span>NSAC · Armonización de datos satelitales</span>
            <span>MODIS <i /> VIIRS <i /> CAPA COMÚN DE DATOS</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

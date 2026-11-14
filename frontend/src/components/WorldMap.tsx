import { useEffect, useRef } from 'react'
import { useTheme } from '../context/ThemeProvider'
import type { AppliedFilters } from '../types/app'
import { EmptyState } from './EmptyState'
import './WorldMap.css'

type WorldMapProps = {
  filters: AppliedFilters
}

export function WorldMap({ filters }: WorldMapProps) {
  const mapElement = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()

  useEffect(() => {
    if (!mapElement.current || !window.L) {
      return
    }

    const map = window.L.map(mapElement.current, { zoomControl: false })
      .setView([4, 0], 2)
    const tileStyle = theme === 'dark' ? 'dark_all' : 'light_all'

    window.L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${tileStyle}/{z}/{x}/{y}{r}.png`,
      {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19,
      },
    ).addTo(map)

    // El contenedor empieza oculto en una vista con pestañas; al montarlo se
    // recalculan sus dimensiones para que Leaflet renderice la tesela completa.
    requestAnimationFrame(() => map.invalidateSize())

    return () => map.remove()
  }, [theme])

  return (
    <section className="world-map" aria-labelledby="world-map-title">
      <header className="world-map__header">
        <div>
          <span className="world-map__eyebrow">DISTRIBUCIÓN GLOBAL</span>
          <h2 id="world-map-title">Focos térmicos</h2>
        </div>
      </header>

      <div className="world-map__canvas">
        <div className="world-map__leaflet" ref={mapElement} />
        <div className="world-map__empty-overlay">
          <EmptyState detail="No hay observaciones disponibles para los filtros seleccionados." />
        </div>
      </div>

      <footer className="world-map__footer">
        <span>Mapa base © OpenStreetMap · CARTO</span>
        <span>
          {filters.startDate && filters.endDate
            ? `${filters.startDate} — ${filters.endDate}`
            : 'Sin observaciones térmicas'}
        </span>
      </footer>
    </section>
  )
}

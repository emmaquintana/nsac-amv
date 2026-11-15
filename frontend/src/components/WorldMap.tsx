import { useEffect, useRef } from 'react'
import type { AppliedFilters } from '../types/app'
import { useObservations } from '../hooks/useObservations'
import { EmptyState } from './EmptyState'
import './WorldMap.css'

type WorldMapProps = {
  filters: AppliedFilters
}

export function WorldMap({ filters }: WorldMapProps) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<LeafletLayerGroup | null>(null)
  const { observations, error } = useObservations(filters)

  useEffect(() => {
    if (!mapElement.current || !window.L) {
      return
    }

    const map = window.L.map(mapElement.current, { zoomControl: false })
      .setView([4, 0], 2)
    window.L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    ).addTo(map)
    const markers = window.L.layerGroup().addTo(map)
    mapRef.current = map
    markersRef.current = markers

    // El contenedor empieza oculto en una vista con pestañas; al montarlo se
    // recalculan sus dimensiones para que Leaflet renderice la tesela completa.
    requestAnimationFrame(() => map.invalidateSize())

    return () => { map.remove(); mapRef.current = null; markersRef.current = null }
  }, [])

  useEffect(() => {
    const markers = markersRef.current
    if (!markers || !window.L) return
    markers.clearLayers()
    observations.forEach((item) => {
      const marker = window.L.circleMarker([item.latitude, item.longitude], {
        radius: Math.max(3, Math.min(9, 3 + (item.frp ?? 0) / 20)),
        color: item.source === 'MODIS' ? '#f07832' : '#edba32',
        fillColor: item.source === 'MODIS' ? '#f07832' : '#edba32',
        fillOpacity: 0.72,
        weight: 1,
      })
      marker.bindPopup(`<strong>${item.source}${item.satellite ? ` · ${item.satellite}` : ''}</strong><br>${new Date(item.detected_at).toLocaleString('es-AR')}<br>FRP: ${item.frp ?? 's/d'} MW`)
      marker.addTo(markers)
    })
  }, [observations])

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
        {error ? <div className="world-map__message" role="alert">{error}. Comprueba que el backend esté activo.</div>
          : observations.length === 0 && <div className="world-map__empty-overlay"><EmptyState detail="No hay observaciones disponibles para los filtros seleccionados." /></div>}
      </div>

      <footer className="world-map__footer">
        <span>Mapa base © OpenStreetMap contributors</span>
        <span>
          {filters.startDate && filters.endDate
            ? `${filters.startDate} — ${filters.endDate}`
            : `${observations.length.toLocaleString('es-AR')} observaciones`}
        </span>
      </footer>
    </section>
  )
}

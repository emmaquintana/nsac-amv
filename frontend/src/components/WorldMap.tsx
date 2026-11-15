import { useEffect, useRef, useState } from 'react'
import type { AppliedFilters, MapViewport } from '../types/app'
import { regions } from '../types/app'
import { useObservations } from '../hooks/useObservations'
import { useTimeSeries } from '../hooks/useTimeSeries'
import { EmptyState } from './EmptyState'
import './WorldMap.css'

type WorldMapProps = {
  filters: AppliedFilters
  active: boolean
}

export function WorldMap({ filters, active }: WorldMapProps) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<LeafletLayerGroup | null>(null)
  const [viewport, setViewport] = useState<MapViewport | null>(null)
  const { data, error, loading, retry, loadingMessage } = useObservations(filters, viewport, active)
  const { points, total: visibleTotal } = data
  const allRegionsSelected = regions.every((region) => filters.regions.includes(region))
  const { summary, error: totalError, loading: totalLoading, retry: retryTotal } = useTimeSeries(filters, allRegionsSelected ? 'global' : 'regions')
  // Sin filtro continental también se cuentan otras regiones y puntos oceánicos.
  const total = !filters.regions.length ? 0 : summary
    ? summary.total + (allRegionsSelected ? summary.unassigned : 0)
    : null

  useEffect(() => {
    if (!mapElement.current || !window.L) {
      return
    }

    const map = window.L.map(mapElement.current, { zoomControl: true, preferCanvas: true, maxZoom: 19, worldCopyJump: true })
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

    const updateViewport = () => {
      const bounds = map.getBounds()
      const next = { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(),
        north: bounds.getNorth(), zoom: map.getZoom() }
      setViewport((previous) => previous && Object.keys(next).every(
        (key) => previous[key as keyof MapViewport] === next[key as keyof MapViewport],
      ) ? previous : next)
    }
    map.on('moveend', updateViewport)
    updateViewport()

    return () => { map.off('moveend', updateViewport); map.remove(); mapRef.current = null; markersRef.current = null }
  }, [])

  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => mapRef.current?.invalidateSize())
    return () => cancelAnimationFrame(frame)
  }, [active])

  useEffect(() => {
    const markers = markersRef.current
    if (!markers || !window.L) return
    markers.clearLayers()
    const map = mapRef.current
    if (!map) return
    points.forEach((item) => {
      const grouped = item.count > 1
      const color = item.modis > 0 && item.viirs > 0 ? '#e78f32' : item.modis > 0 ? '#f07832' : '#edba32'
      // Mantiene los puntos junto a la ventana al cruzar ±180° o desplazar una vuelta completa.
      const longitude = item.longitude + 360 * Math.round((map.getCenter().lng - item.longitude) / 360)
      const marker = window.L.circleMarker([item.latitude, longitude], {
        radius: grouped ? Math.min(15, 5 + Math.log10(item.count) * 2) : 4,
        color,
        fillColor: color,
        fillOpacity: 0.72,
        weight: 1,
      })
      const first = new Date(item.first_detection).toLocaleString('es-AR')
      const last = new Date(item.last_detection).toLocaleString('es-AR')
      marker.bindPopup(`<strong>${item.count.toLocaleString('es-AR')} ${grouped ? 'observaciones agrupadas' : 'observación'}</strong><br>MODIS: ${item.modis.toLocaleString('es-AR')} · VIIRS: ${item.viirs.toLocaleString('es-AR')}<br>${first}${first !== last ? `<br>Hasta ${last}` : ''}<br>FRP${grouped ? ' máxima' : ''}: ${item.max_frp ?? 's/d'} MW${grouped ? '<br>Acerca el mapa para ver más detalle.' : ''}`)
      marker.addTo(markers)
    })
  }, [points, viewport])

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
        {error ? <div className="world-map__message" role="alert">{error} <button type="button" onClick={retry}>Reintentar</button></div>
          : points.length === 0 && <div className="world-map__empty-overlay">
            {loading ? <p role="status">{loadingMessage}</p>
              : <EmptyState detail="No hay observaciones en esta área con los filtros seleccionados. Desplaza el mapa o aleja el zoom para explorar otras zonas." />}
          </div>}
      </div>

      <footer className="world-map__footer">
        <div>
          <span>{total !== null ? `${total.toLocaleString('es-AR')} observaciones en el período`
            : totalLoading ? 'Calculando total del período…' : 'Total del período no disponible'}</span>
          <span role="status">{loading ? loadingMessage : error ? 'No se pudo actualizar el área visible'
            : `${visibleTotal.toLocaleString('es-AR')} observaciones en el área visible · ${points.length.toLocaleString('es-AR')} puntos en el mapa`}</span>
          {totalError && <span role="alert">{totalError} <button type="button" onClick={retryTotal}>Reintentar total</button></span>}
        </div>
        <span>Acerca el mapa para desplegar los focos agrupados.</span>
        <span>
          {filters.startDate && filters.endDate
            ? `${filters.startDate} — ${filters.endDate}`
            : 'Todo el período disponible'}
        </span>
      </footer>
    </section>
  )
}

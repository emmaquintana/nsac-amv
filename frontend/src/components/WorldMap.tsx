import { useEffect, useRef, useState } from 'react'
import type { AppliedFilters, MapViewport } from '../types/app'
import { regions } from '../types/app'
import { useObservations } from '../hooks/useObservations'
import { useTimeSeries } from '../hooks/useTimeSeries'
import { EmptyState } from './EmptyState'
import { useLanguage } from '../context/LanguageContext'
import './WorldMap.css'

type WorldMapProps = {
  filters: AppliedFilters
  active: boolean
}

export function WorldMap({ filters, active }: WorldMapProps) {
  const { t, locale, formatNumber, formatDate } = useLanguage()
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
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
    for (const [selector, label] of [['.leaflet-control-zoom-in', t('zoomIn')], ['.leaflet-control-zoom-out', t('zoomOut')]]) {
      const button = mapElement.current?.querySelector(selector)
      button?.setAttribute('title', label)
      button?.setAttribute('aria-label', label)
    }
  }, [t])

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
      const first = new Date(item.first_detection).toLocaleString(locale)
      const last = new Date(item.last_detection).toLocaleString(locale)
      marker.bindPopup(`<strong>${formatNumber(item.count)} ${t(grouped ? 'groupedObservations' : 'observation')}</strong><br>MODIS: ${formatNumber(item.modis)} · VIIRS: ${formatNumber(item.viirs)}<br>${first}${first !== last ? `<br>${t('until')} ${last}` : ''}<br>${grouped ? t('maxFrp') : 'FRP'}: ${item.max_frp === null ? t('noValue') : formatNumber(item.max_frp)} MW${grouped ? `<br>${t('detailHint')}` : ''}`)
      marker.addTo(markers)
    })
  }, [points, viewport, locale, t, formatNumber])

  return (
    <section className="world-map" aria-labelledby="world-map-title">
      <header className="world-map__header">
        <div>
          <span className="world-map__eyebrow">{t('globalDistribution')}</span>
          <h2 id="world-map-title">{t('hotspots')}</h2>
        </div>
      </header>

      <div className="world-map__canvas">
        <div className="world-map__leaflet" ref={mapElement} />
        {error ? <div className="world-map__message" role="alert">{error} <button type="button" onClick={retry}>{t('retry')}</button></div>
          : points.length === 0 && <div className="world-map__empty-overlay">
            {loading ? <p role="status">{loadingMessage}</p>
              : <EmptyState detail={t('mapEmpty')} />}
          </div>}
      </div>

      <footer className="world-map__footer">
        <div>
          <span>{total !== null ? t('periodTotal', { count: total })
            : t(totalLoading ? 'calculatingTotal' : 'unavailableTotal')}</span>
          <span role="status">{loading ? loadingMessage : error ? t('visibleError')
            : t('visibleTotal', { count: visibleTotal, points: points.length })}</span>
          {totalError && <span role="alert">{totalError} <button type="button" onClick={retryTotal}>{t('retryTotal')}</button></span>}
        </div>
        <span>{t('zoomHint')}</span>
        <span>
          {filters.startDate && filters.endDate
            ? `${formatDate(filters.startDate)} — ${formatDate(filters.endDate)}`
            : t('allDates')}
        </span>
      </footer>
    </section>
  )
}

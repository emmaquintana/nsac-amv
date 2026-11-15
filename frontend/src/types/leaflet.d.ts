type LeafletMap = {
  setView: (center: [number, number], zoom: number) => LeafletMap
  remove: () => void
  invalidateSize: () => void
  getBounds: () => { getWest: () => number; getSouth: () => number; getEast: () => number; getNorth: () => number }
  getZoom: () => number
  getCenter: () => { lng: number }
  on: (event: string, callback: () => void) => LeafletMap
  off: (event: string, callback: () => void) => LeafletMap
}

type LeafletTileLayer = {
  addTo: (map: LeafletMap) => LeafletTileLayer
}

type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => LeafletLayerGroup
  clearLayers: () => LeafletLayerGroup
}

type LeafletCircleMarker = {
  bindPopup: (content: string) => LeafletCircleMarker
  addTo: (group: LeafletLayerGroup) => LeafletCircleMarker
}

type LeafletNamespace = {
  map: (container: HTMLElement, options?: { zoomControl?: boolean; preferCanvas?: boolean; maxZoom?: number; worldCopyJump?: boolean }) => LeafletMap
  tileLayer: (url: string, options: { attribution: string; maxZoom: number }) => LeafletTileLayer
  layerGroup: () => LeafletLayerGroup
  circleMarker: (point: [number, number], options: { radius: number; color: string; fillColor: string; fillOpacity: number; weight: number }) => LeafletCircleMarker
}

interface Window {
  L: LeafletNamespace
}

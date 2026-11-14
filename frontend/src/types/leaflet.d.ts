type LeafletMap = {
  setView: (center: [number, number], zoom: number) => LeafletMap
  remove: () => void
  invalidateSize: () => void
}

type LeafletTileLayer = {
  addTo: (map: LeafletMap) => LeafletTileLayer
}

type LeafletNamespace = {
  map: (container: HTMLElement, options?: { zoomControl?: boolean }) => LeafletMap
  tileLayer: (url: string, options: { attribution: string; maxZoom: number }) => LeafletTileLayer
}

interface Window {
  L: LeafletNamespace
}

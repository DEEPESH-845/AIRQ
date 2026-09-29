import { Map as MLMap, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type { District, World } from '../lib/world'
import { CATS, catOf } from '../lib/naqi'
import { startParticles } from './particles'

setWorkerUrl(workerUrl)

const INDIA: [[number, number], [number, number]] = [[68.1, 6.7], [97.4, 37.1]]
const LAND = '#2a2650'
const homePadding = () =>
  innerWidth < 760 ? { top: 130, bottom: 150, left: 12, right: 12 } : { top: 90, bottom: 60, left: 480, right: 60 }

const aqiColor = [
  'step',
  ['coalesce', ['feature-state', 'aqi'], -1],
  LAND,
  0, CATS[0].color,
  51, CATS[1].color,
  101, CATS[2].color,
  201, CATS[3].color,
  301, CATS[4].color,
  401, CATS[5].color,
  451, CATS[6].color,
]

const STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    neighbors: { type: 'geojson', data: '/geo/neighbors.geojson' },
    states: { type: 'geojson', data: '/geo/states.geojson' },
    districts: { type: 'geojson', data: '/geo/districts.geojson', promoteId: 'id' },
    fires: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    labels: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': '#14122b' } },
    { id: 'neighbors', type: 'fill', source: 'neighbors', paint: { 'fill-color': '#1d1a3a' } },
    { id: 'neighbors-line', type: 'line', source: 'neighbors', paint: { 'line-color': '#2f2b55', 'line-width': 0.6 } },
    { id: 'india', type: 'fill', source: 'states', paint: { 'fill-color': LAND } },
    {
      id: 'districts',
      type: 'fill',
      source: 'districts',
      paint: {
        'fill-color': aqiColor as never,
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'sel'], false], 0.92,
          ['boolean', ['feature-state', 'hover'], false], 0.86,
          0.7,
        ],
      },
    },
    {
      id: 'district-lines',
      type: 'line',
      source: 'districts',
      paint: { 'line-color': '#14122b', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.35, 7, 0.7], 'line-width': 0.5 },
    },
    { id: 'state-lines', type: 'line', source: 'states', paint: { 'line-color': '#f1eef9', 'line-opacity': 0.32, 'line-width': 0.9 } },
    {
      id: 'fires-glow',
      type: 'circle',
      source: 'fires',
      paint: {
        'circle-color': '#ff7a1a',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['+', 2, ['*', 0.08, ['get', 'frp']]], 8, ['+', 6, ['*', 0.2, ['get', 'frp']]]],
        'circle-blur': 1,
        'circle-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 0.7, 48, 0.15],
      },
    },
    {
      id: 'fires-core',
      type: 'circle',
      source: 'fires',
      paint: {
        'circle-color': '#ffd27a',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 0.9, 8, 2.2],
        'circle-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 1, 48, 0.25],
      },
    },
    {
      id: 'sel-line',
      type: 'line',
      source: 'districts',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': '#ffffff', 'line-width': 2 },
    },
    {
      id: 'labels',
      type: 'symbol',
      source: 'labels',
      minzoom: 5.6,
      layout: {
        'text-field': ['get', 'n'],
        'text-font': ['Open Sans Semibold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5.6, 10, 9, 14],
        'text-max-width': 8,
        'text-padding': 6,
      },
      paint: { 'text-color': '#f1eef9', 'text-halo-color': 'rgba(20,18,43,0.85)', 'text-halo-width': 1.4 },
    },
  ],
}

type Props = {
  world: World
  selected: District | null
  onSelect: (id: string | null) => void
  panelOpen: boolean
}

export function ArqMap({ world, selected, onSelect, panelOpen }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const byId = useRef(new Map<string, District>())
  byId.current = new Map(world.districts.map((d) => [d.id, d]))

  // create the map once
  useEffect(() => {
    const map = new MLMap({
      container: el.current!,
      style: STYLE,
      bounds: INDIA,
      fitBoundsOptions: { padding: homePadding() },
      maxBounds: [[10, -35], [150, 65]],
      renderWorldCopies: false,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      minZoom: 3,
      maxZoom: 10,
    })
    map.touchZoomRotate.disableRotation()
    mapRef.current = map
    let hovered: string | null = null

    map.on('load', () => setReady(true))
    map.on('mousemove', 'districts', (e) => {
      const f = e.features?.[0]
      if (!f) return
      const id = String(f.id)
      if (hovered !== id) {
        if (hovered) map.setFeatureState({ source: 'districts', id: hovered }, { hover: false })
        hovered = id
        map.setFeatureState({ source: 'districts', id }, { hover: true })
      }
      map.getCanvas().style.cursor = 'pointer'
      const d = byId.current.get(id)
      const t = tip.current
      if (t && d) {
        t.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`
        t.dataset.show = 'true'
        t.innerHTML = `<b>${d.n}</b><span>${d.s}</span><i style="--c:${catOf(d.aqi).color}">${d.aqi}</i>`
      }
    })
    map.on('mouseleave', 'districts', () => {
      if (hovered) map.setFeatureState({ source: 'districts', id: hovered }, { hover: false })
      hovered = null
      map.getCanvas().style.cursor = ''
      if (tip.current) tip.current.dataset.show = 'false'
    })
    map.on('click', 'districts', (e) => {
      const f = e.features?.[0]
      if (f) onSelectRef.current(String(f.id))
    })
    return () => map.remove()
  }, [])

  // push world data into the map
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const d of world.districts) map.setFeatureState({ source: 'districts', id: d.id }, { aqi: d.aqi })
    ;(map.getSource('fires') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: world.fires.map(([lon, lat, frp, age]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { frp, age },
      })),
    })
    ;(map.getSource('labels') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: world.districts.map((d) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: d.c },
        properties: { n: d.n },
      })),
    })
    return startParticles(map, canvas.current!, world)
  }, [world, ready])

  // selection: outline + camera
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setFilter('sel-line', ['==', ['get', 'id'], selected?.id ?? ''])
    for (const d of world.districts) map.setFeatureState({ source: 'districts', id: d.id }, { sel: d.id === selected?.id })
    const mobile = innerWidth < 760
    const padding = mobile
      ? { top: 70, bottom: Math.round(innerHeight * 0.55), left: 20, right: 20 }
      : { top: 80, bottom: 80, left: 40, right: panelOpen ? 460 : 40 }
    if (selected) map.flyTo({ center: selected.c, zoom: selected.s === 'Delhi' ? 8.6 : selected.k === 'ncr' ? 7.6 : 6.8, padding, duration: 1600, essential: true })
    else map.fitBounds(INDIA, { padding: homePadding(), duration: 1200 })
  }, [selected, ready, panelOpen, world])

  return (
    <div className="map-wrap">
      <div ref={el} className="map" aria-label="Map of India coloured by live air quality" role="application" />
      <canvas ref={canvas} className="particles" aria-hidden="true" />
      <div ref={tip} className="map-tip" data-show="false" aria-hidden="true" />
    </div>
  )
}

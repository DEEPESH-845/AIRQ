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

// reveal the smoke path from its source (0) to the district (1) as p grows
function trajGradient(p: number) {
  const q = Math.min(Math.max(p, 0.002), 0.997)
  return ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255,122,26,0.9)', q, 'rgba(255,226,170,1)', q + 0.002, 'rgba(255,122,26,0)', 1, 'rgba(255,122,26,0)']
}

const empty = { type: 'FeatureCollection' as const, features: [] }

const STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    neighbors: { type: 'geojson', data: '/geo/neighbors.geojson' },
    states: { type: 'geojson', data: '/geo/states.geojson' },
    districts: { type: 'geojson', data: '/geo/districts.geojson', promoteId: 'id' },
    fires: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    labels: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    traj: { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } },
    trajpts: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    clusters: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
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
      id: 'hl-line',
      type: 'line',
      source: 'districts',
      filter: ['in', ['get', 'id'], ['literal', []]],
      paint: { 'line-color': '#ffd27a', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
    },
    {
      id: 'sel-line',
      type: 'line',
      source: 'districts',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': '#ffffff', 'line-width': 2 },
    },
    { id: 'traj-glow', type: 'line', source: 'traj', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.45, 'line-gradient': trajGradient(0) as never } },
    { id: 'traj-line', type: 'line', source: 'traj', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 3, 'line-gradient': trajGradient(0) as never } },
    { id: 'clusters-ring', type: 'circle', source: 'clusters', paint: { 'circle-radius': 14, 'circle-color': 'rgba(255,122,26,0.12)', 'circle-stroke-color': '#ff7a1a', 'circle-stroke-width': 2 } },
    { id: 'trajpts', type: 'circle', source: 'trajpts', paint: { 'circle-radius': 3.5, 'circle-color': '#14122b', 'circle-stroke-color': '#ffd27a', 'circle-stroke-width': 1.5, 'circle-opacity': ['get', 'show'], 'circle-stroke-opacity': ['get', 'show'] } },
    {
      id: 'trajpts-label',
      type: 'symbol',
      source: 'trajpts',
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Semibold'], 'text-size': 12, 'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-allow-overlap': true },
      paint: { 'text-color': '#ffd27a', 'text-halo-color': 'rgba(20,18,43,0.9)', 'text-halo-width': 1.5, 'text-opacity': ['get', 'show'] },
    },
    {
      id: 'clusters-label',
      type: 'symbol',
      source: 'clusters',
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Semibold'], 'text-size': 13, 'text-offset': [0, 1.9], 'text-anchor': 'top', 'text-max-width': 12 },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(20,18,43,0.9)', 'text-halo-width': 1.5 },
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
  trace: District | null
  highlight: string[]
}

export function AirqMap({ world, selected, onSelect, panelOpen, trace, highlight }: Props) {
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

  // districts the General talked about: outline them and bring them into view
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setFilter('hl-line', ['in', ['get', 'id'], ['literal', highlight]])
    const pts = world.districts.filter((d) => highlight.includes(d.id))
    if (pts.length > 1) {
      const lons = pts.map((d) => d.c[0])
      const lats = pts.map((d) => d.c[1])
      map.fitBounds([[Math.min(...lons) - 0.6, Math.min(...lats) - 0.6], [Math.max(...lons) + 0.6, Math.max(...lats) + 0.6]], {
        padding: innerWidth < 760 ? { top: 80, bottom: innerHeight * 0.5, left: 20, right: 20 } : { top: 100, bottom: 80, left: 460, right: panelOpen ? 480 : 60 },
        duration: 1200, maxZoom: 7.5,
      })
    }
  }, [highlight, ready, world, panelOpen])

  // Trace to Source: draw the 36 h back-trajectory from the fire cluster into the district
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const traj = map.getSource('traj') as GeoJSONSource
    const pts = map.getSource('trajpts') as GeoJSONSource
    const cl = map.getSource('clusters') as GeoJSONSource
    if (!trace) {
      traj.setData(empty)
      pts.setData(empty)
      cl.setData(empty)
      return
    }
    const path = [...trace.traj].reverse() // oldest point first: the smoke's real direction of travel
    traj.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: path }, properties: {} })
    const n = path.length - 1
    const marks = trace.traj
      .map((c, k) => ({ c, h: k * 3 }))
      .filter(({ h }) => h > 0 && h % 12 === 0)
    cl.setData({
      type: 'FeatureCollection',
      features: trace.clusters.map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c.c },
        properties: { label: `${c.fires} fire${c.fires > 1 ? 's' : ''} near ${c.near.split(',')[0]}` },
      })),
    })
    const lons = [...path.map((p) => p[0]), ...trace.clusters.map((c) => c.c[0])]
    const lats = [...path.map((p) => p[1]), ...trace.clusters.map((c) => c.c[1])]
    const mobile = innerWidth < 760
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: mobile ? { top: 90, bottom: innerHeight * 0.5, left: 30, right: 30 } : { top: 110, bottom: 90, left: 90, right: 520 }, duration: 1400, maxZoom: 8 },
    )
    let raf = 0
    const t0 = performance.now() + 1300
    const frame = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / 2600))
      const e = 1 - Math.pow(1 - p, 3)
      map.setPaintProperty('traj-line', 'line-gradient', trajGradient(e) as never)
      map.setPaintProperty('traj-glow', 'line-gradient', trajGradient(e) as never)
      map.setPaintProperty('clusters-ring', 'circle-radius', 12 + 5 * Math.sin(t / 260))
      pts.setData({
        type: 'FeatureCollection',
        features: marks.map(({ c, h }) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: c },
          properties: { label: `${h} h ago`, show: e >= 1 - (h / 3) / n ? 1 : 0 },
        })),
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [trace, ready])

  return (
    <div className="map-wrap">
      <div ref={el} className="map" aria-label="Map of India coloured by live air quality" role="application" />
      <canvas ref={canvas} className="particles" aria-hidden="true" />
      <div ref={tip} className="map-tip" data-show="false" aria-hidden="true" />
    </div>
  )
}

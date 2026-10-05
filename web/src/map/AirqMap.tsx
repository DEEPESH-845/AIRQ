import { Map as MLMap, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type { District, World } from '../lib/world'
import { CATS, catOf } from '../lib/naqi'
import { startParticles } from './particles'
import { raidLevels } from '../lib/story'

setWorkerUrl(workerUrl)

const INDIA: [[number, number], [number, number]] = [[68.1, 6.7], [97.4, 37.1]]
const LAND = '#2a2650'
// on phones the top bar wraps onto several rows (HUD, raid banner), so frame the map below its real height
const barBottom = () => Math.round(document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 120) + 8
// ...and above the national readout card that docks at the bottom
const readoutTop = () => document.querySelector('.readout')?.getBoundingClientRect().top ?? innerHeight - 150
const homePadding = () =>
  innerWidth < 760
    ? { top: barBottom(), bottom: Math.round(innerHeight - readoutTop()) + 8, left: 12, right: 12 }
    : { top: 90, bottom: 60, left: 480, right: 60 }

// the briefing card sits bottom-centre (and the readout is hidden), so frame India above it
const briefPadding = () =>
  innerWidth < 760 ? { top: barBottom(), bottom: 250, left: 12, right: 12 } : { top: 150, bottom: 250, left: 60, right: 60 }

export type Focus = { to: 'india' | [number, number]; brief?: boolean; zoom?: number } | null
export type MapField = { c: [number, number]; r: number; fire: boolean } | null

const GREEN = '#8fe3a8'
// a field as a 48-point polygon of its real radius (metres)
function circle([lon, lat]: [number, number], r: number) {
  const pts: [number, number][] = []
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI
    pts.push([lon + (r * Math.cos(a)) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (r * Math.sin(a)) / 110570])
  }
  return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [pts] }, properties: {} }
}

// AQI and raid level are feature properties (not feature-state) so layer filters can pick out raided districts
const aqiColor = [
  'step',
  ['coalesce', ['get', 'aqi'], -1],
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

// fetched once at module load so the shapes download alongside world.json
const districtShapes: Promise<{ type: 'FeatureCollection'; features: { type: 'Feature'; geometry: never; properties: { id: string } }[] }> = fetch('/geo/districts.geojson').then((r) => r.json())

// Smog front: raided districts (raid: 2 = now, 1 = within 24 h) get a breathing haze (now only) and a
// dashed border that marches like a weather-front marking. District-shaped, no circles.
// Animate only constant, non-data-driven paint values: MapLibre re-lays out the whole districts source
// whenever a data-driven paint value or line-dasharray changes, and doing that every frame kept tiles
// from ever finishing loading (half of India stayed uncoloured).
const raid = ['coalesce', ['get', 'raid'], 0]
const raided = ['>', raid, 0]
const HAZE = '#f3e4cf' // pale smoke over the band colour
// dash phases for a marching line (MapLibre can't animate dash offset, so step through equivalent patterns)
// every phase has an even length and the same 7-unit period, so MapLibre never doubles a pattern mid-march
const MARCH = [[0, 4, 3, 0], [0.5, 4, 2.5, 0], [1, 4, 2, 0], [1.5, 4, 1.5, 0], [2, 4, 1, 0], [2.5, 4, 0.5, 0], [3, 4, 0, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]]
// one line layer per phase; the march shows one at a time by switching opacity
const frontOpacity = ['interpolate', ['linear'], ['zoom'], 4, 0.35, 6, 0.95]
const marchLayers = MARCH.map((dash, i) => ({
  id: `raid-front-${i}`,
  type: 'line' as const,
  source: 'districts',
  filter: raided,
  layout: { 'line-join': 'round' as const },
  paint: {
    'line-color': ['case', ['==', raid, 2], '#fff1e0', '#ffb36b'],
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 8, 2.6],
    'line-opacity': i === 0 ? frontOpacity : 0,
    'line-opacity-transition': { duration: 0 },
    'line-dasharray': dash,
  },
}))

const STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    neighbors: { type: 'geojson', data: '/geo/neighbors.geojson' },
    states: { type: 'geojson', data: '/geo/states.geojson' },
    districts: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' },
    fires: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    labels: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    traj: { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } },
    trajpts: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    clusters: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    community: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    field: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    pacts: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
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
    { id: 'raid-haze', type: 'fill', source: 'districts', filter: ['==', raid, 2] as never, paint: { 'fill-color': HAZE, 'fill-opacity': 0.24, 'fill-opacity-transition': { duration: 0 } } },
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
      id: 'raid-front-glow',
      type: 'line',
      source: 'districts',
      filter: raided as never,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': ['case', ['==', raid, 2], '#ffd9b0', '#ff9a4d'] as never,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 5, 8, 10],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 8],
        // at country zoom the glow carries the shape; dashes take over as you zoom in
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 7, 0.3],
      },
    },
    ...(marchLayers as never[]),
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
    // citizens fighting back: verified green actions in the last 7 days glow at their district
    {
      id: 'community-glow',
      type: 'circle',
      source: 'community',
      paint: {
        'circle-color': GREEN,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['+', 11, ['*', 6, ['sqrt', ['get', 'n']]]], 8, ['+', 20, ['*', 10, ['sqrt', ['get', 'n']]]]],
        'circle-blur': 0.9,
        'circle-opacity': 0.55,
      },
    },
    { id: 'community-ring', type: 'circle', source: 'community', filter: ['==', ['get', 'fresh'], 1], paint: { 'circle-radius': 10, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': GREEN, 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.8 } },
    { id: 'community-core', type: 'circle', source: 'community', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.2, 8, 5], 'circle-color': '#eafff0', 'circle-stroke-color': GREEN, 'circle-stroke-width': 1.5 } },
    {
      id: 'community-count',
      type: 'symbol',
      source: 'community',
      minzoom: 4.6,
      layout: { 'text-field': ['concat', ['to-string', ['get', 'n']], ' ✓'], 'text-font': ['Open Sans Semibold'], 'text-size': 11, 'text-offset': [0, -1.3], 'text-allow-overlap': false },
      paint: { 'text-color': GREEN, 'text-halo-color': 'rgba(20,18,43,0.9)', 'text-halo-width': 1.4 },
    },
    // village pacts: one ring per village (never per field), green while fire-free this week, amber after a fire
    {
      id: 'pact-ring',
      type: 'circle',
      source: 'pacts',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 22],
        'circle-color': ['case', ['get', 'fire'], 'rgba(255,178,74,0.12)', 'rgba(143,227,168,0.14)'],
        'circle-stroke-color': ['case', ['get', 'fire'], '#ffb24a', GREEN],
        'circle-stroke-width': 3,
      },
    },
    {
      id: 'pact-label',
      type: 'symbol',
      source: 'pacts',
      minzoom: 5,
      // above the ring, so it never collides with a member's own field label below it
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Semibold'], 'text-size': 12, 'text-offset': [0, -2.2], 'text-anchor': 'bottom', 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(20,18,43,0.9)', 'text-halo-width': 1.5 },
    },
    { id: 'field-fill', type: 'fill', source: 'field', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['case', ['get', 'fire'], '#e5383b', GREEN], 'fill-opacity': 0.35 } },
    { id: 'field-line', type: 'line', source: 'field', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': ['case', ['get', 'fire'], '#e5383b', GREEN], 'line-width': 2.5 } },
    // a field is tiny at country scale: a pin keeps it findable
    { id: 'field-pin', type: 'circle', source: 'field', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 8, 'circle-color': 'rgba(20,18,43,0.6)', 'circle-stroke-color': ['case', ['get', 'fire'], '#e5383b', GREEN], 'circle-stroke-width': 3 } },
    { id: 'field-label', type: 'symbol', source: 'field', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Semibold'], 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top' }, paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(20,18,43,0.9)', 'text-halo-width': 1.5 } },
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
  focus?: Focus
  /** district id -> verified actions in the last 7 days; fresh ones pulse */
  community?: Record<string, number>
  fresh?: string[]
  field?: MapField
  /** when set, a map tap picks a point (Fire Watch) instead of selecting a district */
  onPick?: ((lon: number, lat: number) => void) | null
  pacts?: { name: string; c: [number, number]; fields: number; fire: boolean }[]
}

export function AirqMap({ world, selected, onSelect, panelOpen, trace, highlight, focus = null, community = {}, fresh = [], field = null, onPick = null, pacts = [] }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
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
      minZoom: innerWidth < 760 ? 2.5 : 3, // phones need to fit India between the top bar and the readout
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
      map.getCanvas().style.cursor = onPickRef.current ? 'crosshair' : 'pointer'
      const d = byId.current.get(id)
      const t = tip.current
      // touch screens have no hover: a tap would leave the tooltip stuck on screen
      if (t && d && matchMedia('(hover: hover)').matches) {
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
    // the camera flies on select: don't leave the tooltip floating over a district that moved away
    map.on('movestart', () => tip.current && (tip.current.dataset.show = 'false'))
    map.on('click', 'districts', (e) => {
      const f = e.features?.[0]
      if (f && !onPickRef.current) onSelectRef.current(String(f.id))
    })
    map.on('click', (e) => onPickRef.current?.(e.lngLat.lng, e.lngLat.lat))
    return () => map.remove()
  }, [])

  // push world data into the map
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const levels = raidLevels(world.raids)
    let live = true
    districtShapes.then((geo) => {
      if (!live) return
      ;(map.getSource('districts') as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: geo.features.map((f) => {
          const id = f.properties.id
          return { ...f, properties: { id, aqi: byId.current.get(id)?.aqi ?? -1, raid: levels[id] ?? 0 } }
        }),
      })
    })
    ;(map.getSource('fires') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: world.fires.filter((f) => f[3] <= 24).map(([lon, lat, frp, age]) => ({
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
    const stop = startParticles(map, canvas.current!, world)
    return () => {
      live = false
      stop()
    }
  }, [world, ready])

  // smog front: the haze breathes (~4.2 s) and the border marches (~1.5 s per cycle).
  // Holds still under prefers-reduced-motion, including when that changes mid-visit.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !world.raids.length) return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let step = 0
    const show = (s: number) => {
      if (s === step) return
      map.setPaintProperty(`raid-front-${step}`, 'line-opacity', 0)
      map.setPaintProperty(`raid-front-${(step = s)}`, 'line-opacity', frontOpacity as never)
    }
    const still = () => {
      map.setPaintProperty('raid-haze', 'fill-opacity', 0.24)
      show(0)
    }
    const frame = (t: number) => {
      map.setPaintProperty('raid-haze', 'fill-opacity', 0.16 + 0.16 * (0.5 + 0.5 * Math.sin((t / 4200) * 2 * Math.PI)))
      show(Math.floor(t / 110) % MARCH.length)
      raf = requestAnimationFrame(frame)
    }
    const apply = () => {
      cancelAnimationFrame(raf)
      if (mq.matches) still()
      else raf = requestAnimationFrame(frame)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => {
      cancelAnimationFrame(raf)
      mq.removeEventListener('change', apply)
    }
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

  // citizens fighting back, and the Fire Watch field
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('community') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: Object.entries(community).flatMap(([id, n]) => {
        const d = byId.current.get(id)
        return d ? [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: d.c }, properties: { n, fresh: fresh.includes(id) ? 1 : 0 } }] : []
      }),
    })
  }, [community, fresh, ready, world])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('field') as GeoJSONSource).setData(
      field
        ? {
            type: 'FeatureCollection',
            features: [
              { ...circle(field.c, field.r), properties: { fire: field.fire } },
              { type: 'Feature', geometry: { type: 'Point', coordinates: field.c }, properties: { fire: field.fire, label: field.fire ? 'Your field: fire seen' : 'Your field: fire-free' } },
            ],
          }
        : empty,
    )
  }, [field, ready])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('pacts') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: pacts.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: p.c },
        properties: { fire: p.fire, label: `${p.name} · ${p.fields} fields · ${p.fire ? 'a fire this week' : 'fire-free this week'}` },
      })),
    })
  }, [pacts, ready])
  // new actions send a ripple out from their district (constant paint values only: no re-layout)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !fresh.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const frame = (t: number) => {
      const p = (t % 2000) / 2000
      map.setPaintProperty('community-ring', 'circle-radius', 6 + 30 * p)
      map.setPaintProperty('community-ring', 'circle-stroke-opacity', 0.9 * (1 - p))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [fresh, ready])
  useEffect(() => {
    const c = mapRef.current?.getCanvas()
    if (c) c.style.cursor = onPick ? 'crosshair' : ''
  }, [onPick])

  // briefing camera: whole India, or fly to a point
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !focus) return
    if (focus.to === 'india') return void map.fitBounds(INDIA, { padding: focus.brief ? briefPadding() : homePadding(), duration: 1200 })
    const mobile = innerWidth < 760
    map.flyTo({
      center: focus.to,
      zoom: focus.zoom ?? 6.4,
      padding: mobile ? { top: 90, bottom: Math.round(innerHeight * 0.45), left: 20, right: 20 } : { top: 90, bottom: 240, left: 40, right: 40 },
      duration: 1600,
    })
  }, [focus, ready])

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

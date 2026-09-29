import type { Map as MLMap } from 'maplibre-gl'
import type { World } from '../lib/world'
import { CATS, catIndex } from '../lib/naqi'

/**
 * Smog particles riding the transport wind (mean of 10 m and 850 hPa).
 * Each particle takes the NAQI colour of the air it is passing through, so a
 * plume visibly carries bad air from one district into the next.
 */
const CELL = 0.25 // deg, colour lookup grid

export function buildAqiGrid(world: World) {
  const { lon0, lat0, d, nx, ny } = world.wind
  const cols = Math.round(((nx - 1) * d) / CELL) + 1
  const rows = Math.round(((ny - 1) * d) / CELL) + 1
  const grid = new Int8Array(cols * rows).fill(-1)
  const pts = world.districts
  for (let r = 0; r < rows; r++) {
    const lat = lat0 + r * CELL
    for (let c = 0; c < cols; c++) {
      const lon = lon0 + c * CELL
      let best = -1
      let bd = 1.2 * 1.2 // only colour air within ~130 km of a district centre
      for (let i = 0; i < pts.length; i++) {
        const dx = (pts[i].c[0] - lon) * Math.cos((lat * Math.PI) / 180)
        const dy = pts[i].c[1] - lat
        const dd = dx * dx + dy * dy
        if (dd < bd) {
          bd = dd
          best = i
        }
      }
      if (best >= 0) grid[r * cols + c] = catIndex(pts[best].aqi)
    }
  }
  return { grid, cols, rows, lon0, lat0 }
}

export function startParticles(map: MLMap, canvas: HTMLCanvasElement, world: World, frame = 0) {
  const ctx = canvas.getContext('2d')!
  const { lon0, lat0, d, nx, ny } = world.wind
  const { u, v } = world.wind.frames[frame]
  const aqi = buildAqiGrid(world)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const N = reduce ? 900 : innerWidth < 700 ? 2200 : 5200
  const lon = new Float32Array(N)
  const lat = new Float32Array(N)
  const age = new Uint16Array(N)
  const life = new Uint16Array(N)
  let raf = 0
  let moving = false
  let dpr = 1

  const lonMax = lon0 + (nx - 1) * d
  const latMax = lat0 + (ny - 1) * d

  function wind(x: number, y: number): [number, number] {
    const fx = Math.min(Math.max((x - lon0) / d, 0), nx - 1.001)
    const fy = Math.min(Math.max((y - lat0) / d, 0), ny - 1.001)
    const i = fx | 0
    const j = fy | 0
    const tx = fx - i
    const ty = fy - j
    const k = j * nx + i
    const bil = (f: number[]) =>
      (f[k] * (1 - tx) + f[k + 1] * tx) * (1 - ty) + (f[k + nx] * (1 - tx) + f[k + nx + 1] * tx) * ty
    return [bil(u), bil(v)]
  }

  function cat(x: number, y: number) {
    const c = Math.round((x - aqi.lon0) / CELL)
    const r = Math.round((y - aqi.lat0) / CELL)
    if (c < 0 || r < 0 || c >= aqi.cols || r >= aqi.rows) return -1
    return aqi.grid[r * aqi.cols + c]
  }

  function spawn(i: number) {
    const b = map.getBounds()
    const w = Math.max(b.getWest(), lon0)
    const e = Math.min(b.getEast(), lonMax)
    const s = Math.max(b.getSouth(), lat0)
    const n = Math.min(b.getNorth(), latMax)
    lon[i] = w + Math.random() * (e - w)
    lat[i] = s + Math.random() * (n - s)
    age[i] = 0
    life[i] = 60 + ((Math.random() * 120) | 0)
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // one path per colour bucket keeps strokeStyle changes to 8 per frame
  const buckets: Path2D[] = []
  const hazeIdx = CATS.length

  function tick() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (moving) {
      ctx.clearRect(0, 0, w, h)
      raf = requestAnimationFrame(tick)
      return
    }
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,0.075)'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'

    for (let b = 0; b <= hazeIdx; b++) buckets[b] = new Path2D()
    const zoom = map.getZoom()
    const step = (reduce ? 0.0025 : 0.0055) / Math.pow(2, zoom - 4)
    // keep on-screen density roughly constant as the user zooms in
    const active = Math.round(N * Math.min(1, Math.max(0.22, 1.7 / Math.pow(2, zoom - 4))))

    for (let i = 0; i < active; i++) {
      if (age[i]++ > life[i]) spawn(i)
      const x = lon[i]
      const y = lat[i]
      const [uu, vv] = wind(x, y)
      const nxp = x + (uu * step) / Math.cos((y * Math.PI) / 180)
      const nyp = y + vv * step
      if (nxp < lon0 || nxp > lonMax || nyp < lat0 || nyp > latMax) {
        spawn(i)
        continue
      }
      const a = map.project([x, y])
      const bpt = map.project([nxp, nyp])
      lon[i] = nxp
      lat[i] = nyp
      if (a.x < -20 || a.y < -20 || a.x > w + 20 || a.y > h + 20) continue
      // dissolve particles near the wind grid's edge so it never shows as a hard rectangle
      const edge = Math.min(x - lon0, lonMax - x, y - lat0, latMax - y) / 6
      if (edge < 1 && Math.random() > edge) continue
      const c = cat(x, y)
      const p = buckets[c < 0 ? hazeIdx : c]
      p.moveTo(a.x, a.y)
      p.lineTo(bpt.x, bpt.y)
    }

    ctx.lineCap = 'round'
    for (let b = 0; b <= hazeIdx; b++) {
      if (b === hazeIdx) {
        ctx.strokeStyle = 'rgba(214, 208, 240, 0.22)'
        ctx.lineWidth = 0.9
      } else {
        const [r, g, bl] = CATS[b].rgb
        ctx.strokeStyle = `rgba(${r},${g},${bl},${0.32 + b * 0.09})`
        ctx.lineWidth = 1 + b * 0.35
      }
      ctx.stroke(buckets[b])
    }
    raf = requestAnimationFrame(tick)
  }

  const onMoveStart = () => (moving = true)
  const onMoveEnd = () => {
    moving = false
    for (let i = 0; i < N; i++) spawn(i)
  }
  map.on('movestart', onMoveStart)
  map.on('moveend', onMoveEnd)
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  for (let i = 0; i < N; i++) {
    spawn(i)
    age[i] = (Math.random() * life[i]) | 0
  }
  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    map.off('movestart', onMoveStart)
    map.off('moveend', onMoveEnd)
    ro.disconnect()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}

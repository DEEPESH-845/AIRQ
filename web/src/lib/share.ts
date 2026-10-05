// Share cards: a 1080x1920 story image drawn in the browser (no server), shared through the phone's share sheet.
import qrcode from 'qrcode-generator'
import type { World } from './world'
import { catOf } from './naqi'

export type Card = {
  stat: string
  label: string
  /** how it was verified, e.g. "Verified by NASA satellites" */
  proof: string
  name: string
  where: string
  /** district id to glow on the map */
  district: string
  /** the QR target: a certificate link, or the district on AIRQ */
  url: string
  qrCaption: string
}

const W = 1080
const H = 1920
const GREEN = '#8fe3a8'

/** India's districts as dots coloured by today's AQI, the player's district glowing. */
function drawMap(g: CanvasRenderingContext2D, world: World, district: string, x: number, y: number, w: number, h: number) {
  const lon0 = 68, lon1 = 97.5, lat0 = 6.5, lat1 = 37.5
  const k = Math.min(w / ((lon1 - lon0) * Math.cos((22 * Math.PI) / 180)), h / (lat1 - lat0))
  const ox = x + (w - (lon1 - lon0) * Math.cos((22 * Math.PI) / 180) * k) / 2
  const at = ([lon, lat]: [number, number]) => [ox + (lon - lon0) * Math.cos((22 * Math.PI) / 180) * k, y + (lat1 - lat) * k] as const
  for (const d of world.districts) {
    const [px, py] = at(d.c)
    g.fillStyle = catOf(d.aqi).color
    g.globalAlpha = 0.85
    g.beginPath()
    g.arc(px, py, 6.5, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  const me = world.districts.find((d) => d.id === district)
  if (me) {
    const [px, py] = at(me.c)
    const glow = g.createRadialGradient(px, py, 0, px, py, 90)
    glow.addColorStop(0, 'rgba(143,227,168,0.85)')
    glow.addColorStop(1, 'rgba(143,227,168,0)')
    g.fillStyle = glow
    g.beginPath()
    g.arc(px, py, 90, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#eafff0'
    g.lineWidth = 5
    g.beginPath()
    g.arc(px, py, 16, 0, Math.PI * 2)
    g.stroke()
  }
}

function drawQR(g: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) {
  const q = qrcode(0, 'M')
  q.addData(url)
  q.make()
  const n = q.getModuleCount()
  const cell = size / (n + 4)
  g.fillStyle = '#fff'
  g.beginPath()
  g.roundRect(x, y, size, size, 18)
  g.fill()
  g.fillStyle = '#14122b'
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(x + (c + 2) * cell, y + (r + 2) * cell, Math.ceil(cell), Math.ceil(cell))
}

export async function drawCard(card: Card, world: World): Promise<Blob> {
  await Promise.all(['800 120px "Big Shoulders Display"', '600 40px "Hanken Grotesk Variable"'].map((f) => document.fonts.load(f).catch(() => null)))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#1b1934')
  bg.addColorStop(1, '#0d0c1f')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)

  g.fillStyle = '#f1eef9'
  g.font = '800 120px "Big Shoulders Display", sans-serif'
  g.fillText('AIRQ', 80, 190)
  g.fillStyle = '#a7a3c2'
  g.font = '500 36px "Hanken Grotesk Variable", sans-serif'
  g.fillText("India's air, live. Cleaned by its people.", 80, 250)

  drawMap(g, world, card.district, 80, 300, W - 160, 820)

  g.fillStyle = GREEN
  g.font = '800 300px "Big Shoulders Display", sans-serif'
  g.fillText(card.stat, 72, 1420, W - 160)
  g.fillStyle = '#f1eef9'
  g.font = '600 56px "Hanken Grotesk Variable", sans-serif'
  g.fillText(card.label, 80, 1500, W - 160)
  g.fillStyle = GREEN
  g.font = '600 38px "Hanken Grotesk Variable", sans-serif'
  g.fillText(`✓ ${card.proof}`, 80, 1566, W - 80 - 260 - 120) // stays clear of the QR

  g.fillStyle = '#f1eef9'
  g.font = '800 72px "Big Shoulders Display", sans-serif'
  g.fillText(card.name, 80, 1710, W - 80 - 260 - 120)
  g.fillStyle = '#a7a3c2'
  g.font = '500 36px "Hanken Grotesk Variable", sans-serif'
  g.fillText(card.where, 80, 1764, W - 80 - 260 - 120)

  drawQR(g, card.url, W - 80 - 260, 1560, 260)
  g.fillStyle = '#a7a3c2'
  g.font = '500 28px "Hanken Grotesk Variable", sans-serif'
  g.textAlign = 'center'
  g.fillText(card.qrCaption, W - 80 - 130, 1858)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/png'))
}

/** The share sheet where the browser can share files (phones), else a download. Returns how it went. */
export async function shareCard(blob: Blob, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], 'airq-impact.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  return 'downloaded'
}

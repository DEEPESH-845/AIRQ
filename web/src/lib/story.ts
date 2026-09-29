// Picks for the first-visit briefing. Everything comes from the live world; nothing is hardcoded.
import type { District, World } from './world'
import { catOf } from './naqi'

export const worst = (ds: District[]) => ds.reduce((a, b) => (b.aqi > a.aqi ? b : a))
export const poorPlus = (ds: District[]) => ds.filter((d) => d.aqi > 200).length

const km = ([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) => {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
  return Math.hypot(x, lat2 - lat1) * 111.2
}

export const nearestDistrict = (ds: District[], lon: number, lat: number) =>
  ds.reduce((a, b) => (km(b.c, [lon, lat]) < km(a.c, [lon, lat]) ? b : a))

// Approximation: centroid-distance test, not point-in-polygon; a fire just across a border within 75 km passes
export const nearIndia = (ds: District[], c: [number, number]) => km(nearestDistrict(ds, c[0], c[1]).c, c) <= 75

export type Story = { kind: 'fire' | 'mix'; d: District }

/** Worst district where fire is at least 20% of the air and a fire cluster on its path is in India; else the worst overall. */
export function pickStory(w: World): Story {
  const fireLed = w.districts.filter((d) => d.att.fire >= 0.2 && d.clusters.some((c) => c.fires > 0 && nearIndia(w.districts, c.c)))
  return fireLed.length ? { kind: 'fire', d: worst(fireLed) } : { kind: 'mix', d: worst(w.districts) }
}

/** The one-tap district: the most-threatened raid, else the worst district. */
export function defaultDistrict(w: World): District {
  const r = w.raids[0]
  return (r && w.districts.find((d) => d.id === r.id)) || worst(w.districts)
}

/** Smoke Season front line: districts at Poor or worse now, and the change from 24 h earlier. */
export function frontTrend(ds: District[]) {
  const now = poorPlus(ds)
  return { now, delta: now - ds.filter((d) => d.aqiPrev > 200).length }
}

/** One line for a raid, naming the band it actually reaches (a raid starts at Very Poor but can be Severe+). */
export function raidText(r: World['raids'][number]) {
  const band = catOf(r.aqi).name
  const dust = r.dust ? ' (dust storm)' : ''
  return r.kind === 'incoming' ? `Incoming raid: ${r.n}, ${band} air in ${r.etaH} h${dust}` : `Raid now: ${r.n} is breathing ${band} air${dust}`
}

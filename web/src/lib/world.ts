export type Cat = 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe' | 'Severe+'

export type Attribution = {
  fire: number
  vehicles: number
  dust: number
  industry: number
  household: number
  regional: number
}

export type Cluster = { c: [number, number]; fires: number; frp: number; w: number; near: string }

export type District = {
  id: string
  n: string
  s: string
  c: [number, number]
  k: 'ncr' | 'igp' | 'rest'
  aqi: number
  cat: Cat
  pm25: number
  pm10: number
  fc: number[]
  pm25h: (number | null)[]
  att: Attribution
  conf: 'low' | 'medium'
  traj: [number, number][]
  clusters: Cluster[]
  vi: number
  viMin: number
  blhMin: number
  best: { start: string; pm25: number } | null
}

export type Wind = {
  lon0: number
  lat0: number
  d: number
  nx: number
  ny: number
  frames: { t: string; u: number[]; v: number[] }[]
  blh: number[]
}

export type World = {
  generatedAt: string
  sources: { name: string; url: string; stale: boolean }[]
  districts: District[]
  fires: [lon: number, lat: number, frp: number, hoursAgo: number][]
  wind: Wind
}

export async function loadWorld(): Promise<World> {
  const res = await fetch('/data/world.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`world.json returned ${res.status}`)
  return res.json()
}

export const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

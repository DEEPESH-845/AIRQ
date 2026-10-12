// The daily call: one guess a day. Will this district's 24-h air be better, the same or worse this time tomorrow?
import { useSyncExternalStore } from 'react'
import type { District, World } from './world'
import { istDay } from './player'

export type Dir = -1 | 0 | 1
export type Call = { day: string; district: string; name: string; dir: Dir; fc: Dir | null; base: number; resolveAt: string }
export type Done = Call & { expired: false; actual: number; right: boolean; fcRight: boolean | null; points: number }
export type Result = Done | (Call & { expired: true })
export type Daily = { calls: Call[]; right: number; total: number; beat: number }

const H = 3600e3

/** Worse if the 24-h AQI rises by more than max(5, 10%), better if it falls by that much, else the same. */
export function direction(from: number, to: number): Dir {
  const th = Math.max(5, from * 0.1)
  return to - from > th ? 1 : from - to > th ? -1 : 0
}
export const forecastDir = (d: Pick<District, 'aqi' | 'fc'>): Dir | null => (d.fc?.[24] == null ? null : direction(d.aqi, d.fc[24]))
export const aqStale = (w: Pick<World, 'sources'>) => w.sources.some((s) => s.stale && /air quality/i.test(s.name))

/** The district's 24-h AQI at resolveAt, read from this world: now, or one of the `past` slots within 2 h. */
export function valueAt(d: Pick<District, 'aqi' | 'past'>, generatedAt: string, resolveAt: string): number | 'wait' | 'expired' {
  const lag = (new Date(generatedAt).getTime() - new Date(resolveAt).getTime()) / H
  if (lag > 26) return 'expired'
  const slots: [number, number][] = [[0, d.aqi], ...(d.past ?? []).map((v, i): [number, number] => [4 * (i + 1), v])]
  const hit = slots.find(([h]) => Math.abs(h - lag) <= 2)
  return hit ? hit[1] : 'wait'
}

export const score = (right: boolean, fcRight: boolean | null) => (!right ? 0 : fcRight === false ? 50 : 20)

export const todayCall = (s: Daily, now: number) => s.calls.find((c) => c.day === istDay(now)) ?? null

export function place(s: Daily, d: District, dir: Dir, w: World, now: number): Daily | null {
  if (aqStale(w) || todayCall(s, now)) return null
  const resolveAt = new Date(new Date(w.generatedAt).getTime() + 24 * H).toISOString()
  return { ...s, calls: [...s.calls, { day: istDay(now), district: d.id, name: d.n, dir, fc: forecastDir(d), base: d.aqi, resolveAt }] }
}

export function settle(s: Daily, w: World): [Daily, Result[]] {
  if (aqStale(w)) return [s, []]
  const out: Result[] = []
  const left: Call[] = []
  let { right, total, beat } = s
  for (const c of s.calls) {
    const d = w.districts.find((x) => x.id === c.district)
    const v = d ? valueAt(d, w.generatedAt, c.resolveAt) : 'expired'
    if (v === 'wait') left.push(c)
    else if (v === 'expired') out.push({ ...c, expired: true })
    else {
      const happened = direction(c.base, v)
      const ok = happened === c.dir
      const fcRight = c.fc === null ? null : happened === c.fc
      total++
      if (ok) right++
      if (ok && fcRight === false) beat++
      out.push({ ...c, expired: false, actual: v, right: ok, fcRight, points: score(ok, fcRight) })
    }
  }
  return [{ calls: left, right, total, beat }, out]
}

// ---------- share (English text: it travels beyond the app)
export const dirWord = (d: Dir) => (['Better', 'Same', 'Worse'] as const)[d + 1]
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
export function resultText(r: Done, url: string) {
  const fc = r.fc === null ? '' : `  Forecast: ${dirWord(r.fc)} ${r.fcRight ? '✅' : '❌'}`
  return `AIRQ · ${r.name} · ${day(r.resolveAt)}\nMe: ${dirWord(r.dir)} ${r.right ? '✅' : '❌'}${fc}\nAQI ${r.base} → ${r.actual}\n${url}`
}
export const inviteText = (c: Call, url: string) => `${c.name}'s air tomorrow: I say ${dirWord(c.dir).toLowerCase()}. Your call?\n${url}`
export async function share(text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ text })
      return 'shared'
    }
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch (e) {
    return (e as Error).name === 'AbortError' ? 'cancelled' : 'failed'
  }
}

// ---------- store: one browser, like the rest of the game state
const KEY = 'airq.daily'
const empty = (): Daily => ({ calls: [], right: 0, total: 0, beat: 0 })
let state: Daily | null = null
const subs = new Set<() => void>()
const n = (v: unknown) => (Number.isFinite(v) && (v as number) >= 0 ? (v as number) : 0)

export function getDaily(): Daily {
  if (state) return state
  state = empty()
  try {
    localStorage.removeItem('airq.calls') // the old band Duel: pending calls are dropped (spec item 13)
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && Array.isArray(v.calls))
      state = { calls: v.calls.filter((c: Call) => c && typeof c.day === 'string' && typeof c.resolveAt === 'string' && [-1, 0, 1].includes(c.dir)), right: n(v.right), total: n(v.total), beat: n(v.beat) }
  } catch {
    /* no storage or bad JSON: start fresh */
  }
  return state
}
function set(s: Daily) {
  state = s
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage blocked: lives for this visit */
  }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}
export const useDaily = () => useSyncExternalStore(subscribe, getDaily)
export function placeDaily(d: District, dir: Dir, w: World) {
  const s = place(getDaily(), d, dir, w, Date.now())
  if (s) set(s)
  return !!s
}
export function settleDaily(w: World): Result[] {
  const [s, r] = settle(getDaily(), w)
  if (r.length) set(s)
  return r
}

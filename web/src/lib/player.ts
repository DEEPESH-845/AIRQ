// Game state for one browser: XP, missions, ranks, streak. Pure reducers plus a tiny store.
import { useSyncExternalStore } from 'react'

export type MissionId = 'command' | 'orders' | 'trace' | 'defend' | 'call' | 'general' | 'alert'
export type Tab = 'orders' | 'battle' | 'play'

export const MISSIONS: { id: MissionId; label: string; xp: number; tab: Tab | null; optional?: true }[] = [
  { id: 'command', label: 'Take command of a district', xp: 10, tab: null },
  { id: 'orders', label: "Tailor today's orders", xp: 10, tab: 'orders' },
  { id: 'trace', label: 'Trace the air', xp: 20, tab: 'battle' },
  { id: 'defend', label: 'Deploy defenses', xp: 30, tab: 'play' },
  { id: 'call', label: 'Call tomorrow', xp: 20, tab: 'play' },
  { id: 'general', label: 'Ask the General', xp: 10, tab: null },
  { id: 'alert', label: 'Set a raid alert', xp: 20, tab: 'orders', optional: true },
]

export const RANKS = [
  { name: 'Recruit', xp: 0 },
  { name: 'Scout', xp: 40 },
  { name: 'Sentinel', xp: 100 },
  { name: 'Captain', xp: 250 },
  { name: 'Marshal', xp: 500 },
  { name: 'Air Marshal', xp: 1000 },
]

export type Player = {
  xp: number
  streak: number
  lastDay: string
  missions: MissionId[]
  introSeen: boolean
  migrated: boolean
  /** district id -> IST date of the last rewarded Defend spend */
  defendDays: Record<string, string>
  /** district id -> IST date of the last Instant Replay */
  replayDays: Record<string, string>
}
export type Gain = { xp: number; reason: string }
export type Step = [Player, Gain | null]

export const fresh = (): Player => ({ xp: 0, streak: 0, lastDay: '', missions: [], introSeen: false, migrated: false, defendDays: {}, replayDays: {} })

/** Calendar date in India (UTC+5:30) for a timestamp in ms. */
export const istDay = (t: number) => new Date(t + 5.5 * 3600e3).toISOString().slice(0, 10)

const isDays = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === 'object' && Object.values(v).every((x) => typeof x === 'string')

export function parse(raw: string | null): Player {
  const base = fresh()
  let v: Partial<Player>
  try {
    v = raw ? JSON.parse(raw) : {}
  } catch {
    return base
  }
  if (!v || typeof v !== 'object') return base
  const ids = new Set(MISSIONS.map((m) => m.id))
  return {
    xp: Number.isFinite(v.xp) && (v.xp as number) >= 0 ? (v.xp as number) : 0,
    streak: Number.isFinite(v.streak) && (v.streak as number) >= 0 ? (v.streak as number) : 0,
    lastDay: typeof v.lastDay === 'string' ? v.lastDay : '',
    missions: Array.isArray(v.missions) ? v.missions.filter((m): m is MissionId => ids.has(m as MissionId)) : [],
    introSeen: v.introSeen === true,
    migrated: v.migrated === true,
    defendDays: isDays(v.defendDays) ? v.defendDays : {},
    replayDays: isDays(v.replayDays) ? v.replayDays : {},
  }
}

/** Fold the pre-XP Duel points (`airq.points`) in exactly once. */
export function migrate(p: Player, legacy: string | null): Player {
  if (p.migrated) return p
  const pts = Number(legacy)
  return { ...p, migrated: true, xp: p.xp + (Number.isFinite(pts) && pts > 0 ? pts : 0) }
}

export function rankOf(xp: number) {
  let index = 0
  RANKS.forEach((r, i) => {
    if (xp >= r.xp) index = i
  })
  return { index, name: RANKS[index].name, floor: RANKS[index].xp, next: RANKS[index + 1] ?? null }
}

const required = MISSIONS.filter((m) => !m.optional)
export const missionCount = (p: Player) => ({ done: required.filter((m) => p.missions.includes(m.id)).length, total: required.length })
export const nextMission = (p: Player) => required.find((m) => !p.missions.includes(m.id)) ?? null

export function completeMission(p: Player, id: MissionId): Step {
  if (p.missions.includes(id)) return [p, null]
  const m = MISSIONS.find((x) => x.id === id)!
  return [{ ...p, xp: p.xp + m.xp, missions: [...p.missions, id] }, { xp: m.xp, reason: m.label }]
}

export function checkIn(p: Player, now: number): Step {
  const day = istDay(now)
  if (p.lastDay === day) return [p, null]
  if (p.lastDay && day < p.lastDay) return [p, null] // device clock went backwards
  const streak = p.lastDay === istDay(now - 864e5) ? p.streak + 1 : 1
  return [{ ...p, lastDay: day, streak, xp: p.xp + 5 }, { xp: 5, reason: streak > 1 ? `Day ${streak} check-in` : 'Daily check-in' }]
}

/** First Defend spend on a district each IST day: completes the mission (30) the first time, then 10. */
export function defendSpend(p: Player, district: string, now: number): Step {
  const day = istDay(now)
  if (p.defendDays[district] === day) return [p, null]
  const q = { ...p, defendDays: { ...p.defendDays, [district]: day } }
  if (!q.missions.includes('defend')) return completeMission(q, 'defend')
  return [{ ...q, xp: q.xp + 10 }, { xp: 10, reason: 'Daily defense' }]
}

export function addPoints(p: Player, pts: number, reason: string): Step {
  return pts > 0 ? [{ ...p, xp: p.xp + pts }, { xp: pts, reason }] : [p, null]
}

export const canReplay = (p: Player, district: string, now: number) => p.replayDays[district] !== istDay(now)

export function recordReplay(p: Player, district: string, now: number, pts: number): Step {
  if (!canReplay(p, district, now)) return [p, null]
  const q = { ...p, replayDays: { ...p.replayDays, [district]: istDay(now) } }
  return pts > 0 ? [{ ...q, xp: q.xp + pts }, { xp: pts, reason: 'Instant Replay' }] : [q, null]
}

export const markIntroSeen = (p: Player): Step => [p.introSeen ? p : { ...p, introSeen: true }, null]

/** The briefing plays on a first visit, but never over a deep link (e.g. a raid push opening ?d=). */
export const shouldShowIntro = (p: Player, search: string) => !p.introSeen && !new URLSearchParams(search).get('d')

// ---------- store
const KEY = 'airq.player'
let state: Player | null = null
const subs = new Set<() => void>()
const gainSubs = new Set<(g: Gain) => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage blocked: state lives in memory for this visit */
  }
}

export function getPlayer(): Player {
  if (!state) {
    let raw: string | null = null
    let legacy: string | null = null
    try {
      raw = localStorage.getItem(KEY)
      legacy = localStorage.getItem('airq.points')
    } catch {
      /* storage blocked */
    }
    state = migrate(parse(raw), legacy)
    persist()
  }
  return state
}

export function act(f: (p: Player) => Step) {
  const [next, gain] = f(getPlayer())
  if (next === state) return
  state = next
  persist()
  subs.forEach((s) => s())
  if (gain) gainSubs.forEach((s) => s(gain))
}

const subscribe = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}
export const onGain = (f: (g: Gain) => void) => {
  gainSubs.add(f)
  return () => void gainSubs.delete(f)
}
export const usePlayer = () => useSyncExternalStore(subscribe, getPlayer)
export const resetPlayerForTests = () => {
  state = null
}

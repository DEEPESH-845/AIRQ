// The server-side player: callsign, credits, verified green actions, shop, leaderboard.
// Credits live only on the server (AWS Lambda + DynamoDB); this file is the client and a tiny store.
import { useSyncExternalStore } from 'react'
import economy from './economy.json'
import { catIndex } from './naqi'
import { getPlayer } from './player'

export const ECO = economy
export type Action = (typeof economy.actions)[number]
export type Item = (typeof economy.shop)[number]
export type Receipt = { base: number; frontline: number; streak: number; weeks: number; boost: number; mult: number; first: number; credits: number; xp: number; shield: boolean }
export type Proof = { sk: string; action: string; ok: boolean; reason: string; credits: number }
export type Claim = { item: string; label: string; code: string; at: number; status: 'review' | 'ready' | 'done' | 'refunded' }
export type Me = {
  pid: string; name: string; d: string; dn: string; s: string; title: string; titles: string[]
  xp: number; eco: number; cr: number; wk: string; wxp: number; pt: number
  ad: Record<string, number>; aw: Record<string, number>; inv: { boost?: number; shield?: number }
  streak: number; swk: string; firsts: string[]; n: number; claims: Claim[]; dset: number
  life?: Record<string, number>; earned?: number; field?: Field | null
}
export type Field = { c: [number, number]; acres: number; r: number; d: string; dn: string; at: number; last: string; clean: number; burnt: string[] }
export type FieldResult = { status: 'clean' | 'fire' | 'cooldown' | 'done'; receipt: { credits?: number; xp?: number; days?: number; fires?: number; until?: string } | null }
export type FeedItem = { name: string; title: string; action: string; d: string; dn: string; s: string; at: string }
export type Feed = { recent: FeedItem[]; byDistrict: Record<string, number>; byAction: Record<string, number>; total: number }
export type Cert = { id: string; name: string; title: string; where: string; actions: number; life: Record<string, number>; earned: number; xp: number; streak: number; fieldDays: number; since: number; iat: number }
export type Row = { rank: number; name: string; title?: string; where?: string; players?: number; score: number; me: boolean }
export type Board = { scope: string; week: string; rows: Row[]; me: Row | null }

// ---------- pure helpers (mirror infra/player/app.py, for previews only: the server decides)
export const frontline = (aqi: number) => ECO.frontline[catIndex(aqi)]
export const streakMult = (weeks: number) => Math.min(ECO.streakMax, 1 + ECO.streakStep * Math.max(0, weeks - 1))
export function estimate(a: Pick<Action, 'credits'>, aqi: number, weeks: number, first: boolean, boost = false) {
  const mult = Math.min(ECO.multiplierCap, frontline(aqi) * streakMult(weeks) * (boost ? 2 : 1))
  return Math.round(a.credits * mult) + (first ? ECO.firstBonus : 0)
}
/** The eco-streak (in weeks) a proof sent now would count. */
export function streakIfActNow(me: Pick<Me, 'streak' | 'swk'>, now: number) {
  if (me.swk === weekId(now)) return me.streak
  return me.swk === weekId(now - 7 * 864e5) ? me.streak + 1 : 1
}
/** ISO week of the IST calendar date, e.g. 2026-W41 (matches the Lambda's week_id). */
export function weekId(t: number) {
  const d = new Date(t + 5.5 * 3600e3) // IST date, read through UTC getters
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3) // Thursday of this ISO week decides its year
  const y = d.getUTCFullYear()
  const w = 1 + Math.floor((d.getTime() - Date.UTC(y, 0, 1)) / 864e5 / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}

/** Shrink a photo to <=1280 px JPEG in the browser: smaller upload, and EXIF (GPS, device) is dropped. */
export async function shrink(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * s)
  c.height = Math.round(bmp.height * s)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const url = c.toDataURL('image/jpeg', 0.82)
  return url.slice(url.indexOf(',') + 1)
}

// ---------- store
type Creds = { pid: string; token: string }
type State = { me: Me | null; proofs: Proof[]; status: 'guest' | 'loading' | 'ready' | 'offline' }
const KEY = 'airq.account'
let creds: Creds | null = null
let state: State = { me: null, proofs: [], status: 'guest' }
const subs = new Set<() => void>()
const set = (s: Partial<State>) => {
  state = { ...state, ...s }
  subs.forEach((f) => f())
}
try {
  const c = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  if (c && typeof c.pid === 'string' && typeof c.token === 'string') creds = c
} catch {
  /* storage blocked or corrupt: play as a guest */
}
if (creds) state = { ...state, status: 'loading' }

// subscribe functions live at module scope: a new function each render would make React re-subscribe every render
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => void subs.delete(f)
}
const snapshot = () => state
export const useAccount = () => useSyncExternalStore(subscribe, snapshot)
export const getAccount = () => state

async function call<T>(path: string, body?: object): Promise<T> {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(data.error ?? (r.status >= 500 ? 'AIRQ HQ is busy right now. Try again in a minute.' : `Request failed (${r.status})`)), { status: r.status })
  return data
}
const authed = <T>(path: string, body: object = {}) => {
  if (!creds) return Promise.reject(new Error('Enlist first.'))
  const mine = creds
  return call<T & { me?: Me; proofs?: Proof[] }>(path, { ...creds, ...body }).then(
    (r) => {
      // not after a delete; responses without a player (certificates, codes) leave the player as is
      if (creds === mine && r.me) set({ me: r.me, ...(r.proofs ? { proofs: r.proofs } : {}), status: 'ready' })
      return r
    },
    (e) => {
      if ((e as { status?: number }).status === 401) forgetLocal() // the account is gone on the server
      throw e
    },
  )
}

export async function enlist(name: string, d: string) {
  if (creds) return authed('/api/player', { name, d })
  const r = await call<Creds & { me: Me; proofs: Proof[] }>('/api/player', { name, d })
  creds = { pid: r.pid, token: r.token }
  try {
    localStorage.setItem(KEY, JSON.stringify(creds))
  } catch {
    /* storage blocked: the account lasts for this visit */
  }
  set({ me: r.me, proofs: r.proofs, status: 'ready' })
  void sync(getPlayer().xp) // XP earned before enlisting counts (within today's cap)
  return r
}

/** Daily check-in plus game XP. Returns credits paid for the check-in (0 if already done today). */
export async function sync(xp: number) {
  if (!creds) return 0
  try {
    const r = await authed<{ checkin: number }>('/api/player/sync', { xp })
    return r.checkin
  } catch (e) {
    if ((e as { status?: number }).status !== 401) set({ status: 'offline' })
    return 0
  }
}

export const submitProof = (action: string, image: string) =>
  authed<{ ok: boolean; reason: string; receipt: Receipt | null }>('/api/proof', { action, image })
export const getChallenge = (action: string) => authed<{ code: string; exp: number }>('/api/proof/challenge', { action })
export const registerField = (lon: number, lat: number, acres: number) => authed('/api/field', { lon, lat, acres })
export const checkField = () => authed<FieldResult>('/api/field/check')
export const issueCert = () => authed<{ token: string }>('/api/cert')
export const verifyCert = (t: string) => call<{ valid: boolean; cert: Cert | null }>(`/api/cert?t=${encodeURIComponent(t)}`)
export const buy = (item: string) => authed('/api/shop', { item })
export const equip = (item: string) => authed('/api/shop', { equip: item })
export const fetchBoard = (scope: string) => call<Board>(`/api/leaderboard?scope=${scope}${creds ? `&pid=${encodeURIComponent(creds.pid)}` : ''}`)

function forgetLocal() {
  creds = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing stored */
  }
  set({ me: null, proofs: [], status: 'guest' })
}
export async function deleteAccount() {
  if (!creds) return
  await call('/api/player/delete', creds)
  forgetLocal()
}

// ---------- the public feed of verified actions, polled while anything shows it
let feed: Feed | null = null
const feedSubs = new Set<() => void>()
let feedTimer = 0
async function pollFeed() {
  try {
    feed = await call<Feed>('/api/feed')
    feedSubs.forEach((f) => f())
  } catch {
    /* offline: keep the last feed */
  }
}
export const refreshFeed = pollFeed
const subscribeFeed = (f: () => void) => {
  feedSubs.add(f)
  if (feedSubs.size === 1) {
    if (!feed) void pollFeed()
    feedTimer = window.setInterval(pollFeed, 30000)
  }
  return () => {
    feedSubs.delete(f)
    if (!feedSubs.size) clearInterval(feedTimer)
  }
}
const feedSnapshot = () => feed
export const useFeed = () => useSyncExternalStore(subscribeFeed, feedSnapshot)
export const actionLabel = (id: string) => (id === 'fieldwatch' ? 'Kept a field fire-free (satellite)' : (ECO.actions.find((a) => a.id === id)?.label ?? id))

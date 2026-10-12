// Self-check for the daily call. Run: npx tsx src/lib/daily.check.ts
import assert from 'node:assert/strict'
import { direction, forecastDir, place, resultText, score, settle, todayCall, valueAt, type Daily, type Done } from './daily'
import type { District, World } from './world'

// direction: more than max(5, 10%) counts as a move
assert.equal(direction(100, 111), 1)
assert.equal(direction(100, 110), 0)
assert.equal(direction(100, 89), -1)
assert.equal(direction(30, 36), 1) // floor of 5 points at low AQI
assert.equal(direction(30, 35), 0)

const dist = (over: Partial<District> = {}) => ({ id: 'x', n: 'Delhi', aqi: 120, fc: Array(49).fill(120), past: [118, 116, 114, 112, 110, 108], ...over }) as unknown as District
assert.equal(forecastDir(dist({ fc: [120] } as Partial<District>)), null) // no fc[24]: no forecast to beat
assert.equal(forecastDir(dist({ fc: Array(49).fill(140) } as Partial<District>)), 1)

// valueAt: exact slots, nearest within 2 h, too early, too late, old data without past
const at = (h: number) => new Date(Date.UTC(2026, 9, 13, 5) + h * 3600e3).toISOString()
const R = at(0)
assert.equal(valueAt(dist(), at(0), R), 120)
assert.equal(valueAt(dist(), at(4), R), 118)
assert.equal(valueAt(dist(), at(3), R), 118) // off-grid tick: nearest slot
assert.equal(valueAt(dist(), at(24), R), 108)
assert.equal(valueAt(dist(), at(-3), R), 'wait')
assert.equal(valueAt(dist(), at(27), R), 'expired')
assert.equal(valueAt(dist({ past: undefined }), at(8), R), 'wait')

// scoring
assert.equal(score(true, false), 50)
assert.equal(score(true, true), 20)
assert.equal(score(true, null), 20)
assert.equal(score(false, false), 0)

const fresh: Daily = { calls: [], right: 0, total: 0, beat: 0 }
const world = (gen: string, d = dist(), stale = false) =>
  ({ generatedAt: gen, districts: [d], sources: [{ name: 'Copernicus CAMS via Open-Meteo Air Quality', url: '', stale }] }) as unknown as World
const t0 = Date.UTC(2026, 9, 12, 5) // 10:30 IST, 12 Oct
const w0 = world(at(-24))

// one call per IST day; the next morning works even while yesterday's is pending
const s1 = place(fresh, dist(), 1, w0, t0)!
assert.ok(s1 && todayCall(s1, t0)?.dir === 1)
assert.equal(place(s1, dist(), -1, w0, t0 + 3600e3), null) // same day: refused
const s2 = place(s1, dist(), 0, w0, t0 + 21.5 * 3600e3) // 08:00 IST 13 Oct, before yesterday's result
assert.ok(s2 && s2.calls.length === 2)
// stale air data: no new call
assert.equal(place(fresh, dist(), 1, world(at(-24), dist(), true), t0), null)

// settle: worse called (120 -> 140 is +16%), forecast said same -> beat it
const [a, r] = settle(s1, world(at(0), dist({ aqi: 140 })))
const done = r[0] as Done
assert.equal(r.length, 1)
assert.equal(done.expired, false)
assert.ok(done.right && done.fcRight === false && done.points === 50)
assert.deepEqual([a.calls.length, a.right, a.total, a.beat], [0, 1, 1, 1])
// not yet due: stays pending; stale: nothing settles
assert.equal(settle(s1, world(at(-6)))[1].length, 0)
assert.equal(settle(s1, world(at(0), dist({ aqi: 140 }), true))[1].length, 0)
// expired: reported, not counted
const [b, rb] = settle(s1, world(at(30)))
assert.ok(rb[0].expired && b.total === 0 && b.calls.length === 0)

const text = resultText(done, 'https://x/?d=x')
assert.match(text, /Delhi/)
assert.match(text, /Worse ✅/)
assert.match(text, /120 → 140/)
assert.match(text, /\?d=x$/)
console.log('ok')

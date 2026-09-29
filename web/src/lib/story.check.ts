// Self-check for briefing picks. Run: npx tsx src/lib/story.check.ts
import assert from 'node:assert/strict'
import { defaultDistrict, frontTrend, raidText, nearIndia, nearestDistrict, pickStory, poorPlus, worst } from './story'
import type { Cluster, District, World } from './world'

const att = (fire: number) => ({ fire, vehicles: 0.2, dust: 0.2, industry: 0.1, household: 0.1, regional: 0.4 - fire })
const cl = (c: [number, number], fires = 5): Cluster => ({ c, fires, frp: 10, w: 1, near: 'x' })
const D = (id: string, aqi: number, c: [number, number], fire = 0, clusters: Cluster[] = []) =>
  ({ id, n: id, s: 'S', c, aqi, att: att(fire), clusters }) as unknown as District
const W = (districts: District[], raids: World['raids'] = []) => ({ districts, raids }) as unknown as World

const jind = D('jind', 260, [76.3, 29.3], 0.35, [cl([76.0, 29.6])]) // cluster ~44 km from Jind
const haora = D('haora', 290, [88.2, 22.6], 0.05)
const clean = [D('a', 40, [77, 28]), D('b', 90, [80, 20])]

assert.equal(worst([jind, haora]).id, 'haora')
assert.equal(poorPlus([jind, haora, ...clean]), 2)
assert.equal(poorPlus(clean), 0)

// fire story beats a worse non-fire district
assert.deepEqual(pickStory(W([jind, haora])), { kind: 'fire', d: jind })
// no district with fire >= 0.2 -> mix story on the worst district
assert.deepEqual(pickStory(W(clean)), { kind: 'mix', d: clean[1] })
// fire-led district whose only cluster is far outside India (e.g. 61E 37N) does not count
const foreign = D('far', 300, [74.9, 31.6], 0.4, [cl([61, 37])])
assert.equal(pickStory(W([foreign, ...clean])).kind, 'mix')
// fire-led district with no clusters at all does not count
assert.equal(pickStory(W([D('nocl', 250, [76, 29], 0.5), ...clean])).kind, 'mix')

// default district: first raid, else the worst
assert.equal(defaultDistrict(W([jind, haora], [{ id: 'jind', n: 'jind', s: 'S', aqi: 480, kind: 'incoming', etaH: 7, dust: false }])).id, 'jind')
assert.equal(defaultDistrict(W(clean)).id, 'b')
// a raid for a district missing from the world falls back to the worst
assert.equal(defaultDistrict(W(clean, [{ id: 'gone', n: 'g', s: 'S', aqi: 400, kind: 'now', etaH: 0, dust: false }])).id, 'b')

// nearest district by centroid
assert.equal(nearestDistrict([jind, haora], 76.0, 29.0).id, 'jind')
assert.ok(nearIndia([jind, haora], [76.0, 29.6]))
assert.ok(!nearIndia([jind, haora], [61, 37]))
// Smoke Season front line: Poor-or-worse today vs 24 h earlier (aqiPrev)
const P = (aqi: number, aqiPrev: number) => ({ aqi, aqiPrev }) as unknown as District
assert.deepEqual(frontTrend([P(250, 150), P(220, 230), P(90, 260)]), { now: 2, delta: 0 })
assert.deepEqual(frontTrend([P(250, 150), P(220, 100)]), { now: 2, delta: 2 })
assert.deepEqual(frontTrend([P(150, 250)]), { now: 0, delta: -1 })
// raid wording names the band the raid actually reaches, not always "Very Poor"
const R = (kind: 'now' | 'incoming', aqi: number, etaH = 0, dust = false) => ({ id: 'x', n: 'Jind', s: 'S', aqi, kind, etaH, dust })
assert.equal(raidText(R('now', 500)), 'Raid now: Jind is breathing Severe+ air')
assert.equal(raidText(R('now', 320)), 'Raid now: Jind is breathing Very Poor air')
assert.equal(raidText(R('incoming', 430, 7)), 'Incoming raid: Jind, Severe air in 7 h')
assert.equal(raidText(R('incoming', 310, 1, true)), 'Incoming raid: Jind, Very Poor air in 1 h (dust storm)')
console.log('ok')

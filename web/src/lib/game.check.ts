// Self-check for game math. Run: npx tsx src/lib/game.check.ts
import assert from 'node:assert/strict'
import { aqiToPm25, pm25ToAqi, planFactor, planSeries, cigarettes, DEFENSES } from './game'
import type { District } from './world'

// NAQI <-> PM2.5 round-trips across every band
for (const a of [10, 50, 75, 150, 250, 350, 420, 480]) assert.ok(Math.abs(pm25ToAqi(aqiToPm25(a)) - a) <= 1, `roundtrip ${a}`)
assert.equal(pm25ToAqi(60), 100)
assert.equal(pm25ToAqi(250), 400)

const att = { fire: 0.4, vehicles: 0.2, dust: 0.2, industry: 0.1, household: 0.05, regional: 0.05 }
// crop-residue management only bites after the 24 h smoke transit
assert.equal(planFactor(att, ['stubble'], 0), 1)
assert.ok(Math.abs(planFactor(att, ['stubble'], 30) - 0.8) < 1e-9)
// the smog tower is (correctly) almost useless at district scale
assert.ok(planFactor(att, ['tower'], 0) > 0.99)
// plans never make air worse, and all defenses combined stay physically sane
const d = { fc: [320, 340, 360], att } as unknown as District
const all = planSeries(d, DEFENSES.map((x) => x.id))
assert.ok(all.every((v, i) => v <= d.fc[i] && v > 0))
assert.ok(Math.abs(cigarettes(44) - 2) < 1e-9)
console.log('ok')

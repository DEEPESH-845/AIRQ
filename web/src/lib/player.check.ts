// Self-check for player state. Run: npx tsx src/lib/player.check.ts
import assert from 'node:assert/strict'
import {
  MISSIONS, act, addPoints, canReplay, checkIn, completeMission, defendSpend, fresh, getPlayer, istDay, markIntroSeen,
  migrate, missionCount, nextMission, parse, rankOf, recordReplay, resetPlayerForTests, shouldShowIntro,
} from './player'

const at = (iso: string) => new Date(iso).getTime()

// IST day boundary: 18:29 UTC is 23:59 IST, 18:31 UTC is 00:01 IST next day
assert.equal(istDay(at('2026-09-30T18:29:00Z')), '2026-09-30')
assert.equal(istDay(at('2026-09-30T18:31:00Z')), '2026-10-01')

// check-in: once a day, streak grows on consecutive days, resets after a gap, ignores a clock going backwards
// the very first visit starts the streak but pays nothing (ranks count mission XP only on day one)
let [p, g] = checkIn(fresh(), at('2026-09-30T04:00:00Z'))
assert.equal(p.xp, 0); assert.equal(p.streak, 1); assert.equal(g, null)
assert.equal(checkIn(p, at('2026-09-30T17:00:00Z'))[1], null)
;[p] = checkIn(p, at('2026-10-01T04:00:00Z'))
assert.equal(p.streak, 2); assert.equal(p.xp, 5)
assert.equal(checkIn(p, at('2026-09-29T04:00:00Z'))[1], null, 'clock went backwards')
;[p] = checkIn(p, at('2026-10-03T04:00:00Z'))
assert.equal(p.streak, 1, 'gap resets streak')

// missions pay once
let q = fresh()
;[q, g] = completeMission(q, 'trace')
assert.equal(q.xp, 20); assert.equal(g?.xp, 20)
assert.equal(completeMission(q, 'trace')[1], null)

// the six required missions sum to exactly 100 (Sentinel); alert is optional
assert.equal(MISSIONS.filter((m) => !m.optional).reduce((a, m) => a + m.xp, 0), 100)
assert.deepEqual(missionCount(q), { done: 1, total: 6 })
assert.equal(nextMission(fresh())?.id, 'command')

// ranks
assert.equal(rankOf(39).name, 'Recruit')
assert.equal(rankOf(40).name, 'Scout')
assert.equal(rankOf(100).name, 'Sentinel')
assert.equal(rankOf(1000).name, 'Air Marshal')
assert.equal(rankOf(1000).next, null)
assert.equal(rankOf(45).next?.name, 'Sentinel')

// Defend: first spend completes the mission (30); after that, one +10 per IST day in total (not per district)
let r = fresh()
const t = at('2026-09-30T06:00:00Z')
;[r, g] = defendSpend(r, 'A', t)
assert.equal(r.xp, 30); assert.ok(r.missions.includes('defend'))
for (let i = 0; i < 20; i++) assert.equal(defendSpend(r, 'A', t)[1], null, 'toggle spam pays nothing')
;[r, g] = defendSpend(r, 'B', t)
assert.equal(r.xp, 30, 'another district the same day pays nothing'); assert.equal(g, null)
;[r] = defendSpend(r, 'A', at('2026-10-01T06:00:00Z'))
assert.equal(r.xp, 40)
;[r, g] = defendSpend(r, 'C', at('2026-10-01T09:00:00Z'))
assert.equal(r.xp, 40, 'daily reward already taken'); assert.equal(g, null)

// replay: once per district per IST day, points become XP, zero points still use the day
let s = fresh()
assert.ok(canReplay(s, 'A', t))
;[s] = recordReplay(s, 'A', t, 50)
assert.equal(s.xp, 50); assert.equal(canReplay(s, 'A', t), false)
assert.equal(recordReplay(s, 'A', t, 50)[1], null)
;[s, g] = recordReplay(s, 'B', t, 0)
assert.equal(g, null); assert.equal(canReplay(s, 'B', t), false)

// Duel points
assert.equal(addPoints(fresh(), 0, 'x')[1], null)
assert.equal(addPoints(fresh(), 25, 'x')[0].xp, 25)

// parse: corrupt or wrong-typed data falls back safely
assert.deepEqual(parse('{not json'), fresh())
assert.deepEqual(parse(null), fresh())
assert.equal(parse(JSON.stringify({ xp: 'lots', missions: ['trace', 'bogus'] })).xp, 0)
assert.deepEqual(parse(JSON.stringify({ missions: ['trace', 'bogus'] })).missions, ['trace'])

// legacy points migrate exactly once; junk legacy values are ignored
const m1 = migrate(fresh(), '70')
assert.equal(m1.xp, 70); assert.equal(migrate(m1, '70').xp, 70)
assert.equal(migrate(fresh(), 'NaN').xp, 0)
assert.equal(migrate(fresh(), '-5').xp, 0)

// intro: first visit only, never over a deep link
assert.equal(shouldShowIntro(fresh(), ''), true)
assert.equal(shouldShowIntro(fresh(), '?d=abc'), false)
assert.equal(shouldShowIntro(markIntroSeen(fresh())[0], ''), false)

// store with storage blocked: still works in memory
try {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
} catch {
  /* runtime owns localStorage and won't let us replace it; an absent localStorage takes the same catch path */
}
resetPlayerForTests()
act((x) => completeMission(x, 'orders'))
assert.equal(getPlayer().xp, 10)
console.log('ok')

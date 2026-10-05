// Self-check for the credit preview maths. Run: npx tsx src/lib/account.check.ts
import assert from 'node:assert/strict'
import { ECO, activeEvents, estimate, eventMult, frontline, streakIfActNow, streakMult, weekId } from './account'

const at = (iso: string) => new Date(iso).getTime()
// IST week boundary and year edges (same cases as infra/player/check.py)
assert.equal(weekId(at('2026-10-04T18:29:00Z')), '2026-W40')
assert.equal(weekId(at('2026-10-04T18:31:00Z')), '2026-W41')
assert.equal(weekId(at('2026-01-01T06:00:00Z')), '2026-W01')
assert.equal(weekId(at('2027-01-01T06:00:00Z')), '2026-W53')
assert.equal(weekId(at('2025-12-29T06:00:00Z')), '2026-W01')

// multipliers match the Lambda: frontline by band, streak +10%/week to 1.5, product capped at 3x
assert.deepEqual([50, 250, 350, 420, 500].map(frontline), [1, 1.25, 1.5, 2, 2])
assert.equal(streakMult(1), 1); assert.equal(streakMult(3), 1.2); assert.equal(streakMult(20), 1.5)
const tree = ECO.actions.find((a) => a.id === 'tree')!
const quiet = at('2026-12-15T06:00:00Z') // outside every event
assert.equal(estimate(tree, 40, 1, true, false, quiet), 80)
assert.equal(estimate({ credits: 15 }, 500, 1, true, true, quiet), 15 * 3 + 20, 'capped at 3x like the server check')
// events, same rules as the Lambda: Smoke Season makes stubble x1.5 and Fire Watch x2
const smoke = at('2026-10-05T06:00:00Z')
assert.deepEqual(activeEvents(smoke).map((e) => e.id), ['smoke-2026'])
assert.equal(eventMult('fieldwatch', smoke), 2)
assert.equal(estimate(ECO.actions.find((a) => a.id === 'stubble')!, 40, 1, false, false, smoke), 180)
assert.equal(eventMult('cleanup', at('2026-11-08T06:00:00Z')), 2)
assert.equal(activeEvents(quiet).length, 0)

// streak preview
const now = at('2026-10-06T06:00:00Z')
assert.equal(streakIfActNow({ streak: 2, swk: '2026-W40' }, now), 3)
assert.equal(streakIfActNow({ streak: 2, swk: '2026-W41' }, now), 2)
assert.equal(streakIfActNow({ streak: 5, swk: '2026-W38' }, now), 1)
assert.equal(streakIfActNow({ streak: 0, swk: '' }, now), 1)
console.log('ok')

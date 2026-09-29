// Self-check for Instant Replay. Run: npx tsx src/lib/replay.check.ts
import assert from 'node:assert/strict'
import { replayRound, scoreCall } from './replay'
import type { World } from './world'

// same formula as the Forecast Duel: 50 beat the forecast, 20 both right, 5 off by one, 0 otherwise
assert.equal(scoreCall(3, 2, 3), 50)
assert.equal(scoreCall(3, 3, 3), 20)
assert.equal(scoreCall(2, 3, 3), 5)
assert.equal(scoreCall(4, 3, 3), 5)
assert.equal(scoreCall(0, 3, 3), 0)

const w = {
  districts: [{ id: 'a', n: 'Jind', aqi: 260 }, { id: 'c', n: 'C', aqi: 90 }],
  replay: { at: '2026-09-29T13:00:00+00:00', districts: { a: [180, 240], b: [90, 100], c: [80, null] } },
} as unknown as World
assert.deepEqual(replayRound(w, 'a'), { id: 'a', name: 'Jind', aqiThen: 180, fcBand: 3, at: '2026-09-29T13:00:00+00:00' })
assert.equal(replayRound(w, 'b'), null, 'district missing from the live world')
assert.equal(replayRound(w, 'c'), null, 'no forecast for now')
assert.equal(replayRound(w, 'zzz'), null, 'district missing from the archive')
assert.equal(replayRound({ districts: w.districts } as unknown as World, 'a'), null, 'no replay block at all')
console.log('ok')

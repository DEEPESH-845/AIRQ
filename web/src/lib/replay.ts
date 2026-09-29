// Instant Replay: call a band for "now" from yesterday's reading, against yesterday's forecast.
import { catIndex } from './naqi'
import type { World } from './world'

/** Duel scoring: 50 beat the forecast, 20 both right, 5 off by one band, else 0. */
export const scoreCall = (call: number, forecast: number, actual: number) =>
  call === actual ? (forecast === actual ? 20 : 50) : Math.abs(call - actual) === 1 ? 5 : 0

export type Round = { id: string; name: string; aqiThen: number; fcBand: number; at: string }

export function replayRound(w: World, id: string): Round | null {
  const r = w.replay?.districts[id]
  const d = w.districts.find((x) => x.id === id)
  if (!w.replay || !r || !d || r[1] == null) return null
  return { id, name: d.n, aqiThen: r[0], fcBand: catIndex(r[1]), at: w.replay.at }
}

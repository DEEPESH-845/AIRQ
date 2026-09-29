import { useState } from 'react'
import type { District, World } from '../lib/world'
import { CATS, catIndex } from '../lib/naqi'
import { replayRound, scoreCall } from '../lib/replay'
import { act, canReplay, recordReplay, usePlayer } from '../lib/player'

/** Call "now" from yesterday's reading, then see the real answer next to the AIRQ forecast (CAMS). */
export function Replay({ world, d }: { world: World; d: District }) {
  const p = usePlayer()
  const [call, setCall] = useState<number | null>(null)
  const [now] = useState(() => Date.now())
  const round = replayRound(world, d.id)
  if (!round) return null
  const hours = Math.round((new Date(world.generatedAt).getTime() - new Date(round.at).getTime()) / 3600e3)
  const actual = catIndex(d.aqi)
  const then = catIndex(round.aqiThen)
  const options = [then - 1, then, then + 1, then + 2].filter((i) => i >= 0 && i < CATS.length)
  const played = !canReplay(p, d.id, now)

  if (call === null && played)
    return (
      <section className="block" aria-labelledby="rp-h">
        <h2 id="rp-h">Instant Replay</h2>
        <p className="lede">You've played today's replay for {d.n}. Try another district, or come back tomorrow.</p>
      </section>
    )

  const pts = call === null ? 0 : scoreCall(call, round.fcBand, actual)
  const mark = (band: number) => (band === actual ? '✓' : '✗')
  return (
    <section className="block" aria-labelledby="rp-h">
      <h2 id="rp-h">Instant Replay</h2>
      <p className="lede">
        {hours} hours ago {d.n} read <b style={{ color: CATS[then].color }}>{round.aqiThen}</b> ({CATS[then].name}). The AIRQ forecast (CAMS)
        then called <b style={{ color: CATS[round.fcBand].color }}>{CATS[round.fcBand].name}</b> for now. What is it really?
      </p>
      {call === null ? (
        <div className="duel-opts">
          {options.map((i) => (
            <button
              key={i}
              style={{ ['--c' as string]: CATS[i].color }}
              onClick={() => {
                setCall(i)
                act((x) => recordReplay(x, d.id, Date.now(), scoreCall(i, round.fcBand, actual)))
              }}
            >
              {CATS[i].name}
            </button>
          ))}
        </div>
      ) : (
        <div className="reveal" aria-live="polite">
          <p>
            Now: <b style={{ color: CATS[actual].color }}>{CATS[actual].name}</b> (AQI {d.aqi})
          </p>
          <p>
            You: {CATS[call].name} {mark(call)} · AIRQ forecast (CAMS): {CATS[round.fcBand].name} {mark(round.fcBand)}
          </p>
          <p className="reveal-pts">{pts ? `+${pts} XP` : 'No points this time'}</p>
        </div>
      )}
    </section>
  )
}

import { useState } from 'react'
import type { District } from '../lib/world'
import { CATS, catIndex } from '../lib/naqi'
import { openCall, placeCall, type Call } from '../lib/game'
import { act, completeMission } from '../lib/player'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** Call tomorrow's AQI band against the AIRQ forecast (CAMS). Settled by the next day's data. */
export function Duel({ d, generatedAt }: { d: District; generatedAt: string }) {
  const [call, setCall] = useState<Call | undefined>(() => openCall(d.id))
  const cur = catIndex(d.aqi)
  const options = [cur - 1, cur, cur + 1, cur + 2].filter((i) => i >= 0 && i < CATS.length)

  return (
    <section className="block" aria-labelledby="duel-h">
      <h2 id="duel-h">Call tomorrow</h2>
      {call ? (
        <p className="lede">
          You called <b style={{ color: CATS[call.band].color }}>{CATS[call.band].name}</b>. The AIRQ forecast (CAMS) says{' '}
          <b style={{ color: CATS[call.ai].color }}>{CATS[call.ai].name}</b>. It settles {when(call.resolveAt)}: 50 XP if you beat
          the forecast, 20 if you both get it right.
        </p>
      ) : (
        <>
          <p className="lede">What will the air be here this time tomorrow? Beat the AIRQ forecast (CAMS) to score.</p>
          <div className="duel-opts" data-mission="call">
            {options.map((i) => (
              <button
                key={i}
                style={{ ['--c' as string]: CATS[i].color }}
                onClick={() => {
                  setCall(placeCall(d, i, generatedAt))
                  act((p) => completeMission(p, 'call'))
                }}
              >
                {CATS[i].name}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

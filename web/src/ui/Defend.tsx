import { useMemo, useState } from 'react'
import type { District } from '../lib/world'
import { BUDGET, DEFENSES, aqiToPm25, cigarettes, planSeries } from '../lib/game'
import { ForecastChart } from './ForecastChart'

const peakNext24 = (s: number[]) => Math.max(...s.slice(0, 25))
const cigs = (s: number[]) => cigarettes(s.slice(0, 24).reduce((a, v) => a + aqiToPm25(v), 0) / 24)

/** Pick interventions within a daily budget; see tomorrow re-forecast against reality. */
export function Defend({ d, start }: { d: District; start: string }) {
  const [active, setActive] = useState<string[]>([])
  const [last, setLast] = useState<string | null>(null)
  const spent = DEFENSES.filter((x) => active.includes(x.id)).reduce((a, x) => a + x.cost, 0)
  const plan = useMemo(() => planSeries(d, active), [d, active])

  // what each defense alone would do to tomorrow's AQI, so choices are informed
  const alone = useMemo(
    () => Object.fromEntries(DEFENSES.map((x) => [x.id, (planSeries(d, [x.id])[30] ?? d.aqi) - (d.fc[30] ?? d.aqi)])),
    [d],
  )

  const toggle = (id: string, cost: number) => {
    setLast(id)
    setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : spent + cost <= BUDGET ? [...a, id] : a))
  }
  const before = { peak: peakNext24(d.fc), cigs: cigs(d.fc) }
  const after = { peak: peakNext24(plan), cigs: cigs(plan) }
  const note = DEFENSES.find((x) => x.id === last)?.note

  return (
    <section className="block" aria-labelledby="def-h">
      <h2 id="def-h">Defend {d.n}</h2>
      <p className="lede">
        You have {BUDGET} points a day. Spend them on real measures and see how tomorrow changes.
      </p>
      <div className="def-grid">
        {DEFENSES.map((x) => {
          const on = active.includes(x.id)
          const blocked = !on && spent + x.cost > BUDGET
          return (
            <button key={x.id} className="def" aria-pressed={on} disabled={blocked} onClick={() => toggle(x.id, x.cost)}>
              <span className="def-name">{x.name}</span>
              <span className="def-meta">
                <span className="cost" aria-label={`${x.cost} points`}>
                  {Array.from({ length: x.cost }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
                <span>{alone[x.id] === 0 ? 'no change' : `${alone[x.id]} AQI`}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="budget">
        {BUDGET - spent} of {BUDGET} points left
      </p>
      {note && <p className="fine def-note">{note}</p>}
      <ForecastChart fc={d.fc} start={start} plan={active.length ? plan : undefined} />
      <p className="def-result" aria-live="polite">
        {active.length ? (
          <>
            Tomorrow's peak goes from <b>{before.peak}</b> to <b>{after.peak}</b>. A day here costs your lungs{' '}
            <b>{after.cigs.toFixed(1)} cigarettes</b> instead of {before.cigs.toFixed(1)}.
          </>
        ) : (
          <>
            Breathing here for the next day is like smoking <b>{before.cigs.toFixed(1)} cigarettes</b>.
          </>
        )}
      </p>
      <p className="fine">Effect sizes are conservative estimates from published studies of Delhi-NCR measures.</p>
    </section>
  )
}

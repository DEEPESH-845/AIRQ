import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { District, World } from '../lib/world'
import { CATS, catIndex, catOf } from '../lib/naqi'
import { PERSONAS, adviceFor, loadPersona, savePersona, type Persona } from '../lib/advice'
import { ForecastChart } from './ForecastChart'
import { Attribution } from './Attribution'
import { Defend } from './Defend'
import { Duel } from './Duel'
import { AlertToggle } from './AlertToggle'
import { Briefing } from './Briefing'
import { ReportSource } from './ReportSource'
import { Replay } from './Replay'
import { raidText } from '../lib/story'
import { act, completeMission, type Tab } from '../lib/player'

const fmtHour = (iso: string, addH = 0) =>
  new Date(new Date(iso).getTime() + addH * 3600e3).toLocaleTimeString('en-IN', { hour: 'numeric', timeZone: 'Asia/Kolkata' })

const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })

function lidText(d: District) {
  if (d.dustAhead)
    return `A dust storm is forecast within 24 hours. Coarse dust drives the AQI up fast; keep windows shut and wear an N95 outdoors.`
  if (d.blhMin < 200)
    return `Tonight the mixing layer collapses to about ${d.blhMin} m. Smog gets trapped near the ground, so mornings will be worst.`
  if (d.viMin < 6000) return `Ventilation drops below 6,000 m²/s in the next 24 hours, so pollution will linger.`
  return `The air mixes well over the next 24 hours, which helps clear pollution.`
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'orders', label: 'Orders' },
  { id: 'battle', label: 'Battle' },
  { id: 'play', label: 'Play' },
]

function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const key = (e: KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowRight: (i + 1) % 3, ArrowLeft: (i + 2) % 3, Home: 0, End: 2 }
    const n = moves[e.key]
    if (n === undefined) return
    e.preventDefault()
    onTab(TABS[n].id)
    refs.current[n]?.focus()
  }
  return (
    <div className="tabs" role="tablist" aria-label="District sections">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={tab === t.id ? `panel-${t.id}` : undefined}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => onTab(t.id)}
          onKeyDown={(e) => key(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function DistrictPanel({ d, world, tab, onTab, focusKey, onClose, onTrace, onHighlight }: { d: District; world: World; tab: Tab; onTab: (t: Tab) => void; focusKey: number; onClose: () => void; onTrace: () => void; onHighlight: (ids: string[]) => void }) {
  const generatedAt = world.generatedAt
  const raid = world.raids.find((r) => r.id === d.id)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusKey) panelRef.current?.focus()
  }, [focusKey])
  const cat = catOf(d.aqi)
  const advice = adviceFor(d.aqi)
  const [persona, setPersona] = useState<Persona>(loadPersona)
  const pick = (p: Persona) => {
    setPersona(p)
    savePersona(p)
    act((x) => completeMission(x, 'orders'))
  }

  return (
    <aside className="panel" aria-label={`${d.n} air quality`} style={{ ['--c' as string]: cat.color }}>
      <header className="panel-head">
        <div>
          <h1>{d.n}</h1>
          <p>{d.s}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close district">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="aqi-row">
        <span className="aqi-num">{d.aqi}</span>
        <div>
          <span className="aqi-cat">{d.cat}</span>
          <span className="aqi-sub">{advice.cpcb}</span>
          {advice.grap && <span className="grap">{advice.grap} applies in Delhi-NCR at this level</span>}
        </div>
      </div>
      <div
        className="health"
        role="meter"
        aria-label="Air health"
        aria-valuemin={0}
        aria-valuemax={CATS.length}
        aria-valuenow={CATS.length - catIndex(d.aqi)}
        aria-valuetext={`${CATS.length - catIndex(d.aqi)} of ${CATS.length}, ${d.cat}`}
      >
        <span>Air health</span>
        <span className="health-bar">
          {CATS.map((c, i) => (
            <i key={c.name} data-on={i < CATS.length - catIndex(d.aqi)} />
          ))}
        </span>
      </div>
      <p className="order">
        <b>{advice.verdict}</b> <small>· Modelled, not measured</small>
      </p>
      <p className="fine">
        PM2.5 {d.pm25} µg/m³ and PM10 {d.pm10} µg/m³, 24-hour average. Estimated from Copernicus CAMS at {fmtHour(generatedAt)} IST.
      </p>

      <Tabs tab={tab} onTab={onTab} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={-1} ref={panelRef}>
        {tab === 'orders' && (
          <>
            <Briefing district={d.id} onHighlight={onHighlight} />
            <section className="block" aria-labelledby="verdict-h">
              <h2 id="verdict-h">What to do today</h2>
              <div className="seg" role="radiogroup" aria-label="Who is this for">
                {PERSONAS.map((p) => (
                  <button key={p.id} role="radio" aria-checked={persona === p.id} onClick={() => pick(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="verdict">
                <b>{advice.verdict}.</b> {advice[persona]}
              </p>
              {d.best && (
                <p className="best">
                  <span>Cleanest window {istDay(d.best.start) === istDay(generatedAt) ? 'today' : 'tomorrow'}</span>
                  <b>
                    {fmtHour(d.best.start)} to {fmtHour(d.best.start, 2)}
                  </b>
                  <small>PM2.5 around {d.best.pm25} µg/m³</small>
                </p>
              )}
              <AlertToggle district={d.id} name={d.n} />
            </section>
            <section className="block" aria-labelledby="fc-h">
              <h2 id="fc-h">Next 48 hours</h2>
              <ForecastChart fc={d.fc} start={generatedAt} />
              <p className="lid">{lidText(d)}</p>
            </section>
          </>
        )}
        {tab === 'battle' && (
          <>
            {raid && (
              <p className="raid-status">{raidText(raid)}.</p>
            )}
            <Attribution d={d} onTrace={onTrace} />
            <ReportSource d={d} />
          </>
        )}
        {tab === 'play' && (
          <>
            <Replay world={world} d={d} />
            <Defend d={d} start={generatedAt} />
            <Duel d={d} generatedAt={generatedAt} />
          </>
        )}
      </div>
    </aside>
  )
}

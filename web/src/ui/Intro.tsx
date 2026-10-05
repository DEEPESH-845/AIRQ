import { useEffect, useMemo, useRef, useState } from 'react'
import type { District, World } from '../lib/world'
import type { Focus } from '../map/AirqMap'
import { defaultDistrict, nearIndia, nearestDistrict, pickStory, poorPlus } from '../lib/story'
import { SOURCES } from '../lib/sources'
import { useFeed } from '../lib/account'

type Scene = { focus: Focus; trace: District | null }

/** First-visit briefing: three cards over the live map. Non-blocking, skippable, replayable from "?". */
export function Intro({ world, onScene, onPick, onSearch, onDone }: { world: World; onScene: (s: Scene) => void; onPick: (id: string) => void; onSearch: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [near, setNear] = useState<District | null>(null)
  const [locating, setLocating] = useState(false)
  const card = useRef<HTMLElement>(null)
  const story = useMemo(() => pickStory(world), [world])
  const n = poorPlus(world.districts)
  const top = SOURCES.map((s) => ({ ...s, v: story.d.att[s.key] })).sort((a, b) => b.v - a.v)
  const target = defaultDistrict(world)
  const feed = useFeed()
  const fieldDays = feed?.byAction.fieldwatch ?? 0
  const actions = (feed?.total ?? 0) - fieldDays - (feed?.byAction.pact ?? 0) - (feed?.byAction.pactweek ?? 0)

  useEffect(() => {
    if (step === 1) onScene(story.kind === 'fire' ? { focus: null, trace: story.d } : { focus: { to: story.d.c }, trace: null })
    else onScene({ focus: { to: 'india', brief: true }, trace: null })
  }, [step, story, onScene])
  useEffect(() => card.current?.focus(), []) // once: the step text is aria-live, so later steps are announced

  useEffect(() => {
    // Escape skips the briefing, except while typing (the search box uses Escape to clear itself)
    const onKey = (e: globalThis.KeyboardEvent) =>
      e.key === 'Escape' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && onDone()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onDone])

  // a slow location answer must not act after the card has closed
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true // StrictMode mounts twice: set on every mount, not only at creation
    return () => void (alive.current = false)
  }, [])
  const locate = () => {
    if (!('geolocation' in navigator)) return onSearch()
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!alive.current) return
        setLocating(false)
        const at: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        if (nearIndia(world.districts, at)) setNear(nearestDistrict(world.districts, at[0], at[1]))
        else onSearch() // outside India: let them search instead of guessing a district hundreds of km away
      },
      () => {
        if (!alive.current) return
        setLocating(false)
        onSearch()
      },
      { timeout: 8000, maximumAge: 600000 },
    )
  }

  const cards = [
    {
      title: "India's air, right now.",
      body: n
        ? `${n} of ${world.districts.length} districts are breathing Poor air or worse. Colours show each district's air today.`
        : "India's air is mostly clean today. Here's where it's worst.",
    },
    story.kind === 'fire'
      ? { title: 'Air travels.', body: `Air reaching ${story.d.n} in the last 36 hours came from here: the line is its path, the rings are fires on the way.` }
      : { title: 'Every district has its own mix.', body: `${story.d.n} today: mostly ${top[0].label.toLowerCase()} (${Math.round(top[0].v * 100)}%).` },
    { title: 'Take command.', body: "Pick a district to defend. You'll get today's orders, where its air comes from, and ways to play." },
  ]
  const c = cards[step]

  return (
    <section className="intro" aria-label="Briefing" tabIndex={-1} ref={card}>
      <div className="intro-steps" aria-hidden="true">
        {cards.map((_, i) => (
          <i key={i} data-on={i <= step} />
        ))}
      </div>
      <h2>{c.title}</h2>
      <p aria-live="polite">{c.body}</p>
      {step === 0 && feed && feed.total > 0 && (
        <p className="intro-impact">
          This week, AIRQ players verified{' '}
          {actions > 0 && (
            <>
              <b>{actions}</b> green action{actions === 1 ? '' : 's'}
            </>
          )}
          {actions > 0 && fieldDays > 0 && ' and '}
          {fieldDays > 0 && (
            <>
              <b>{fieldDays}</b> fire-free field day{fieldDays === 1 ? '' : 's'} from space
            </>
          )}
          .
        </p>
      )}
      {step === 1 && story.kind === 'mix' && (
        <div className="att-bar" role="img" aria-label={top.map((r) => `${r.label} ${Math.round(r.v * 100)}%`).join(', ')}>
          {top.map((r) => (
            <span key={r.key} style={{ flexGrow: r.v, background: r.color }} />
          ))}
        </div>
      )}
      {step < 2 ? (
        <div className="intro-actions">
          <button onClick={onDone}>Skip</button>
          <button className="primary" onClick={() => setStep(step + 1)}>
            Next
          </button>
        </div>
      ) : near ? (
        <div className="intro-actions">
          <span>Nearest district: <b>{near.n}</b></span>
          <button onClick={onSearch}>Not yours? Search</button>
          <button className="primary" onClick={() => onPick(near.id)}>
            Take command
          </button>
        </div>
      ) : (
        <div className="intro-actions">
          <button onClick={locate} disabled={locating}>
            {locating ? 'Finding you…' : 'Use my location'}
          </button>
          <button onClick={onSearch}>Search</button>
          <button className="primary" onClick={() => onPick(target.id)}>
            Take {target.n}
          </button>
        </div>
      )}
    </section>
  )
}

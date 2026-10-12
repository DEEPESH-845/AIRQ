import { useEffect, useRef, useState } from 'react'
import type { District, World } from '../lib/world'
import type { Focus } from '../map/AirqMap'
import { nearIndia, nearestDistrict } from '../lib/story'
import { useT } from '../lib/i18n'

type Scene = { focus: Focus; trace: District | null }

/** First visit: one card over the live map that says what AIRQ is and gets you to your district. Skippable, replayable from More. */
export function Intro({ world, onScene, onPick, onSearch, onDone }: { world: World; onScene: (s: Scene) => void; onPick: (id: string) => void; onSearch: () => void; onDone: () => void }) {
  const t = useT()
  const [near, setNear] = useState<District | null>(null)
  const [locating, setLocating] = useState(false)
  const card = useRef<HTMLElement>(null)

  useEffect(() => onScene({ focus: { to: 'india', brief: true }, trace: null }), [onScene])
  useEffect(() => card.current?.focus(), [])

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
  // the position is matched to a district here in the browser; it is never sent anywhere
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

  return (
    <section className="intro" aria-label={t('intro.title')} tabIndex={-1} ref={card}>
      <h2>{t('intro.title')}</h2>
      <p>{t('intro.body')}</p>
      {near ? (
        <div className="intro-actions">
          <span>{t('intro.near', { name: near.n })}</span>
          <button onClick={onSearch}>{t('intro.search')}</button>
          <button className="primary" onClick={() => onPick(near.id)}>
            {t('intro.open', { name: near.n })}
          </button>
        </div>
      ) : (
        <div className="intro-actions">
          <button onClick={onDone}>{t('intro.look')}</button>
          <button onClick={onSearch}>{t('intro.search')}</button>
          <button className="primary" onClick={locate} disabled={locating}>
            {t('intro.locate')}
            <small>{t('intro.private')}</small>
          </button>
        </div>
      )}
    </section>
  )
}

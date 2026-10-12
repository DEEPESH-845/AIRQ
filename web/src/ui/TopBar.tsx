import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { World } from '../lib/world'
import { istTime } from '../lib/world'
import { catOf } from '../lib/naqi'
import { LANGS, setLang, useLang, useT, type Key } from '../lib/i18n'

export function TopBar({ world, onSelect, onGeneral, onHelp, onHow, onLeaders, actions, children }: { world: World; onSelect: (id: string) => void; onGeneral: () => void; onHelp: () => void; onHow: () => void; onLeaders: () => void; actions: ReactNode; children?: ReactNode }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const bar = useRef<HTMLElement>(null)
  // left-hand panels start below the bar, whose height changes with the HUD, the raid banner and the screen width
  useEffect(() => {
    const el = bar.current
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight - 28}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const stale = world.sources.some((s) => s.stale)

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return world.districts
      .filter((d) => d.n.toLowerCase().includes(t) || d.s.toLowerCase().startsWith(t))
      .sort((a, b) => Number(!a.n.toLowerCase().startsWith(t)) - Number(!b.n.toLowerCase().startsWith(t)))
      .slice(0, 7)
  }, [q, world])

  const pick = (id: string) => {
    onSelect(id)
    setQ('')
    input.current?.blur()
  }

  return (
    <header className="topbar" ref={bar}>
      <div className="brand">
        <span className="wordmark">AIRQ</span>
        <span className="status" data-stale={stale}>
          <span className="pulse" aria-hidden="true" />
          {stale ? 'Some feeds delayed' : 'Live'}, updated {istTime(world.generatedAt)} IST
        </span>
        <small className="honesty">
          <span className="long">Modelled estimates from Copernicus CAMS, updated every 4 h. Not monitor readings.</span>
          <span className="short">Modelled CAMS estimates, not monitor readings.</span>
        </small>
      </div>
      <div className="top-actions">
        {actions}
        <More onGeneral={onGeneral} onHelp={onHelp} onHow={onHow} onLeaders={onLeaders} />
      </div>
      <div className="search" role="combobox" aria-expanded={matches.length > 0} aria-haspopup="listbox">
        <input
          ref={input}
          id="district-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, matches.length - 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            else if (e.key === 'Enter' && matches[active]) pick(matches[active].id)
            else if (e.key === 'Escape') setQ('')
          }}
          placeholder={t('top.search')}
          aria-label={t('top.search')}
          aria-controls="search-list"
        />
        {matches.length > 0 && (
          <ul id="search-list" role="listbox">
            {matches.map((d, i) => (
              <li
                key={d.id}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(d.id)
                }}
              >
                <span>
                  {d.n}
                  <small>{d.s}</small>
                </span>
                <b style={{ color: catOf(d.aqi).color }}>{d.aqi}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
      {children}
    </header>
  )
}

/** Everything that isn't the daily loop, one tap away. Native <details>; closes on a choice, an outside tap or Escape. */
function More({ onGeneral, onHelp, onHow, onLeaders }: { onGeneral: () => void; onHelp: () => void; onHow: () => void; onLeaders: () => void }) {
  const t = useT()
  const l = useLang()
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const out = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ref.current?.open) return
      e.stopImmediatePropagation() // this Escape belongs to the menu, not to the district or sheet underneath
      ref.current.open = false
      ref.current.querySelector('summary')?.focus()
    }
    addEventListener('pointerdown', out)
    addEventListener('keydown', esc)
    return () => {
      removeEventListener('pointerdown', out)
      removeEventListener('keydown', esc)
    }
  }, [])
  const item = (k: Key, f: () => void) => (
    <button
      onClick={() => {
        if (ref.current) ref.current.open = false
        f()
      }}
    >
      {t(k)}
    </button>
  )
  return (
    <details className="more" ref={ref}>
      <summary className="more-btn">{t('top.more')}</summary>
      <div className="more-menu">
        {item('more.ai', onGeneral)}
        {item('more.leaders', onLeaders)}
        {item('more.manual', onHelp)}
        {item('more.how', onHow)}
        <div className="seg" role="radiogroup" aria-label={t('more.lang')}>
          {LANGS.map(([id, name]) => (
            <button key={id} role="radio" aria-checked={l === id} lang={id} onClick={() => setLang(id)}>
              {name}
            </button>
          ))}
        </div>
      </div>
    </details>
  )
}

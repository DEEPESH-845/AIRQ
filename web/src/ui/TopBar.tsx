import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { World } from '../lib/world'
import { istTime } from '../lib/world'
import { catOf } from '../lib/naqi'

export function TopBar({ world, onSelect, onGeneral, children }: { world: World; onSelect: (id: string) => void; onGeneral: () => void; children?: ReactNode }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
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
    <header className="topbar">
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
      <button className="general-btn" onClick={onGeneral}>
        Ask the General
      </button>
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
          placeholder="Find your district"
          aria-label="Find your district"
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
      </div>
      {children}
    </header>
  )
}

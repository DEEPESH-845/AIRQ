import { useMemo, useState } from 'react'
import type { District, World } from '../lib/world'
import { catOf } from '../lib/naqi'

type Board = { id: string; label: string; metric: (d: District) => number; show: (d: District) => string; asc?: boolean; hint: string }

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

const BOARDS: Board[] = [
  { id: 'worst', label: 'Most polluted', metric: (d) => d.aqi, show: (d) => String(d.aqi), hint: 'Highest AQI right now' },
  { id: 'best', label: 'Cleanest', metric: (d) => d.aqi, show: (d) => String(d.aqi), asc: true, hint: 'Lowest AQI right now' },
  { id: 'rise', label: 'Worsening', metric: (d) => d.aqi - d.aqiPrev, show: (d) => signed(d.aqi - d.aqiPrev), hint: 'Biggest AQI rise since this time yesterday' },
  { id: 'next', label: 'Rising tomorrow', metric: (d) => (d.fc[24] ?? d.aqi) - d.aqi, show: (d) => signed((d.fc[24] ?? d.aqi) - d.aqi), hint: 'Forecast AQI change over the next 24 hours' },
  { id: 'fire', label: 'Fire smoke', metric: (d) => d.att.fire, show: (d) => `${Math.round(d.att.fire * 100)}%`, hint: 'Estimated share of pollution from farm and forest fires' },
]

export function Rankings({ world, onSelect, onClose }: { world: World; onSelect: (id: string) => void; onClose: () => void }) {
  const [board, setBoard] = useState(BOARDS[0])
  const [state, setState] = useState('All India')
  const states = useMemo(() => ['All India', ...[...new Set(world.districts.map((d) => d.s))].sort()], [world])

  const rows = useMemo(() => {
    const pool = state === 'All India' ? world.districts : world.districts.filter((d) => d.s === state)
    return [...pool].sort((a, b) => (board.asc ? 1 : -1) * (board.metric(a) - board.metric(b))).slice(0, 25)
  }, [world, board, state])

  return (
    <aside className="rankings" aria-label="District rankings">
      <header className="panel-head">
        <div>
          <h1>Rankings</h1>
          <p>{board.hint}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close rankings">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="seg" role="tablist" aria-label="Ranking">
        {BOARDS.map((b) => (
          <button key={b.id} role="tab" aria-selected={b.id === board.id} aria-checked={b.id === board.id} onClick={() => setBoard(b)}>
            {b.label}
          </button>
        ))}
      </div>
      <label className="state-pick">
        <span>Show</span>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          {states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <ol className="rank-list">
        {rows.map((d, i) => (
          <li key={d.id}>
            <button onClick={() => onSelect(d.id)} style={{ ['--c' as string]: catOf(d.aqi).color }}>
              <span className="rank">{i + 1}</span>
              <span className="who">
                {d.n}
                <small>{d.s}</small>
              </span>
              {board.id !== 'worst' && board.id !== 'best' && <span className="aqi-chip">{d.aqi}</span>}
              <b style={board.id === 'fire' ? { color: 'var(--ember)' } : board.id === 'worst' || board.id === 'best' ? undefined : { color: 'var(--ink)' }}>
                {board.show(d)}
              </b>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}

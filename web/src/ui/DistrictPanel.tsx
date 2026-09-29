import type { District } from '../lib/world'
import { catOf } from '../lib/naqi'

export function DistrictPanel({ d, onClose }: { d: District; onClose: () => void }) {
  const cat = catOf(d.aqi)
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
          <span className="aqi-sub">
            PM2.5 {d.pm25} µg/m³, PM10 {d.pm10} µg/m³, 24-hour average
          </span>
        </div>
      </div>
    </aside>
  )
}

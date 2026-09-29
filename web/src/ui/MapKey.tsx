import { CATS } from '../lib/naqi'

/** What the colours, streaks, dots and rings on the map mean. Native details: no script needed. */
export function MapKey({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  return (
    <details className="map-key" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>Map key</summary>
      <ul>
        <li>
          <span className="mk-bands" aria-hidden="true">
            {CATS.map((c) => (
              <i key={c.name} style={{ background: c.color }} />
            ))}
          </span>
          District air today: {CATS.map((c) => c.name).join(', ')}
        </li>
        <li>
          <span className="mk-streak" aria-hidden="true" />
          Moving streaks: wind right now
        </li>
        <li>
          <span className="mk-fire" aria-hidden="true" />
          Orange dots: fires in the last 24 h (NASA FIRMS)
        </li>
        <li>
          <span className="mk-ring" aria-hidden="true" />
          Pulsing ring: raid, Very Poor air now or within 24 h
        </li>
      </ul>
    </details>
  )
}

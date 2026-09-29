import { useState } from 'react'
import type { World } from '../lib/world'

/** The most-threatened raid from world.raids (AQI crossing 300 now or within 24 h). */
export function RaidBanner({ world, onSelect }: { world: World; onSelect: (id: string) => void }) {
  const [hidden, setHidden] = useState(false)
  const r = world.raids[0]
  if (!r || hidden) return null
  const text =
    r.kind === 'incoming'
      ? `Incoming raid: ${r.n}, Very Poor air in ${r.etaH} h`
      : `Raid now: ${r.n} has crossed into Very Poor air`
  return (
    <div className="raid-banner" role="status">
      <button className="raid-go" onClick={() => onSelect(r.id)}>
        {text}
        {r.dust ? ' (dust storm)' : ''}
      </button>
      <button className="raid-x" onClick={() => setHidden(true)} aria-label="Dismiss raid alert">
        ×
      </button>
    </div>
  )
}

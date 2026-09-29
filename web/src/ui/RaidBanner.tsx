import { useState } from 'react'
import type { World } from '../lib/world'
import { raidText } from '../lib/story'

/** The most-threatened raid from world.raids (AQI crossing 300 now or within 24 h). */
export function RaidBanner({ world, onSelect }: { world: World; onSelect: (id: string) => void }) {
  const [hidden, setHidden] = useState(false)
  const r = world.raids[0]
  if (!r || hidden) return null
  return (
    <div className="raid-banner" role="status">
      <button className="raid-go" onClick={() => onSelect(r.id)}>
        {raidText(r)}
      </button>
      <button className="raid-x" onClick={() => setHidden(true)} aria-label="Dismiss raid alert">
        ×
      </button>
    </div>
  )
}

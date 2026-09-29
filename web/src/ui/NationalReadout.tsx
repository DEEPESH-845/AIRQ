import type { World } from '../lib/world'
import { CATS, catIndex } from '../lib/naqi'
import { frontTrend } from '../lib/story'

/** Bottom-left instrument: how India's districts split across the NAQI bands, doubling as the legend. */
export function NationalReadout({ world, onSelect, onRankings }: { world: World; onSelect: (id: string) => void; onRankings: () => void }) {
  const counts = CATS.map(() => 0)
  for (const d of world.districts) counts[catIndex(d.aqi)]++
  const total = world.districts.length
  const poorPlus = counts.slice(3).reduce((a, b) => a + b, 0)
  const worst = [...world.districts].sort((a, b) => b.aqi - a.aqi).slice(0, 3)
  const { delta } = frontTrend(world.districts)
  const trend = delta > 0 ? `▲ ${delta} more than yesterday` : delta < 0 ? `▼ ${-delta} fewer than yesterday` : 'Same as yesterday'

  return (
    <section className="readout" aria-label="India right now">
      <p className="front">
        Smoke Season front line <small data-trend={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}>{trend}</small>
      </p>
      <p className="readout-line">
        <span className="big">{poorPlus}</span>
        <span>
          of {total} districts are breathing <em>Poor</em> air or worse
        </span>
      </p>
      <div className="strip" role="img" aria-label={CATS.map((c, i) => `${counts[i]} ${c.name}`).join(', ')}>
        {CATS.map((c, i) =>
          counts[i] ? <span key={c.name} style={{ flexGrow: counts[i], background: c.color }} title={`${c.name}: ${counts[i]}`} /> : null,
        )}
      </div>
      <ol className="scale">
        {CATS.map((c, i) => (
          <li key={c.name} style={{ ['--c' as string]: c.color }} data-empty={counts[i] === 0}>
            {c.name}
            <small>{counts[i]}</small>
          </li>
        ))}
      </ol>
      <div className="worst">
        <span className="worst-label">Worst now</span>
        {worst.map((d) => (
          <button key={d.id} onClick={() => onSelect(d.id)} style={{ ['--c' as string]: CATS[catIndex(d.aqi)].color }}>
            {d.n} <b>{d.aqi}</b>
          </button>
        ))}
      </div>
      {world.raids.length > 0 && (
        <div className="worst raids-list">{/* .worst styles; .raids-list keeps it visible on mobile */}
          <span className="worst-label">Raids</span>
          {world.raids.slice(0, 3).map((r) => (
            <button key={r.id} onClick={() => onSelect(r.id)} style={{ ['--c' as string]: CATS[4].color }}>
              {r.n} <b>{r.kind === 'incoming' ? `${r.etaH} h` : 'now'}</b>
            </button>
          ))}
        </div>
      )}
      <button className="to-rankings" onClick={onRankings}>
        See all rankings
      </button>
    </section>
  )
}

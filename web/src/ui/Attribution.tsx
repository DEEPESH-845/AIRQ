import type { Attribution as Att, District } from '../lib/world'

export const SOURCES: { key: keyof Att; label: string; color: string; note: string }[] = [
  { key: 'fire', label: 'Farm and forest fires', color: '#ff7a1a', note: 'Smoke carried here by the wind from fires detected by satellite.' },
  { key: 'vehicles', label: 'Vehicles', color: '#6f9bff', note: 'Exhaust and brake and tyre wear, strongest along arterial roads.' },
  { key: 'dust', label: 'Road and construction dust', color: '#d9bf8c', note: 'Resuspended road dust and building sites.' },
  { key: 'industry', label: 'Industry and power plants', color: '#b08cff', note: 'Factories, brick kilns and coal plants within about 150 km.' },
  { key: 'household', label: 'Waste and household burning', color: '#ff8fae', note: 'Open garbage fires and solid cooking fuel.' },
  { key: 'regional', label: 'Regional background', color: '#8c88a8', note: 'Aged pollution that has drifted in from far away.' },
]

/** Where this district's air is coming from: a model estimate, never presented as measured. */
export function Attribution({ d, onTrace }: { d: District; onTrace: () => void }) {
  const rows = SOURCES.map((s) => ({ ...s, v: d.att[s.key] })).sort((a, b) => b.v - a.v)
  const lead = rows[0]
  const cl = d.clusters[0]

  return (
    <section className="block" aria-labelledby="att-h">
      <h2 id="att-h">Where this air comes from</h2>
      <p className="lede">
        {lead.label} {lead.key === 'regional' ? 'makes up' : 'is the biggest source,'} about {Math.round(lead.v * 100)}% of today's
        pollution.
      </p>
      <div className="att-bar" role="img" aria-label={rows.map((r) => `${r.label} ${Math.round(r.v * 100)}%`).join(', ')}>
        {rows.map((r) => (
          <span key={r.key} style={{ flexGrow: r.v, background: r.color }} />
        ))}
      </div>
      <ul className="att-list">
        {rows.map((r) => (
          <li key={r.key} style={{ ['--c' as string]: r.color }}>
            <span className="sw" aria-hidden="true" />
            <span className="att-label">{r.label}</span>
            <b>{Math.round(r.v * 100)}%</b>
          </li>
        ))}
      </ul>
      {cl && cl.fires > 0 ? (
        <button className="trace" onClick={onTrace}>
          <span>
            <b>Trace the smoke</b>
            <small>
              {cl.fires} fire{cl.fires > 1 ? 's' : ''} near {cl.near} sat on this air's path in the last 36 hours
            </small>
          </span>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <p className="fine">No satellite fires sat on this air's path in the last 36 hours.</p>
      )}
      <p className="fine">
        Model estimate ({d.conf} confidence) from wind back-trajectories, NASA FIRMS fires and regional emission profiles, tuned to
        IITM's daily Delhi stubble estimate. Not a measurement.
      </p>
    </section>
  )
}

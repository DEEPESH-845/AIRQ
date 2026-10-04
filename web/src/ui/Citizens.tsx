import { useEffect, useState } from 'react'
import { actionLabel, useFeed } from '../lib/account'

const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60e3))
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** One line for the national readout: this week's verified actions, with the latest ones rotating. */
export function CitizenTicker({ onOpen }: { onOpen: () => void }) {
  const feed = useFeed()
  const [i, setI] = useState(0)
  const items = feed?.recent ?? []
  useEffect(() => {
    if (items.length < 2) return
    const t = setInterval(() => setI((k) => k + 1), 4000)
    return () => clearInterval(t)
  }, [items.length])
  if (!feed) return null
  const r = items.length ? items[i % items.length] : null
  return (
    <button className="ticker" onClick={onOpen}>
      <span className="ticker-dot" aria-hidden="true" />
      <span>
        <b>{feed.total}</b> verified green action{feed.total === 1 ? '' : 's'} this week
        {r ? (
          <small key={r.at}>
            {r.name} · {actionLabel(r.action).toLowerCase()} · {r.dn} · {ago(r.at)}
          </small>
        ) : (
          <small>Be the first: prove a green action and light up your district.</small>
        )}
      </span>
    </button>
  )
}

/** Battle tab: what players in this district did this week. */
export function CitizensHere({ district, name, onEarn }: { district: string; name: string; onEarn: () => void }) {
  const feed = useFeed()
  const n = feed?.byDistrict[district] ?? 0
  const here = (feed?.recent ?? []).filter((r) => r.d === district).slice(0, 3)
  return (
    <section className="block citizens" aria-labelledby="cit-h">
      <h2 id="cit-h">Citizens fighting back</h2>
      <p className="lede">
        {n ? (
          <>
            <b>{n}</b> verified green action{n === 1 ? '' : 's'} in {name} this week.
          </>
        ) : (
          <>No verified actions in {name} yet this week. Be the first to light it up on the map.</>
        )}
      </p>
      {here.length > 0 && (
        <ul className="proof-list">
          {here.map((r) => (
            <li key={r.at} data-ok="true">
              <span>
                {r.name}
                <small>
                  {actionLabel(r.action)} · {ago(r.at)}
                </small>
              </span>
              <b>✓</b>
            </li>
          ))}
        </ul>
      )}
      <button className="secondary-btn" onClick={onEarn}>
        Prove a green action
      </button>
    </section>
  )
}

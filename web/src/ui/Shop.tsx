import { useState } from 'react'
import { ECO, buy, equip, type Item, type Me } from '../lib/account'

const SHELVES: { kind: string; title: string; note: string }[] = [
  { kind: 'goodie', title: 'Goodies', note: 'Real things for real action.' },
  { kind: 'boost', title: 'Boosts', note: 'Make your next actions count for more.' },
  { kind: 'title', title: 'Titles', note: 'Shown beside your callsign on the leaderboard.' },
]

/** Spend credits. Goodies unlock after a few verified actions and go through a human check. */
export function Shop({ me, onEarn }: { me: Me; onEarn: () => void }) {
  const [confirm, setConfirm] = useState<Item | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; warn?: boolean } | null>(null)
  const locked = me.n < ECO.goodiesUnlock

  const purchase = async (it: Item) => {
    setBusy(true)
    setMsg(null)
    try {
      await buy(it.id)
      setMsg({ text: it.kind === 'goodie' ? `Claimed ${it.label}. Your code is below.` : `${it.label} is yours.` })
      setConfirm(null)
    } catch (e) {
      setMsg({ text: (e as Error).message, warn: true })
    } finally {
      setBusy(false)
    }
  }
  const owned = (it: Item) => (it.kind === 'title' ? me.titles.includes(it.id) : it.kind === 'boost' ? `${me.inv[it.id as 'boost' | 'shield'] ?? 0} held` : null)

  return (
    <div className="shop" data-mission="shop">
      <p className="fine">
        You have <b>{me.cr} credits</b>. Earn more by proving green actions; streaks and the frontline bonus multiply them.{' '}
        <button className="linkish inline" onClick={onEarn}>
          Earn credits
        </button>
      </p>
      {msg && (
        <p className={`fine${msg.warn ? ' warn' : ''}`} role="status">
          {msg.text}
        </p>
      )}
      {SHELVES.map((sh) => (
        <section key={sh.kind} className="block" aria-labelledby={`sh-${sh.kind}`}>
          <h2 id={`sh-${sh.kind}`}>{sh.title}</h2>
          <p className="fine shelf-note">
            {sh.kind === 'goodie' && locked ? `Unlocks after ${ECO.goodiesUnlock} verified green actions (${me.n}/${ECO.goodiesUnlock}).` : sh.note}
          </p>
          <ul className="items">
            {ECO.shop
              .filter((it) => it.kind === sh.kind)
              .map((it) => {
                const has = owned(it)
                const cant = me.cr < it.cost || (it.kind === 'goodie' && locked) || has === true
                return (
                  <li key={it.id}>
                    <span>
                      {it.label}
                      <small>{it.desc}</small>
                      {typeof has === 'string' && <small>{has}</small>}
                    </span>
                    {has === true ? (
                      <button className="buy" aria-pressed={me.title === it.label} onClick={() => equip(me.title === it.label ? '' : it.id).catch(() => {})}>
                        {me.title === it.label ? 'Wearing' : 'Wear'}
                      </button>
                    ) : (
                      <button className="buy" disabled={cant || busy} onClick={() => (it.kind === 'goodie' ? setConfirm(it) : purchase(it))}>
                        {it.cost}
                      </button>
                    )}
                  </li>
                )
              })}
          </ul>
          {sh.kind === 'goodie' && confirm && (
            <div className="confirm" role="alertdialog" aria-labelledby="cf-h">
              <p id="cf-h">
                <b>
                  Claim {confirm.label} for {confirm.cost} credits?
                </b>
              </p>
              <p className="fine">
                AIRQ is a pilot. A person reviews every claim and your proofs before a partner NGO or sponsor fulfils it, and partners are still being onboarded,
                so delivery isn't guaranteed yet. If a claim is turned down, its credits come back.
              </p>
              <div className="intro-actions">
                <button onClick={() => setConfirm(null)}>Cancel</button>
                <button className="primary" disabled={busy} onClick={() => purchase(confirm)}>
                  Claim
                </button>
              </div>
            </div>
          )}
        </section>
      ))}
      {me.claims.length > 0 && (
        <section className="block" aria-labelledby="claims-h">
          <h2 id="claims-h">Your claims</h2>
          <ul className="items">
            {me.claims.map((c) => (
              <li key={c.code}>
                <span>
                  {c.label}
                  <small>
                    <code>{c.code}</code> · {c.status === 'review' ? 'Under review' : c.status === 'ready' ? 'Ready to collect' : 'Delivered'}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

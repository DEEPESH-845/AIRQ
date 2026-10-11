import { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { ECO, buy, equip, type Claim, type Item, type Me } from '../lib/account'

const SHELVES: { kind: string; title: string; note: string }[] = [
  { kind: 'goodie', title: 'Goodies', note: 'Real things for real action.' },
  { kind: 'boost', title: 'Boosts', note: 'Make your next actions count for more.' },
  { kind: 'title', title: 'Titles', note: 'Shown beside your callsign on the leaderboard.' },
]
const BOOST_MAX = 2 // mirrors buy() in infra/player/app.py
const STATUS: Record<Claim['status'], string> = { review: 'Under review', ready: 'Approved: show the code to collect', done: 'Delivered', refunded: 'Turned down, credits refunded' }

/** Spend credits. Goodies unlock after a few verified actions and go through a human check. */
export function Shop({ me, onEarn }: { me: Me; onEarn: () => void }) {
  const [confirm, setConfirm] = useState<Item | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; warn?: boolean } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const locked = me.n < ECO.goodiesUnlock && !me.demo

  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await f()
      setMsg({ text: ok })
      setConfirm(null)
    } catch (e) {
      setMsg({ text: (e as Error).message, warn: true })
    } finally {
      setBusy(false)
    }
  }
  const purchase = (it: Item) =>
    run(() => buy(it.id), it.kind === 'goodie' ? `Claimed ${it.label}. A reviewer checks it next; its code is under Your claims.` : it.kind === 'title' ? `${it.label} is yours and you're wearing it.` : `${it.label} is ready: it's used on your next verified action.`)
  const held = (it: Item) => me.inv[it.id as 'boost' | 'shield'] ?? 0

  return (
    <div className="shop" data-mission="shop">
      <p className="fine">
        You have <b>{me.cr} credits</b>. Earn more by proving green actions; streaks and the frontline bonus multiply them.{' '}
        <button className="linkish inline" onClick={onEarn}>
          Earn credits
        </button>
      </p>
      {msg && (
        <p className={`fine shop-msg${msg.warn ? ' warn' : ''}`} role="status">
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
                const owned = it.kind === 'title' && me.titles.includes(it.id)
                const full = it.kind === 'boost' && held(it) >= BOOST_MAX
                const pending = it.kind === 'goodie' && me.claims.some((c) => c.item === it.id && c.status === 'review')
                const short = it.cost - me.cr
                const why = pending ? 'Claim under review' : full ? `You hold the most (${BOOST_MAX})` : it.kind === 'goodie' && locked ? 'Locked' : short > 0 ? `${short} more credits` : ''
                return (
                  <li key={it.id}>
                    <span>
                      {it.label}
                      <small>{it.desc}</small>
                      {it.kind === 'boost' && held(it) > 0 && <small>{held(it)} held</small>}
                      {why && !owned && <small className="why">{why}</small>}
                    </span>
                    {owned ? (
                      <button
                        className="buy"
                        aria-pressed={me.title === it.label}
                        disabled={busy}
                        onClick={() => (me.title === it.label ? run(() => equip(''), 'Title taken off.') : run(() => equip(it.id), `Now wearing ${it.label}.`))}
                      >
                        {me.title === it.label ? 'Wearing' : 'Wear'}
                      </button>
                    ) : (
                      <button className="buy" disabled={!!why || busy} aria-label={`${it.label}, ${it.cost} credits`} onClick={() => (it.kind === 'goodie' ? setConfirm(it) : purchase(it))}>
                        {pending ? 'Claimed' : it.cost}
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
                {me.demo
                  ? 'This is a demo account: the claim goes to the real reviewer queue marked DEMO, and nothing is shipped.'
                  : "AIRQ is a pilot. A person checks every claim and your proofs before a partner NGO or sponsor fulfils it, and partners are still being onboarded, so delivery isn't guaranteed yet. If a claim is turned down, the reviewer refunds its credits."}
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
          <ul className="items claims">
            {[...me.claims].reverse().map((c) => (
              <li key={c.code} data-status={c.status}>
                <span>
                  {c.label}
                  <small>
                    <code>{c.code}</code> · <span className="claim-status">{STATUS[c.status]}</span>
                  </small>
                </span>
                {c.status === 'ready' && (
                  <button className="buy" aria-expanded={open === c.code} onClick={() => setOpen(open === c.code ? null : c.code)}>
                    {open === c.code ? 'Hide' : 'Collect'}
                  </button>
                )}
                {c.status === 'ready' && open === c.code && <Collect code={c.code} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** The pickup pass: the claim code as large text and a QR the partner scans or reads out. */
function Collect({ code }: { code: string }) {
  const qr = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(code)
    q.make()
    return q
  }, [code])
  const n = qr.getModuleCount()
  const cells: string[] = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) cells.push(`M${x} ${y}h1v1h-1z`)
  return (
    <div className="collect">
      <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={`QR code for claim ${code}`}>
        <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
        <path d={cells.join('')} fill="#111" />
      </svg>
      <p>
        <b>{code}</b>
        <small>Show this at the pickup point or to the partner volunteer. They mark it delivered.</small>
      </p>
    </div>
  )
}

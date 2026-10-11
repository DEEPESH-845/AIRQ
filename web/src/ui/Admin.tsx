import { useEffect, useState } from 'react'
import { actionLabel, fetchDesk, type Desk, type QueuedClaim } from '../lib/account'

const KEY = 'airq.reviewer'
const when = (s: number | string) =>
  new Date(typeof s === 'number' ? s * 1000 : s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const STATUS = { review: 'Needs review', ready: 'Approved, awaiting pickup', done: 'Delivered', refunded: 'Refunded' }
const read = () => {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** The reviewer's desk at /?admin: every goodie claim with the claimant's recent proof photos; approve, deliver or refund. */
export default function Admin() {
  const [key, setKey] = useState(read)
  const [draft, setDraft] = useState('')
  const [desk, setDesk] = useState<Desk | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [all, setAll] = useState(false)
  const [q, setQ] = useState('')

  const load = async (k: string, review?: Parameters<typeof fetchDesk>[1]) => {
    try {
      const d = await fetchDesk(k, review)
      setErr('')
      setDesk(d)
      setKey(k)
      try {
        sessionStorage.setItem(KEY, k) // this tab only: closing it signs the reviewer out
      } catch {
        /* storage blocked: sign in again next time */
      }
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 401) {
        setKey('')
        setDesk(null)
      }
      setErr((e as Error).message)
    }
  }
  useEffect(() => {
    document.title = 'AIRQ reviewer desk'
    if (!key) return
    fetchDesk(key).then(setDesk, (e: Error & { status?: number }) => (e.status === 401 ? setKey('') : setErr(e.message))) // a stale key: back to sign-in
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once, with the key saved in this tab

  const act = async (c: QueuedClaim, status: 'ready' | 'done' | 'refund') => {
    if (status === 'refund' && !confirm(`Turn down ${c.code} and refund ${c.cost ?? ''} credits to ${c.name}?`)) return
    setBusy(c.code)
    await load(key, { pid: c.pid, code: c.code, status })
    setBusy('')
  }

  if (!key || !desk)
    return (
      <main className="admin">
        <form
          className="admin-login"
          onSubmit={(e) => {
            e.preventDefault()
            void load(draft.trim())
          }}
        >
          <h1>Reviewer desk</h1>
          <p className="fine">Goodie claims wait here for a person to check the player's proofs. Enter the reviewer key.</p>
          <input type="password" autoComplete="current-password" aria-label="Reviewer key" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <button className="primary-btn" disabled={!draft.trim()}>
            Open the desk
          </button>
          {err && (
            <p className="fine warn" role="alert">
              {err}
            </p>
          )}
          <a className="linkish" href="/">
            Back to AIRQ
          </a>
        </form>
      </main>
    )

  const needle = q.trim().toUpperCase()
  const shown = desk.claims.filter((c) => (all || c.status === 'review' || c.status === 'ready') && (!needle || c.code.includes(needle) || c.name.toUpperCase().includes(needle)))
  const open = desk.claims.filter((c) => c.status === 'review').length
  return (
    <main className="admin">
      <header className="admin-head">
        <div>
          <h1>Reviewer desk</h1>
          <p className="fine">
            {open} to review · {desk.claims.filter((c) => c.status === 'ready').length} awaiting pickup · {desk.claims.length} claims in all
          </p>
        </div>
        <div className="admin-tools">
          <input type="search" placeholder="Claim code or callsign" aria-label="Find a claim" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="fine">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show closed
          </label>
          <button className="secondary-btn" onClick={() => load(key)}>
            Refresh
          </button>
          <button
            className="linkish"
            onClick={() => {
              try {
                sessionStorage.removeItem(KEY)
              } catch {
                /* nothing saved */
              }
              setKey('')
              setDesk(null)
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {err && (
        <p className="fine warn" role="alert">
          {err}
        </p>
      )}
      {!shown.length && <p className="fine">{needle ? 'No claim matches.' : 'Nothing waiting. New claims appear here.'}</p>}
      <ul className="desk">
        {shown.map((c) => (
          <li key={c.code} className="claim-card" data-status={c.status}>
            <div className="claim-top">
              <div>
                <h2>
                  {c.label} <code>{c.code}</code>
                  {c.demo && <em className="demo-tag">DEMO</em>}
                </h2>
                <p className="fine">
                  {c.name} · {c.where} · {c.n} verified actions · claimed {when(c.at)}
                  {c.cost ? ` · ${c.cost} credits` : ''}
                </p>
              </div>
              <span className="claim-pill">{STATUS[c.status]}</span>
            </div>
            {desk.proofs[c.pid] && (
              <ul className="proof-strip" aria-label={`${c.name}'s recent proofs`}>
                {desk.proofs[c.pid].map((p) => (
                  <li key={p.at} data-ok={p.ok}>
                    <a href={p.photo} target="_blank" rel="noreferrer">
                      <img src={p.photo} alt={`Proof: ${actionLabel(p.action)}`} loading="lazy" />
                    </a>
                    <small>
                      <b>{p.ok ? `+${p.credits}` : 'Rejected'}</b> {actionLabel(p.action)}
                    </small>
                    <small title={p.reason}>{when(p.at)}</small>
                  </li>
                ))}
                {!desk.proofs[c.pid].length && <li className="fine">No photo proofs on record.</li>}
              </ul>
            )}
            {(c.status === 'review' || c.status === 'ready') && (
              <div className="claim-actions">
                {c.status === 'review' ? (
                  <button className="primary-btn" disabled={!!busy} onClick={() => act(c, 'ready')}>
                    Approve
                  </button>
                ) : (
                  <button className="primary-btn" disabled={!!busy} onClick={() => act(c, 'done')}>
                    Mark delivered
                  </button>
                )}
                <button className="secondary-btn" disabled={!!busy} onClick={() => act(c, 'refund')}>
                  Turn down and refund
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}

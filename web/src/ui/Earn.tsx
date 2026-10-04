import { useEffect, useState } from 'react'
import type { World } from '../lib/world'
import { catOf } from '../lib/naqi'
import { ECO, actionLabel as label, deleteAccount, estimate, frontline, getChallenge, refreshFeed, streakIfActNow, submitProof, useAccount, type Me, type Receipt } from '../lib/account'
import { Camera } from './Camera'
import { FireWatch, type Pick } from './FireWatch'

// what the server checks, shown while it works (the order it runs them in)
const CHECKS = ['Photo decoded and re-encoded, location data removed', 'Fingerprint: never used before, not even a resized copy', 'Not a screen, print or AI image', 'One-time code read from the photo', 'Shows the action you picked']
const x = (n: number) => `×${Number(n.toFixed(2))}`

/** Pick a green action, photograph it, and let Nova Lite check it. Credits arrive on approval. */
export function Earn({ world, me, pick: fieldPick, onPickField, onShowField, onCert }: { world: World; me: Me; pick: Pick | null; onPickField: () => void; onShowField: () => void; onCert: () => void }) {
  const { proofs } = useAccount()
  const home = world.districts.find((d) => d.id === me.d)
  const aqi = home?.aqi ?? 0
  const [now] = useState(() => Date.now())
  const weeks = streakIfActNow(me, now)
  const [pick, setPick] = useState<string | null>(null)
  const [photo, setPhoto] = useState<{ b64: string; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; reason: string; receipt: Receipt | null } | null>(null)
  const [err, setErr] = useState('')
  const [code, setCode] = useState<{ code: string; exp: number; action: string } | null>(null)
  const [step, setStep] = useState(0)
  const action = ECO.actions.find((a) => a.id === pick)
  const needsCode = !!action?.challenge
  const liveCode = code && code.action === pick && code.exp * 1000 > Date.now() ? code.code : undefined
  const left = ECO.dailyProofs - me.pt
  const boost = (me.inv.boost ?? 0) > 0

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])
  // walk the checklist while the server works; it stops on the last step until the answer lands
  useEffect(() => {
    if (!busy) return
    setStep(0)
    const t = setInterval(() => setStep((k) => Math.min(k + 1, CHECKS.length - 1)), 900)
    return () => clearInterval(t)
  }, [busy])

  const choose = (id: string) => {
    setPick(id)
    setPhoto(null)
    setResult(null)
    setErr('')
  }
  const fetchCode = async () => {
    if (!action) return
    setErr('')
    try {
      const c = await getChallenge(action.id)
      setCode({ ...c, action: action.id })
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const send = async () => {
    if (!action || !photo || busy) return
    setBusy(true)
    setErr('')
    try {
      const r = await submitProof(action.id, photo.b64)
      setResult(r)
      setPhoto(null)
      if (needsCode) setCode(null) // codes are single-use
      if (r.ok) void refreshFeed()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="earn">
      <div className="stat-row">
        <span>
          <b>{me.n}</b>
          <small>verified actions</small>
        </span>
        <span>
          <b>{me.streak && me.swk ? me.streak : 0}</b>
          <small>week eco-streak</small>
        </span>
        <span title={home ? `${home.n} is ${catOf(aqi).name} right now` : ''}>
          <b style={{ color: catOf(aqi).color }}>{x(frontline(aqi))}</b>
          <small>frontline bonus</small>
        </span>
      </div>
      <p className="fine">
        {frontline(aqi) > 1
          ? `${me.dn} is breathing ${catOf(aqi).name} air, so every action there pays ${x(frontline(aqi))}. Acting where the air is worst pays most.`
          : `Frontline bonus kicks in when ${me.dn} reaches Poor air or worse.`}{' '}
        {boost && <b>Double Credits is armed for your next action.</b>}
      </p>

      {result && (
        <div className="verdict-card" data-ok={result.ok} role="status">
          <b>{result.ok ? 'Verified' : 'Not verified'}</b>
          <p>{result.reason}</p>
          {result.receipt && (
            <p className="receipt">
              {result.receipt.base} base {x(result.receipt.frontline)} frontline {x(result.receipt.streak)} streak
              {result.receipt.boost > 1 ? ` ×2 boost` : ''}
              {result.receipt.mult < result.receipt.frontline * result.receipt.streak * result.receipt.boost ? ` (capped at ×${ECO.multiplierCap})` : ''}
              {result.receipt.first ? ` + ${result.receipt.first} first-time` : ''} = <b>+{result.receipt.credits} credits</b>, +{result.receipt.xp} XP
              {result.receipt.shield ? '. Your Streak Shield saved the streak.' : ''}
            </p>
          )}
        </div>
      )}

      <h2 className="sub">Prove a green action</h2>
      <p className="fine">{left > 0 ? `${left} of ${ECO.dailyProofs} proofs left today.` : 'No proofs left today. Come back tomorrow.'}</p>
      <ul className="actions" role="radiogroup" aria-label="Green action" data-mission="earn">
        {ECO.actions.map((a) => {
          const day = me.ad[a.id] ?? 0
          const week = me.aw[a.id] ?? 0
          const capped = day >= a.perDay || week >= a.perWeek
          const gain = estimate(a, aqi, weeks, !me.firsts.includes(a.id), boost)
          return (
            <li key={a.id}>
              <button role="radio" aria-checked={pick === a.id} disabled={capped || left <= 0} onClick={() => choose(a.id)}>
                <span>
                  {a.label}
                  {a.challenge && <em className="code-chip">code</em>}
                  <small>{capped ? (week >= a.perWeek ? 'Weekly limit reached' : 'Done for today') : `${a.perDay - day} left today${a.perWeek < 7 ? `, ${a.perWeek}/week` : ''}${me.firsts.includes(a.id) ? '' : `, incl. +${ECO.firstBonus} first-time bonus`}`}</small>
                </span>
                <b>+{gain}</b>
              </button>
            </li>
          )
        })}
      </ul>

      {action && (
        <div className="proof-form">
          <p className="lede">
            <b>Photo needed:</b> {action.photo}. <small>{action.why}</small>
          </p>
          {needsCode && !liveCode && !busy ? (
            <div className="code-gate">
              <p>
                High-value actions carry a <b>one-time code</b>. Write it by hand on paper and keep it in the photo: it proves the photo was taken just now,
                for AIRQ.
              </p>
              <button className="primary-btn" onClick={fetchCode}>
                Get my one-time code
              </button>
            </div>
          ) : busy ? (
            <ol className="checks" aria-live="polite">
              {CHECKS.filter((_, k) => needsCode || k !== 3).map((c, k) => (
                <li key={c} data-state={k < step ? 'done' : k === step ? 'run' : 'wait'}>
                  {c}
                </li>
              ))}
            </ol>
          ) : photo ? (
            <>
              <img className="shot" src={photo.url} alt="Your proof photo" />
              <div className="shot-actions">
                <button className="linkish" onClick={() => setPhoto(null)}>
                  Retake
                </button>
                <button className="primary-btn" onClick={send}>
                  Send for verification
                </button>
              </div>
            </>
          ) : (
            <>
              {liveCode && (
                <p className="code-big" aria-live="polite">
                  Your code <b>{liveCode}</b> <small>valid 15 minutes, one photo</small>
                </p>
              )}
              <Camera key={pick} code={liveCode} onShot={(b64, url) => setPhoto({ b64, url })} />
            </>
          )}
          <p className="fine">
            Every photo goes through five checks on our server: re-encoding, fingerprint, screen and AI-image detection, the code, and the action itself (Amazon Nova AI). Photos are stored privately for 90 days for audit, never shown
            publicly; location data is removed. Avoid faces and number plates.
          </p>
        </div>
      )}
      {err && <p className="fine warn">{err}</p>}

      <FireWatch world={world} me={me} pick={fieldPick} onPick={onPickField} onShow={onShowField} />

      <section className="block cert-cta" aria-labelledby="cert-h">
        <h2 id="cert-h">Impact certificate</h2>
        <p className="fine">A signed record of everything you've verified, with a QR code anyone, including a city office, can scan to check it's genuine.</p>
        <button className="secondary-btn" onClick={onCert} disabled={me.n < 1 && !me.field?.clean}>
          {me.n < 1 && !me.field?.clean ? 'Unlocks with your first verified action' : 'Issue my certificate'}
        </button>
      </section>

      {proofs.length > 0 && (
        <section className="block" aria-labelledby="proofs-h">
          <h2 id="proofs-h">Recent proofs</h2>
          <ul className="proof-list">
            {proofs.map((p) => (
              <li key={p.sk} data-ok={p.ok}>
                <span>
                  {label(p.action)}
                  <small>{p.reason}</small>
                </span>
                <b>{p.ok ? `+${p.credits}` : '✗'}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="gloss account">
        <summary>Your account</summary>
        <p>
          Callsign <b>{me.name}</b>, home {me.dn}, {me.s}. {me.eco} XP from verified actions.
        </p>
        <button
          className="linkish"
          onClick={async () => {
            if (confirm('Delete your AIRQ account, credits, claims and proof photos? This cannot be undone.')) {
              try {
                await deleteAccount()
              } catch (e) {
                setErr((e as Error).message)
              }
            }
          }}
        >
          Delete my account and photos
        </button>
      </details>
    </div>
  )
}

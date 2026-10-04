import { useEffect, useRef, useState } from 'react'
import type { World } from '../lib/world'
import { catOf } from '../lib/naqi'
import { ECO, deleteAccount, estimate, frontline, shrink, streakIfActNow, submitProof, useAccount, type Me, type Receipt } from '../lib/account'

const label = (id: string) => ECO.actions.find((a) => a.id === id)?.label ?? id
const x = (n: number) => `×${Number(n.toFixed(2))}`

/** Pick a green action, photograph it, and let Nova Lite check it. Credits arrive on approval. */
export function Earn({ world, me }: { world: World; me: Me }) {
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
  const file = useRef<HTMLInputElement>(null)
  const action = ECO.actions.find((a) => a.id === pick)
  const left = ECO.dailyProofs - me.pt
  const boost = (me.inv.boost ?? 0) > 0

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])

  const choose = async (f: File | undefined) => {
    setErr('')
    setResult(null)
    if (!f) return
    try {
      setPhoto({ b64: await shrink(f), url: URL.createObjectURL(f) })
    } catch {
      setErr("This browser couldn't read that photo. Try a JPEG or PNG.")
    }
  }
  const send = async () => {
    if (!action || !photo || busy) return
    setBusy(true)
    setErr('')
    try {
      setResult(await submitProof(action.id, photo.b64))
      setPhoto(null)
      if (file.current) file.current.value = ''
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
              <button role="radio" aria-checked={pick === a.id} disabled={capped || left <= 0} onClick={() => setPick(a.id)}>
                <span>
                  {a.label}
                  <small>{capped ? (week >= a.perWeek ? 'Weekly limit reached' : 'Done for today') : `${a.perDay - day} left today${a.perWeek < 7 ? `, ${a.perWeek}/week` : ''}`}</small>
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
          <label className="photo-pick">
            <input ref={file} type="file" accept="image/*" capture="environment" onChange={(e) => choose(e.target.files?.[0])} />
            {photo ? <img src={photo.url} alt="Your proof photo" /> : <span>Take or choose a photo</span>}
          </label>
          <button className="primary-btn" disabled={!photo || busy} onClick={send}>
            {busy ? 'Checking your photo…' : `Send for verification`}
          </button>
          <p className="fine">
            Take a fresh photo: screenshots, stock images and re-used photos are rejected. Photos are checked by Amazon Nova AI, stored privately for 90 days for
            audit, never shown publicly. Location data is removed before upload. Avoid faces and number plates.
          </p>
        </div>
      )}
      {err && <p className="fine warn">{err}</p>}

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

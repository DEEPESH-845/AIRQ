import { useState } from 'react'
import type { World } from '../lib/world'
import { ECO, checkField, registerField, type FieldResult, type Me } from '../lib/account'

export type Pick = { lon: number; lat: number }
const FW = ECO.fieldWatch

/** Satellite Fire Watch: a farmer pins their field; every day NASA VIIRS sees no fire on it pays credits. No photo needed. */
export function FireWatch({ world, me, pick, onPick, onShow }: { world: World; me: Me; pick: Pick | null; onPick: () => void; onShow: () => void }) {
  const [acres, setAcres] = useState(5)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<FieldResult | null>(null)
  const f = me.field
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
  // fires the satellites saw in the last 24 h within 25 km, for context (the server decides what counts)
  const near = f ? world.fires.filter((x) => x[3] <= 24 && dist(f.c, [x[0], x[1]]) <= 25).length : 0

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="block firewatch" aria-labelledby="fw-h" data-mission="firewatch">
      <h2 id="fw-h">
        Satellite Fire Watch <em className="code-chip sat">no photo</em>
      </h2>
      {!f ? (
        <>
          <p className="fine">
            For farmers in the stubble belt. Pin your field once. Every day NASA's VIIRS satellites see no fire on it, you earn <b>{FW.credits} credits</b>. A fire on
            the field pauses rewards for {FW.cooldownDays} days. Verified from space, nothing to fake.
          </p>
          {pick ? (
            <div className="fw-form">
              <p className="fine">
                Field at {pick.lat.toFixed(4)}° N, {pick.lon.toFixed(4)}° E{' '}
                <button className="linkish inline" onClick={onPick}>
                  move pin
                </button>
              </p>
              <label className="field">
                <span>Field size: {acres} acres</span>
                <input type="range" min={FW.acresMin} max={FW.acresMax} step={0.5} value={acres} onChange={(e) => setAcres(Number(e.target.value))} />
              </label>
              <button className="primary-btn" disabled={busy} onClick={() => run(() => registerField(pick.lon, pick.lat, acres))}>
                {busy ? 'Registering…' : 'Register my field'}
              </button>
              <p className="fine">The field is fixed once registered, so the satellite record stays honest.</p>
            </div>
          ) : (
            <button className="secondary-btn" onClick={onPick}>
              Pin my field on the map
            </button>
          )}
        </>
      ) : (
        <>
          <div className="fw-status">
            <span>
              <b>{f.clean}</b>
              <small>fire-free days verified</small>
            </span>
            <span>
              <b>{f.acres}</b>
              <small>acres near {f.dn}</small>
            </span>
            <span>
              <b style={{ color: near ? 'var(--ember)' : '#8fe3a8' }}>{near}</b>
              <small>fires within 25 km today</small>
            </span>
          </div>
          {res && (
            <p className={`fw-result ${res.status}`} role="status">
              {res.status === 'clean' && `Satellite check passed: no fire on your field in the last 24 h. +${res.receipt?.credits} credits (day ${res.receipt?.days}).`}
              {res.status === 'fire' && `VIIRS detected ${res.receipt?.fires} fire${res.receipt?.fires === 1 ? '' : 's'} on your field. Rewards pause for ${FW.cooldownDays} days.`}
              {res.status === 'cooldown' && `Paused after a fire on your field, until ${res.receipt?.until}.`}
              {res.status === 'done' && "Today's check is done. The satellites pass again tonight; check tomorrow."}
              {res.status === 'gap' && `No check for ${res.receipt?.hours} h, longer than the 60 h satellite record. Watch restarted today; check daily to keep earning.`}
            </p>
          )}
          <div className="shot-actions">
            <button className="linkish" onClick={onShow}>
              Show on map
            </button>
            <button className="primary-btn" disabled={busy || f.last === today} onClick={() => run(async () => setRes(await checkField()))}>
              {f.last === today ? 'Checked today' : busy ? 'Asking the satellites…' : "Run today's satellite check"}
            </button>
          </div>
        </>
      )}
      {err && <p className="fine warn">{err}</p>}
    </section>
  )
}

function dist(a: [number, number], b: [number, number]) {
  const dx = (b[0] - a[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
  return Math.hypot(dx, (b[1] - a[1]) * 110.57)
}

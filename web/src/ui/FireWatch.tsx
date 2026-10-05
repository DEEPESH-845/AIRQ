import { useState } from 'react'
import type { World } from '../lib/world'
import { ECO, checkField, eventMult, registerField, type FieldResult, type Me } from '../lib/account'
import { ShareButton } from './ShareButton'
import { useLang, useT } from '../lib/i18n'
import { useNow } from '../lib/now'

export type Pick = { lon: number; lat: number }
const FW = ECO.fieldWatch

/** Satellite Fire Watch: a farmer pins their field; every day NASA VIIRS sees no fire on it pays credits. No photo needed. */
export function FireWatch({ world, me, pick, onPick, onShow }: { world: World; me: Me; pick: Pick | null; onPick: () => void; onShow: () => void }) {
  const [acres, setAcres] = useState(5)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<FieldResult | null>(null)
  const t = useT()
  const lang = useLang()
  const f = me.field
  const now = useNow(60000)
  const today = new Date(now + 5.5 * 3600e3).toISOString().slice(0, 10)
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
    <section className="block firewatch" aria-labelledby="fw-h" data-mission="firewatch" lang={lang}>
      <h2 id="fw-h">
        {t('fw.title')} <em className="code-chip sat">{t('fw.nophoto')}</em>
      </h2>
      {!f ? (
        <>
          <p className="fine">{t('fw.intro', { credits: FW.credits * eventMult('fieldwatch'), days: FW.cooldownDays })}</p>
          {pick ? (
            <div className="fw-form">
              <p className="fine">
                {t('fw.at', { lat: pick.lat.toFixed(4), lon: pick.lon.toFixed(4) })}{' '}
                <button className="linkish inline" onClick={onPick}>
                  {t('fw.move')}
                </button>
              </p>
              <label className="field">
                <span>{t('fw.size', { n: acres })}</span>
                <input type="range" min={FW.acresMin} max={FW.acresMax} step={0.5} value={acres} onChange={(e) => setAcres(Number(e.target.value))} />
              </label>
              <button className="primary-btn" disabled={busy} onClick={() => run(() => registerField(pick.lon, pick.lat, acres))}>
                {busy ? t('fw.registering') : t('fw.register')}
              </button>
              <p className="fine">{t('fw.fixed')}</p>
            </div>
          ) : (
            <button className="secondary-btn" onClick={onPick}>
              {t('fw.pin')}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="fw-status">
            <span>
              <b>{f.clean}</b>
              <small>{t('fw.days')}</small>
            </span>
            <span>
              <b>{f.acres}</b>
              <small>{t('fw.acres', { d: f.dn })}</small>
            </span>
            <span>
              <b style={{ color: near ? 'var(--ember)' : '#8fe3a8' }}>{near}</b>
              <small>{t('fw.near')}</small>
            </span>
          </div>
          {res && (
            <p className={`fw-result ${res.status}`} role="status">
              {res.status === 'clean' && t('fw.clean', { c: res.receipt?.credits ?? 0, d: res.receipt?.days ?? 0 })}
              {res.status === 'fire' && t('fw.fire', { n: res.receipt?.fires ?? 0, d: FW.cooldownDays })}
              {res.status === 'cooldown' && t('fw.cooldown', { date: res.receipt?.until ?? '' })}
              {res.status === 'done' && t('fw.done')}
              {res.status === 'gap' && t('fw.gap', { h: res.receipt?.hours ?? 0 })}
            </p>
          )}
          {f.last_ts ? (
            <p className="fine">
              {t('fw.last', { when: new Date(f.last_ts * 1000).toLocaleString(lang === 'en' ? 'en-IN' : `${lang}-IN`, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) })}
            </p>
          ) : null}
          {f.clean > 0 && (
            <ShareButton
              world={world}
              label={t('fw.share')}
              text={`My field has stayed fire-free for ${f.clean} day${f.clean === 1 ? '' : 's'}, verified from space on AIRQ. No stubble burning here.`}
              card={() => ({
                stat: String(f.clean),
                label: f.clean === 1 ? 'fire-free day on my field' : 'fire-free days on my field',
                proof: 'Verified by NASA VIIRS satellites',
                name: me.name,
                where: `${f.acres} acres near ${f.dn}`,
                district: f.d,
                url: `${location.origin}/?d=${f.d}`,
                qrCaption: 'Join me on AIRQ',
              })}
            />
          )}
          <div className="shot-actions">
            <button className="linkish" onClick={onShow}>
              {t('fw.show')}
            </button>
            <button className="primary-btn" disabled={busy || f.last === today} onClick={() => run(async () => setRes(await checkField()))}>
              {f.last === today ? t('fw.checked') : busy ? t('fw.asking') : t('fw.run')}
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

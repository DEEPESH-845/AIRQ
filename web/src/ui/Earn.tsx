import { useEffect, useState } from 'react'
import type { World } from '../lib/world'
import { catOf } from '../lib/naqi'
import { ECO, activeEvents, actionLabel as label, deleteAccount, estimate, frontline, getChallenge, refreshFeed, streakIfActNow, submitProof, useAccount, type Me, type Receipt } from '../lib/account'
import { Camera } from './Camera'
import { useNow } from '../lib/now'
import { FireWatch, type Pick } from './FireWatch'
import { ShareButton } from './ShareButton'
import { LANGS, actionText, setLang, useLang, useT, type Key } from '../lib/i18n'

// what the server checks, shown while it works (the order it runs them in)
const CHECKS: Key[] = ['check.1', 'check.2', 'check.3', 'check.4', 'check.5']

/** EN / हिंदी / ਪੰਜਾਬੀ for the Earn and Fire Watch screens. */
export function LangPicker() {
  const l = useLang()
  return (
    <div className="seg lang" role="radiogroup" aria-label="Language">
      {LANGS.map(([id, name]) => (
        <button key={id} role="radio" aria-checked={l === id} lang={id} onClick={() => setLang(id)}>
          {name}
        </button>
      ))}
    </div>
  )
}
const x = (n: number) => `×${Number(n.toFixed(2))}`

/** Pick a green action, photograph it, and let Nova Lite check it. Credits arrive on approval. */
export function Earn({ world, me, pick: fieldPick, onPickField, onShowField, onCert }: { world: World; me: Me; pick: Pick | null; onPickField: () => void; onShowField: () => void; onCert: () => void }) {
  const { proofs } = useAccount()
  const t = useT()
  const lang = useLang()
  const home = world.districts.find((d) => d.id === me.d)
  const aqi = home?.aqi ?? 0
  const now = useNow(15000)
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
  const liveCode = code && code.action === pick && code.exp * 1000 > now ? code.code : undefined
  const left = ECO.dailyProofs - me.pt
  const boost = (me.inv.boost ?? 0) > 0

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])
  // walk the checklist while the server works; it stops on the last step until the answer lands
  useEffect(() => {
    if (!busy) return
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
    setStep(0)
    setBusy(true)
    setErr('')
    try {
      const r = await submitProof(action.id, photo.b64, lang)
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
    <div className="earn" lang={lang}>
      <LangPicker />
      {activeEvents().map((e) => (
        <p key={e.id} className="event-banner">
          <b>{t(`evl.${e.id}` as Key)}</b>
          {t(`ev.${e.id}` as Key)}
        </p>
      ))}
      <div className="stat-row">
        <span>
          <b>{me.n}</b>
          <small>{t('earn.verified')}</small>
        </span>
        <span>
          <b>{me.streak && me.swk ? me.streak : 0}</b>
          <small>{t('earn.streak')}</small>
        </span>
        <span title={home ? `${home.n} is ${catOf(aqi).name} right now` : ''}>
          <b style={{ color: catOf(aqi).color }}>{x(frontline(aqi))}</b>
          <small>{t('earn.frontline')}</small>
        </span>
      </div>
      <p className="fine">
        {frontline(aqi) > 1 ? t('earn.frontOn', { district: me.dn, band: catOf(aqi).name, mult: x(frontline(aqi)) }) : t('earn.frontOff', { district: me.dn })}{' '}
        {boost && <b>{t('earn.boost')}</b>}
      </p>

      {result && (
        <div className="verdict-card" data-ok={result.ok} role="status">
          <b>{result.ok ? t('earn.ok') : t('earn.no')}</b>
          <p>{result.reason}</p>
          {result.receipt && (
            <p className="receipt">
              {result.receipt.base} {t('r.base')} {x(result.receipt.frontline)} {t('r.frontline')} {x(result.receipt.streak)} {t('r.streak')}
              {result.receipt.boost > 1 ? ` ×2 ${t('r.boost')}` : ''}
              {(result.receipt.event ?? 1) > 1 ? ` ×${result.receipt.event} ${t('r.event')}` : ''}
              {result.receipt.mult < result.receipt.frontline * result.receipt.streak * result.receipt.boost * (result.receipt.event ?? 1) ? ` (${t('r.capped')} ×${ECO.multiplierCap})` : ''}
              {result.receipt.first ? ` + ${result.receipt.first} ${t('r.first')}` : ''} ={' '}
              <b>
                +{result.receipt.credits} {t('r.credits')}
              </b>
              , +{result.receipt.xp} XP
              {result.receipt.shield ? `. ${t('r.shield')}` : ''}
            </p>
          )}
          {result.ok && (
            <ShareButton
              world={world}
              label={t('earn.share')}
              text={`I just did something real for India's air: ${me.n} verified green action${me.n === 1 ? '' : 's'} on AIRQ.`}
              card={() => ({
                stat: String(me.n),
                label: me.n === 1 ? 'verified green action' : 'verified green actions',
                proof: 'Photo-verified by AI, with a one-time code',
                name: me.name,
                where: `${me.dn}, ${me.s}`,
                district: me.d,
                url: `${location.origin}/?d=${me.d}`,
                qrCaption: 'Join me on AIRQ',
              })}
            />
          )}
        </div>
      )}

      <h2 className="sub">{t('earn.title')}</h2>
      <p className="fine">{left > 0 ? t('earn.left', { left, total: ECO.dailyProofs }) : t('earn.none')}</p>
      <ul className="actions" role="radiogroup" aria-label="Green action" data-mission="earn">
        {ECO.actions.map((a) => {
          const day = me.ad[a.id] ?? 0
          const week = me.aw[a.id] ?? 0
          const capped = day >= a.perDay || week >= a.perWeek
          const gain = estimate(a, aqi, weeks, !me.firsts.includes(a.id), boost)
          const tx = actionText(a, lang)
          const note = [t('earn.leftToday', { n: a.perDay - day }), a.perWeek < 7 ? t('earn.perWeek', { n: a.perWeek }) : '', me.firsts.includes(a.id) ? '' : t('earn.firstIncl', { n: ECO.firstBonus })]
            .filter(Boolean)
            .join(', ')
          return (
            <li key={a.id}>
              <button role="radio" aria-checked={pick === a.id} disabled={capped || left <= 0} onClick={() => choose(a.id)}>
                <span>
                  {tx.label}
                  {a.challenge && <em className="code-chip">{t('earn.code')}</em>}
                  <small>{capped ? (week >= a.perWeek ? t('earn.weekly') : t('earn.doneToday')) : note}</small>
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
            <b>{t('earn.photoNeeded')}</b> {actionText(action, lang).photo}. <small>{actionText(action, lang).why}</small>
          </p>
          {needsCode && !liveCode && !busy ? (
            <div className="code-gate">
              <p>{t('earn.gate')}</p>
              <button className="primary-btn" onClick={fetchCode}>
                {t('earn.getCode')}
              </button>
            </div>
          ) : busy ? (
            <ol className="checks" aria-live="polite">
              {CHECKS.filter((_, k) => needsCode || k !== 3).map((c, k) => (
                <li key={c} data-state={k < step ? 'done' : k === step ? 'run' : 'wait'}>
                  {t(c)}
                </li>
              ))}
            </ol>
          ) : photo ? (
            <>
              <img className="shot" src={photo.url} alt="Your proof photo" />
              <div className="shot-actions">
                <button className="linkish" onClick={() => setPhoto(null)}>
                  {t('earn.retake')}
                </button>
                <button className="primary-btn" onClick={send}>
                  {t('earn.send')}
                </button>
              </div>
            </>
          ) : (
            <>
              {liveCode && (
                <p className="code-big" aria-live="polite">
                  {t('earn.yourCode')} <b>{liveCode}</b> <small>{t('earn.valid')}</small>
                </p>
              )}
              <Camera key={pick} code={liveCode} onShot={(b64, url) => setPhoto({ b64, url })} />
            </>
          )}
          <p className="fine">{t('earn.privacy')}</p>
        </div>
      )}
      {err && <p className="fine warn">{err}</p>}

      <FireWatch world={world} me={me} pick={fieldPick} onPick={onPickField} onShow={onShowField} />

      <section className="block cert-cta" aria-labelledby="cert-h">
        <h2 id="cert-h">{t('cert.title')}</h2>
        <p className="fine">{t('cert.body')}</p>
        <button className="secondary-btn" onClick={onCert} disabled={me.n < 1 && !me.field?.clean}>
          {me.n < 1 && !me.field?.clean ? t('cert.locked') : t('cert.issue')}
        </button>
      </section>

      {proofs.length > 0 && (
        <section className="block" aria-labelledby="proofs-h">
          <h2 id="proofs-h">{t('proofs.title')}</h2>
          <ul className="proof-list">
            {proofs.map((p) => (
              <li key={p.sk} data-ok={p.ok}>
                <span>
                  {p.action === 'fieldwatch' ? label(p.action) : actionText(ECO.actions.find((a) => a.id === p.action) ?? { id: p.action, label: label(p.action), photo: '', why: '' }, lang).label}
                  <small>{p.reason}</small>
                </span>
                <b>{p.ok ? `+${p.credits}` : '✗'}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="gloss account">
        <summary>{t('acct.title')}</summary>
        <p>{t('acct.body', { name: me.name, home: `${me.dn}, ${me.s}`, xp: me.eco })}</p>
        <button
          className="linkish"
          onClick={async () => {
            if (confirm(t('acct.confirm'))) {
              try {
                await deleteAccount()
              } catch (e) {
                setErr((e as Error).message)
              }
            }
          }}
        >
          {t('acct.delete')}
        </button>
      </details>
    </div>
  )
}

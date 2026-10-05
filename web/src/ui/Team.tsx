import { useEffect, useState } from 'react'
import { TEAM_KINDS, createTeam, fetchTeam, joinTeam, leaveTeam, type Me, type Pact, type TeamView } from '../lib/account'
import { useLang, useT, type Key } from '../lib/i18n'
import { LangPicker } from './Earn'

/** Village Fire Pact: the members' fields settle together each week, from NASA VIIRS. Aggregates only, never who burned. */
function PactPanel({ pact, hasField }: { pact: Pact; hasField: boolean }) {
  const t = useT()
  const ready = pact.fields >= pact.minFields
  return (
    <section className="block pact" aria-labelledby="pact-h">
      <h2 id="pact-h">{t('pact.title')}</h2>
      <div className="pact-streak">
        <b>{pact.streak}</b>
        <span>{t('pact.streak')}</span>
      </div>
      <p className="lede">
        {!ready ? t('pact.small', { min: pact.minFields, n: pact.fields }) : pact.firedThisWeek ? t('pact.fired') : t('pact.clean', { n: pact.fields })}
      </p>
      <p className="fine">
        {t('pact.rule', { bonus: `+${pact.bonus}` })} {pact.strikeLeft ? t('pact.strikeLeft') : t('pact.strikeUsed')}
      </p>
      {!hasField && <p className="fine warn">{t('pact.pin')}</p>}
      {pact.weeks.length > 0 && (
        <ol className="pact-weeks" aria-label="Past weeks">
          {pact.weeks.map((w) => (
            <li key={w.wk} data-r={w.result} title={`${w.wk}: ${t(`pact.r.${w.result}` as Key)}`}>
              <span className="sr-only">
                {w.wk}: {t(`pact.r.${w.result}` as Key)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Teams: schools, colleges, residents' associations, offices, village pacts. One team per player; join by invite code. */
export function Team({ me, invite }: { me: Me; invite: string | null }) {
  const t = useT()
  const lang = useLang()
  const [view, setView] = useState<TeamView | null>(null)
  const [mode, setMode] = useState<'join' | 'create'>('join')
  const [code, setCode] = useState(invite ?? '')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('school')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [shared, setShared] = useState('')

  useEffect(() => {
    let live = true
    if (me.team) fetchTeam(me.team).then((v) => live && setView(v), (e) => live && setErr((e as Error).message))
    return () => {
      live = false
    }
  }, [me.team, me.wxp])

  const run = async (f: () => Promise<{ team?: TeamView }>) => {
    setBusy(true)
    setErr('')
    try {
      const r = await f()
      if (r.team) setView(r.team)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (me.team && view?.code === me.team) {
    const link = `${location.origin}/?team=${view.code}`
    const pct = Math.min(100, Math.round((view.verified / view.goal) * 100))
    return (
      <div className="team" lang={lang}>
        <LangPicker />
        <div className="team-card">
          <small>{t(`kind.${view.kind}` as Key)}</small>
          <h2>{view.name}</h2>
          <div className="stat-row">
            <span>
              <b>{view.members}</b>
              <small>{t('team.members')}</small>
            </span>
            <span>
              <b>{view.wxp}</b>
              <small>{t('team.xp')}</small>
            </span>
            <span>
              <b>{view.verified}</b>
              <small>{t('team.verified')}</small>
            </span>
          </div>
          <div className="goal" role="progressbar" aria-valuemin={0} aria-valuemax={view.goal} aria-valuenow={view.verified} aria-label={t('team.goal', { n: view.goal })}>
            <span>
              {t('team.goal', { n: view.goal })} {view.verified >= view.goal ? t('team.reached') : ''}
            </span>
            <i>
              <em style={{ width: `${pct}%` }} />
            </i>
          </div>
        </div>
        {view.pact && <PactPanel pact={view.pact} hasField={!!me.field} />}
        <section className="block" aria-labelledby="inv-h">
          <h2 id="inv-h">{t('team.invite')}</h2>
          <p className="fine">{t('team.inviteBody', { team: view.name })}</p>
          <p className="invite">
            <code>{view.code}</code>
            <button
              className="share-btn"
              onClick={async () => {
                const text = t('team.shareText', { team: view.name, link })
                try {
                  if (navigator.share) await navigator.share({ text, url: link })
                  else {
                    await navigator.clipboard.writeText(link)
                    setShared(t('team.copied'))
                  }
                } catch {
                  /* share sheet dismissed */
                }
              }}
            >
              {shared || t('team.share')}
            </button>
          </p>
        </section>
        <section className="block" aria-labelledby="mem-h">
          <h2 id="mem-h">{t('team.board')}</h2>
          <ol className="rank-list board">
            {view.rows.map((r) => (
              <li key={r.rank} data-me={r.name === me.name}>
                <span className="row">
                  <span className="rank">{r.rank}</span>
                  <span className="who">
                    {r.name}
                    {r.title && <em className="title-chip">{r.title}</em>}
                    <small>{r.where}</small>
                  </span>
                  <b>{r.score}</b>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <button
          className="linkish"
          disabled={busy}
          onClick={() => {
            if (confirm(t('team.leaveConfirm', { team: view.name }))) void run(() => leaveTeam())
          }}
        >
          {t('team.leave')}
        </button>
        {err && <p className="fine warn">{err}</p>}
      </div>
    )
  }

  return (
    <div className="team" lang={lang}>
      <LangPicker />
      <p className="lede">{t('team.intro')}</p>
      <div className="seg" role="radiogroup" aria-label={`${t('team.joinTab')} / ${t('team.createTab')}`}>
        <button role="radio" aria-checked={mode === 'join'} onClick={() => setMode('join')}>
          {t('team.joinTab')}
        </button>
        <button role="radio" aria-checked={mode === 'create'} onClick={() => setMode('create')}>
          {t('team.createTab')}
        </button>
      </div>
      {mode === 'join' ? (
        <form
          className="enlist"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => joinTeam(code))
          }}
        >
          <label className="field">
            <span>{t('team.code')}</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="e.g. K7QPMZ" autoCapitalize="characters" />
          </label>
          <button className="primary-btn" disabled={busy || code.trim().length !== 6}>
            {busy ? t('team.joining') : t('team.join')}
          </button>
        </form>
      ) : (
        <form
          className="enlist"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => createTeam(name, kind))
          }}
        >
          <label className="field">
            <span>{t('team.name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="e.g. DPS Karnal Eco Club" />
          </label>
          <label className="field">
            <span>{t('team.kind')}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {TEAM_KINDS.map(([k]) => (
                <option key={k} value={k}>
                  {t(`kind.${k}` as Key)}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-btn" disabled={busy || name.trim().length < 3}>
            {busy ? t('team.creating') : t('team.create')}
          </button>
        </form>
      )}
      {err && <p className="fine warn">{err}</p>}
    </div>
  )
}

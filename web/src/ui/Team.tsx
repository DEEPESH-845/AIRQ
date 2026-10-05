import { useEffect, useState } from 'react'
import { TEAM_KINDS, createTeam, fetchTeam, joinTeam, leaveTeam, type Me, type Pact, type TeamView } from '../lib/account'

const RESULT: Record<string, string> = { clean: 'Fire-free week', forgiven: 'Fire forgiven (season strike)', fire: 'A fire: streak reset', small: 'Too few fields to count' }

/** Village Fire Pact: the members' fields settle together each week, from NASA VIIRS. Aggregates only, never who burned. */
function PactPanel({ pact, hasField }: { pact: Pact; hasField: boolean }) {
  const ready = pact.fields >= pact.minFields
  return (
    <section className="block pact" aria-labelledby="pact-h">
      <h2 id="pact-h">Village Fire Pact</h2>
      <div className="pact-streak">
        <b>{pact.streak}</b>
        <span>fire-free week{pact.streak === 1 ? '' : 's'} in a row</span>
      </div>
      <p className="lede">
        {!ready
          ? `A pact needs at least ${pact.minFields} farmers with pinned fields (now ${pact.fields}).`
          : pact.firedThisWeek
            ? 'A fire was seen on a pact field this week. The verdict comes on Monday.'
            : `No fire on any of the ${pact.fields} pact fields so far this week.`}
      </p>
      <p className="fine">
        Every fire-free week pays <b>+{pact.bonus} credits</b> to each farmer in the pact. One fire on any member's field costs the whole village that week's bonus.
        {pact.strikeLeft ? ' The first fire this season is forgiven.' : " This season's forgiven fire has been used."} Only a fire on the field itself counts, so a neighbour's fire can't
        fail the pact.
      </p>
      {!hasField && <p className="fine warn">Pin your field in Earn → Satellite Fire Watch so it counts for the pact.</p>}
      {pact.weeks.length > 0 && (
        <ol className="pact-weeks" aria-label="Past weeks">
          {pact.weeks.map((w) => (
            <li key={w.wk} data-r={w.result} title={`${w.wk}: ${RESULT[w.result]}, ${w.fields} fields`}>
              <span className="sr-only">
                {w.wk}: {RESULT[w.result]}
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
  const [view, setView] = useState<TeamView | null>(null)
  const [mode, setMode] = useState<'join' | 'create'>(invite ? 'join' : 'join')
  const [code, setCode] = useState(invite ?? '')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('school')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [shared, setShared] = useState('')

  useEffect(() => {
    let live = true
    if (me.team) fetchTeam(me.team).then((v) => live && setView(v), (e) => live && setErr((e as Error).message))
    else setView(null)
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

  if (me.team && view) {
    const link = `${location.origin}/?team=${view.code}`
    const pct = Math.min(100, Math.round((view.verified / view.goal) * 100))
    return (
      <div className="team">
        <div className="team-card">
          <small>{view.kindLabel}</small>
          <h2>{view.name}</h2>
          <div className="stat-row">
            <span>
              <b>{view.members}</b>
              <small>members</small>
            </span>
            <span>
              <b>{view.wxp}</b>
              <small>XP this week</small>
            </span>
            <span>
              <b>{view.verified}</b>
              <small>verified actions this week</small>
            </span>
          </div>
          <div className="goal" role="progressbar" aria-valuemin={0} aria-valuemax={view.goal} aria-valuenow={view.verified} aria-label="This week's team goal">
            <span>
              Team goal: <b>{view.goal}</b> verified green actions this week {view.verified >= view.goal ? '· reached!' : ''}
            </span>
            <i>
              <em style={{ width: `${pct}%` }} />
            </i>
          </div>
        </div>
        {view.pact && <PactPanel pact={view.pact} hasField={!!me.field} />}
        <section className="block" aria-labelledby="inv-h">
          <h2 id="inv-h">Invite your people</h2>
          <p className="fine">Anyone who opens the link or enters the code joins {view.name}.</p>
          <p className="invite">
            <code>{view.code}</code>
            <button
              className="share-btn"
              onClick={async () => {
                const text = `Join ${view.name} on AIRQ and help clean India's air: ${link}`
                try {
                  if (navigator.share) await navigator.share({ text, url: link })
                  else {
                    await navigator.clipboard.writeText(link)
                    setShared('Invite link copied')
                  }
                } catch {
                  /* share sheet dismissed */
                }
              }}
            >
              {shared || 'Share invite'}
            </button>
          </p>
        </section>
        <section className="block" aria-labelledby="mem-h">
          <h2 id="mem-h">Members this week</h2>
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
            if (confirm(`Leave ${view.name}?`)) void run(() => leaveTeam())
          }}
        >
          Leave team
        </button>
        {err && <p className="fine warn">{err}</p>}
      </div>
    )
  }

  return (
    <div className="team">
      <p className="lede">Join your school, college, residents' association, office or village. Teams climb their own leaderboard and chase a weekly goal together.</p>
      <div className="seg" role="radiogroup" aria-label="Join or create">
        <button role="radio" aria-checked={mode === 'join'} onClick={() => setMode('join')}>
          Join with a code
        </button>
        <button role="radio" aria-checked={mode === 'create'} onClick={() => setMode('create')}>
          Create a team
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
            <span>Invite code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="e.g. K7QPMZ" autoCapitalize="characters" />
          </label>
          <button className="primary-btn" disabled={busy || code.trim().length !== 6}>
            {busy ? 'Joining…' : 'Join team'}
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
            <span>Team name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="e.g. DPS Karnal Eco Club" />
          </label>
          <label className="field">
            <span>Kind of team</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {TEAM_KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-btn" disabled={busy || name.trim().length < 3}>
            {busy ? 'Creating…' : 'Create team'}
          </button>
        </form>
      )}
      {err && <p className="fine warn">{err}</p>}
    </div>
  )
}

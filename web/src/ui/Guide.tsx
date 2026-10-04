import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { World } from '../lib/world'
import { CATS, catIndex } from '../lib/naqi'
import { ECO, estimate, useAccount } from '../lib/account'
import { RANKS, usePlayer, type MissionId } from '../lib/player'

export type ShowTarget = 'map' | 'orders' | 'battle' | MissionId | 'earn' | 'shop' | 'leaders'
type Chapter = { id: string; title: string; done?: boolean; show?: [ShowTarget, string][]; body: ReactNode }

const goodies = ECO.shop.filter((s) => s.kind === 'goodie')

/** The Field Manual: a chaptered, hands-on guide. "Show me" drives the real interface. */
export default function Guide({ world, onClose, onShow, onHow, onReplayIntro }: { world: World; onClose: () => void; onShow: (t: ShowTarget) => void; onHow: () => void; onReplayIntro: () => void }) {
  const p = usePlayer()
  const { me } = useAccount()
  const [i, setI] = useState(0)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  useEffect(() => {
    ref.current?.querySelector('.guide-body')?.scrollTo(0, 0) // returns a Promise in newer Chrome: never return it
  }, [i])
  const has = (m: MissionId) => p.missions.includes(m)

  const chapters: Chapter[] = [
    {
      id: 'map',
      title: 'Read the map',
      show: [['map', 'Show me the map key']],
      body: (
        <>
          <p>Every district is coloured by its air right now, on India's official National AQI scale:</p>
          <ul className="band-list">
            {CATS.map((c) => (
              <li key={c.name} style={{ ['--c' as string]: c.color }}>
                <b>{c.name}</b> {c.min}–{c.max}
              </li>
            ))}
          </ul>
          <ul>
            <li><b>White streaks</b> are the wind, moving smoke across the country.</li>
            <li><b>Orange dots</b> are fires seen by NASA satellites in the last two days.</li>
            <li><b>A dashed, breathing border</b> is a smog raid: a district that just turned Very Poor or worse, or will within 24 hours.</li>
            <li>The <b>readout</b> (bottom left) counts districts in each band and tracks the Smoke Season front line against yesterday.</li>
          </ul>
          <p className="fine">Numbers are modelled estimates from Copernicus CAMS, refreshed every 4 hours, not monitor readings.</p>
        </>
      ),
    },
    {
      id: 'command',
      title: 'Take command',
      done: has('command') && has('orders'),
      show: [['orders', "Open a district's orders"], ['battle', 'Open the Battle tab']],
      body: (
        <>
          <p>Pick a district by tapping it, searching at the top, or from <b>Rankings</b>. Its panel has three tabs:</p>
          <ol className="how-steps">
            <li><b>Orders</b>: what to do today for children, runners, people with asthma or outdoor workers (CPCB guidance), the cleanest 2-hour window, the 48-hour forecast, and a raid alert you can switch on.</li>
            <li><b>Battle</b>: where the air comes from (fires, vehicles, dust, industry, household burning), a trace of the smoke's path, and a one-tap complaint to the authority that can act.</li>
            <li><b>Play</b>: the games below.</li>
          </ol>
          <p>Missions on the bar at the top walk you through all of it, worth 100 XP.</p>
        </>
      ),
    },
    {
      id: 'play',
      title: 'Play for XP',
      done: has('defend') && has('call'),
      show: [['defend', 'Show me Defend'], ['call', 'Show me Call tomorrow'], ['general', 'Ask the General']],
      body: (
        <table className="guide-table">
          <thead>
            <tr><th>Game</th><th>How</th><th>XP</th></tr>
          </thead>
          <tbody>
            <tr><td>Defend</td><td>Spend 4 points a day on real measures (stubble management, road wetting…) and see tomorrow's forecast change.</td><td>30 first time, then 10 a day</td></tr>
            <tr><td>Call tomorrow</td><td>Guess tomorrow's AQI band. Settles when the data refreshes 24 h later.</td><td>50 if you beat the forecast, 20 if you both get it right</td></tr>
            <tr><td>Instant Replay</td><td>Yesterday's reading is shown; call what it is now.</td><td>Up to 50, once per district a day</td></tr>
            <tr><td>Ask the General</td><td>An AI commander answers from live data. 10 questions a day.</td><td>10 once</td></tr>
            <tr><td>Daily check-in</td><td>Just come back. A streak grows each day in a row.</td><td>5 a day</td></tr>
          </tbody>
        </table>
      ),
    },
    {
      id: 'ranks',
      title: 'XP and ranks',
      body: (
        <>
          <p>XP is your progress. It is never spent, and it comes from both game play and verified green actions.</p>
          <ol className="rank-ladder">
            {RANKS.map((r) => (
              <li key={r.name} data-on={p.xp + (me?.eco ?? 0) >= r.xp}>
                <b>{r.name}</b> {r.xp} XP
              </li>
            ))}
          </ol>
          <p className="fine">
            The leaderboard counts at most {ECO.dailyGameXp} game XP a day per player, so it can't be farmed by tapping. Verified green actions count in full, within their own daily and weekly limits.
          </p>
        </>
      ),
    },
    {
      id: 'prove',
      title: 'Prove a green action',
      done: !!me && me.n > 0,
      show: [['earn', me ? 'Log a green action' : 'Enlist now']],
      body: (
        <>
          <p><b>Credits</b> are AIRQ's second currency, and the one you spend. They only come from cleaning the real air:</p>
          <ol className="how-steps">
            <li><b>Enlist</b> with a callsign and home district (no email or password).</li>
            <li>Do something that cuts air pollution: plant a tree, cycle instead of driving, manage stubble without burning, report a waste fire, and more.</li>
            <li><b>Photograph it</b> and send it from the Earn tab. Amazon Nova AI checks that the photo shows that action.</li>
            <li>Approved: credits and XP land at once, with a receipt showing every bonus. Rejected: you see why, and can try a new photo.</li>
          </ol>
          <h3>Photos that pass</h3>
          <ul>
            <li>Fresh, taken now, in daylight, with the action clearly in frame (the sapling in soil, the bike on the road).</li>
            <li>No screenshots, photos of screens, stock or downloaded images. Every photo works once: re-sending it is rejected.</li>
            <li>Leave faces and number plates out. Location data is stripped before upload; photos stay private.</li>
          </ul>
          <p className="fine">Limits: {ECO.dailyProofs} proofs a day, and each action has its own daily or weekly cap.</p>
        </>
      ),
    },
    {
      id: 'max',
      title: 'Maximise your credits',
      body: <Maximise world={world} />,
    },
    {
      id: 'shop',
      title: 'Shop and goodies',
      done: !!me && (me.titles.length > 0 || me.claims.length > 0 || Object.values(me.inv).some((n) => (n ?? 0) > 0)),
      show: [['shop', 'Open the shop']],
      body: (
        <>
          <ul>
            <li><b>Goodies</b>: real things, unlocked after {ECO.goodiesUnlock} verified actions. {goodies.map((g) => `${g.label} (${g.cost})`).join(', ')}.</li>
            <li><b>Boosts</b>: Double Credits (40) doubles your next verified action. Streak Shield (60) saves your eco-streak through one missed week. Hold up to 2 of each.</li>
            <li><b>Titles</b>: wear one beside your callsign on the leaderboard, from Sapling Scout (50) to Air Marshal of the People (600).</li>
          </ul>
          <h3>Redeeming a goodie</h3>
          <ol className="how-steps">
            <li>Tap its price and confirm. Credits are taken and you get a claim code like AIRQ-K7QP-3MZD.</li>
            <li>A person reviews the claim and your proofs (this stops fake accounts emptying the shop).</li>
            <li>A partner NGO or sponsor fulfils it, and the claim shows "Approved, ready to collect". Turned down? The reviewer refunds the credits.</li>
          </ol>
          <p className="fine">AIRQ is a pilot and partners are still being onboarded, so delivery isn't guaranteed yet. The shop says so before you claim.</p>
        </>
      ),
    },
    {
      id: 'board',
      title: 'Leaderboard',
      show: [['leaders', 'Open the leaderboard']],
      body: (
        <>
          <ul>
            <li><b>This week</b>: XP since Monday 00:00 India time. Everyone starts level each week.</li>
            <li><b>My district</b>: just your neighbours, so you're competing with people breathing the same air.</li>
            <li><b>States</b>: every player's weekly XP summed by home state. Rally your state.</li>
            <li><b>All time</b>: total XP.</li>
          </ul>
          <p>Ties go to whoever enlisted first. Wear a title from the shop and it shows next to your name.</p>
        </>
      ),
    },
  ]
  const c = chapters[i]

  return (
    <section className="how guide" aria-label="Field Manual" tabIndex={-1} ref={ref}>
      <header className="panel-head">
        <div>
          <h1>Field Manual</h1>
          <p>Everything AIRQ does, and how to make the most of it.</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close the Field Manual">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <nav className="guide-nav" aria-label="Chapters">
        {chapters.map((ch, k) => (
          <button key={ch.id} aria-current={k === i ? 'step' : undefined} data-done={ch.done ?? false} onClick={() => setI(k)}>
            <span>{k + 1}</span> {ch.title}
          </button>
        ))}
      </nav>
      <article className="guide-body" aria-live="polite">
        <h2>
          {i + 1}. {c.title} {c.done && <small className="done">✓ done</small>}
        </h2>
        {c.body}
        {c.show && (
          <div className="guide-show">
            {c.show.map(([t, l]) => (
              <button key={t} onClick={() => onShow(t)}>
                {l} →
              </button>
            ))}
          </div>
        )}
      </article>
      <footer className="guide-foot">
        <button disabled={i === 0} onClick={() => setI(i - 1)}>
          Back
        </button>
        <span>
          {i + 1} / {chapters.length}
        </span>
        {i < chapters.length - 1 ? (
          <button className="primary" onClick={() => setI(i + 1)}>
            Next
          </button>
        ) : (
          <button className="primary" onClick={onClose}>
            Done
          </button>
        )}
      </footer>
      <p className="fine guide-more">
        <button className="linkish inline" onClick={onReplayIntro}>
          Replay the briefing
        </button>{' '}
        ·{' '}
        <button className="linkish inline" onClick={onHow}>
          How AIRQ works: data, AWS and glossary
        </button>
      </p>
    </section>
  )
}

const TIPS: [string, string][] = [
  ['Go big first', 'Managing stubble (120), switching a home to clean cooking (80) and planting trees (60 each, 2 a day) pay the most because they cut the most smoke.'],
  ['Collect every first-time bonus', `Each of the ${ECO.actions.length} action types pays +${ECO.firstBonus} the first time it is verified: ${ECO.actions.length * ECO.firstBonus} credits for trying everything once.`],
  ['Never break the weekly streak', `One verified action a week keeps your eco-streak. Each week in a row adds 10%, up to ×${ECO.streakMax} from week 6. Going away? A Streak Shield (60) covers one missed week.`],
  ['Act on the frontline', 'Your home district\'s air sets a bonus: Poor ×1.25, Very Poor ×1.5, Severe ×2. It peaks in smoke season (October to January), exactly when action matters most.'],
  ['Time your Double Credits', `Arm it (40) before your biggest action. Before stubble management it turns 120 into 240. Total multipliers are capped at ×${ECO.multiplierCap}.`],
  ['Spread your proofs', `You get ${ECO.dailyProofs} proofs a day and each action has its own cap, so mix them: two trees, a bus ride, a cycle trip and composting all fit in one day.`],
  ['Show up daily', `Opening AIRQ pays +${ECO.checkinCredits} credits a day, plus game XP for the board.`],
]

/** Tips plus a live calculator: actions per week -> credits, with the player's own frontline and streak. */
function Maximise({ world }: { world: World }) {
  const { me } = useAccount()
  const homeAqi = world.districts.find((d) => d.id === me?.d)?.aqi ?? 250
  const [band, setBand] = useState(catIndex(homeAqi))
  const [weeks, setWeeks] = useState(Math.max(1, me?.streak ?? 1))
  const [plan, setPlan] = useState<Record<string, number>>({ tree: 2, cycle: 4, transit: 4, compost: 3 })
  const aqi = CATS[band].min
  const cap = (a: (typeof ECO.actions)[number]) => Math.min(a.perWeek, a.perDay * 7)
  const total = ECO.actions.reduce((s, a) => s + (plan[a.id] ?? 0) * estimate(a, aqi, weeks, false), 0)
  const proofs = Object.values(plan).reduce((s, n) => s + n, 0)
  const next = goodies.find((g) => g.cost > (me?.cr ?? 0)) ?? goodies[goodies.length - 1]

  return (
    <>
      <ol className="tips">
        {TIPS.map(([t, d]) => (
          <li key={t}>
            <b>{t}.</b> {d}
          </li>
        ))}
      </ol>
      <h3>Plan your week</h3>
      <div className="calc">
        <label>
          <span>Your district's air</span>
          <select value={band} onChange={(e) => setBand(Number(e.target.value))}>
            {CATS.map((c, k) => (
              <option key={c.name} value={k}>
                {c.name} (×{ECO.frontline[k]})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Eco-streak: {weeks} week{weeks === 1 ? '' : 's'}</span>
          <input type="range" min={1} max={8} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
        </label>
        <ul className="calc-rows">
          {ECO.actions.map((a) => (
            <li key={a.id}>
              <span>
                {a.label}
                <small>{estimate(a, aqi, weeks, false)} each, up to {cap(a)} a week</small>
              </span>
              <input
                type="number"
                min={0}
                max={cap(a)}
                value={plan[a.id] ?? 0}
                aria-label={`${a.label}, times per week`}
                onChange={(e) => setPlan({ ...plan, [a.id]: Math.max(0, Math.min(cap(a), Number(e.target.value) || 0)) })}
              />
            </li>
          ))}
        </ul>
        <p className="calc-total" aria-live="polite">
          <b>{total}</b> credits a week
          <small>
            {proofs > ECO.dailyProofs * 7 ? `That's ${proofs} proofs; the limit is ${ECO.dailyProofs * 7} a week. ` : ''}
            {total > 0 && next ? `${next.label} (${next.cost}) in about ${Math.max(1, Math.ceil((next.cost - (me?.cr ?? 0)) / total))} week(s). ` : ''}
            Plus first-time bonuses and +{ECO.checkinCredits} a day for checking in.
          </small>
        </p>
      </div>
    </>
  )
}

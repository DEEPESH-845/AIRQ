import { useMemo, useState } from 'react'
import type { District, World } from '../lib/world'
import { enlist, useAccount } from '../lib/account'
import { nearIndia, nearestDistrict } from '../lib/story'
import { Earn } from './Earn'
import { Shop } from './Shop'
import { Leaderboard } from './Leaderboard'
import type { Pick } from './FireWatch'

export type ImpactTab = 'earn' | 'shop' | 'leaders'
const TABS: { id: ImpactTab; label: string }[] = [
  { id: 'earn', label: 'Earn' },
  { id: 'shop', label: 'Shop' },
  { id: 'leaders', label: 'Leaderboard' },
]

/** Real-world green actions, credits, the shop and the player leaderboard. */
export function Impact({ world, tab, onTab, home, onClose, pick, onPickField, onShowField, onCert }: { world: World; tab: ImpactTab; onTab: (t: ImpactTab) => void; home: District; onClose: () => void; pick: Pick | null; onPickField: () => void; onShowField: () => void; onCert: () => void }) {
  const { me, status } = useAccount()
  return (
    <aside className="rankings impact" aria-label="Impact">
      <header className="panel-head">
        <div>
          <h1>Impact</h1>
          <p>{me ? `${me.name}${me.title ? ` · ${me.title}` : ''} · ${me.dn}` : 'Clean the real air, earn credits, climb the board.'}</p>
        </div>
        {me && (
          <span className="credits" aria-label={`${me.cr} credits`}>
            {me.cr}
            <small>credits</small>
          </span>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Close impact">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="seg" role="tablist" aria-label="Impact sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} aria-checked={tab === t.id} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="impact-body">
        {tab === 'leaders' ? (
          <Leaderboard enlisted={!!me} onEnlist={() => onTab('earn')} />
        ) : status === 'loading' ? (
          <p className="fine">Reaching AIRQ HQ…</p>
        ) : !me ? (
          <Enlist world={world} home={home} />
        ) : tab === 'earn' ? (
          <Earn world={world} me={me} pick={pick} onPickField={onPickField} onShowField={onShowField} onCert={onCert} />
        ) : (
          <Shop me={me} onEarn={() => onTab('earn')} />
        )}
        {status === 'offline' && <p className="fine warn">Can't reach AIRQ HQ. Your credits are safe on the server; try again shortly.</p>}
      </div>
    </aside>
  )
}

function Enlist({ world, home }: { world: World; home: District }) {
  const [name, setName] = useState('')
  const [d, setD] = useState(home.id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [locating, setLocating] = useState(false)
  const locate = () => {
    setLocating(true)
    setErr('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const at: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        if (nearIndia(world.districts, at)) setD(nearestDistrict(world.districts, at[0], at[1]).id)
        else setErr("You seem to be outside India. Pick your home district from the list.")
      },
      () => {
        setLocating(false)
        setErr('Location unavailable. Pick your district from the list.')
      },
      { timeout: 8000, maximumAge: 600000 },
    )
  }
  const byState = useMemo(() => {
    const m = new Map<string, District[]>()
    for (const x of [...world.districts].sort((a, b) => a.n.localeCompare(b.n))) m.set(x.s, [...(m.get(x.s) ?? []), x])
    return [...m].sort(([a], [b]) => a.localeCompare(b))
  }, [world])
  const ok = /^[A-Za-z0-9][A-Za-z0-9 ]{1,16}[A-Za-z0-9]$/.test(name.trim().replace(/\s+/g, ' '))

  return (
    <form
      className="enlist"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ok || busy) return
        setBusy(true)
        setErr('')
        try {
          await enlist(name, d)
        } catch (x) {
          setErr((x as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2>Enlist</h2>
      <p className="lede">
        Tapping the map earns XP. <b>Credits</b> come from cleaning the real air: plant a tree, skip the car, stop a fire. Snap a photo, our AI checks it,
        and credits land in your account to spend on goodies.
      </p>
      <label className="field">
        <span>Callsign (public, on the leaderboard)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={18} autoComplete="nickname" placeholder="e.g. Neem Ninja" />
        <small>3 to 18 letters, digits or spaces. No real names needed.</small>
      </label>
      <label className="field">
        <span>Home district</span>
        <select value={d} onChange={(e) => setD(e.target.value)}>
          {byState.map(([s, ds]) => (
            <optgroup key={s} label={s}>
              {ds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.n}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {'geolocation' in navigator && (
          <button type="button" className="linkish" onClick={locate} disabled={locating}>
            {locating ? 'Finding you…' : 'Use my location'}
          </button>
        )}
        <small>Sets your frontline bonus and district board. After your first change, it can change once every 30 days.</small>
      </label>
      <button className="primary-btn" disabled={!ok || busy}>
        {busy ? 'Enlisting…' : 'Enlist and get 2 credits'}
      </button>
      {err && <p className="fine warn">{err}</p>}
      <p className="fine">No email or password. Your account lives in this browser; clearing site data loses it.</p>
    </form>
  )
}

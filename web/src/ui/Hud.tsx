import { useEffect, useRef, useState } from 'react'
import { missionCount, nextMission, onGain, rankOf, usePlayer, type Gain, type MissionId } from '../lib/player'
import { pushSupported } from '../lib/push'
import { useAccount } from '../lib/account'
import type { ImpactTab } from './Impact'

/** Rank, XP, credits and the one next thing to do. Streak appears from the second day. */
export function Hud({ onMission, onImpact }: { onMission: (id: MissionId) => void; onImpact: (t: ImpactTab) => void }) {
  const p = usePlayer()
  const { me } = useAccount()
  const xp = p.xp + (me?.eco ?? 0) // game XP here plus verified-action XP from the server
  const r = rankOf(xp)
  const next = nextMission(p)
  const { done, total } = missionCount(p)
  const pct = r.next ? Math.round(((xp - r.floor) / (r.next.xp - r.floor)) * 100) : 100
  const [msg, setMsg] = useState<{ text: string; rankUp: boolean } | null>(null)
  const lastRank = useRef(r.index)

  useEffect(() => onGain((g: Gain) => setMsg({ text: `+${g.xp} XP · ${g.reason}`, rankUp: false })), [])
  // the account arriving from the server is not a rank-up or a credit gain; later changes are
  const loaded = useRef(false)
  const lastCr = useRef(0)
  useEffect(() => {
    if (r.index > lastRank.current && (loaded.current || !me)) setMsg({ text: `Rank up: ${r.name}`, rankUp: true })
    lastRank.current = r.index
  }, [r.index, r.name]) // eslint-disable-line react-hooks/exhaustive-deps -- me only gates the first load
  useEffect(() => {
    if (!me) return void (loaded.current = false)
    if (loaded.current && me.cr > lastCr.current) setMsg({ text: `+${me.cr - lastCr.current} credits`, rankUp: false })
    loaded.current = true
    lastCr.current = me.cr
  }, [me])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), msg.rankUp ? 3200 : 2400)
    return () => clearTimeout(t)
  }, [msg])

  const optional = pushSupported() && !p.missions.includes('alert')
  return (
    <div className="hud">
      <div
        className="hud-rank"
        role="group"
        tabIndex={0}
        aria-label={`Rank ${r.name}, ${xp} XP${r.next ? `, ${r.next.xp - xp} XP to ${r.next.name}` : ''}`}
      >
        <b>{r.name}</b>
        <span className="hud-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        <small>
          {xp} XP{p.streak > 1 ? ` · ${p.streak}-day streak` : ''}
        </small>
      </div>
      {next ? (
        <button className="hud-next" onClick={() => onMission(next.id)}>
          Next: {next.label} <small>+{next.xp}</small>
        </button>
      ) : (
        <button className="hud-next" onClick={() => onImpact('earn')}>
          Next: {me ? 'Prove a green action' : 'Enlist and earn credits'} <small>+credits</small>
        </button>
      )}
      <button className="hud-chip" onClick={() => onImpact(me ? 'shop' : 'earn')} aria-label={me ? `${me.cr} credits, open the shop` : 'Earn credits'}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M13.5 2.5C7 2.5 2.5 5.5 2.5 11c0 1 .2 1.8.5 2.5C4 9 7 6.5 10 5.5 7.5 7 5 9.5 4 13.6 9.5 14 13.5 10 13.5 2.5z" fill="currentColor" />
        </svg>
        {me ? me.cr : 'Earn'}
      </button>
      <button className="hud-chip" onClick={() => onImpact('leaders')} aria-label="Leaderboard">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 2h8v2h2.5v1.5A3 3 0 0 1 11.7 8.5 4 4 0 0 1 9 10.9V12h2v2H5v-2h2v-1.1A4 4 0 0 1 4.3 8.5 3 3 0 0 1 1.5 5.5V4H4zm0 3.5H3a1.5 1.5 0 0 0 1 1.4zm8 0v1.4a1.5 1.5 0 0 0 1-1.4z" fill="currentColor" />
        </svg>
        <span className="chip-long">Leaderboard</span>
      </button>
      <small className="hud-count">
        {next ? `Missions ${done}/${total}${optional ? ' (+1 optional)' : ''}` : ''}
      </small>
      <p className="xp-toast" role="status" data-rankup={msg?.rankUp ?? false}>
        {msg?.text ?? ''}
      </p>
    </div>
  )
}

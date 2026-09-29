import { useEffect, useRef, useState } from 'react'
import { missionCount, nextMission, onGain, rankOf, usePlayer, type Gain, type MissionId } from '../lib/player'
import { pushSupported } from '../lib/push'

/** Rank, XP and the one next mission. Streak appears from the second day. */
export function Hud({ onMission }: { onMission: (id: MissionId) => void }) {
  const p = usePlayer()
  const r = rankOf(p.xp)
  const next = nextMission(p)
  const { done, total } = missionCount(p)
  const pct = r.next ? Math.round(((p.xp - r.floor) / (r.next.xp - r.floor)) * 100) : 100
  const [msg, setMsg] = useState<{ text: string; rankUp: boolean } | null>(null)
  const lastRank = useRef(r.index)

  useEffect(() => onGain((g: Gain) => setMsg({ text: `+${g.xp} XP · ${g.reason}`, rankUp: false })), [])
  useEffect(() => {
    if (r.index > lastRank.current) setMsg({ text: `Rank up: ${r.name}`, rankUp: true })
    lastRank.current = r.index
  }, [r.index, r.name])
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
        aria-label={`Rank ${r.name}, ${p.xp} XP${r.next ? `, ${r.next.xp - p.xp} XP to ${r.next.name}` : ''}`}
      >
        <b>{r.name}</b>
        <span className="hud-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        <small>
          {p.xp} XP{p.streak > 1 ? ` · ${p.streak}-day streak` : ''}
        </small>
      </div>
      {next && (
        <button className="hud-next" onClick={() => onMission(next.id)}>
          Next: {next.label} <small>+{next.xp}</small>
        </button>
      )}
      <small className="hud-count">
        Missions {done}/{total}
        {optional ? ' (+1 optional)' : ''}
      </small>
      <p className="xp-toast" role="status" data-rankup={msg?.rankUp ?? false}>
        {msg?.text ?? ''}
      </p>
    </div>
  )
}

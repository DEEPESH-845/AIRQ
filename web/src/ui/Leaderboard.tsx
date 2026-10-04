import { useEffect, useState } from 'react'
import { fetchBoard, useAccount, type Board, type Row } from '../lib/account'

const SCOPES = [
  { id: 'week', label: 'This week', hint: 'XP earned since Monday, India time. Resets every Monday.' },
  { id: 'district', label: 'My district', hint: 'This week, players who call your district home.' },
  { id: 'states', label: 'States', hint: "This week's XP of every player, summed by home state." },
  { id: 'all', label: 'All time', hint: 'Total XP: game play plus verified green actions.' },
]

/** Players ranked by XP. Game XP is capped per day on the server; verified green actions are uncapped. */
export function Leaderboard({ enlisted, onEnlist }: { enlisted: boolean; onEnlist: () => void }) {
  const [scope, setScope] = useState('week')
  const [board, setBoard] = useState<Board | null>(null)
  const [err, setErr] = useState('')
  const { me } = useAccount()
  const s = SCOPES.find((x) => x.id === scope)!

  useEffect(() => {
    let live = true
    fetchBoard(scope).then(
      (b) => {
        if (!live) return
        setBoard(b)
        setErr('')
      },
      (e) => live && setErr((e as Error).message),
    )
    return () => {
      live = false
    }
  }, [scope, me?.wxp, me?.name, me?.title])

  const rows = board?.scope === scope ? board.rows : []
  const pinned = board?.scope === scope && board.me && !rows.some((r) => r.me) ? board.me : null
  return (
    <div className="leaders" data-mission="leaders">
      <div className="seg" role="radiogroup" aria-label="Leaderboard">
        {SCOPES.filter((x) => enlisted || x.id !== 'district').map((x) => (
          <button key={x.id} role="radio" aria-checked={scope === x.id} onClick={() => setScope(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <p className="fine shelf-note">{s.hint}</p>
      {err && <p className="fine warn">{err}</p>}
      {!err && board?.scope === scope && rows.length === 0 && <p className="lede">No one has scored yet {scope === 'all' ? '' : 'this week'}. First place is open.</p>}
      <ol className="rank-list board">
        {rows.map((r) => (
          <RowView key={`${r.rank}-${r.name}`} r={r} states={scope === 'states'} />
        ))}
        {pinned && (
          <>
            <li className="gap" aria-hidden="true">
              ⋯
            </li>
            <RowView r={pinned} states={scope === 'states'} />
          </>
        )}
      </ol>
      {!enlisted && (
        <p className="fine">
          <button className="linkish inline" onClick={onEnlist}>
            Enlist
          </button>{' '}
          to put your callsign on the board.
        </p>
      )}
    </div>
  )
}

function RowView({ r, states }: { r: Row; states: boolean }) {
  return (
    <li data-me={r.me}>
      <span className="row">
        <span className="rank">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
        <span className="who">
          {r.name}
          {r.title && <em className="title-chip">{r.title}</em>}
          <small>{states ? `${r.players} player${r.players === 1 ? '' : 's'}` : r.where}</small>
        </span>
        <b>{r.score}</b>
      </span>
    </li>
  )
}

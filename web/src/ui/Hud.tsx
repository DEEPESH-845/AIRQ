import { useEffect, useRef, useState } from 'react'
import { onGain, rankOf, usePlayer, type Gain } from '../lib/player'
import { useAccount } from '../lib/account'
import { useT } from '../lib/i18n'
import type { ImpactTab } from './Impact'

/** The Act chip (credits, or a way in to earn them) and the XP / rank-up toast. Ranks live on the leaderboard. */
export function Hud({ onImpact }: { onImpact: (t: ImpactTab) => void }) {
  const t = useT()
  const p = usePlayer()
  const { me } = useAccount()
  const xp = p.xp + (me?.eco ?? 0) // game XP here plus verified-action XP from the server
  const r = rankOf(xp)
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

  return (
    <div className="hud">
      <button className="hud-chip" onClick={() => onImpact(me ? 'shop' : 'earn')} aria-label={me ? `${me.cr} credits, open the shop` : t('top.act')}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M13.5 2.5C7 2.5 2.5 5.5 2.5 11c0 1 .2 1.8.5 2.5C4 9 7 6.5 10 5.5 7.5 7 5 9.5 4 13.6 9.5 14 13.5 10 13.5 2.5z" fill="currentColor" />
        </svg>
        {me ? me.cr : t('top.act')}
      </button>
      <p className="xp-toast" role="status" data-rankup={msg?.rankUp ?? false}>
        {msg?.text ?? ''}
      </p>
    </div>
  )
}

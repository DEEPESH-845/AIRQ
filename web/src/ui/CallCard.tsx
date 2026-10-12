import { useState } from 'react'
import type { District, World } from '../lib/world'
import { act, completeMission } from '../lib/player'
import { aqStale, tooOld, inviteText, placeDaily, resultText, share, todayCall, useDaily, type Dir, type Done, type Result } from '../lib/daily'
import { useT, type Key } from '../lib/i18n'
import { useNow } from '../lib/now'

const DIRS: [Dir, Key][] = [[-1, 'dir.better'], [0, 'dir.same'], [1, 'dir.worse']]
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const link = (id: string) => `${location.origin}/?d=${id}`
const noteFor = (r: Awaited<ReturnType<typeof share>>, t: (k: Key) => string) => (r === 'copied' ? t('copied') : r === 'failed' ? t('share.failed') : '')

/** Today's one call, above the panel tabs so it shows whichever tab is open. */
export function CallCard({ d, world }: { d: District; world: World }) {
  const t = useT()
  const s = useDaily()
  const now = useNow()
  const mine = todayCall(s, now)
  const [note, setNote] = useState('')
  const dirT = (x: Dir) => t(DIRS[x + 1][1])
  const send = async (text: string) => setNote(noteFor(await share(text), t))

  return (
    <section className="call-card" aria-labelledby="call-h">
      <h2 id="call-h">{t('call.h')}</h2>
      {aqStale(world) ? (
        <p className="lede">{t('call.paused')}</p>
      ) : mine ? (
        <p className="lede">
          {mine.district === d.id ? t('call.made', { dir: dirT(mine.dir), when: when(mine.resolveAt) }) : t('call.other', { name: mine.name, dir: dirT(mine.dir) })}{' '}
          <button className="linkish" onClick={() => send(inviteText(mine, link(mine.district)))}>{t('share')}</button>{' '}
          <span role="status">{note}</span>
        </p>
      ) : tooOld(world, now) ? (
        <p className="lede">{t('call.old')}</p>
      ) : (
        <>
          <p className="lede">
            {t('call.q', { name: d.n })} <small>{t('call.now', { aqi: d.aqi })}</small>
          </p>
          <div className="duel-opts" data-mission="call">
            {DIRS.map(([x, k]) => (
              <button key={x} onClick={() => placeDaily(d, x, world) && act((p) => completeMission(p, 'call'))}>
                {t(k)}
              </button>
            ))}
          </div>
          <small className="call-rule">{t('call.rule')}</small>
        </>
      )}
      {s.total > 0 && <small className="call-record">{t('call.record', { right: s.right, total: s.total, beat: s.beat })}</small>}
    </section>
  )
}

/** Yesterday's result, on the first load after it is ready. */
export function ResultToast({ results, onClose }: { results: Result[]; onClose: () => void }) {
  const t = useT()
  const [note, setNote] = useState('')
  const dirT = (x: Dir) => t(DIRS[x + 1][1])
  const done = results.find((r): r is Done => !r.expired)
  return (
    <div className="toast" role="status">
      {results.map((r) =>
        r.expired ? (
          <p key={r.day}>{t('res.missed', { name: r.name })}</p>
        ) : (
          <p key={r.day}>
            {t('res.line', { name: r.name, from: r.base, to: r.actual })}
            <br />
            {t('res.you', { dir: dirT(r.dir) })} {r.right ? '✅' : '❌'}
            {r.fc !== null && <> · {t('res.fc', { dir: dirT(r.fc) })} {r.fcRight ? '✅' : '❌'}</>}
            <br />
            <b>{r.points ? t(r.fcRight === false ? 'res.beat' : 'res.right', { pts: r.points }) : t('res.wrong')}</b>
          </p>
        ),
      )}
      <div className="toast-actions">
        {done && (
          <button onClick={async () => setNote(noteFor(await share(resultText(done, link(done.district))), t))}>{t('share')}</button>
        )}
        <button onClick={onClose}>{t('gotit')}</button>
        <span role="status">{note}</span>
      </div>
    </div>
  )
}

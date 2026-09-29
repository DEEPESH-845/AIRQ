import { useEffect, useRef, useState } from 'react'
import type { District } from '../lib/world'
import { askGeneral } from '../lib/general'
import { act, completeMission } from '../lib/player'

type Msg = { who: 'you' | 'general'; text: string; error?: boolean }

/** Ask the General anything about the live map. Answers highlight the districts they mention. */
export function GeneralChat({ selected, onHighlight, onClose }: { selected: District | null; onHighlight: (ids: string[]) => void; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) // returns a Promise in newer Chrome: never return it
  }, [msgs, busy])

  const suggestions = [
    'Where is the air worst right now?',
    'Which districts will get worse tomorrow?',
    'How many farm fires are burning near Delhi?',
    selected ? `Is it safe to go running in ${selected.n} this evening?` : 'Which state has the cleanest air today?',
  ]

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setMsgs((m) => [...m, { who: 'you', text: t }])
    setQ('')
    setBusy(true)
    try {
      const r = await askGeneral({ q: t, d: selected?.id })
      setMsgs((m) => [...m, { who: 'general', text: r.text }])
      onHighlight(r.highlight)
      act((p) => completeMission(p, 'general')) // only on a real answer; a 429 lands in catch
    } catch (e) {
      setMsgs((m) => [...m, { who: 'general', text: (e as Error).message, error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="rankings general" aria-label="Ask the General">
      <header className="panel-head">
        <div>
          <h1>Ask the General</h1>
          <p>Live answers from AIRQ's data. Health advice comes from CPCB guidance.</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close the General">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="chat" role="log">
        {msgs.length === 0 && (
          <div className="suggest">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <p key={i} className={`msg ${m.who}`} data-error={m.error}>
            {m.text}
          </p>
        ))}
        {busy && (
          <p className="msg general briefing-wait" aria-label="The General is thinking">
            <i />
            <i />
            <i />
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault()
          send(q)
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} placeholder="Ask about any district" aria-label="Your question" />
        <button type="submit" disabled={busy || !q.trim()}>
          Ask
        </button>
      </form>
    </aside>
  )
}

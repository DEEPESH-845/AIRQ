import { useEffect, useState } from 'react'
import { askGeneral } from '../lib/general'

/** The General's briefing for this district: generated once per data refresh, then served from cache. */
export function Briefing({ district, onHighlight }: { district: string; onHighlight: (ids: string[]) => void }) {
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    askGeneral({ d: district }).then(
      (r) => live && setText(r.text),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [district])

  if (failed) return null
  return (
    <section className="briefing" aria-live="polite" aria-busy={!text}>
      <span className="briefing-from">Briefing from the General</span>
      {text ? (
        <p>{text}</p>
      ) : (
        <p className="briefing-wait">
          <i />
          <i />
          <i />
        </p>
      )}
      {text && (
        <button className="linkish" onClick={() => onHighlight([district])}>
          Show on map
        </button>
      )}
    </section>
  )
}

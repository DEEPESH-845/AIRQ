import { useState } from 'react'
import type { District } from '../lib/world'
import { SOURCE_TYPES, channelFor, complaintText, emailLink, xLink, type SourceType } from '../lib/complaint'

/** Turn a sighting into a complaint the right authority actually receives. */
export function ReportSource({ d }: { d: District }) {
  const [type, setType] = useState<SourceType | null>(null)
  const [where, setWhere] = useState('')
  const [coords, setCoords] = useState<[number, number] | undefined>()
  const [note, setNote] = useState('')
  const channel = channelFor(d.s)

  const complaint = type ? { type, where, coords, when: new Date() } : null

  const locate = () => {
    setNote('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords([p.coords.longitude, p.coords.latitude])
        setNote('Location attached as a map link.')
      },
      () => setNote('Location unavailable. Type a landmark instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const copyAndOpen = async () => {
    if (!complaint || !channel) return
    try {
      await navigator.clipboard.writeText(complaintText(d, complaint))
      setNote(`Complaint copied. Paste it into ${channel.name}.`)
    } catch {
      setNote('Copy failed; select the text in the email instead.')
    }
    window.open(channel.url, '_blank', 'noopener')
  }

  const email = complaint ? emailLink(d, complaint) : null

  return (
    <section className="block" aria-labelledby="rep-h">
      <h2 id="rep-h">Report a pollution source</h2>
      <p className="lede">Seen something burning or a dusty site? Send it to the people who can stop it.</p>
      <div className="seg" role="radiogroup" aria-label="What did you see">
        {SOURCE_TYPES.map((t) => (
          <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="where">
        <input value={where} onChange={(e) => setWhere(e.target.value)} maxLength={120} placeholder="Where? A landmark or street" aria-label="Where you saw it" />
        {'geolocation' in navigator && (
          <button className="icon-btn" onClick={locate} aria-label="Attach my location" title="Attach my location">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {complaint && email && (
        <div className="report-actions">
          {channel && (
            <button className="primary" onClick={copyAndOpen}>
              Copy complaint and open {channel.name}
            </button>
          )}
          <a className="secondary" href={email.href}>
            Email the pollution board (Section 31A)
          </a>
          <a className="secondary" href={xLink(d, complaint)} target="_blank" rel="noopener noreferrer">
            Post on X
          </a>
        </div>
      )}
      {note && <p className="fine">{note}</p>}
      {complaint && email && !email.hasRecipient && (
        <p className="fine">Add your District Magistrate's or pollution board regional officer's email in the To field before sending.</p>
      )}
    </section>
  )
}

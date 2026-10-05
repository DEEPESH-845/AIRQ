import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { actionLabel, verifyCert, type Cert } from '../lib/account'
import type { World } from '../lib/world'
import { ShareButton } from './ShareButton'

const date = (s: number) => new Date(s * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

/** A signed impact certificate. Opened from a link or QR (?cert=), it asks AIRQ's server whether the signature is genuine. */
export default function Certificate({ token, world, onClose }: { token: string; world: World; onClose: () => void }) {
  const [state, setState] = useState<{ valid: boolean; cert: Cert | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const url = `${location.origin}/?cert=${token}`
  const qr = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(url)
    q.make()
    return q
  }, [url])
  const n = qr.getModuleCount()

  useEffect(() => {
    ref.current?.focus()
    verifyCert(token).then(setState, () => setState({ valid: false, cert: null }))
  }, [token])

  const c = state?.cert
  return (
    <section className="cert-wrap" role="dialog" aria-modal="true" aria-label="Impact certificate" tabIndex={-1} ref={ref}>
      <article className="cert" data-valid={state?.valid ?? 'checking'}>
        <header>
          <span className="wordmark">AIRQ</span>
          <span className="cert-kind">Clean Air Impact Certificate</span>
        </header>
        {!state ? (
          <p className="fine">Checking the signature with AIRQ…</p>
        ) : !c ? (
          <p className="cert-bad">This certificate could not be verified. It may have been altered.</p>
        ) : (
          <>
            <p className="cert-to">This certifies that</p>
            <h2>
              {c.name}
              {c.title && <em className="title-chip">{c.title}</em>}
            </h2>
            <p className="cert-where">
              {c.where}
              {c.team ? ` · ${c.team}` : ''}
            </p>
            <div className="cert-stats">
              <span>
                <b>{c.actions}</b>
                <small>photo-verified green actions</small>
              </span>
              <span>
                <b>{c.fieldDays}</b>
                <small>fire-free field days, by satellite</small>
              </span>
              <span>
                <b>{c.earned}</b>
                <small>Clean Air Credits earned</small>
              </span>
              <span>
                <b>{c.xp}</b>
                <small>XP</small>
              </span>
            </div>
            <ul className="cert-life">
              {Object.entries(c.life)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <li key={k}>
                    <b>{v}×</b> {actionLabel(k)}
                  </li>
                ))}
            </ul>
            <footer>
              <svg className="qr" viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label="QR code linking to this certificate's verification page">
                <rect width={n + 4} height={n + 4} fill="#fff" />
                {Array.from({ length: n }, (_, r) =>
                  Array.from({ length: n }, (_, col) => (qr.isDark(r, col) ? <rect key={`${r}-${col}`} x={col + 2} y={r + 2} width={1.02} height={1.02} fill="#14122b" /> : null)),
                )}
              </svg>
              <div>
                <p className="cert-seal">{state.valid ? '✓ Signature verified by AIRQ' : 'Not verified'}</p>
                <p className="fine">
                  Issued {date(c.iat)} · ID {c.id} · Player since {date(c.since)}. Scan the code or open the link to check it with AIRQ's server; any edit breaks
                  the signature.
                </p>
              </div>
            </footer>
          </>
        )}
      </article>
      <div className="cert-actions">
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setCopied(true)
            } catch {
              /* clipboard blocked: the QR still works */
            }
          }}
        >
          {copied ? 'Link copied' : 'Copy verification link'}
        </button>
        {c && state?.valid && (
          <ShareButton
            world={world}
            text={`My clean-air record on AIRQ: ${c.actions} verified actions, ${c.earned} credits. Scan the code to check it.`}
            card={() => ({
              stat: String(c.actions + c.fieldDays),
              label: c.fieldDays ? 'verified actions and fire-free days' : 'verified green actions',
              proof: 'Signed certificate: scan to check',
              name: c.name,
              where: c.where,
              district: world.districts.find((d) => `${d.n}, ${d.s}` === c.where)?.id ?? '', // names repeat across states
              url,
              qrCaption: 'Scan to verify',
            })}
          />
        )}
        <button onClick={() => print()}>Print</button>
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  )
}

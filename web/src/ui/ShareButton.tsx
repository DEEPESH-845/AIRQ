import { useState } from 'react'
import type { World } from '../lib/world'
import { drawCard, shareFile, type Card } from '../lib/share'
import { useT } from '../lib/i18n'

/** Two taps on purpose: the first draws the card, the second shares it. Phones only open the share sheet straight from a
 *  tap, and drawing the card takes a moment, so sharing in the same tap fails on iPhone. */
export function ShareButton({ world, card, text, label }: { world: World; card: () => Card; text: string; label?: string }) {
  const t = useT()
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'downloaded' | 'error'>('idle')
  const icon = (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  if (file)
    return (
      <button
        className="share-btn ready"
        onClick={async () => {
          const r = await shareFile(file, text)
          setFile(null)
          setState(r === 'downloaded' ? 'downloaded' : 'idle')
        }}
      >
        {icon}
        {t('share.now')}
      </button>
    )
  return (
    <button
      className="share-btn"
      disabled={state === 'busy'}
      onClick={async () => {
        setState('busy')
        try {
          setFile(new File([await drawCard(card(), world)], 'airq-impact.png', { type: 'image/png' }))
          setState('idle')
        } catch {
          setState('error')
        }
      }}
    >
      {icon}
      {state === 'busy' ? t('share.drawing') : state === 'downloaded' ? t('share.saved') : state === 'error' ? t('share.error') : (label ?? t('earn.share'))}
    </button>
  )
}

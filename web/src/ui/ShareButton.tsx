import { useState } from 'react'
import type { World } from '../lib/world'
import { drawCard, shareCard, type Card } from '../lib/share'

/** Draws the share card on tap (so nothing is rendered until it's wanted) and opens the share sheet. */
export function ShareButton({ world, card, text, label = 'Share card' }: { world: World; card: () => Card; text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'downloaded' | 'error'>('idle')
  return (
    <button
      className="share-btn"
      disabled={state === 'busy'}
      onClick={async () => {
        setState('busy')
        try {
          const r = await shareCard(await drawCard(card(), world), text)
          setState(r === 'downloaded' ? 'downloaded' : 'idle')
        } catch {
          setState('error')
        }
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {state === 'busy' ? 'Drawing…' : state === 'downloaded' ? 'Saved: post it from your photos' : state === 'error' ? "Couldn't draw the card" : label}
    </button>
  )
}

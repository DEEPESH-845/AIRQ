import { useState } from 'react'
import { disableAlerts, enableAlerts, pushSupported, watching } from '../lib/push'
import { act, completeMission } from '../lib/player'

const COPY = {
  off: 'Warn me before smog reaches here',
  busy: 'Turning on alerts…',
  on: 'Alerts on for this district',
  denied: 'Notifications are blocked. Allow them in your browser settings to get alerts.',
  error: "Couldn't turn on alerts. Check your connection and try again.",
  unsupported: "This browser can't receive push alerts. Try Chrome, Edge or Firefox; on iPhone, add AIRQ to your Home Screen first.",
}

export function AlertToggle({ district, name }: { district: string; name: string }) {
  const [state, setState] = useState<keyof typeof COPY>(() => (watching().includes(district) ? 'on' : 'off'))
  if (!pushSupported()) return null

  const click = async () => {
    if (state === 'on') {
      setState('busy')
      await disableAlerts(district).catch(() => {})
      setState('off')
      return
    }
    setState('busy')
    const res = await enableAlerts(district)
    setState(res)
    if (res === 'on') act((p) => completeMission(p, 'alert'))
  }

  return (
    <div className="alert-toggle" data-mission="alert">
      <button onClick={click} aria-pressed={state === 'on'} disabled={state === 'busy'}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0"
            fill={state === 'on' ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        {state === 'on' || state === 'off' || state === 'busy' ? COPY[state] : COPY.off}
      </button>
      {state === 'on' && <small>We'll push a warning up to a day before AQI in {name} crosses 300. Tap again to stop.</small>}
      {(state === 'denied' || state === 'error' || state === 'unsupported') && <small className="warn">{COPY[state]}</small>}
    </div>
  )
}

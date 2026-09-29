// Web Push: subscribe this browser to smog-raid alerts for one or more districts.
const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const LIST = 'arq.alerts'

export const pushSupported = () => !!KEY && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function watching(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LIST) ?? '[]')
  } catch {
    return []
  }
}
function setWatching(ids: string[]) {
  try {
    localStorage.setItem(LIST, JSON.stringify(ids))
  } catch {
    /* alerts still work; we just can't remember the toggle */
  }
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function subscription() {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(KEY!) })
}

export async function enableAlerts(district: string): Promise<'on' | 'denied' | 'error'> {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'
  try {
    const sub = await subscription()
    const r = await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ d: district, sub }) })
    if (!r.ok) return 'error'
    setWatching([...new Set([...watching(), district])])
    return 'on'
  } catch {
    return 'error'
  }
}

export async function disableAlerts(district: string) {
  const sub = await subscription()
  await fetch('/api/subscribe', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ d: district, sub }) })
  setWatching(watching().filter((d) => d !== district))
}

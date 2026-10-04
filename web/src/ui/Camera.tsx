import { useEffect, useRef, useState } from 'react'
import { shrink } from '../lib/account'

/** Live in-app camera (rear camera on phones). Falls back to the file picker when there is no camera or no permission.
 *  The code, when given, is shown over the viewfinder so the player writes it down and keeps it in frame. */
export function Camera({ code, onShot }: { code?: string; onShot: (b64: string, preview: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'live' | 'none'>('starting')
  const [flash, setFlash] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let live = true
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('none')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play().catch(() => {})
        }
        setState('live')
      })
      .catch(() => live && setState('none'))
    return () => {
      live = false
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const shoot = async () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92))
    if (!blob) return
    setFlash(true)
    setTimeout(() => setFlash(false), 180)
    onShot(await shrink(blob), URL.createObjectURL(blob))
  }

  return (
    <div className="camera">
      {state !== 'none' ? (
        <>
          <video ref={video} playsInline muted aria-label="Camera viewfinder" />
          {code && (
            <div className="cam-code" aria-hidden="true">
              <small>Write on paper, keep in frame</small>
              <b>{code}</b>
            </div>
          )}
          <span className="cam-corners" aria-hidden="true" />
          {flash && <span className="cam-flash" aria-hidden="true" />}
          <button className="shutter" onClick={shoot} disabled={state !== 'live'} aria-label="Take photo">
            <i />
          </button>
        </>
      ) : (
        <label className="photo-pick">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                onShot(await shrink(f), URL.createObjectURL(f))
              } catch {
                setErr("This browser can't read that photo format (e.g. HEIC). Try a JPEG or PNG.")
              }
            }}
          />
          <span>{err || `No camera access. Take or choose a photo${code ? ` showing the code ${code}` : ''}.`}</span>
        </label>
      )}
    </div>
  )
}

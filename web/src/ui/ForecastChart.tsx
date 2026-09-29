import { useId } from 'react'
import { CATS, catOf } from '../lib/naqi'

const W = 376
const H = 128
const PAD = { l: 4, r: 4, t: 22, b: 22 }

const hourLabel = (d: Date) =>
  d.toLocaleTimeString('en-IN', { hour: 'numeric', timeZone: 'Asia/Kolkata' }).replace(' ', ' ')

/** 48-hour NAQI outlook. The line takes the colour of the band it is in. */
export function ForecastChart({ fc, start, plan }: { fc: number[]; start: string; plan?: number[] }) {
  const uid = useId().replace(/:/g, '')
  const t0 = new Date(start).getTime()
  const peak = Math.max(...fc)
  const peakI = fc.indexOf(peak)
  const top = Math.max(150, Math.ceil((peak * 1.2) / 50) * 50)
  const x = (i: number) => PAD.l + (i / (fc.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b)
  const line = fc.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')
  const area = `${line}L${x(fc.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`
  const planLine = plan?.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')

  // gradient stops at each band edge, in the chart's own y space
  const stops = CATS.flatMap((c) => {
    const lo = Math.min(1, Math.max(0, 1 - (c.min - 0.5) / top))
    const hi = Math.min(1, Math.max(0, 1 - (c.max + 0.5) / top))
    return [
      { o: hi, c: c.color },
      { o: lo, c: c.color },
    ]
  }).sort((a, b) => a.o - b.o)

  const ticks = [0, 12, 24, 36, 48].filter((i) => i < fc.length)
  const guides = [100, 200, 300, 400].filter((g) => g < top)

  return (
    <svg className="fc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`AQI over the next 48 hours, peaking at ${peak}`}>
      <defs>
        <linearGradient id={`g${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={PAD.t} x2="0" y2={H - PAD.b}>
          {stops.map((s, i) => (
            <stop key={i} offset={s.o} stopColor={s.c} />
          ))}
        </linearGradient>
        <linearGradient id={`f${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`m${uid}`}>
          <path d={area} fill={`url(#f${uid})`} />
        </mask>
      </defs>
      {guides.map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="fc-guide" />
          <text x={W - PAD.r} y={y(g) - 4} textAnchor="end" className="fc-guide-label">
            {g}
          </text>
        </g>
      ))}
      <rect x="0" y="0" width={W} height={H} fill={`url(#g${uid})`} mask={`url(#m${uid})`} />
      <path d={line} fill="none" stroke={`url(#g${uid})`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {planLine && <path d={planLine} className="fc-plan" />}
      {planLine && (
        <text x={PAD.l} y={12} className="fc-legend">
          <tspan className="fc-legend-real">Forecast</tspan>
          <tspan dx="12">Your plan</tspan>
        </text>
      )}
      <circle cx={x(0)} cy={y(fc[0])} r="4" fill={catOf(fc[0]).color} />
      <circle cx={x(peakI)} cy={y(peak)} r="4" fill="none" stroke={catOf(peak).color} strokeWidth="2" />
      <text
        x={Math.min(Math.max(x(peakI), 40), W - 60)}
        y={y(peak) - 9}
        textAnchor="middle"
        className="fc-peak"
      >
        Peak {peak}, {hourLabel(new Date(t0 + peakI * 3600e3))}
      </text>
      {ticks.map((i) => (
        <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === 48 ? 'end' : 'middle'} className="fc-tick">
          {i === 0 ? 'Now' : hourLabel(new Date(t0 + i * 3600e3))}
        </text>
      ))}
    </svg>
  )
}

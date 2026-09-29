import { useEffect, useRef } from 'react'

const box = (x: number, y: number, w: number, label: string, sub?: string) => (
  <g key={`${x},${y}`}>
    <rect x={x} y={y} width={w} height={44} rx={8} className="aw-box" />
    <text x={x + w / 2} y={sub ? y + 19 : y + 27} textAnchor="middle" className="aw-t">
      {label}
    </text>
    {sub && (
      <text x={x + w / 2} y={y + 35} textAnchor="middle" className="aw-s">
        {sub}
      </text>
    )}
  </g>
)
const arrow = (x1: number, y1: number, x2: number, y2: number) => <path key={`${x1}${y1}${x2}${y2}`} d={`M${x1} ${y1}L${x2} ${y2}`} className="aw-a" markerEnd="url(#aw-arrow)" />

/** The AWS stack as deployed by infra/template.yaml. Three lanes; every arrow is a real call, none cross lanes. */
function AwsDiagram() {
  const lane = (y: number, title: string, items: [string, string, number][]) => {
    let x = 8
    const out = [
      <text key={title} x="8" y={y - 10} className="aw-lane">
        {title}
      </text>,
    ]
    items.forEach(([label, sub, w], i) => {
      out.push(box(x, y, w, label, sub))
      if (i < items.length - 1) out.push(arrow(x + w, y + 22, x + w + 20, y + 22))
      x += w + 22
    })
    return out
  }
  return (
    <svg viewBox="0 0 760 316" role="img" aria-label="AWS architecture. World tick: EventBridge Scheduler every 4 hours starts a Step Functions workflow, which runs the tick Lambda; it writes world.json to S3, served by CloudFront. API: CloudFront routes /api to an HTTP API; the General Lambda runs a Strands agent on Amazon Bedrock Nova Micro. Raid alerts: Step Functions emits SmogRaid events; an EventBridge rule sends them to SNS, which triggers the push Lambda to send web push. DynamoDB holds push subscriptions and the General's daily quota. AWS Budgets caps spend at 15 dollars a month.">
      <defs>
        <marker id="aw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="aw-head" />
        </marker>
      </defs>
      {lane(26, 'World tick, every 4 h', [['EventBridge', 'Scheduler', 130], ['Step Functions', 'Standard', 130], ['Lambda', 'world tick', 120], ['S3', 'world.json', 120], ['CloudFront', 'app + data', 150]])}
      {lane(126, 'Ask the General', [['CloudFront', '/api/*', 130], ['HTTP API', '/api/general', 130], ['Lambda', 'Strands agent', 120], ['Bedrock', 'Nova Micro', 140]])}
      {lane(226, 'Raid alerts', [['EventBridge', 'SmogRaid rule', 130], ['SNS', 'raid topic', 130], ['Lambda', 'push', 120], ['Web Push', 'your browser', 140]])}
      <text x="8" y="292" className="aw-s">Step Functions emits the SmogRaid events. DynamoDB holds push subscriptions (/api/subscribe) and the General's daily quota.</text>
      <text x="8" y="308" className="aw-s">AWS Budgets caps spend at $15 a month.</text>
    </svg>
  )
}

const GLOSSARY: [string, string][] = [
  ['AQI (NAQI)', "India's National Air Quality Index (CPCB, 2014), from 0 to 500. It is set by the worst pollutant's 24-hour average; AIRQ computes it from PM2.5 and PM10."],
  ['PM2.5', 'Particles smaller than 2.5 micrometres. They reach deep into the lungs and blood and drive most of the health harm.'],
  ['PM10', 'Particles up to 10 micrometres, including dust. They irritate the nose, throat and airways.'],
  ['Mixing layer ("the lid")', 'The layer of air near the ground that pollution mixes into. At night it can drop below 200 m and trap smog, so mornings are often worst.'],
  ['Ventilation', 'Mixing height times wind speed, in m²/s. Below about 6,000 m²/s, pollution lingers instead of clearing.'],
]

export default function HowItWorks({ onClose, onReplay }: { onClose: () => void; onReplay: () => void }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside className="how" aria-label="How AIRQ works" tabIndex={-1} ref={ref}>
      <header className="panel-head">
        <div>
          <h1>How AIRQ works</h1>
          <p>Make air pollution visible, and make protecting yourself from it a daily habit.</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close How AIRQ works">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <button className="how-replay" onClick={onReplay}>
        Replay the briefing
      </button>
      <section className="block">
        <h2>Every 4 hours</h2>
        <ol className="how-steps">
          <li>
            <b>Collect.</b> Copernicus CAMS air quality via Open-Meteo; Open-Meteo wind at 850 hPa and 10 m plus boundary-layer height;
            NASA FIRMS VIIRS 375 m active fires (S-NPP and NOAA-20, last 7 days).
          </li>
          <li>
            <b>Fuse</b> it for all 790 districts.
          </li>
          <li>
            <b>Forecast</b> 48 hours, trace each district's 36-hour air path, and estimate where its pollution comes from.
          </li>
          <li>
            <b>Advise and alert</b> using CPCB NAQI and GRAP health statements, with a push before air turns Very Poor.
          </li>
        </ol>
      </section>
      <section className="block">
        <h2>Built on AWS</h2>
        <div className="aw-scroll" tabIndex={0} aria-label="AWS architecture diagram, scrolls sideways on small screens">
          <AwsDiagram />
        </div>
      </section>
      <section className="block">
        <h2>Honest limits</h2>
        <p className="fine">
          Source shares are a model estimate: typical splits from published Delhi studies (TERI-ARAI 2018, IITM DSS), plus a fire share
          from the 36-hour wind path over NASA fire detections, tuned to IITM's daily Delhi stubble estimate. Not a measurement.
        </p>
        <p className="fine">AQI values are modelled estimates from Copernicus CAMS, not monitor readings. The forecast is the CAMS forecast. Defense effects are approximate.</p>
        <p className="fine">Future work: correct the model against ground stations (OpenAQ) with Amazon SageMaker.</p>
      </section>
      <section className="block">
        <h2>Words on the map</h2>
        {GLOSSARY.map(([term, text]) => (
          <details key={term} className="gloss">
            <summary>{term}</summary>
            <p>{text}</p>
          </details>
        ))}
      </section>
    </aside>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { loadWorld, type World } from './lib/world'
import { ArqMap } from './map/ArqMap'
import { TopBar } from './ui/TopBar'
import { NationalReadout } from './ui/NationalReadout'
import { DistrictPanel } from './ui/DistrictPanel'
import { Rankings } from './ui/Rankings'
import { GeneralChat } from './ui/GeneralChat'
import { settle, bandName, type Result } from './lib/game'

export default function App() {
  const [world, setWorld] = useState<World | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(location.search).get('d'))

  const [results, setResults] = useState<Result[]>([])
  useEffect(() => {
    loadWorld().then((w) => {
      setWorld(w)
      setResults(settle(w.districts, w.generatedAt))
    }, (e) => setError(String(e.message ?? e)))
  }, [])

  // deep link: ?d=<district id>
  useEffect(() => {
    const url = new URL(location.href)
    if (selectedId) url.searchParams.set('d', selectedId)
    else url.searchParams.delete('d')
    history.replaceState(null, '', url)
  }, [selectedId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedId(null)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const selected = useMemo(() => world?.districts.find((d) => d.id === selectedId) ?? null, [world, selectedId])
  const [tracing, setTracing] = useState(false)
  const [side, setSide] = useState<'readout' | 'rankings' | 'general'>('readout')
  const [highlight, setHighlight] = useState<string[]>([])
  useEffect(() => setTracing(false), [selectedId])

  if (error)
    return (
      <main className="fallback">
        <p>ARQ couldn't load today's air data ({error}). Refresh to try again.</p>
      </main>
    )
  if (!world) return <main className="fallback" aria-busy="true" />

  return (
    <main className="app">
      <ArqMap world={world} selected={selected} onSelect={setSelectedId} panelOpen={!!selected} trace={tracing ? selected : null} highlight={highlight} />
      <TopBar world={world} onSelect={setSelectedId} onGeneral={() => setSide('general')} />
      {side === 'rankings' && <Rankings world={world} onSelect={setSelectedId} onClose={() => setSide('readout')} />}
      {side === 'general' && <GeneralChat selected={selected} onHighlight={setHighlight} onClose={() => { setSide('readout'); setHighlight([]) }} />}
      {side === 'readout' && <NationalReadout world={world} onSelect={setSelectedId} onRankings={() => setSide('rankings')} />}
      {tracing && selected && (
        <div className="trace-banner" role="status">
          <span>
            Smoke path into <b>{selected.n}</b> over the last 36 hours
          </span>
          <button onClick={() => setTracing(false)}>Done</button>
        </div>
      )}
      {results.length > 0 && (
        <div className="toast" role="status">
          {results.map((r) => (
            <p key={r.district}>
              {r.name}: you called {bandName(r.band)}, it came in at {r.actual} ({bandName(r.actualBand)}). <b>+{r.points} points</b>
            </p>
          ))}
          <button onClick={() => setResults([])}>Got it</button>
        </div>
      )}
      {selected && (
        <DistrictPanel key={selected.id} d={selected} generatedAt={world.generatedAt} onClose={() => setSelectedId(null)} onTrace={() => setTracing(true)} onHighlight={setHighlight} />
      )}
    </main>
  )
}

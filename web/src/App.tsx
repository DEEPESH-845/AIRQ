import { useEffect, useMemo, useState } from 'react'
import { loadWorld, type World } from './lib/world'
import { ArqMap } from './map/ArqMap'
import { TopBar } from './ui/TopBar'
import { NationalReadout } from './ui/NationalReadout'
import { DistrictPanel } from './ui/DistrictPanel'

export default function App() {
  const [world, setWorld] = useState<World | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(location.search).get('d'))

  useEffect(() => {
    loadWorld().then(setWorld, (e) => setError(String(e.message ?? e)))
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

  if (error)
    return (
      <main className="fallback">
        <p>ARQ couldn't load today's air data ({error}). Refresh to try again.</p>
      </main>
    )
  if (!world) return <main className="fallback" aria-busy="true" />

  return (
    <main className="app">
      <ArqMap world={world} selected={selected} onSelect={setSelectedId} panelOpen={!!selected} />
      <TopBar world={world} onSelect={setSelectedId} />
      <NationalReadout world={world} onSelect={setSelectedId} />
      {selected && <DistrictPanel key={selected.id} d={selected} onClose={() => setSelectedId(null)} />}
    </main>
  )
}

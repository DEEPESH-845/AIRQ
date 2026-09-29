import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadWorld, type District, type World } from './lib/world'
import { AirqMap, type Focus } from './map/AirqMap'
import { Intro } from './ui/Intro'
import { TopBar } from './ui/TopBar'
import { NationalReadout } from './ui/NationalReadout'
import { DistrictPanel } from './ui/DistrictPanel'
import { Rankings } from './ui/Rankings'
import { GeneralChat } from './ui/GeneralChat'
import { Boundary } from './ui/Boundary'
import { settle, bandName, type Result } from './lib/game'
import { Hud } from './ui/Hud'
import { MISSIONS, act, addPoints, checkIn, completeMission, getPlayer, markIntroSeen, shouldShowIntro, type MissionId, type Tab } from './lib/player'
import { defaultDistrict } from './lib/story'

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

  useEffect(() => {
    if (!world) return
    act((p) => checkIn(p, Date.now()))
    act((p) => addPoints(p, results.reduce((a, x) => a + x.points, 0), 'Forecast Duel results'))
  }, [world]) // eslint-disable-line react-hooks/exhaustive-deps -- once per loaded world; results arrive with it

  // deep link: ?d=<district id>
  useEffect(() => {
    const url = new URL(location.href)
    if (selectedId) url.searchParams.set('d', selectedId)
    else url.searchParams.delete('d')
    history.replaceState(null, '', url)
  }, [selectedId])

  useEffect(() => {
    if (selectedId) act((p) => completeMission(p, 'command'))
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
  const [tab, setTab] = useState<Tab>('orders')
  const [focusKey, setFocusKey] = useState(0)
  const [intro, setIntro] = useState(() => shouldShowIntro(getPlayer(), location.search))
  const [focus, setFocus] = useState<Focus>(null)
  const [introTrace, setIntroTrace] = useState<District | null>(null)
  // stable, so Intro's scene effect runs only when its step changes
  const onScene = useCallback((s: { focus: Focus; trace: District | null }) => {
    setFocus(s.focus)
    setIntroTrace(s.trace)
  }, [])
  // home: fly back to all of India; false when a district is being selected (its own camera move must win)
  const endIntro = (home = true) => {
    setIntro(false)
    setIntroTrace(null)
    setFocus(home ? { to: 'india' } : null)
    act(markIntroSeen)
  }
  useEffect(() => setTracing(false), [selectedId])
  const goMission = (id: MissionId) => {
    if (!world) return
    if (id === 'general') return setSide('general')
    setSelectedId((cur) => cur ?? defaultDistrict(world).id)
    const m = MISSIONS.find((x) => x.id === id)
    if (m?.tab) {
      setTab(m.tab)
      setFocusKey((k) => k + 1)
    }
  }
  const startTrace = () => {
    setTracing(true)
    act((p) => completeMission(p, 'trace'))
  }

  if (error)
    return (
      <main className="fallback">
        <p>AIRQ couldn't load today's air data ({error}). Refresh to try again.</p>
      </main>
    )
  if (!world) return <main className="fallback" aria-busy="true" />

  return (
    <main className="app">
      <AirqMap world={world} selected={selected} onSelect={setSelectedId} panelOpen={!!selected} trace={tracing ? selected : introTrace} highlight={highlight} focus={focus} />
      <TopBar world={world} onSelect={setSelectedId} onGeneral={() => setSide('general')} onHelp={() => setIntro(true)}>
        <Hud onMission={goMission} />
      </TopBar>
      <Boundary key={side}>
      {side === 'rankings' && <Rankings world={world} onSelect={setSelectedId} onClose={() => setSide('readout')} />}
      {side === 'general' && <GeneralChat selected={selected} onHighlight={setHighlight} onClose={() => { setSide('readout'); setHighlight([]) }} />}
      {side === 'readout' && !intro && <NationalReadout world={world} onSelect={setSelectedId} onRankings={() => setSide('rankings')} />}
      </Boundary>
      {intro && (
        <Intro
          world={world}
          onScene={onScene}
          onPick={(id) => {
            endIntro(false)
            setSelectedId(id)
          }}
          onSearch={() => {
            endIntro()
            document.getElementById('district-search')?.focus()
          }}
          onDone={() => endIntro()}
        />
      )}
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
              {r.name}: you called {bandName(r.band)}, it came in at {r.actual} ({bandName(r.actualBand)}). <b>+{r.points} XP</b>
            </p>
          ))}
          <button onClick={() => setResults([])}>Got it</button>
        </div>
      )}
      {selected && (
        <Boundary key={selected.id}>
        <DistrictPanel d={selected} world={world} tab={tab} onTab={setTab} focusKey={focusKey} onClose={() => setSelectedId(null)} onTrace={startTrace} onHighlight={setHighlight} />
        </Boundary>
      )}
    </main>
  )
}

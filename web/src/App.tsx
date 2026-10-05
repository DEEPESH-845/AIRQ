import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { loadWorld, type District, type World } from './lib/world'
import { AirqMap, type Focus } from './map/AirqMap'
import { Intro } from './ui/Intro'
import { RaidBanner } from './ui/RaidBanner'
import { MapKey } from './ui/MapKey'

const HowItWorks = lazy(() => import('./ui/HowItWorks'))
const Guide = lazy(() => import('./ui/Guide'))
import type { ShowTarget } from './ui/Guide'
import { Impact, type ImpactTab } from './ui/Impact'
import type { Pick } from './ui/FireWatch'
import { issueCert, sync, useAccount, useFeed } from './lib/account'
const Certificate = lazy(() => import('./ui/Certificate'))
import { TopBar } from './ui/TopBar'
import { NationalReadout } from './ui/NationalReadout'
import { DistrictPanel } from './ui/DistrictPanel'
import { Rankings } from './ui/Rankings'
import { GeneralChat } from './ui/GeneralChat'
import { Boundary } from './ui/Boundary'
import { settle, bandName, type Result } from './lib/game'
import { Hud } from './ui/Hud'
import { MISSIONS, act, addPoints, checkIn, completeMission, getPlayer, markIntroSeen, shouldShowIntro, usePlayer, type MissionId, type Tab } from './lib/player'
import { defaultDistrict, nearestDistrict } from './lib/story'
import { ECO } from './lib/account'

export default function App() {
  const [world, setWorld] = useState<World | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(location.search).get('d'))

  const [results, setResults] = useState<Result[]>([])
  useEffect(() => {
    loadWorld().then((w) => {
      setWorld(w)
      setSelectedId((cur) => (cur && w.districts.some((d) => d.id === cur) ? cur : null)) // drop a stale ?d=
      const r = settle(w.districts, w.generatedAt)
      setResults(r) // the results toast shows the XP; award in the same step so a closed tab can't lose it
      act((p) => addPoints(p, r.reduce((a, x) => a + x.points, 0), 'Forecast Duel results'))
    }, (e) => setError(String(e.message ?? e)))
  }, [])

  useEffect(() => {
    if (!world) return
    act((p) => checkIn(p, Date.now())) // after Hud mounts, so its toast shows
  }, [world])
  // the server's daily check-in (credits) and game XP for the leaderboard: on load, then settled XP changes
  const xp = usePlayer().xp
  useEffect(() => {
    if (!world) return
    const t = setTimeout(() => sync(getPlayer().xp), 1500)
    return () => clearTimeout(t)
  }, [world, xp])

  // deep link: ?d=<district id>. Opening a district pushes a history entry so Back closes it.
  useEffect(() => {
    const url = new URL(location.href)
    const cur = url.searchParams.get('d')
    if (cur === selectedId) return
    if (selectedId) url.searchParams.set('d', selectedId)
    else url.searchParams.delete('d')
    if (selectedId && !cur) history.pushState({ airqDistrict: true }, '', url)
    else history.replaceState(history.state, '', url)
  }, [selectedId])
  useEffect(() => {
    const onPop = () => setSelectedId(new URLSearchParams(location.search).get('d'))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  // closing from the UI undoes our own history entry, so Back doesn't land on a duplicate
  const closeDistrict = () => (history.state?.airqDistrict ? history.back() : setSelectedId(null))

  useEffect(() => {
    if (selectedId) act((p) => completeMission(p, 'command'))
  }, [selectedId])


  const selected = useMemo(() => world?.districts.find((d) => d.id === selectedId) ?? null, [world, selectedId])
  const [tracing, setTracing] = useState(false)
  const invited = new URLSearchParams(location.search).has('team')
  const [side, setSide] = useState<'readout' | 'rankings' | 'general' | 'impact'>(invited ? 'impact' : 'readout')
  const [impactTab, setImpactTab] = useState<ImpactTab>(invited ? 'team' : 'earn')
  const [guide, setGuide] = useState(false)
  const [picking, setPicking] = useState(false)
  const [fieldPick, setFieldPick] = useState<Pick | null>(null)
  const [pickMsg, setPickMsg] = useState('')
  const [cert, setCert] = useState<string | null>(() => new URLSearchParams(location.search).get('cert'))
  // ?team=CODE (an invite link) opens the Team tab with the code filled in
  const [invite] = useState<string | null>(() => new URLSearchParams(location.search).get('team')?.toUpperCase().slice(0, 6) ?? null)
  const { me } = useAccount()
  const feed = useFeed()
  // districts with an action in the last 15 minutes send out a ripple
  const fresh = useMemo(() => {
    const cut = Date.now() - 15 * 60e3
    return [...new Set((feed?.recent ?? []).filter((r) => new Date(r.at).getTime() > cut).map((r) => r.d))]
  }, [feed])
  const mapField = useMemo(() => {
    const f = me?.field
    return f ? { c: f.c, r: f.r, fire: !!f.burnt.length && f.burnt[f.burnt.length - 1] === f.last } : null
  }, [me?.field])
  const [highlight, setHighlight] = useState<string[]>([])
  const [tab, setTab] = useState<Tab>('orders')
  const [focusKey, setFocusKey] = useState(0)
  const [how, setHow] = useState(false)
  const [spot, setSpot] = useState<MissionId | null>(null)
  const [keyOpen, setKeyOpen] = useState(() => innerWidth >= 760)
  // Escape closes the top-most layer only: the sheet, else a running trace, else the district.
  // Never while typing (inputs use Escape to clear themselves). One handler: a second listener
  // in the sheet would be detached by the re-render before it ran.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (how) setHow(false)
      else if (cert) closeCert()
      else if (picking) cancelPick()
      else if (guide) setGuide(false)
      else if (tracing) setTracing(false)
      else if (side !== 'readout') setSide('readout')
      else if (selectedId) closeDistrict()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [how, cert, picking, guide, tracing, side, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps -- closeDistrict only reads history
  const [intro, setIntro] = useState(() => shouldShowIntro(getPlayer(), location.search) && !/[?&](cert|team)=/.test(location.search))
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
    // give keyboard focus somewhere sensible when the card disappears
    if (home) requestAnimationFrame(() => document.querySelector<HTMLElement>('.help-btn')?.focus())
  }
  // choosing a district any way (map, search, rankings) ends the briefing: they have taken command
  const select = (id: string | null) => {
    if (!id) return closeDistrict()
    setSelectedId(id)
    if (intro) endIntro(false)
  }
  useEffect(() => setTracing(false), [selectedId])
  const goMission = (id: MissionId) => {
    if (!world) return
    if (id === 'general') return openGeneral()
    setSelectedId((cur) => cur ?? defaultDistrict(world).id)
    if (intro) endIntro(false)
    const m = MISSIONS.find((x) => x.id === id)
    if (m?.tab) {
      setTab(m.tab)
      setSpot(id)
      setFocusKey((k) => k + 1)
    }
  }
  const openGeneral = () => {
    if (intro) endIntro()
    setSide('general')
  }
  const openImpact = (t: ImpactTab) => {
    if (intro) endIntro()
    setImpactTab(t)
    setSide('impact')
  }
  // the Field Manual's "Show me" buttons drive the real interface
  const show = (t: ShowTarget) => {
    if (!world) return
    setGuide(false)
    if (t === 'map') {
      closeDistrict()
      setSide('readout')
      setKeyOpen(true)
    } else if (t === 'orders' || t === 'battle') {
      setSelectedId((cur) => cur ?? defaultDistrict(world).id)
      setTab(t)
    } else if (t === 'earn' || t === 'shop' || t === 'leaders') openImpact(t)
    else if (t === 'field') {
      if (me?.field) showField()
      else if (me) startPick()
      else openImpact('earn')
    } else goMission(t)
  }
  // Fire Watch: hide the panel, let the player tap their field, then reopen with the pin
  const startPick = () => {
    closeDistrict()
    setSide('readout')
    setPickMsg('')
    setPicking(true)
    setFocus(innerWidth < 760 ? { to: [75.6, 30.5], zoom: 5.7 } : { to: [76.2, 30.0], zoom: 6.3 }) // the Punjab-Haryana stubble belt
  }
  // same rule as the server (field_error): in an Indo-Gangetic district, or near recent farm fires
  const inBelt = (lon: number, lat: number) => {
    if (!world) return false
    const d = nearestDistrict(world.districts, lon, lat)
    const km = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110.57)
    if (km(d.c, [lon, lat]) > 100) return false
    return d.k !== 'rest' || world.fires.filter((f) => km([lon, lat], [f[0], f[1]]) <= ECO.fieldWatch.beltKm).length >= 3
  }
  function cancelPick() {
    setPicking(false)
    openImpact('earn')
  }
  const showField = () => {
    if (!me?.field) return
    if (innerWidth < 760) setSide('readout') // the panel covers the map on phones
    setFocus({ to: me.field.c, zoom: 9 })
  }
  const openCert = async () => {
    try {
      setCert((await issueCert()).token)
    } catch {
      /* the button is disabled until a first verified action; a server error leaves it closed */
    }
  }
  function closeCert() {
    setCert(null)
    const u = new URL(location.href)
    if (u.searchParams.has('cert')) {
      u.searchParams.delete('cert')
      history.replaceState(history.state, '', u)
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
      <AirqMap
        world={world}
        selected={selected}
        onSelect={select}
        panelOpen={!!selected}
        trace={tracing ? selected : introTrace}
        highlight={highlight}
        focus={focus}
        community={feed?.byDistrict}
        pacts={feed?.pacts}
        fresh={fresh}
        field={mapField}
        onPick={
          picking
            ? (lon, lat) => {
                if (!inBelt(lon, lat)) return setPickMsg('Not in the stubble belt. Tap a farm in Punjab, Haryana, west UP or Bihar.')
                setPicking(false)
                setFieldPick({ lon, lat })
                openImpact('earn')
              }
            : null
        }
      />
      <TopBar world={world} onSelect={select} onGeneral={openGeneral} onHelp={() => setGuide(true)}>
        <Hud onMission={goMission} onImpact={openImpact} />
        {/* pin mode clears the map: the readout, key and raid banner would cover the field you need to tap */}
        {!intro && !picking && <RaidBanner world={world} onSelect={select} />}
        {!selected && side === 'readout' && !picking && <MapKey open={keyOpen} onToggle={setKeyOpen} />}
      </TopBar>
      <Boundary key={side}>
      {side === 'rankings' && <Rankings world={world} onSelect={select} onClose={() => setSide('readout')} />}
      {side === 'general' && <GeneralChat selected={selected} onHighlight={setHighlight} onClose={() => { setSide('readout'); setHighlight([]) }} />}
      {side === 'impact' && (
        <Impact
          world={world}
          tab={impactTab}
          onTab={setImpactTab}
          home={selected ?? defaultDistrict(world)}
          onClose={() => setSide('readout')}
          pick={fieldPick}
          onPickField={startPick}
          onShowField={showField}
          onCert={openCert}
          invite={invite}
        />
      )}
      {side === 'readout' && !intro && !picking && <NationalReadout world={world} onSelect={select} onRankings={() => setSide('rankings')} onImpact={() => openImpact('leaders')} />}
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
      {guide && (
        <Boundary>
        <Suspense fallback={null}>
          <Guide
            world={world}
            onClose={() => setGuide(false)}
            onShow={show}
            onHow={() => {
              setGuide(false)
              setHow(true)
            }}
            onReplayIntro={() => {
              setGuide(false)
              closeDistrict()
              setSide('readout')
              setIntro(true)
            }}
          />
        </Suspense>
        </Boundary>
      )}
      {how && (
        <Suspense fallback={null}>
          <HowItWorks
            onClose={() => setHow(false)}
            onReplay={() => {
              setHow(false)
              closeDistrict()
              setSide('readout') // same as the Field Manual's replay: nothing left open under the briefing
              setIntro(true)
            }}
          />
        </Suspense>
      )}
      {picking && (
        <div className="trace-banner pick-banner" role="status">
          <span aria-live="polite">{pickMsg || <>Tap your <b>field</b> on the map. Zoom in to be precise.</>}</span>
          <button onClick={cancelPick}>Cancel</button>
        </div>
      )}
      {cert && (
        <Boundary>
          <Suspense fallback={null}>
            <Certificate token={cert} world={world} onClose={closeCert} />
          </Suspense>
        </Boundary>
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
        <DistrictPanel d={selected} world={world} tab={tab} onTab={setTab} focusKey={focusKey} spot={spot} onClose={closeDistrict} onTrace={startTrace} onHighlight={setHighlight} onEarn={() => openImpact('earn')} />
        </Boundary>
      )}
    </main>
  )
}

// Layout check at real screen sizes, without enlisting players. Usage: node scripts/screens.mjs  (dev server on BASE or :5173)
import { chromium } from 'playwright'
const base = process.env.BASE ?? 'http://localhost:5173'
const SIZES = [[320, 568], [360, 740], [390, 844], [844, 390], [768, 1024], [1024, 768], [1280, 720], [1366, 768], [1440, 900], [2560, 1440]]
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let fails = 0
const bad = (s, m) => (fails++, console.log(`FAIL ${s}: ${m}`))
for (const [w, h] of SIZES) {
  const s = `${w}x${h}`
  const touch = Math.min(w, h) < 800
  const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch })
  await p.goto(base, { waitUntil: 'networkidle' })
  await p.waitForSelector('.intro', { timeout: 15000 })
  await p.click('.intro-actions button >> nth=0') // Just look around
  await p.waitForTimeout(1500)
  const lay = () => p.evaluate(() => {
    const off = [...document.querySelectorAll('button, a, input, summary')].filter((e) => {
      const r = e.getBoundingClientRect()
      return r.width && e.checkVisibility({ visibilityProperty: true }) && (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1)
    }).map((e) => e.className || e.textContent?.slice(0, 20))
    let mapHits = 0
    for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) mapHits += document.elementFromPoint((innerWidth * i) / 10, (innerHeight * j) / 10)?.closest('.maplibregl-map') ? 1 : 0
    return { hscroll: document.documentElement.scrollWidth > innerWidth, off, map: mapHits / 81 }
  })
  const home = await lay()
  if (home.hscroll) bad(s, 'horizontal scroll on home')
  if (home.off.length) bad(s, `off-screen on home: ${home.off.join(', ')}`)
  if (home.map < 0.35) bad(s, `map only ${Math.round(home.map * 100)}% visible on home`)
  await p.screenshot({ path: `/tmp/airq-shots/screens-${s}-home.png` })
  await p.fill('#district-search', 'Delhi')
  await p.keyboard.press('Enter')
  await p.waitForSelector('.call-card')
  await p.waitForTimeout(800)
  const card = await p.$eval('.call-card', (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  if (!card) bad(s, 'call card not fully visible without scrolling')
  const panel = await lay()
  if (panel.hscroll) bad(s, 'horizontal scroll with panel')
  if (panel.map < 0.2) bad(s, `map only ${Math.round(panel.map * 100)}% visible with panel open`)
  await p.screenshot({ path: `/tmp/airq-shots/screens-${s}-panel.png` })
  await p.close()
}
await b.close()
console.log(fails ? `screens: ${fails} FAIL` : 'screens: ok')
process.exitCode = fails ? 1 : 0

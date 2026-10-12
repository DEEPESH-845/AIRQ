// Top bar checks: More menu items, Escape and outside tap close only the menu, Hindi switch. Usage: node scripts/topbar.mjs (dev server on BASE or :5173)
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await p.addInitScript(() => { localStorage.setItem('airq.player', JSON.stringify({ introSeen: true })); localStorage.removeItem('airq.lang') })
await p.goto((process.env.BASE ?? 'http://localhost:5173') + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
const fail = (m) => (console.log('FAIL', m), process.exitCode = 1)
if (await p.$('.hud-rank, .hud-next, .general-btn, .help-btn')) fail('old top-bar controls still present')
await p.fill('#district-search', 'Delhi'); await p.keyboard.press('Enter'); await p.waitForSelector('.panel')
for (const [label, sel] of [['Ask AIRQ AI', '.general, .chat, [aria-label*="General"], [aria-label*="AI"]'], ['Field Manual', '.guide'], ['How AIRQ works', '.how'], ['Leaderboard', '.impact']]) {
  await p.click('.more-btn'); await p.click(`.more-menu button:has-text("${label}")`); await p.waitForTimeout(700)
  if (await p.$eval('details.more', (d) => d.open)) fail(`menu stayed open after ${label}`)
  console.log(label, '->', !!(await p.$(sel)))
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
}
// Escape closes only the menu
if (!(await p.$('.panel'))) { await p.fill('#district-search', 'Delhi'); await p.keyboard.press('Enter'); await p.waitForSelector('.panel') }
await p.click('.more-btn'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
if (await p.$eval('details.more', (d) => d.open)) fail('Escape did not close menu')
if (!(await p.$('.panel'))) fail('Escape on menu closed the district too')
// outside tap closes
await p.click('.more-btn'); await p.mouse.click(640, 400); await p.waitForTimeout(200)
if (await p.$eval('details.more', (d) => d.open)) fail('outside click did not close menu')
// Hindi
await p.click('.more-btn'); await p.click('.more-menu [lang=hi]'); await p.waitForTimeout(300)
const tabs = await p.$$eval('[role=tab]', (t) => t.map((x) => x.textContent).join())
const ph = await p.getAttribute('#district-search', 'placeholder')
const card = await p.textContent('.call-card h2')
console.log('hi:', tabs, '|', ph, '|', card)
if (tabs !== 'आज,क्यों,कल') fail('tabs not Hindi')
await p.keyboard.press('Escape')
await p.screenshot({ path: '/tmp/airq-shots/t6.png' })
if (errs.length) fail('errors: ' + errs.join(' | ').slice(0, 400))
console.log(process.exitCode ? 'T6 FAIL' : 'T6 ok')
await b.close()
// Checkpoint verifier: loads AIRQ, fails on console errors, saves screenshots.
// Usage: node scripts/shot.mjs <name> [path] [--mobile] [--click=<selector>]...
import { chromium } from 'playwright'
const [name = 'home', path = '/', ...flags] = process.argv.slice(2)
const mobile = flags.includes('--mobile')
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
const base = process.env.BASE ?? 'http://localhost:5173'
const same = (u) => new URL(u).origin === new URL(base).origin
page.on('requestfailed', (r) => same(r.url()) && errors.push(`request failed: ${r.url()}`))
page.on('response', (r) => same(r.url()) && r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`))
await page.goto(base + path, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)
for (const f of flags.filter((f) => f.startsWith('--click='))) {
  await page.click(f.slice(8))
  await page.waitForTimeout(2200)
}
const out = `/tmp/airq-shots/${name}${mobile ? '-m' : ''}.png`
await page.screenshot({ path: out })
console.log(out)
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
process.exitCode = errors.length ? 1 : 0
await browser.close()

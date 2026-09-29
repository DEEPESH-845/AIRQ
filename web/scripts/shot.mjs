// Checkpoint verifier: loads ARQ, fails on console errors, saves screenshots.
// Usage: node scripts/shot.mjs <name> [path] [--mobile] [--click=<selector>]...
import { chromium } from 'playwright'
const [name = 'home', path = '/', ...flags] = process.argv.slice(2)
const mobile = flags.includes('--mobile')
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:5173' + path, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)
for (const f of flags.filter((f) => f.startsWith('--click='))) {
  await page.click(f.slice(8))
  await page.waitForTimeout(2200)
}
const out = `/tmp/arq-shots/${name}${mobile ? '-m' : ''}.png`
await page.screenshot({ path: out })
console.log(out)
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()

// Keyboard check for the district tabs. Usage: node scripts/keys.mjs  (dev server on BASE or :5173)
import { chromium } from 'playwright'
const base = process.env.BASE ?? 'http://localhost:5173'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const fail = (m) => {
  console.error('FAIL:', m)
  process.exitCode = 1
}
await page.goto(base + '/', { waitUntil: 'networkidle' })
const id = await page.evaluate(async () => (await (await fetch('/data/world.json')).json()).districts[0].id)
await page.goto(`${base}/?d=${id}`, { waitUntil: 'networkidle' })
if (!(await page.waitForSelector('[role=tab]', { timeout: 10000 }).catch(() => null))) {
  fail('no tabs rendered')
  console.log('keys: FAIL')
  await browser.close()
  process.exit(1)
}
const sel = () => page.$eval('[role=tab][aria-selected=true]', (e) => e.textContent)
await page.focus('[role=tab][aria-selected=true]')
if ((await sel()) !== 'Orders') fail('starts on Orders')
await page.keyboard.press('ArrowRight')
if ((await sel()) !== 'Battle') fail('ArrowRight -> Battle')
await page.keyboard.press('End')
if ((await sel()) !== 'Play') fail('End -> Play')
await page.keyboard.press('ArrowRight')
if ((await sel()) !== 'Orders') fail('ArrowRight wraps to Orders')
await page.keyboard.press('ArrowLeft')
if ((await sel()) !== 'Play') fail('ArrowLeft wraps to Play')
if ((await page.$eval('[role=tabpanel]', (e) => e.getAttribute('aria-labelledby'))) !== 'tab-play') fail('tabpanel follows the tab')
if ((await page.evaluate(() => document.activeElement?.getAttribute('role'))) !== 'tab') fail('focus stays in the tablist')
console.log(process.exitCode ? 'keys: FAIL' : 'keys: ok')
await browser.close()

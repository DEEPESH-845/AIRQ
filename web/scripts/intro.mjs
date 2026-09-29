// Briefing behaviour checks. Usage: node scripts/intro.mjs  (dev server on BASE or :5173)
import { chromium } from 'playwright'
const base = process.env.BASE ?? 'http://localhost:5173'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const fail = (m) => {
  console.error('FAIL:', m)
  process.exitCode = 1
}
const fresh = async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.intro')
  return page
}

// Escape typed inside the search box must not dismiss the briefing
let page = await fresh()
await page.focus('#district-search')
await page.keyboard.press('Escape')
if (!(await page.$('.intro'))) fail('Escape in the search box dismissed the briefing')
await page.close()

// picking a district any other way (search) ends the briefing and keeps the district open
page = await fresh()
const name = await page.evaluate(async () => (await (await fetch('/data/world.json')).json()).districts[0].n)
await page.fill('#district-search', name)
await page.keyboard.press('Enter')
await page.waitForTimeout(800)
if (await page.$('.intro')) fail('briefing still open after picking a district from search')
if (!(await page.$('.panel'))) fail('district panel not open after picking from search')
if (!new URL(page.url()).searchParams.get('d')) fail('no ?d= after picking from search')
await page.close()

// Escape outside inputs still skips the briefing
page = await fresh()
await page.keyboard.press('Escape')
if (await page.$('.intro')) fail('Escape did not skip the briefing')
await page.close()

console.log(process.exitCode ? 'intro: FAIL' : 'intro: ok')
await browser.close()

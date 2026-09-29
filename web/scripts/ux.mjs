// UX regression checks. Usage: node scripts/ux.mjs  (dev server on BASE or :5173)
import { chromium } from 'playwright'
const base = process.env.BASE ?? 'http://localhost:5173'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const fail = (m) => {
  console.error('FAIL:', m)
  process.exitCode = 1
}
const world = await (await fetch(base + '/data/world.json')).json()
const traced = world.districts.find((d) => d.clusters.some((c) => c.fires > 0)) ?? world.districts[0]
const open = async (id = world.districts[0].id) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${base}/?d=${id}`, { waitUntil: 'networkidle' }) // deep link: no briefing
  await page.waitForSelector('.panel')
  return page
}

// Escape while typing in the search box clears the box, not the open district
let page = await open()
await page.fill('#district-search', 'del')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
if (!(await page.$('.panel'))) fail('Escape in the search box closed the district')
await page.close()

// browser Back closes the district and stays on the site
page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.keyboard.press('Escape')
await page.fill('#district-search', world.districts[0].n)
await page.keyboard.press('Enter')
await page.waitForSelector('.panel')
await page.goBack()
await page.waitForTimeout(500)
if (!page.url().startsWith(base)) fail(`Back left the site (${page.url()})`)
else if (await page.$('.panel')) fail('Back did not close the district')
await page.close()

// Escape during a trace ends the trace only
page = await open(traced.id)
await page.click('#tab-battle')
const trace = await page.$('.trace')
if (trace) {
  await trace.click()
  await page.waitForSelector('.trace-banner')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  if (await page.$('.trace-banner')) fail('Escape did not end the trace')
  if (!(await page.$('.panel'))) fail('Escape during a trace also closed the district')
}
await page.close()

// the "Tailor today's orders" prompt brings the persona chips into focus
page = await open()
await page.click('.hud-next')
await page.waitForTimeout(600)
if (!(await page.evaluate(() => !!document.activeElement?.closest('[data-mission="orders"]'))))
  fail('mission prompt did not move focus to the persona chips')
await page.close()

// opening Ask the General during the briefing ends the briefing (no card over the chat)
page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.click('.general-btn')
await page.waitForTimeout(300)
if (await page.$('.intro')) fail('briefing stayed open over Ask the General')
await page.close()

console.log(process.exitCode ? 'ux: FAIL' : 'ux: ok')
await browser.close()

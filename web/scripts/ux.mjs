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

// closing a district from the UI (here: Replay the briefing) must not leave a dead history entry behind
page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.keyboard.press('Escape')
await page.fill('#district-search', world.districts[0].n)
await page.keyboard.press('Enter')
await page.waitForSelector('.panel')
await page.click('.help-btn')
await page.waitForSelector('.how-replay')
await page.click('.how-replay')
await page.waitForTimeout(500)
if (await page.evaluate(() => history.state?.airqDistrict === true)) fail('closing via the UI left the district history entry behind')
if (await page.$('.panel')) fail('Replay the briefing did not close the district')
await page.close()

// a stale ?d= (district not in today's world) opens nothing and leaves no phantom selection
page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(base + '/?d=nope', { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
if (new URL(page.url()).searchParams.get('d')) fail('unknown ?d= kept in the URL')
await page.close()

// zooming in and back out keeps every district coloured (animating data-driven paint once left half of India blank).
// Needs real GPU timing: under swiftshader the frames are too slow to starve the tile loads.
const gpu = await chromium.launch({ channel: 'chrome' }).catch(() => null)
if (!gpu) console.warn('skip: zoom colour check needs Google Chrome installed')
else {
page = await gpu.newPage({ viewport: { width: 1440, height: 800 } })
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.keyboard.press('Escape')
await page.waitForTimeout(2000)
await page.mouse.move(720, 600)
for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -250), await page.waitForTimeout(120)
await page.waitForTimeout(2500)
for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 300), await page.waitForTimeout(120)
await page.waitForTimeout(2500)
const blank = await page.evaluate(async (b64) => {
  // pixels in the uncoloured-land shade (#2a2650): India with no district fill on top
  const img = new Image()
  img.src = 'data:image/png;base64,' + b64
  await img.decode()
  const x = new OffscreenCanvas(img.width, img.height).getContext('2d')
  x.drawImage(img, 0, 0)
  const d = x.getImageData(0, 0, img.width, img.height).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 42) < 3 && Math.abs(d[i + 1] - 38) < 3 && Math.abs(d[i + 2] - 80) < 3) n++
  return n
}, (await page.screenshot()).toString('base64'))
if (blank > 6000) fail(`districts left uncoloured after zooming in and out (${blank} blank px)`)
await gpu.close()
}

console.log(process.exitCode ? 'ux: FAIL' : 'ux: ok')
await browser.close()

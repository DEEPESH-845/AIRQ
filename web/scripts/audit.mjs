// Full UI audit: drives every screen and control, checks layout on each one, keeps going past failures.
// Usage: node scripts/audit.mjs [--mobile]   (BASE defaults to the vite dev server; /api is the live stack)
// Optional AUDIT_PID/AUDIT_TOKEN: a funded test player for the shop flows (otherwise a fresh player is enlisted).
import { chromium } from 'playwright'
const mobile = process.argv.includes('--mobile')
const base = process.env.BASE ?? 'http://localhost:5173'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const ctx = await browser.newContext({
  ...(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } }),
  permissions: ['camera', 'geolocation', 'clipboard-read', 'clipboard-write'],
  geolocation: { latitude: 30.9, longitude: 75.85 }, // Ludhiana, in the stubble belt
})
const page = await ctx.newPage()
const issues = []
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`))
page.on('dialog', (d) => d.accept())
page.on('response', async (r) => {
  if (r.status() < 400 || !r.url().includes('/api/')) return
  const body = await r.text().catch(() => '')
  if (/No team with that code/.test(body)) return // the audit enters a wrong invite code on purpose
  errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}: ${body.slice(0, 120)}`)
})
const tag = mobile ? '[m]' : '[d]'
const bad = (m) => issues.push(`${tag} ${m}`)
const wait = (ms) => page.waitForTimeout(ms)
const shot = (n) => page.screenshot({ path: `/tmp/airq-shots/audit-${n}${mobile ? '-m' : ''}.png` })
async function step(name, fn) {
  try {
    await fn()
  } catch (e) {
    bad(`${name}: ${String(e.message ?? e).split('\n')[0].slice(0, 160)}`)
    await shot(`fail-${name.replace(/\W+/g, '-').slice(0, 30)}`).catch(() => {})
  }
}

// layout checks for whatever is on screen now
async function layout(screen) {
  const found = await page.evaluate((mobile) => {
    const out = []
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px)`)
    // a modal or sheet on top makes everything beneath it intentionally unreachable: judge only what's inside it
    const modal = document.querySelector('.cert-wrap, .how, .guide')
    const scrollsX = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true
      return false
    }
    const els = [...document.querySelectorAll('button, a[href], input, select, summary, [role=tab], [role=radio]')].filter((el) => !modal || modal.contains(el))
    for (const el of els) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden]')) continue
      if (el.matches('input[type=file]')) continue
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
      // only judge elements inside the viewport vertically (scroll containers hide the rest on purpose)
      if (r.bottom < 0 || r.top > innerHeight) continue
      // scrolled out of its own scroll container (a list, a chapter strip): hidden on purpose
      let sc = el.parentElement
      while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY + getComputedStyle(sc).overflowX)) sc = sc.parentElement
      if (sc && sc !== document.documentElement) {
        const b = sc.getBoundingClientRect()
        if (r.top < b.top - 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1 || r.right > b.right + 1) continue
      }
      if ((r.left < -1 || r.right > innerWidth + 1) && !scrollsX(el)) out.push(`cut off sideways: "${label}"`)
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1)
      const cy = Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 0), innerHeight - 1)
      const hit = document.elementFromPoint(cx, cy)
      // something else on top, and not something that belongs to this control
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !(el.matches('input') && hit.closest('label')?.contains(el))) {
        const clip = el.closest('.impact-body, .guide-body, .guide-nav, .panel, .rank-list, .chat, .rankings, .how')
        // a deliberate overlay (sheet, full-screen panel, card) on top of something outside it is layering, not a bug
        const over = hit.closest('.panel, .rankings, .intro, .cert-wrap, .how, .toast, .trace-banner')
        if (over && !over.contains(el)) continue
        // inside a scroll container the control may just be scrolled under that container's own header
        const by = (hit.className && String(hit.className).slice(0, 30)) || hit.tagName
        if (!(clip && clip.contains(hit))) out.push(`covered: "${label}" under ${by}`)
      }
      if (mobile && r.height < 24 && !el.matches('a, summary, .linkish')) out.push(`small tap target (${Math.round(r.height)}px): "${label}"`)
    }
    return out
  }, mobile)
  for (const f of [...new Set(found)]) bad(`${screen}: ${f}`)
}

// close every layer (sheet, side panel, district) so each section starts from the map
async function reset() {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape')
    await wait(150)
  }
  await wait(400)
}

const world = await (await fetch(base + '/data/world.json')).json().catch(() => null)
const raidId = world?.raids?.[0]?.id

// ---------------- first visit: the briefing
await page.goto(base, { waitUntil: 'networkidle' })
await wait(2500)
await step('intro shows on first visit', () => page.waitForSelector('.intro', { timeout: 5000 }))
await layout('intro 1')
await step('intro next', async () => {
  await page.click('.intro .primary')
  await wait(1800)
  await layout('intro 2')
  await page.click('.intro .primary')
  await wait(800)
})
await shot('intro3')
await step('intro use my location', async () => {
  await page.click('.intro-actions button:has-text("Use my location")')
  await page.waitForSelector('.intro-actions span b', { timeout: 8000 })
  const near = await page.textContent('.intro-actions span b')
  if (!near) bad('nearest district empty')
})
await step('intro take command', async () => {
  await page.click('.intro-actions .primary')
  await page.waitForSelector('.panel', { timeout: 8000 })
  if (await page.isVisible('.intro')) bad('intro still visible after taking command')
})
await wait(1800)
await layout('district orders')
await shot('orders')

// ---------------- district panel
await step('persona radios', async () => {
  for (const b of await page.$$('[data-mission="orders"] button')) {
    await b.click()
    if ((await b.getAttribute('aria-checked')) !== 'true') bad('persona radio did not check')
  }
})
await step('briefing show on map', async () => {
  const b = await page.$('.briefing .linkish')
  if (b) await b.click()
})
await step('battle tab', async () => {
  await page.click('[role=tab]:has-text("Battle")')
  await wait(400)
  await layout('battle')
  await shot('battle')
})
await step('trace the smoke', async () => {
  const t = await page.$('.trace')
  if (!t) return
  await t.click()
  await page.waitForSelector('.trace-banner', { timeout: 4000 })
  await wait(1500)
  await shot('trace')
  await page.click('.trace-banner button')
  if (await page.isVisible('.trace-banner')) bad('trace Done did not close')
})
await step('report a source', async () => {
  await page.click('#rep-h')
  const radios = await page.$$('[aria-label="What did you see"] button')
  if (!radios.length) return bad('no report types')
  await radios[0].click()
  await page.fill('.where input', 'Near the bus stand')
  await page.waitForSelector('.report-actions', { timeout: 3000 })
  const email = await page.getAttribute('.report-actions a[href^="mailto:"]', 'href')
  if (!email || !email.includes('subject=')) bad('complaint email link malformed')
  const x = await page.getAttribute('.report-actions a[href*="x.com"], .report-actions a[href*="twitter"]', 'href')
  if (!x) bad('no X link')
  await layout('report source')
})
await step('citizens block', async () => {
  await page.waitForSelector('.citizens', { timeout: 3000 })
})
await step('play tab', async () => {
  await page.click('[role=tab]:has-text("Play")')
  await wait(400)
  await layout('play')
  await shot('play')
})
await step('replay', async () => {
  const b = await page.$('#rp-h ~ .duel-opts button')
  if (b) {
    await b.click()
    await page.waitForSelector('.reveal', { timeout: 3000 })
  }
})
await step('defend toggles and budget', async () => {
  const defs = await page.$$('.def')
  if (defs.length < 6) return bad(`only ${defs.length} defenses`)
  await defs[0].click()
  if ((await defs[0].getAttribute('aria-pressed')) !== 'true') bad('defense did not toggle on')
  const res = await page.textContent('.def-result')
  if (!/goes from/.test(res ?? '')) bad('defend result did not update')
  await defs[0].click()
  if ((await defs[0].getAttribute('aria-pressed')) !== 'false') bad('defense did not toggle off')
  await layout('defend')
})
await step('duel call', async () => {
  const b = await page.$('[data-mission="call"] button')
  if (b) {
    await b.click()
    await page.waitForSelector('#duel-h ~ .lede b', { timeout: 3000 })
  }
})
await step('panel keyboard tabs', async () => {
  await page.focus('[role=tab][aria-selected=true]')
  await page.keyboard.press('ArrowLeft')
  if ((await page.textContent('[role=tab][aria-selected=true]')) !== 'Battle') bad('ArrowLeft from Play')
})
await step('back button closes district', async () => {
  await page.goBack()
  await wait(800)
  if (await page.isVisible('.panel')) bad('Back did not close the district')
})

// ---------------- top bar
await reset()
await step('search', async () => {
  const q = mobile ? 'Luck' : 'Kanp'
  await page.fill('#district-search', q)
  await page.waitForSelector('#search-list li', { timeout: 3000 })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.panel', { timeout: 5000 })
  if ((await page.inputValue('#district-search')) !== '') bad('search not cleared after pick')
})
await step('close district', async () => {
  await page.click('.panel .icon-btn')
  await wait(700)
  if (await page.isVisible('.panel')) bad('close button did not close panel')
})
await step('raid banner', async () => {
  if (!raidId) return
  if (!(await page.isVisible('.raid-go'))) return bad('raid banner missing while raids exist')
  await page.click('.raid-go')
  await page.waitForSelector('.panel', { timeout: 5000 })
  await page.click('.panel .icon-btn')
  await wait(500)
  await page.click('.raid-x')
  if (await page.isVisible('.raid-banner')) bad('raid dismiss did not hide banner')
})
await step('map key toggle', async () => {
  const before = await page.$eval('.map-key', (e) => e.open)
  await page.click('.map-key summary')
  if ((await page.$eval('.map-key', (e) => e.open)) === before) bad('map key did not toggle')
})
await layout('home')
await shot('home')

// ---------------- readout + rankings
await reset()
await step('readout worst chip', async () => {
  if (mobile) return // hidden on phones by design
  await page.click('.worst button >> nth=0')
  await page.waitForSelector('.panel', { timeout: 5000 })
  await page.click('.panel .icon-btn')
  await wait(500)
})
await step('rankings', async () => {
  await page.click('.to-rankings')
  await page.waitForSelector('.rankings', { timeout: 3000 })
  await layout('rankings')
  for (const t of await page.$$('.rankings .seg button')) {
    await t.click()
    if ((await t.getAttribute('aria-selected')) !== 'true') bad('rankings tab not selected')
  }
  await page.selectOption('.state-pick select', { index: 3 })
  const rows = await page.$$('.rank-list li')
  if (!rows.length) bad('no rows for a state')
  await page.click('.rank-list button >> nth=0')
  await page.waitForSelector('.panel', { timeout: 5000 })
  await shot('rankings')
  await page.keyboard.press('Escape') // closes the rankings
  await page.keyboard.press('Escape') // closes the district
  await wait(600)
  if (await page.isVisible('.rankings')) bad('Escape did not close rankings')
})

// ---------------- the General
await reset()
await step('general chat', async () => {
  await page.click('.general-btn')
  await page.waitForSelector('.general', { timeout: 3000 })
  await layout('general')
  await page.click('.suggest button >> nth=0')
  await page.waitForSelector('.msg.general:not(.briefing-wait)', { timeout: 30000 })
  await shot('general')
  await page.click('.general .icon-btn')
  if (await page.isVisible('.general')) bad('General close failed')
})

// ---------------- Field Manual: every chapter, every Show me
await reset()
await step('field manual chapters', async () => {
  await page.click('.help-btn')
  await page.waitForSelector('.guide', { timeout: 4000 })
  const n = (await page.$$('.guide-nav button')).length
  for (let i = 0; i < n; i++) {
    await page.click(`.guide-nav button >> nth=${i}`)
    await wait(150)
    await layout(`guide ch${i + 1}`)
  }
  await page.click('.guide-foot button:has-text("Back")')
  await page.click('.guide-foot .primary') // Next
  await shot('guide')
  await page.click('.guide .icon-btn')
})
await reset()
const shows = await (async () => {
  await page.click('.help-btn')
  await page.waitForSelector('.guide')
  const list = []
  const n = (await page.$$('.guide-nav button')).length
  for (let i = 0; i < n; i++) {
    await page.click(`.guide-nav button >> nth=${i}`)
    for (const b of await page.$$('.guide-show button')) list.push([i, (await b.textContent()).trim()])
  }
  await page.click('.guide .icon-btn')
  return list
})().catch((e) => (bad(`collect show-me buttons: ${String(e.message).split('\n')[0]}`), []))
for (const [i, label] of shows) {
  await step(`show me "${label}"`, async () => {
    await page.click('.help-btn')
    await page.waitForSelector('.guide')
    await page.click(`.guide-nav button >> nth=${i}`)
    await page.click(`.guide-show button:has-text("${label.replace(' →', '')}")`)
    await wait(1200)
    if (await page.isVisible('.guide')) bad(`guide stayed open after "${label}"`)
    const state = await page.evaluate(() => ({ panel: !!document.querySelector('.panel'), side: !!document.querySelector('.rankings'), pick: !!document.querySelector('.pick-banner') }))
    if (!state.panel && !state.side && !state.pick && !/map/i.test(label)) bad(`"${label}" opened nothing`)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await wait(500)
  })
}
await step('how it works + replay briefing', async () => {
  await page.click('.help-btn')
  await page.click('.guide-more button:has-text("How AIRQ works")')
  await page.waitForSelector('aside.how', { timeout: 4000 })
  await layout('how it works')
  await page.click('.gloss summary >> nth=0')
  await page.click('.how-replay')
  await page.waitForSelector('.intro', { timeout: 4000 })
  await page.click('.intro-actions button:has-text("Skip")')
  await wait(800)
})

// ---------------- Impact: guest leaderboard, enlist, earn, Fire Watch, shop, certificate
await reset()
await step('guest leaderboard', async () => {
  const funded = process.env.AUDIT_PID
  if (funded) return
  await page.click('.hud-chip:has-text("Leaderboard"), .hud-chip[aria-label="Leaderboard"]')
  await page.waitForSelector('.leaders', { timeout: 4000 })
  await wait(1200)
  await layout('leaderboard guest')
  await page.click('.leaders .linkish') // Enlist
  await page.waitForSelector('.enlist', { timeout: 3000 })
})
if (process.env.AUDIT_PID) {
  await page.evaluate(([pid, token]) => localStorage.setItem('airq.account', JSON.stringify({ pid, token })), [process.env.AUDIT_PID, process.env.AUDIT_TOKEN])
  await page.reload({ waitUntil: 'networkidle' })
  await wait(2500)
  await page.click('.hud-chip >> nth=0')
} else {
  await step('enlist validation', async () => {
    await page.fill('.enlist input', 'a')
    if (await page.isEnabled('.enlist .primary-btn')) bad('enlist allowed a 1-letter callsign')
    await page.click('.enlist .linkish') // use my location
    await wait(1500)
    await layout('enlist')
    await page.fill('.enlist input', `Audit ${Math.floor(Math.random() * 900 + 100)}`)
    await page.click('.enlist .primary-btn')
    await page.waitForSelector('.earn', { timeout: 15000 })
  })
}
await wait(1000)
await layout('earn')
await shot('earn')
await step('earn: code action', async () => {
  const b = await page.$('.actions button:has(.code-chip):not([disabled])')
  if (!b) return bad('no enabled code action')
  await b.click()
  await page.click('.code-gate .primary-btn')
  await page.waitForSelector('.code-big b', { timeout: 8000 })
  await page.waitForSelector('.shutter:not([disabled])', { timeout: 8000 })
  await layout('earn code camera')
  await page.click('.shutter')
  await page.waitForSelector('.shot')
  await page.click('.shot-actions .linkish') // retake
  await page.waitForSelector('.camera video')
  await page.click('.shutter')
  await page.waitForSelector('.shot')
  await page.click('.shot-actions .primary-btn') // send: the fake camera feed should be rejected, not crash
  await page.waitForSelector('.checks', { timeout: 3000 })
  await shot('earn-checking')
  await page.waitForSelector('.verdict-card', { timeout: 40000 })
  await shot('earn-verdict')
  if ((await page.getAttribute('.verdict-card', 'data-ok')) === 'true') bad('fake camera test pattern was approved')
})
await step('fire watch pin + register + check', async () => {
  if (await page.$('.fw-status')) return
  await page.click('.firewatch .secondary-btn')
  await page.waitForSelector('.pick-banner', { timeout: 3000 })
  await wait(2200) // the map flies to the stubble belt first
  if (await page.isVisible('.impact') && mobile) bad('impact panel still covers the map during pin mode')
  // tap Ludhiana on the map
  const pt = await page.evaluate(() => {
    const m = document.querySelector('.map')
    const r = m.getBoundingClientRect()
    return [r.left + r.width / 2, r.top + r.height / 2]
  })
  if (mobile) await page.touchscreen.tap(pt[0], pt[1])
  else await page.mouse.click(pt[0], pt[1])
  await page.waitForSelector('.fw-form', { timeout: 4000 })
  await layout('fire watch form')
  await page.click('.fw-form .primary-btn')
  await wait(2500)
  const err = await page.$('.firewatch .warn')
  if (err) {
    // the map centre may be outside the belt; that's a valid refusal, but its message must show
    const t = await err.textContent()
    if (!t) bad('fire watch error empty')
  }
})
await step('shop', async () => {
  await page.click('.impact .seg button:has-text("Shop")')
  await page.waitForSelector('.shop', { timeout: 3000 })
  await layout('shop')
  await shot('shop')
  const buy = await page.$('.buy:not([disabled])')
  if (process.env.AUDIT_PID && buy) {
    await buy.click()
    await wait(1500)
  }
  await page.click('.shop .linkish') // Earn credits
  await page.waitForSelector('.earn')
})
await step('team tab', async () => {
  await page.click('.impact .seg button:has-text("Team")')
  await page.waitForSelector('.team', { timeout: 4000 })
  await layout('team')
  await page.click('.team .seg button:has-text("Create")')
  await page.fill('.team input', 'x')
  if (await page.isEnabled('.team .primary-btn')) bad('team create allowed a 1-letter name')
  await page.click('.team .seg button:has-text("Join")')
  await page.fill('.team input', 'ZZZZZZ')
  await page.click('.team .primary-btn')
  await page.waitForSelector('.team .warn', { timeout: 6000 })
  if (!/No team/.test(await page.textContent('.team .warn'))) bad('bad invite code not explained')
})
await step('languages', async () => {
  await page.click('.impact .seg button:has-text("Earn")')
  for (const l of ['hi', 'pa', 'en']) {
    await page.click(`.seg.lang button[lang="${l}"]`)
    await wait(200)
    if ((await page.getAttribute('.earn', 'lang')) !== l) bad(`language ${l} not applied`)
    await layout(`earn ${l}`)
  }
})
await step('leaderboard scopes', async () => {
  await page.click('.impact .seg button:has-text("Leaderboard")')
  await page.waitForSelector('.leaders')
  for (const s of await page.$$('.leaders .seg button')) {
    await s.click()
    await wait(900)
  }
  await layout('leaderboard')
})
await step('invalid certificate link', async () => {
  await page.goto(base + '/?cert=forged.token', { waitUntil: 'networkidle' })
  await page.waitForSelector('.cert-bad', { timeout: 8000 })
  await layout('certificate invalid')
  await page.click('.cert-actions .primary')
  if (await page.isVisible('.cert-wrap')) bad('certificate close failed')
  if (new URL(page.url()).searchParams.get('cert')) bad('?cert= left in the URL after close')
})
await step('delete account', async () => {
  if (process.env.AUDIT_PID) return
  await page.click('.hud-chip >> nth=0')
  await page.click('.impact .seg button:has-text("Earn")')
  await page.waitForSelector('.account summary', { timeout: 5000 })
  await page.click('.account summary')
  await page.click('.account .linkish') // confirm() auto-accepted
  await page.waitForSelector('.enlist', { timeout: 8000 })
})

console.log([...new Set(issues)].join('\n') || `${tag} no layout or flow issues`)
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : `${tag} no console errors`)
await browser.close()

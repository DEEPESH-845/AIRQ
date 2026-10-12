// Daily call in a real browser: two tabs share one call a day, Share falls back to the clipboard,
// and invite/cert links don't reopen the home district on top. Usage: node scripts/daily.mjs (dev server on BASE or :5173)
import { chromium } from 'playwright'
const base = process.env.BASE ?? 'http://localhost:5173'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const fail = (m) => (console.log('FAIL', m), (process.exitCode = 1))
const world = await (await fetch(base + '/data/world.json')).json()
const id = world.districts[0].id

// two tabs: a call made in one is today's call in the other, without a reload
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] })
await ctx.addInitScript(() => localStorage.setItem('airq.player', JSON.stringify({ introSeen: true })))
const a = await ctx.newPage()
const c = await ctx.newPage()
for (const p of [a, c]) await p.goto(`${base}/?d=${id}`, { waitUntil: 'networkidle' })
await a.waitForSelector('[data-mission="call"] button')
await c.click('[data-mission="call"] button >> nth=2')
await a.waitForTimeout(500)
if (await a.$('[data-mission="call"] button')) fail('second tab still offers a call after the first tab made one')

// Share: navigator.share rejecting (not a cancel) falls back to the clipboard
await c.evaluate(() => (navigator.share = () => Promise.reject(new DOMException('no', 'NotAllowedError'))))
await c.click('.call-card .linkish')
await c.waitForTimeout(400)
const note = await c.textContent('.call-card [role=status]')
const clip = await c.evaluate(() => navigator.clipboard.readText())
if (!/Copied/.test(note ?? '') || !/Your call\?/.test(clip)) fail(`share fallback: note "${note}", clipboard "${clip.slice(0, 40)}"`)
await ctx.close()

// a returning player opening an invite link gets the Team sheet, not their home district on top
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx2.addInitScript((h) => {
  localStorage.setItem('airq.player', JSON.stringify({ introSeen: true }))
  localStorage.setItem('airq.home', h)
}, id)
const t = await ctx2.newPage()
await t.goto(`${base}/?team=ABC123`, { waitUntil: 'networkidle' })
await t.waitForTimeout(1500)
if (await t.$('.panel')) fail('home district reopened over the team invite')
await ctx2.close()

await b.close()
console.log(process.exitCode ? 'daily: FAIL' : 'daily: ok')

// Judges' demo + reviewer desk, end to end: demo link -> buy title, boosts, goodie -> reviewer approves -> pickup QR -> delivered.
// Usage: node scripts/demo.mjs [--mobile]  (BASE defaults to the vite dev server). Creates demo players on the live stack; they expire in 48 h.
import { chromium } from 'playwright'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
// both keys derive from the untracked certificate secret, like derived_key() in infra/player/app.py
const secret = readFileSync(new URL('../../.cert-secret', import.meta.url), 'utf8').trim()
const key = (label, n) => createHmac('sha256', secret).update(label).digest('hex').slice(0, n)
const base = process.env.BASE ?? 'http://localhost:5173'
const mobile = process.argv.includes('--mobile')
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
p.on('dialog', (d) => d.accept())
const sfx = mobile ? '-m' : ''
await p.goto(base + `/?demo=${key('demo', 12)}`)
await p.waitForSelector('.demo-bar', { timeout: 20000 })
console.log('url after demo:', p.url())
await p.waitForSelector('.shop')
await p.screenshot({ path: `/tmp/airq-shots/demo-shop${sfx}.png` })
await p.click('.buy[aria-label^="Sapling Scout"]'); await p.waitForSelector('.shop-msg'); console.log('title:', await p.textContent('.shop-msg'))
await p.click('.buy[aria-label^="Double Credits"]'); await p.waitForTimeout(1500)
await p.click('.buy[aria-label^="Double Credits"]'); await p.waitForTimeout(1500)
console.log('boost disabled at 2:', await p.isDisabled('.buy[aria-label^="Double Credits"]'))
await p.click('.buy[aria-label^="Seed-ball pack"]'); await p.click('.confirm .primary'); await p.waitForSelector('.claims li')
console.log('claim:', await p.textContent('.claims li'))
const code = (await p.textContent('.claims code')).trim()
// reviewer approves in another tab
const a = await ctx.newPage()
await a.goto(base + '/?admin')
await a.fill('input[type=password]', key('admin', 32)); await a.click('.primary-btn')
await a.waitForSelector('.claim-card'); await a.fill('input[type=search]', code)
await a.screenshot({ path: `/tmp/airq-shots/admin${sfx}.png`, fullPage: true })
await a.click('.claim-card .primary-btn:has-text("Approve")'); await a.waitForSelector('.claim-card[data-status=ready]')
console.log('approved in desk')
await p.reload(); await p.click('.hud-chip[aria-label*="open the shop"]')
await p.waitForSelector('.claims li[data-status=ready] .buy'); await p.click('.claims li[data-status=ready] .buy')
await p.waitForSelector('.collect svg'); await p.locator('.collect').scrollIntoViewIfNeeded()
await p.screenshot({ path: `/tmp/airq-shots/collect${sfx}.png` })
await a.click('.claim-card .primary-btn:has-text("Mark delivered")'); await a.waitForTimeout(1500)
console.log('errors:', errs)
await b.close()

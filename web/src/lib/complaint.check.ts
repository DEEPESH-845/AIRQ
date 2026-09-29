// Self-check for complaint builders. Run: npx tsx src/lib/complaint.check.ts
import assert from 'node:assert/strict'
import { complaintText, emailLink, xLink, channelFor } from './complaint'
import type { District } from './world'

const d = { n: 'New Delhi', s: 'Delhi', aqi: 342, cat: 'Very Poor', pm25: 180 } as District
const c = { type: 'Garbage burning' as const, where: 'Gole Market & Sector 4', coords: [77.2, 28.63] as [number, number], when: new Date('2026-10-01T06:30:00Z') }

assert.match(complaintText(d, c), /AQI 342 \(Very Poor\)/)
assert.match(complaintText(d, c), /maps\.google\.com\/\?q=28\.63000,77\.20000/)
const e = emailLink(d, c)
assert.ok(e.href.startsWith('mailto:msdpcc@nic.in?subject=') && e.hasRecipient)
assert.ok(decodeURIComponent(e.href).includes('Section 31A'))
assert.ok(!e.href.includes(' ') && !e.href.includes('&body=&'), 'mailto must be fully encoded')
assert.equal(emailLink({ ...d, s: 'Bihar' }, c).hasRecipient, false)
// the X post fits in a post even with a very long location, and keeps its tags
const long = decodeURIComponent(xLink(d, { ...c, where: 'x'.repeat(400) }).split('text=')[1])
assert.ok(long.length <= 280 && long.endsWith('@DPCC_official @CPCB_OFFICIAL'))
assert.equal(channelFor('Uttar Pradesh')?.url, 'https://jansunwai.up.nic.in/')
assert.equal(channelFor('Kerala'), null)
console.log('ok')

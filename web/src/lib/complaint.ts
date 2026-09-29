import type { District } from './world'

export const SOURCE_TYPES = ['Garbage burning', 'Construction dust', 'Factory or kiln smoke', 'Crop residue burning', 'Smoky vehicles', 'Other'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

// Board inboxes verified on the boards' own contact pages (2026-09-29). Other states: the user adds their DM / regional officer.
const BOARD_EMAIL: Record<string, string> = {
  Delhi: 'msdpcc@nic.in', // Member Secretary, DPCC (dpcc.delhi.gov.in/dpcc/contact-us)
  Haryana: 'hqhspcb@hspcb.org.in', // HSPCB head office (hspcb.org.in/page/head-office)
}

// Official complaint apps: Green Delhi is published by DPCC on Google Play; Jansunwai is UP's IGRS portal.
export function channelFor(state: string): { name: string; url: string } | null {
  if (state === 'Delhi') return { name: 'Green Delhi', url: 'https://play.google.com/store/apps/details?id=com.green_delhi_teste' }
  if (state === 'Uttar Pradesh') return { name: 'Jansunwai', url: 'https://jansunwai.up.nic.in/' }
  return null
}

export type Complaint = { type: SourceType; where: string; coords?: [number, number]; when: Date }

const stamp = (d: Date) =>
  d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

const mapLink = (c?: [number, number]) => (c ? ` (https://maps.google.com/?q=${c[1].toFixed(5)},${c[0].toFixed(5)})` : '')

export function complaintText(d: District, c: Complaint) {
  return [
    `Air pollution complaint: ${c.type.toLowerCase()}`,
    `Location: ${c.where || 'not specified'}, ${d.n}, ${d.s}${mapLink(c.coords)}`,
    `Seen: ${stamp(c.when)} IST`,
    `District air quality now: AQI ${d.aqi} (${d.cat}), PM2.5 ${d.pm25} µg/m³ (ARQ, estimated from Copernicus CAMS).`,
    `Please inspect and stop this source.`,
  ].join('\n')
}

export function emailLink(d: District, c: Complaint) {
  const to = BOARD_EMAIL[d.s] ?? ''
  const subject = `Air pollution complaint under Section 31A, Air Act 1981: ${c.type} in ${d.n}`
  const body = [
    'To the Member Secretary / Regional Officer, State Pollution Control Board, and the District Magistrate,',
    '',
    complaintText(d, c),
    '',
    `I request you to exercise the powers of the Board under Section 31A of the Air (Prevention and Control of Pollution) Act, 1981 and issue directions to stop this source, and to inform me of the action taken.`,
    '',
    'Name:',
    'Phone:',
  ].join('\n')
  return { href: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, hasRecipient: !!to }
}

export function xLink(d: District, c: Complaint) {
  const tags = d.s === 'Delhi' ? '@DPCC_official @CPCB_OFFICIAL' : '@CPCB_OFFICIAL'
  const place = c.where ? `${c.where}, ${d.n}` : d.n
  let text = `Air pollution complaint: ${c.type.toLowerCase()} at ${place} (${d.s}). AQI here is ${d.aqi}, ${d.cat}. Please act. ${tags}`
  if (text.length > 270) text = text.slice(0, 266 - tags.length) + '… ' + tags
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`
}

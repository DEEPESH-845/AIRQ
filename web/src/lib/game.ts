import type { Attribution, District } from './world'

// PM2.5 <-> NAQI sub-index (CPCB 2014), used to apply source cuts in concentration space.
const PM = [
  [0, 30, 0, 50],
  [30, 60, 50, 100],
  [60, 90, 100, 200],
  [90, 120, 200, 300],
  [120, 250, 300, 400],
  [250, 380, 400, 500],
]
export const pm25ToAqi = (c: number) => {
  for (const [lo, hi, ilo, ihi] of PM) if (c <= hi) return Math.round(ilo + ((Math.max(c, lo) - lo) * (ihi - ilo)) / (hi - lo))
  return 500
}
export const aqiToPm25 = (a: number) => {
  for (const [lo, hi, ilo, ihi] of PM) if (a <= ihi) return lo + ((Math.max(a, ilo) - ilo) * (hi - lo)) / (ihi - ilo)
  return 380
}

// Berkeley Earth: 22 µg/m³ of PM2.5 breathed for a day is roughly one cigarette.
export const cigarettes = (pm25: number) => pm25 / 22

export type Defense = {
  id: string
  name: string
  cost: number
  cuts: Partial<Record<keyof Attribution, number>>
  /** hours before the effect reaches this district */
  delay: number
  note: string
}

// Approximate effect sizes, kept deliberately conservative. Labelled as estimates in the UI.
export const DEFENSES: Defense[] = [
  { id: 'stubble', name: 'Manage crop residue upwind', cost: 2, cuts: { fire: 0.5 }, delay: 24, note: 'Happy Seeders and PUSA decomposer on half the burning fields. Smoke already in the air still arrives, so the benefit lands after about a day.' },
  { id: 'dust', name: 'Halt construction, wet the roads', cost: 1, cuts: { dust: 0.35 }, delay: 0, note: 'GRAP-style construction ban with road sprinkling and anti-smog guns.' },
  { id: 'waste', name: 'Stop garbage burning', cost: 1, cuts: { household: 0.4 }, delay: 0, note: 'Enforcement drives against open waste fires, plus clean cooking fuel.' },
  { id: 'traffic', name: 'Odd-even and truck ban', cost: 2, cuts: { vehicles: 0.15 }, delay: 0, note: 'Studies of Delhi odd-even found modest gains, mostly from fewer trucks.' },
  { id: 'industry', name: 'Switch industry to clean fuel', cost: 3, cuts: { industry: 0.3 }, delay: 0, note: 'Shift factories off coal and pet coke to PNG, enforce kiln and plant norms.' },
  { id: 'tower', name: 'Build a smog tower', cost: 2, cuts: { vehicles: 0.004, dust: 0.004 }, delay: 0, note: 'Cleans air within a few hundred metres of the tower. Almost no effect across a whole district.' },
]
export const BUDGET = 4

/** Factor applied to PM2.5 once each defense is in effect. */
export function planFactor(att: Attribution, active: string[], hour: number) {
  let cut = 0
  for (const d of DEFENSES) {
    if (!active.includes(d.id) || hour < d.delay) continue
    for (const [k, v] of Object.entries(d.cuts)) cut += att[k as keyof Attribution] * v
  }
  return 1 - cut
}

export function planSeries(d: District, active: string[]) {
  return d.fc.map((a, h) => pm25ToAqi(aqiToPm25(a) * planFactor(d.att, active, h)))
}

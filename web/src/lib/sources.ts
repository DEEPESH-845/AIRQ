import type { Attribution as Att } from './world'

/** Pollution sources: label, colour on the bars, and what each means. */
export const SOURCES: { key: keyof Att; label: string; color: string; note: string }[] = [
  { key: 'fire', label: 'Farm and forest fires', color: '#ff7a1a', note: 'Smoke carried here by the wind from fires detected by satellite.' },
  { key: 'vehicles', label: 'Vehicles', color: '#6f9bff', note: 'Exhaust and brake and tyre wear, strongest along arterial roads.' },
  { key: 'dust', label: 'Road and construction dust', color: '#d9bf8c', note: 'Resuspended road dust and building sites.' },
  { key: 'industry', label: 'Industry and power plants', color: '#b08cff', note: 'Factories, brick kilns and coal plants within about 150 km.' },
  { key: 'household', label: 'Waste and household burning', color: '#ff8fae', note: 'Open garbage fires and solid cooking fuel.' },
  { key: 'regional', label: 'Regional background', color: '#8c88a8', note: 'Aged pollution that has drifted in from far away.' },
]

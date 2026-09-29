import type { Cat } from './world'

// CPCB National AQI bands. Colours follow the official scale, lifted for a dark map.
export const CATS: { name: Cat; min: number; max: number; color: string; rgb: [number, number, number] }[] = [
  { name: 'Good', min: 0, max: 50, color: '#2fbf71', rgb: [47, 191, 113] },
  { name: 'Satisfactory', min: 51, max: 100, color: '#a3d94e', rgb: [163, 217, 78] },
  { name: 'Moderate', min: 101, max: 200, color: '#f2d13a', rgb: [242, 209, 58] },
  { name: 'Poor', min: 201, max: 300, color: '#f28c28', rgb: [242, 140, 40] },
  { name: 'Very Poor', min: 301, max: 400, color: '#e5383b', rgb: [229, 56, 59] },
  { name: 'Severe', min: 401, max: 450, color: '#b3123f', rgb: [179, 18, 63] },
  { name: 'Severe+', min: 451, max: 500, color: '#7a0c3a', rgb: [122, 12, 58] },
]

export const catIndex = (aqi: number) => {
  const i = CATS.findIndex((c) => aqi <= c.max)
  return i < 0 ? CATS.length - 1 : i
}
export const catOf = (aqi: number) => CATS[catIndex(aqi)]

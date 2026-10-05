// The fire-near-you rule, kept free of AWS imports so its self-check runs anywhere.
export const FIRE_KM = 25 // within this distance of the district centre
export const FIRE_MIN = 3 // fewer new fires than this is noise, not news
const NEW_H = 4.5 // the tick runs every 4 h: fires younger than this are new since the last one
const km = (a, b) => Math.hypot((b[0] - a[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110.57)

export function newFiresNear(c, fires) {
  return fires.filter(([lon, lat, , age]) => age <= NEW_H && km(c, [lon, lat]) <= FIRE_KM).length
}

// Self-check for band colours. Run: npx tsx src/lib/naqi.check.ts
import assert from 'node:assert/strict'
import { CATS } from './naqi'

// WCAG relative luminance and contrast ratio
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// every band colour is used as large text (the AQI number) on the panel (--sky-1): WCAG large-text minimum is 3:1
for (const c of CATS) assert.ok(contrast(c.color, '#1b1934') >= 3, `${c.name} ${c.color} contrast ${contrast(c.color, '#1b1934').toFixed(2)} < 3`)
// neighbouring bands stay distinguishable
for (let i = 1; i < CATS.length; i++) assert.notEqual(CATS[i].color, CATS[i - 1].color)
console.log('ok')

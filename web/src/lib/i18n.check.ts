// Self-check for translations. Run: npx tsx src/lib/i18n.check.ts
import assert from 'node:assert/strict'
import economy from './economy.json'
import { KEYS, actionText, fill, translate } from './i18n'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
// every translated string keeps exactly the English placeholders, so no number silently disappears
for (const k of KEYS) for (const l of ['hi', 'pa'] as const) assert.equal(placeholders(translate(l, k)), placeholders(translate('en', k)), `${l} ${k}`)
// every action has a full Hindi and Punjabi translation, different from the English
for (const a of economy.actions) for (const l of ['hi', 'pa'] as const) {
  const t = actionText(a, l)
  assert.ok(t.label && t.photo && t.why && t.label !== a.label, `${l} ${a.id}`)
}
assert.equal(actionText(economy.actions[0], 'en').label, economy.actions[0].label)
assert.equal(fill('{a} of {b}', { a: 1, b: 6 }), '1 of 6')
assert.equal(fill('{missing}', {}), '{missing}')
assert.match(translate('hi', 'earn.left', { left: 3, total: 6 }), /3.*6|6.*3/)
console.log('ok')

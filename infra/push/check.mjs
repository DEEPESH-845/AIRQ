// Self-check for the fire-near-you rule. Run: node infra/push/check.mjs
import assert from 'node:assert/strict'
process.env.VAPID_SUBJECT = 'mailto:x@example.com'
process.env.VAPID_PUBLIC = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
process.env.VAPID_PRIVATE = 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls'
const { newFiresNear } = await import('./index.mjs')
const karnal = [76.98, 29.69]
const near = [76.98 + 0.1, 29.69, 5, 2] // ~9.7 km, 2 h old: new and near
const old = [76.98, 29.69, 5, 10] // on top of it but from an earlier tick
const far = [77.6, 29.69, 5, 1] // ~60 km
assert.equal(newFiresNear(karnal, [near, near, old, far]), 2)
assert.equal(newFiresNear(karnal, []), 0)
console.log('ok')

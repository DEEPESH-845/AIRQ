// Self-check for the fire-near-you rule. Run: node infra/push/check.mjs
import assert from 'node:assert/strict'
import { newFiresNear } from './fires.mjs'
const karnal = [76.98, 29.69]
const near = [76.98 + 0.1, 29.69, 5, 2] // ~9.7 km, 2 h old: new and near
const old = [76.98, 29.69, 5, 10] // on top of it but from an earlier tick
const far = [77.6, 29.69, 5, 1] // ~60 km
assert.equal(newFiresNear(karnal, [near, near, old, far]), 2)
assert.equal(newFiresNear(karnal, []), 0)
console.log('ok')

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dist, projT, segDist, sat, toLocal, openingGeom, hits } from '../src/geom.js'
import { blank, migrate } from '../src/model.js'

/** @typedef {import('../src/model.js').Opening} Opening */

const box = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ s) => [
  { x: x0, y: y0 },
  { x: x0 + s, y: y0 },
  { x: x0 + s, y: y0 + s },
  { x: x0, y: y0 + s },
]
const sofa = { id: 'a', name: 'Sofa', w: 200, d: 100, h: 80, color: '#50fa7b' }
const wall = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 } }

test('distances and projection', () => {
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5)
  assert.equal(projT({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 }), 0.5)
  assert.equal(projT({ x: -50, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }), 0)
  assert.equal(segDist({ x: 150, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }), 50)
})

test('sat: overlap, separation, touching edges', () => {
  assert.equal(sat(box(0, 0, 10), box(5, 5, 10)), true)
  assert.equal(sat(box(0, 0, 10), box(20, 0, 10)), false)
  assert.equal(sat(box(0, 0, 10), box(10, 0, 10)), false)
})

test('toLocal undoes rotation', () => {
  const l = toLocal({ x: 10, y: 10 }, 90, { x: 10, y: 20 })
  assert.ok(Math.abs(l.x - 10) < 1e-9 && Math.abs(l.y) < 1e-9)
})

test('hits: item against a thick wall', () => {
  const plan = { walls: [wall], openings: [], wallT: 10 }
  assert.deepEqual(hits(plan, sofa, 200, 60, 0), []) // edge at y=10, wall face at y=5
  assert.deepEqual(hits(plan, sofa, 200, 52, 0), ['w0'])
  assert.deepEqual(hits(plan, sofa, 200, 80, 90), ['w0']) // rotated: half depth is now 100
})

test('hits: door swing zone blocks, window does not', () => {
  /** @type {Opening} */
  const door = { id: 'd', wall: 'w1', t: 200, w: 80, kind: 'door', hinge: 0, swing: 1 }
  const plan = { walls: [wall], openings: [door], wallT: 10 }
  const g = openingGeom(door, wall)
  assert.equal(g.zone.length, 4)
  assert.deepEqual(hits(plan, sofa, 200, 100, 0), ['od']) // zone spans y 0..80 below the wall
  assert.deepEqual(
    hits({ ...plan, openings: [{ ...door, kind: 'window' }] }, sofa, 200, 100, 0),
    [],
  )
  assert.deepEqual(hits({ ...plan, openings: [{ ...door, swing: -1 }] }, sofa, 200, 100, 0), [])
})

test('migrate fills wall ids and openings', () => {
  const p = blank()
  p.plan.walls.push({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } })
  delete p.plan.openings
  const m = migrate(p)
  assert.ok(m.plan.walls[0].id)
  assert.deepEqual(m.plan.openings, [])
})

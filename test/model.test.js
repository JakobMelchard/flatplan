import { test } from 'node:test'
import assert from 'node:assert/strict'
import { uid, blank, migrate, layout, asset } from '../src/model.js'

test('uid returns distinct short strings', () => {
  const a = uid()
  const b = uid()
  assert.match(a, /^[a-z0-9]+$/)
  assert.notEqual(a, b)
})

test('blank project has one layout set as current', () => {
  const p = blank()
  assert.equal(p.layouts.length, 1)
  assert.equal(p.layouts[0].id, p.current)
  assert.deepEqual(p.plan.walls, [])
  assert.equal(p.plan.wallT, 10)
})

test('migrate assigns ids to walls missing one and leaves existing ids alone', () => {
  const p = blank()
  p.plan.walls = [
    { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
    { id: 'keep', a: { x: 0, y: 0 }, b: { x: 0, y: 10 } },
  ]
  delete p.plan.openings
  const m = migrate(p)
  assert.ok(m.plan.walls[0].id)
  assert.equal(m.plan.walls[1].id, 'keep')
  assert.deepEqual(m.plan.openings, [])
})

test('layout returns the current layout, falling back to the first', () => {
  const p = blank()
  assert.equal(layout(p).id, p.current)
  p.current = 'missing'
  assert.equal(layout(p), p.layouts[0])
})

test('asset looks up by id and returns undefined when missing', () => {
  const p = blank()
  p.assets.push({ id: 'a1', name: 'Chair', w: 40, d: 40, h: 90, color: '#000' })
  assert.equal(asset(p, 'a1')?.name, 'Chair')
  assert.equal(asset(p, 'nope'), undefined)
})

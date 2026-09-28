import { test } from 'node:test'
import assert from 'node:assert/strict'
import { History, snap } from '../src/history.js'
import { blank } from '../src/model.js'

test('snap deep-copies objects and drops undefined', () => {
  const src = { a: [{ b: 1 }], c: 'x', d: undefined }
  const c = snap(src)
  assert.deepEqual(c, { a: [{ b: 1 }], c: 'x' })
  c.a[0].b = 2
  assert.equal(src.a[0].b, 1)
})

test('undo / redo walk the recorded states', () => {
  const p = blank()
  const h = new History(p, 200, 0)
  p.plan.wallT = 20
  h.record(p, 1)
  p.plan.wallT = 30
  h.record(p, 2)
  assert.equal(h.undo()?.plan.wallT, 20)
  assert.equal(h.undo()?.plan.wallT, 10)
  assert.equal(h.undo(), null)
  assert.equal(h.redo()?.plan.wallT, 20)
  assert.equal(h.redo()?.plan.wallT, 30)
  assert.equal(h.redo(), null)
})

test('a new change after undo drops the redo branch', () => {
  const p = blank()
  const h = new History(p, 200, 0)
  p.plan.wallT = 20
  h.record(p, 1)
  h.undo()
  p.plan.wallT = 40
  h.record(p, 2)
  assert.equal(h.redo(), null)
  assert.equal(h.undo()?.plan.wallT, 10)
})

test('changes within the merge window form one step', () => {
  const p = blank()
  const h = new History(p, 200, 400)
  for (const [v, t] of [
    [11, 1000],
    [12, 1100],
    [13, 1200],
  ])
    ((p.plan.wallT = v), h.record(p, t))
  p.plan.wallT = 50
  h.record(p, 5000)
  assert.equal(h.undo()?.plan.wallT, 13)
  assert.equal(h.undo()?.plan.wallT, 10)
})

test('restored snapshots are copies', () => {
  const p = blank()
  const h = new History(p, 200, 0)
  p.plan.wallT = 20
  h.record(p, 1)
  const u = /** @type {import('../src/model.js').Project} */ (h.undo())
  u.plan.wallT = 99
  assert.equal(h.redo()?.plan.wallT, 20)
  assert.equal(h.undo()?.plan.wallT, 10)
})

test('limit caps the undo stack', () => {
  const p = blank()
  const h = new History(p, 3, 0)
  for (let i = 1; i <= 10; i++) ((p.plan.wallT = i), h.record(p, i))
  let n = 0
  while (h.undo()) n++
  assert.equal(n, 3)
})

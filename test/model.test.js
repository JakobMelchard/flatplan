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

test('migrate rejects a project with missing parts or wrong types', () => {
  const item = { id: 'i', asset: 'a', x: 0, y: 0, rot: 0 }
  const opening = { id: 'o', wall: 'w', t: 0, w: 80, kind: 'door', hinge: 0, swing: 1 }
  /** @type {((p: any) => void)[]} */
  const breaks = [
    (p) => (p.plan = null),
    (p) => (p.plan.walls = { length: 1 }),
    (p) => (p.plan.walls = [{ a: { x: '0', y: 0 }, b: { x: 1, y: 1 } }]),
    (p) => (p.plan.walls = [{ id: 7, a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }]),
    (p) => (p.plan.openings = [{ ...opening, kind: 'trap' }]),
    (p) => (p.plan.openings = [{ ...opening, t: '1' }]),
    (p) => (p.plan.wallT = '10px'),
    (p) => (p.assets = {}),
    (p) =>
      (p.assets = [{ id: 'a', name: 'A', w: '1;background:red', d: 1, h: 1, color: '#000000' }]),
    (p) => (p.assets = [{ id: 'a', name: ['A'], w: 1, d: 1, h: 1, color: '#000000' }]),
    (p) => (p.layouts = []),
    (p) => (p.layouts[0].items = [{ ...item, x: '0' }]),
    (p) => (p.layouts[0].items = [null]),
    (p) => (p.current = 1),
  ]
  for (const bad of [null, 'x', [], {}])
    assert.throws(() => migrate(bad), TypeError, JSON.stringify(bad))
  for (const f of breaks) {
    const p = blank()
    f(p)
    assert.throws(() => migrate(p), TypeError, String(f))
  }
})

test('migrate keeps only #rrggbb colours and base64 data URL images', () => {
  const a = { id: 'a', name: 'A', w: 1, d: 1, h: 1 }
  const png = 'data:image/png;base64,iVBORw0KGgo='
  const image = { x: 0, y: 0, cmPerPx: 1, opacity: 0.6 }
  /** @type {any} */
  const p = blank()
  p.assets = [
    { ...a, color: 'red;background-image:url(https://evil.example/x)' },
    { ...a, color: ['#aabbcc'] },
    { ...a, color: '#AABBCC', img: 'javascript:alert(1)' },
    { ...a, color: '#aabbcc', img: 'https://evil.example/x.png' },
    { ...a, color: '#aabbcc', img: `${png});background:url(//evil.example/x` },
    { ...a, color: '#aabbcc', img: [png] },
    { ...a, color: '#aabbcc', img: png },
  ]
  p.plan.image = { ...image, src: 'https://evil.example/plan.png' }
  p.assets[3].name = 'Remote'
  /** @type {string[]} */
  const dropped = []
  const m = migrate(p, dropped)
  assert.deepEqual(dropped, ['plan', 'A', 'Remote', 'A', 'A'])
  assert.match(m.assets[0].color, /^#[0-9a-f]{6}$/)
  assert.match(m.assets[1].color, /^#[0-9a-f]{6}$/)
  assert.equal(m.assets[2].color, '#AABBCC')
  assert.deepEqual(
    m.assets.map((x) => x.img),
    [undefined, undefined, undefined, undefined, undefined, undefined, png],
  )
  assert.equal(m.plan.image, undefined)

  p.plan.image = { ...image, src: png }
  assert.equal(migrate(p).plan.image?.src, png)
  p.plan.image = { ...image, src: png, opacity: '1' }
  assert.equal(migrate(p).plan.image, undefined)
})

test('migrate accepts the demo project unchanged', async () => {
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(new URL('fixtures/demo/project.json', import.meta.url), 'utf8')
  assert.deepEqual(migrate(JSON.parse(text)), JSON.parse(text))
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

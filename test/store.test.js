import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blank } from '../src/model.js'

/**
 * Stand-in for indexedDB with one store. Requests settle on a later tick, like the real thing.
 * @param {{ record?: unknown, readError?: Error, putErrors?: number }} [o] stored record, error
 *   for every get, number of puts that fail before they work
 */
const fakeDB = (o = {}) => {
  const log = { opens: 0, closes: 0, puts: /** @type {unknown[]} */ ([]) }
  let putErrors = o.putErrors ?? 0
  /**
   * @param {unknown} result
   * @param {Error} [error]
   */
  const request = (result, error) => {
    /** @type {any} */
    const r = { result, error }
    setImmediate(() => (error ? r.onerror?.() : r.onsuccess?.()))
    return r
  }
  const store = {
    get: () => request(o.record, o.readError),
    put: (/** @type {unknown} */ v) =>
      putErrors-- > 0
        ? request(undefined, new Error('put'))
        : (log.puts.push(v), request(undefined)),
  }
  const db = { close: () => log.closes++, transaction: () => ({ objectStore: () => store }) }
  const globals = {
    indexedDB: { open: () => (log.opens++, request(db)) },
    localStorage: { getItem: () => null, removeItem() {} },
  }
  for (const [k, value] of Object.entries(globals))
    Object.defineProperty(globalThis, k, { value, configurable: true })
  return log
}

let n = 0
/**
 * store.js keeps its connection and the read-error flag in module state: a fresh copy per test.
 * @returns {Promise<typeof import('../src/store.js')>}
 */
const fresh = () => import(`../src/store.js?${n++}`)

test('no stored record yields a blank project that saves', async () => {
  const log = fakeDB()
  const { load, save } = await fresh()
  const p = await load()
  assert.deepEqual(p.plan.walls, [])
  assert.equal(p.layouts.length, 1)
  assert.equal(await save(p), null)
  assert.equal(log.puts.length, 1)
})

test('a stored record is returned', async () => {
  const record = blank()
  record.assets.push({ id: 'a1', name: 'Chair', w: 40, d: 40, h: 90, color: '#000000' })
  fakeDB({ record })
  const { load } = await fresh()
  assert.equal((await load()).assets[0].name, 'Chair')
})

test('a read error is reported to the caller and nothing is saved after it', async () => {
  const log = fakeDB({ readError: Object.assign(new Error('boom'), { name: 'UnknownError' }) })
  const { load, save } = await fresh()
  // main.js shows this message in the toast and starts with a blank project
  await assert.rejects(load(), /could not read the saved project \(UnknownError\)/i)
  // the autosave after the next edit, and the flush when the app is backgrounded
  assert.match((await save(blank())) ?? '', /not saved/)
  assert.match((await save(blank())) ?? '', /not saved/)
  assert.deepEqual(log.puts, [])
})

test('a stored record that is not a project counts as a read error', async () => {
  const log = fakeDB({ record: { plan: { walls: 'x' } } })
  const { load, save } = await fresh()
  await assert.rejects(load(), /could not read the saved project/i)
  assert.notEqual(await save(blank()), null)
  assert.deepEqual(log.puts, [])
})

test('one connection serves every transaction', async () => {
  const log = fakeDB()
  const { load, save } = await fresh()
  const p = await load()
  await save(p)
  await save(p)
  assert.equal(log.opens, 1)
})

test('a failed transaction drops the connection and the next one reopens', async () => {
  const log = fakeDB({ putErrors: 1 })
  const { load, save } = await fresh()
  const p = await load()
  assert.match((await save(p)) ?? '', /save failed/)
  assert.equal(log.closes, 1)
  assert.equal(await save(p), null)
  assert.equal(log.opens, 2)
})

/** @param {'onload' | 'onerror'} fire which handler the fake image calls once src is set */
const fakeImage = (fire) =>
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    value: class {
      width = 10
      height = 10
      /** @param {string} _ */
      set src(_) {
        setImmediate(() => /** @type {any} */ (this)[fire]?.())
      }
    },
  })

test('shrinkImage rejects when the image does not decode', async () => {
  fakeImage('onerror')
  const { shrinkImage } = await fresh()
  await assert.rejects(shrinkImage('data:image/png;base64,AAAA'))
})

test('shrinkImage returns a small image unchanged', async () => {
  fakeImage('onload')
  const { shrinkImage } = await fresh()
  assert.equal(await shrinkImage('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA')
})

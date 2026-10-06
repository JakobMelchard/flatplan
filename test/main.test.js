import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'
import { blank } from '../src/model.js'

// main.js wires the store to a canvas editor and the whole UI. Those need a real DOM, so they
// are replaced by stand-ins that record what main.js hands them; store.js and model.js are real.
const seen = {
  /** @type {any} */ ed: null,
  /** @type {unknown[]} */ ui: [],
  /** @type {string[]} */ alerts: [],
  /** @type {Record<string, () => void>} */ on: {},
  /** @type {unknown[]} */ puts: [],
  /** @type {Error | undefined} */ readError: undefined,
}
/** @type {Record<string, string>} */
const stubs = {
  './editor.js':
    'export class Editor { constructor(c, p) { this.p = p; globalThis.seen.ed = this } fit() {} setTool() {} }',
  './ui.js': 'export const buildUI = (...a) => ((globalThis.seen.ui = a), () => {})',
  './feedback.js': 'export const setupFeedback = () => {}',
}
registerHooks({
  resolve: (spec, ctx, next) =>
    spec in stubs && ctx.parentURL?.includes('/src/main.js')
      ? { url: `data:text/javascript,${encodeURIComponent(stubs[spec])}`, shortCircuit: true }
      : next(spec, ctx),
})

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
  get: () => request(undefined, seen.readError),
  put: (/** @type {unknown} */ v) => (seen.puts.push(v), request(undefined)),
}
const doc = {
  visibilityState: 'visible',
  getElementById: () => ({}),
  querySelector: () => ({}),
  addEventListener: (/** @type {string} */ t, /** @type {() => void} */ f) => (seen.on[t] = f),
}
const globals = {
  seen,
  window: globalThis,
  document: doc,
  location: { hostname: 'localhost' },
  alert: (/** @type {string} */ m) => seen.alerts.push(m),
  localStorage: { getItem: () => null },
  indexedDB: {
    open: () => request({ close() {}, transaction: () => ({ objectStore: () => store }) }),
  },
}
for (const [k, value] of Object.entries(globals))
  Object.defineProperty(globalThis, k, { value, configurable: true })

let n = 0
const start = () => import(`../src/main.js?${n++}`)

test('an edit is autosaved after the debounce', async () => {
  await start()
  assert.equal(seen.ui[3], '')
  seen.ed.onChange()
  await sleep(350)
  assert.equal(seen.puts.length, 1)
})

test('after a read error main.js hands the warning to the UI and nothing is saved', async () => {
  seen.readError = Object.assign(new Error('boom'), { name: 'UnknownError' })
  const puts = seen.puts.length
  await start()
  // buildUI shows its fourth argument in the toast
  assert.match(String(seen.ui[3]), /Could not read the saved project \(UnknownError\)/)
  assert.deepEqual(seen.ed.p.plan.walls, [])
  seen.ed.onChange()
  await sleep(350)
  doc.visibilityState = 'hidden'
  seen.on.visibilitychange()
  await sleep(10)
  assert.equal(seen.puts.length, puts)
  assert.deepEqual(seen.alerts, [])
})

test('Import after a read error lifts the block and reports the images it dropped', async () => {
  seen.readError = new Error('boom')
  await start()
  const p = blank()
  p.assets.push({
    id: 'a',
    name: 'Sofa',
    w: 1,
    d: 1,
    h: 1,
    color: '#000000',
    img: 'https://x/y.png',
  })
  // what Import hands over; Reset passes blank()
  assert.deepEqual(/** @type {any} */ (seen.ui[2])(p), ['Sofa'])
  assert.equal(seen.ed.p.assets[0].img, undefined)
  const puts = seen.puts.length
  seen.ed.onChange()
  await sleep(350)
  assert.equal(seen.puts.length, puts + 1)
  assert.deepEqual(seen.alerts, [])
})

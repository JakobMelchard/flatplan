import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const src = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const base = 'https://app.test/flatplan/app/'

/**
 * Run sw.js against stand-ins for the worker globals, with index.html and src/main.js cached.
 * @param {boolean} online false makes every fetch fail
 */
const boot = (online) => {
  /** @type {Record<string, (e: any) => void>} */
  const on = {}
  /** @type {Map<string, unknown>} */
  const cache = new Map([
    [`${base}index.html`, 'cached shell'],
    [`${base}src/main.js`, 'cached main'],
  ])
  const key = (/** @type {string | { url: string }} */ r) =>
    new URL(typeof r === 'string' ? r : r.url, base).href
  const store = {
    addAll: async () => {},
    put: async (/** @type {{ url: string }} */ r, /** @type {unknown} */ res) => {
      cache.set(key(r), res)
    },
  }
  runInNewContext(src, {
    self: {
      addEventListener: (/** @type {string} */ t, /** @type {(e: any) => void} */ f) => (on[t] = f),
      skipWaiting() {},
    },
    location: new URL('sw.js', base),
    caches: {
      open: async () => store,
      match: async (/** @type {string | { url: string }} */ r) => cache.get(key(r)),
    },
    fetch: async (/** @type {{ url: string }} */ r) => {
      if (!online) throw new TypeError('offline')
      return { ok: true, clone: () => `network ${r.url}` }
    },
    URL,
    Response,
  })
  /**
   * Send one GET through the fetch handler.
   * @param {string} path
   * @param {string} [mode] Request.mode; 'navigate' for a page load
   */
  const get = async (path, mode = 'no-cors') => {
    /** @type {Promise<unknown>[]} */
    const waits = []
    /** @type {any} */
    let res
    on.fetch({
      request: { method: 'GET', url: base + path, mode },
      respondWith: (/** @type {Promise<unknown>} */ p) => (res = p),
      waitUntil: (/** @type {Promise<unknown>} */ p) => waits.push(p),
    })
    res = await res
    await Promise.all(waits)
    return { res, waits: waits.length }
  }
  return { get, cache }
}

test('offline: an asset that is not cached fails instead of getting the HTML shell', async () => {
  const { res } = await boot(false).get('src/gone.js')
  assert.notEqual(res, 'cached shell')
  assert.equal(res.type, 'error')
})

test('offline: a page load falls back to the cached shell', async () => {
  assert.equal((await boot(false).get('some/page', 'navigate')).res, 'cached shell')
})

test('offline: a cached asset is served from the cache', async () => {
  assert.equal((await boot(false).get('src/main.js')).res, 'cached main')
})

test('online: a shell file is cached, and the cache write is held by waitUntil', async () => {
  const { get, cache } = boot(true)
  assert.equal((await get('index.html')).waits, 1)
  assert.equal(cache.get(`${base}index.html`), `network ${base}index.html`)
})

test('online: a request outside the shell list is not cached', async () => {
  const { get, cache } = boot(true)
  const { res, waits } = await get('docs/page.html')
  assert.equal(res.ok, true)
  assert.equal(waits, 0)
  assert.equal(cache.has(`${base}docs/page.html`), false)
})

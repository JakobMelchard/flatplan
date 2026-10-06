// Browser flow against the dev server: add and place an item, reload, export, reset, import.
// Needs Chromium (npx playwright-core install chromium, or CHROMIUM_PATH).
/* global indexedDB -- read inside page.evaluate, in the browser */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright-core'

const PORT = process.env.PORT ?? '8576'
const srv = spawn('node', ['serve.js'], {
  env: { ...process.env, PORT },
  stdio: ['ignore', 'pipe', 'inherit'],
})
await once(srv.stdout, 'data')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
after(async () => {
  await browser.close()
  srv.kill()
})

/**
 * The project in IndexedDB, as the app saved it.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<any>}
 */
const stored = (page) =>
  page.evaluate(
    () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('flatplan', 1)
        r.onupgradeneeded = () => r.result.createObjectStore('kv')
        r.onsuccess = () => {
          const g = r.result.transaction('kv').objectStore('kv').get('project')
          g.onsuccess = () => (r.result.close(), res(g.result))
          g.onerror = rej
        }
        r.onerror = rej
      }),
  )

/**
 * Wait until the stored project passes ok; saves are debounced.
 * @param {import('playwright-core').Page} page
 * @param {(p: any) => boolean} ok
 */
const until = async (page, ok) => {
  for (let i = 0; i < 50; i++) {
    const p = await stored(page)
    if (p && ok(p)) return p
    await sleep(100)
  }
  assert.fail(`stored project never matched: ${JSON.stringify(await stored(page))?.slice(0, 300)}`)
}

/** @param {any} p */
const items = (p) => p.layouts.find((/** @type {any} */ l) => l.id === p.current).items

test('place an item, reload, export, reset and import', async () => {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    serviceWorkers: 'block',
    acceptDownloads: true,
  })
  const page = await ctx.newPage()
  /** @type {string[]} */
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://127.0.0.1:${PORT}/`)

  await page.click('#left .ph button')
  await page.fill('dialog[open] input[placeholder="e.g. Sofa"]', 'Sofa')
  await page.click('dialog[open] button[type=submit]')
  await page.click('#left .card')
  await until(page, (p) => p.assets[0]?.name === 'Sofa' && items(p).length === 1)

  await page.reload()
  await page.locator('#left .card', { hasText: 'Sofa' }).waitFor()

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Export')])
  const file = /** @type {string} */ (await dl.path())
  const out = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(out.assets[0].name, 'Sofa')
  assert.equal(items(out).length, 1)

  page.once('dialog', (d) => d.accept())
  await page.click('[title="Reset project"]')
  await until(page, (p) => p.assets.length === 0 && items(p).length === 0)

  await page.setInputFiles('label:has-text("Import") input[type=file]', file)
  await until(page, (p) => p.assets[0]?.name === 'Sofa' && items(p).length === 1)
  await page.locator('#left .card', { hasText: 'Sofa' }).waitFor()

  assert.deepEqual(errors, [])
  await ctx.close()
})

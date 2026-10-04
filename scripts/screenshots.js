// Regenerates docs/screenshots/plan.png: the demo two-room flat in test/fixtures/demo is written
// into the app's IndexedDB, then the view is zoomed out one step. Needs Chromium.
/* global indexedDB -- read inside page.evaluate, in the browser */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { chromium } from 'playwright-core'

const PORT = process.env.PORT ?? '8575'
const url = `http://127.0.0.1:${PORT}/`
const project = JSON.parse(await readFile('test/fixtures/demo/project.json', 'utf8'))
const srv = spawn('node', ['serve.js'], {
  env: { ...process.env, PORT },
  stdio: ['ignore', 'pipe', 'inherit'],
})
await once(srv.stdout, 'data')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  const ctx = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    serviceWorkers: 'block',
  })
  const p = await ctx.newPage()
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.evaluate(
    (project) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('flatplan', 1)
        r.onupgradeneeded = () => r.result.createObjectStore('kv')
        r.onsuccess = () => {
          const t = r.result.transaction('kv', 'readwrite')
          t.objectStore('kv').put(project, 'project')
          t.oncomplete = res
          t.onerror = rej
        }
      }),
    project,
  )
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  await p.click('#zoomer [title="Zoom out"]')
  await p.waitForTimeout(200)
  await p.screenshot({ path: 'docs/screenshots/plan.png' })
} finally {
  await browser.close()
  srv.kill()
}

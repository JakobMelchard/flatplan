import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { join } from 'node:path'

test('a malformed URL gets 400 and the dev server keeps serving', async () => {
  // serve.js only logs the port it was given, so find a free one first
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const { port } = /** @type {import('node:net').AddressInfo} */ (probe.address())
  probe.close()
  await once(probe, 'close')
  const srv = spawn(process.execPath, ['serve.js'], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), BIND: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  try {
    await once(srv.stdout, 'data')
    assert.equal((await fetch(`http://127.0.0.1:${port}/%E0%A4%A`)).status, 400)
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200)
  } finally {
    srv.kill()
  }
})

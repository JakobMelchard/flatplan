// Static server, no build step. PORT (default 5173), BIND (default 127.0.0.1; 0.0.0.0 to open
// it from the iPad over the LAN / tailnet).
// GET /version: the served git commit, so the app can offer a reload after a deploy.
// POST /log: when CLIENT_LOG names a file, appends the body (client debug events) to it; the
// app only sends them when /version reports debug.
import { createServer } from 'node:http'
import { appendFile, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { extname, join, normalize } from 'node:path'

const root = import.meta.dirname
/** @type {Record<string, string>} */
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}
const port = Number(process.env.PORT ?? 5173)
const host = process.env.BIND ?? '127.0.0.1'
const clientLog = process.env.CLIENT_LOG

/** @returns {Promise<string>} short sha + subject of the served checkout, '' outside git */
const version = () =>
  new Promise((res) =>
    execFile('git', ['log', '-1', '--format=%h %s'], { cwd: root }, (err, out) =>
      res(err ? '' : out.trim()),
    ),
  )

createServer(async (req, res) => {
  if (req.url === '/version')
    return res
      .writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify({ version: await version(), debug: !!clientLog }))
  if (req.url === '/log' && req.method === 'POST') {
    let body = ''
    for await (const c of req) if ((body += c).length > 1 << 16) break
    if (clientLog) await appendFile(clientLog, body.trimEnd() + '\n').catch(() => {})
    return res.writeHead(204).end()
  }
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(
    /^(\.\.[/\\])+/,
    '',
  )
  const file = join(root, path.endsWith('/') ? `${path}index.html` : path)
  if (
    !file.startsWith(root) ||
    /[/\\](\.[^/\\]*|node_modules|test)([/\\]|$)/.test(file.slice(root.length))
  )
    return res.writeHead(404).end()
  try {
    const body = await readFile(file)
    res
      .writeHead(200, {
        'content-type': types[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      })
      .end(body)
  } catch {
    res.writeHead(404).end()
  }
}).listen(port, host, () => console.log(`flatplan on http://${host}:${port}`))

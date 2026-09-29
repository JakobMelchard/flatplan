// Dev server: static files, no build step. PORT (default 5173), BIND (default 127.0.0.1;
// 0.0.0.0 to open it from the iPad over the LAN / tailnet).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
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

createServer(async (req, res) => {
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

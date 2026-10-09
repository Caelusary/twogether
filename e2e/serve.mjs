// Tiny static server for tests: serves the repo root the way Vercel does and
// applies the headers from vercel.json, so the CSP is exercised by the e2e suite.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve('.')
const port = Number(process.env.PORT || 4317)
// Read per request so `npm run csp` takes effect without a restart.
const currentHeaders = () => JSON.parse(readFileSync('vercel.json', 'utf8')).headers.find((r) => r.source === '/(.*)').headers
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = normalize(join(root, path === '/' ? 'index.html' : path))
  for (const h of currentHeaders()) res.setHeader(h.key, h.value)
  if (!file.startsWith(root) || /[\/](node_modules|e2e|scripts|supabase|\.)/.test(file.slice(root.length))) {
    res.writeHead(404).end('Not found')
    return
  }
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404).end('Not found')
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`))

// Builds the Content-Security-Policy in vercel.json from what the pages load.
// Inline <script> blocks are allowed by sha256 hash, so after editing any inline
// script run `npm run csp` (CI runs `npm run csp:check` and fails on drift).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const SUPABASE = 'https://vlkdgcjoxvvebbmnuxht.supabase.co'
const SENTRY_INGEST = 'https://o4511733518172160.ingest.us.sentry.io'

const pages = readdirSync('.').filter((f) => f.endsWith('.html')).sort()
const hashes = new Set()
for (const page of pages) {
  // Browsers normalise CRLF to LF before hashing, so do the same (Windows checkouts are CRLF).
  const html = readFileSync(page, 'utf8').replace(/\r\n?/g, '\n')
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    hashes.add(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`)
  }
}

const directives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", ...[...hashes].sort(), 'https://esm.sh', 'https://browser.sentry-cdn.com'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ['https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'blob:', SUPABASE],
  'connect-src': ["'self'", SUPABASE, SENTRY_INGEST],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
}
const csp = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ')

const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
const headers = config.headers.find((h) => h.source === '/(.*)').headers
const entry = headers.find((h) => h.key === 'Content-Security-Policy')

if (process.argv.includes('--check')) {
  if (entry.value !== csp) {
    console.error('vercel.json CSP is stale (an inline script changed). Run `npm run csp`.')
    process.exit(1)
  }
  console.log(`CSP up to date (${hashes.size} inline script hashes across ${pages.length} pages).`)
} else {
  entry.value = csp
  writeFileSync('vercel.json', JSON.stringify(config, null, 2) + '\n')
  console.log(`Wrote CSP with ${hashes.size} inline script hashes across ${pages.length} pages.`)
}

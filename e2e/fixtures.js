// Shared Playwright fixtures. Every Supabase call (auth, REST, RPC, storage) is
// answered here from an in-memory fake couple, so no test ever reaches the live
// project. Any request to a host outside the allowlist is aborted and fails the test.
import { test as base, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

export const SUPABASE = 'https://vlkdgcjoxvvebbmnuxht.supabase.co'
const STORAGE_KEY = 'sb-vlkdgcjoxvvebbmnuxht-auth-token'
// Static assets the pages load from CDNs. Data never comes from these.
const ALLOWED_HOSTS = ['localhost', 'esm.sh', 'browser.sentry-cdn.com', 'fonts.googleapis.com', 'fonts.gstatic.com']

const ME = { user_id: 'user-me', pair_id: 'pair-1', display_name: 'Sam' }
const PARTNER = { user_id: 'user-partner', pair_id: 'pair-1', display_name: 'Riley' }
const PAIR = { id: 'pair-1', since_date: '2025-02-14', invite_code: 'K7Q2ZP' }
// 1x1 warm pixel so gallery thumbnails render without a real image host.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/3+3HQAHfQLzWg0ULAAAAABJRU5ErkJggg==', 'base64')

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

export function fakeSession(email = 'sam@example.test') {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const user = { id: ME.user_id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2025-02-14T00:00:00Z' }
  return {
    access_token: `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME.user_id, email, role: 'authenticated', aud: 'authenticated', exp })}.test-signature`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'test-refresh-token',
    user,
  }
}

/**
 * Default world: Sam is signed in, paired with Riley, two photos in the gallery.
 * Override any part per test, e.g. { partner: null } for an unpaired account,
 * { fail: { galleryList: true } } to make a request fail.
 */
function defaultWorld() {
  return {
    signedIn: true,
    introSeen: true,
    me: { ...ME },
    partner: { ...PARTNER },
    pair: { ...PAIR },
    moods: { 'user-me': 'happy', 'user-partner': 'sleepy' },
    files: [
      { name: '1700000000000-aaaaaa.jpg', id: 'f1' },
      { name: '1700000000001-bbbbbb.jpg', id: 'f2' },
    ],
    loginError: null,
    signupNeedsConfirm: false,
    joinResult: { name: 'Jordan' },
    fail: {},
  }
}

function json(route, status, body, headers = {}) {
  return route.fulfill({ status, contentType: 'application/json', headers, body: body === undefined ? '' : JSON.stringify(body) })
}

function eqParam(url, key) {
  const v = url.searchParams.get(key)
  return v && v.replace(/^(eq|neq)\./, '')
}

async function handleSupabase(route, world, calls) {
  const req = route.request()
  const url = new URL(req.url())
  const path = url.pathname
  const method = req.method()
  calls.push(`${method} ${path}`)
  if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  const single = (req.headers().accept || '').includes('vnd.pgrst.object')
  const rows = (list) => {
    if (!single) return json(route, 200, list)
    return list.length ? json(route, 200, list[0]) : json(route, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
  }

  // ---- auth ----
  if (path === '/auth/v1/token') {
    if (world.loginError) return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: world.loginError })
    world.signedIn = true
    return json(route, 200, fakeSession(req.postDataJSON()?.email))
  }
  if (path === '/auth/v1/signup') {
    const s = fakeSession(req.postDataJSON()?.email)
    if (world.signupNeedsConfirm) return json(route, 200, { ...s.user, confirmation_sent_at: new Date().toISOString() })
    world.signedIn = true
    return json(route, 200, s)
  }
  if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
  if (path === '/auth/v1/user') return json(route, 200, fakeSession().user)

  // ---- REST ----
  if (path === '/rest/v1/profiles') {
    if (method === 'PATCH') {
      if (world.fail.saveName) return json(route, 500, { message: 'boom' })
      Object.assign(world.me, req.postDataJSON())
      return route.fulfill({ status: 204 })
    }
    const people = [world.me, world.partner].filter(Boolean)
    if (url.searchParams.get('user_id')?.startsWith('neq.')) {
      return rows(people.filter((p) => p.pair_id === eqParam(url, 'pair_id') && p.user_id !== eqParam(url, 'user_id')))
    }
    return rows(people.filter((p) => p.user_id === eqParam(url, 'user_id')))
  }
  if (path === '/rest/v1/pairs') {
    if (method === 'PATCH') {
      if (world.fail.saveDate) return json(route, 500, { message: 'boom' })
      Object.assign(world.pair, req.postDataJSON())
      return route.fulfill({ status: 204 })
    }
    return rows(world.pair && world.pair.id === eqParam(url, 'id') ? [world.pair] : [])
  }
  if (path === '/rest/v1/mood_state') {
    if (method === 'POST') {
      const body = req.postDataJSON()
      const row = Array.isArray(body) ? body[0] : body
      world.moods[row.user_id] = row.mood
      return route.fulfill({ status: 201 })
    }
    const id = eqParam(url, 'user_id')
    return rows(world.moods[id] ? [{ mood: world.moods[id] }] : [])
  }
  if (path.startsWith('/rest/v1/rpc/')) {
    const fn = path.split('/').pop()
    const body = req.postDataJSON() || {}
    if (fn === 'join_pair') {
      if (world.joinResult.error) return json(route, 400, { code: 'P0001', message: world.joinResult.error })
      return json(route, 200, body.p_dry_run ? world.joinResult.name : null)
    }
    if (fn === 'create_or_join_pair') return json(route, 200, world.me.pair_id)
    return json(route, 200, null)
  }

  // ---- storage ----
  if (path === '/storage/v1/object/list/gallery-photos') {
    if (world.fail.galleryList) return json(route, 500, { statusCode: '500', error: 'Internal', message: 'boom' })
    return json(route, 200, world.files.map((f) => ({ ...f, created_at: '2025-03-01T00:00:00Z', metadata: {} })))
  }
  if (path === '/storage/v1/object/sign/gallery-photos') {
    const { paths } = req.postDataJSON()
    return json(route, 200, paths.map((p) => ({ path: p, signedURL: `/object/sign/gallery-photos/${p}?token=test`, error: null })))
  }
  if (path.startsWith('/storage/v1/object/sign/gallery-photos/')) {
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    const p = decodeURIComponent(path.replace('/storage/v1/object/sign/gallery-photos/', ''))
    return json(route, 200, { signedURL: `/object/sign/gallery-photos/${p}?token=test` })
  }
  if (path === '/storage/v1/object/gallery-photos' && method === 'DELETE') {
    const { prefixes } = req.postDataJSON()
    world.files = world.files.filter((f) => !prefixes.some((p) => p.endsWith('/' + f.name)))
    return json(route, 200, prefixes.map((name) => ({ name })))
  }
  if (path.startsWith('/storage/v1/object/gallery-photos/') && method === 'POST') {
    if (world.fail.upload) return json(route, 400, { statusCode: '400', error: 'Bad', message: 'nope' })
    const name = path.split('/').pop()
    world.files.unshift({ name, id: 'f' + Date.now() })
    return json(route, 200, { Key: `gallery-photos/${path.split('gallery-photos/')[1]}`, Id: 'new' })
  }

  calls.push(`UNMOCKED ${method} ${path}`)
  return json(route, 404, { message: `unmocked ${method} ${path}` })
}

export const test = base.extend({
  world: async ({}, use) => {
    await use(defaultWorld())
  },
  // Console noise a test expects (e.g. a mocked 500). Anything else fails the test.
  allowConsole: async ({}, use) => {
    await use([])
  },
  calls: async ({}, use) => {
    await use([])
  },
  go: async ({ page, world }, use) => {
    let seeded = false
    await use(async (path) => {
      if (!seeded) {
        seeded = true
        await page.addInitScript(
          ({ key, session, introSeen }) => {
            // Seed once per test (init scripts rerun on every navigation, and logout must stick).
            if (sessionStorage.getItem('e2e-seeded')) return
            sessionStorage.setItem('e2e-seeded', '1')
            if (session) localStorage.setItem(key, JSON.stringify(session))
            if (introSeen) localStorage.setItem('monthsaryIntroSeen', '1')
          },
          { key: STORAGE_KEY, session: world.signedIn ? fakeSession() : null, introSeen: world.introSeen },
        )
      }
      await page.goto(path)
    })
  },
  page: async ({ page, world, allowConsole, calls }, use) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const text = m.text()
      if (allowConsole.some((re) => re.test(text))) return
      errors.push(`console: ${text}`)
    })

    await page.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin === SUPABASE) return handleSupabase(route, world, calls)
      // Sentry: swallow error and session reports so tests never send telemetry.
      if (url.hostname.endsWith('.ingest.us.sentry.io')) return route.fulfill({ status: 200, body: '{}' })
      if (ALLOWED_HOSTS.includes(url.hostname)) return route.continue()
      calls.push(`BLOCKED ${url.href}`)
      return route.abort()
    })

    await use(page)

    expect(calls.filter((c) => c.startsWith('UNMOCKED') || c.startsWith('BLOCKED')), 'every request is mocked or a static CDN asset').toEqual([])
    expect(errors, 'no console errors, page errors or CSP violations').toEqual([])
  },
})

export { expect }

/** WCAG 2 A/AA scan; fails on serious or critical violations. */
export async function expectAccessible(page, include) {
  // preload:false stops axe fetching cross-origin stylesheets itself, which the CSP (correctly) blocks.
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).options({ preload: false })
  if (include) builder = builder.include(include)
  const { violations } = await builder.analyze()
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(', ')}`)
  expect(bad).toEqual([])
}

/** Nothing scrolls sideways at the current viewport. */
export async function expectNoSidewaysScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'page is wider than the viewport').toBeLessThanOrEqual(0)
}

/** Lists visible controls whose tap area is under 44x44px (empty when all pass). */
export async function smallTapTargets(page) {
  return page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=tab]')) {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (!r.width || !r.height || style.visibility === 'hidden' || style.display === 'none') continue
      if (el.closest('[hidden], dialog:not([open])')) continue
      if (r.height >= 44 && r.width >= 44) continue
      // A small control can still be fine if an invisible ::after grows its hit area to 44px:
      // probe the edge midpoints of a 44px box around its centre and check they all land on it.
      el.scrollIntoView({ block: 'center', inline: 'center' })
      const c = el.getBoundingClientRect()
      const cx = c.left + c.width / 2, cy = c.top + c.height / 2
      const corners = [[0, -21], [21, 0], [0, 21], [-21, 0]]
      if (corners.every(([dx, dy]) => { const hit = document.elementFromPoint(cx + dx, cy + dy); return hit && (hit === el || el.contains(hit)) })) continue
      out.push(`${el.tagName.toLowerCase()}#${el.id || ''}.${[...el.classList].join('.')} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return out
  })
}

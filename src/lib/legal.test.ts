// The privacy page states facts about the code. These are the ones a test can hold: there is no analytics or
// cookie code, and every outside service the app can ask is named on the page.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AI_NOTICE, ASKED, NOT_ADVICE, NOT_NASA, OPERATOR, PRIVACY, STORED, TERMS } from './legal'

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|tsx|css|html|js)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}
const SOURCES = [...files('src'), 'index.html', 'public/sw.js']
const read = (p: string) => readFileSync(p, 'utf8')

describe('what the privacy page says about the code', () => {
  it('no cookies, analytics, advertising or error reporters: none is in the source', () => {
    const banned = /document\.cookie|googletagmanager|google-analytics|gtag\(|plausible\.io|posthog|matomo|hotjar|mixpanel|segment\.com|sentry\.io|@sentry\/|navigator\.sendBeacon|fbq\(|clarity\.ms/
    const found = SOURCES.filter((p) => banned.test(read(p)))
    expect(found).toEqual([])
  })

  it('no script, style or font is loaded from another site by the page itself', () => {
    const html = read('index.html')
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/)
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/)
    for (const p of SOURCES.filter((f) => f.endsWith('.css'))) expect(read(p), p).not.toMatch(/@import\s+url\(["']?https?:|fonts\.googleapis|fonts\.gstatic/)
  })

  it('names every outside service the app can ask', () => {
    const named = ASKED.map((a) => a.host).join(', ')
    // a host the code builds a request to: a URL with a query, a tile template or an API path. The reference lists
    // (the parameter registry, the credits, these pages) and the data dossier that no page reads yet only link out.
    const asks = /https:\/\/([a-z0-9.-]+)\/[^'"` )]*(?:\$\{|\{z\}|\?|\/rest\/|\/api\/|\/v1\/|\/v2\.0\/)/g
    const hosts = new Set<string>()
    for (const p of SOURCES) {
      if (/src[\\/]lib[\\/](data[\\/]|evidence\.ts|attribution\.ts|legal\.ts|glossary\.ts)/.test(p)) continue
      for (const m of read(p).matchAll(asks)) hosts.add(m[1])
    }
    expect(hosts.size).toBeGreaterThan(6)
    for (const h of hosts) expect(named.includes(h), `${h} is asked by the code and not named on the privacy page`).toBe(true)
  })

  it('names the app’s own storage, and stores nothing under another name', () => {
    expect(STORED.length).toBeGreaterThanOrEqual(4)
    const keys = new Set<string>()
    for (const p of SOURCES) for (const m of read(p).matchAll(/['"`](zixtaro[:.][a-z0-9:._-]*)/gi)) keys.add(m[1])
    // every key the app writes is its own, under one prefix: nothing third-party is kept in the browser
    for (const p of SOURCES) for (const m of read(p).matchAll(/(?:local|session)Storage\.setItem\(\s*['"`]([^'"`]+)/g)) expect(m[1].startsWith('zixtaro'), `${p}: ${m[1]}`).toBe(true)
    expect(keys.size).toBeGreaterThan(2)
  })
})

describe('the legal pages', () => {
  it('say the three things the tool is not, and never promise a result', () => {
    const all = [...NOT_ADVICE, ...AI_NOTICE, ...NOT_NASA, ...PRIVACY, ...TERMS]
    for (const c of all) {
      expect(c.k.length, c.k).toBeGreaterThan(3)
      expect(c.v.length, c.k).toBeGreaterThan(40)
    }
    const text = all.map((c) => c.v).join(' ')
    expect(text).toMatch(/does not replace your judgement/)
    expect(text).toMatch(/not affiliated with, sponsored by or endorsed by NASA/)
    expect(text).toMatch(/No machine-learned or generative model/)
    expect(text).toMatch(/Apache License 2\.0/)
    expect(text).not.toMatch(/guaranteed|we guarantee|will increase your yield/i)
  })

  it('carry no personal address as their contact', () => {
    expect(OPERATOR.contact).not.toMatch(/@(gmail|yahoo|hotmail|outlook|icloud|proton|mail\.ru|yandex|ukr\.net)\./i)
  })
})

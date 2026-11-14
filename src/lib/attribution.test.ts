// The promises of the licence pages, held: every package the site ships is under an open licence and is named;
// every third-party material is in THIRD_PARTY.md; what is not plainly open is on the owner's list.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_CREDITS, FONTS, OPEN_QUESTIONS, SOFTWARE } from './attribution'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { license?: string; dependencies: Record<string, string> }
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { license?: string; dev?: boolean; version?: string }> }

/** licences the Open Source Initiative approves, or a dedication to the public domain - as package.json files write them */
const OPEN = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|Zlib|0BSD|CC0-1\.0|OFL-1\.1|MPL-2\.0|BlueOak-1\.0\.0|Unlicense)$/
const isOpen = (licence: string) =>
  licence
    .replace(/[()]/g, '')
    .split(/\s+(?:AND|OR)\s+/)
    .every((id) => OPEN.test(id.trim()))

function licenceOf(path: string, v: { license?: string }): string {
  if (v.license) return v.license
  const own = `${path}/package.json`
  if (!existsSync(own)) return 'UNKNOWN'
  const j = JSON.parse(readFileSync(own, 'utf8')) as { license?: string | { type?: string } }
  return typeof j.license === 'string' ? j.license : (j.license?.type ?? 'UNKNOWN')
}

describe('what the site ships', () => {
  it('is itself under the licence the Space Apps terms fall back on', () => {
    expect(pkg.license).toBe('Apache-2.0')
    expect(readFileSync('LICENSE', 'utf8')).toMatch(/Apache License\s+Version 2\.0, January 2004/)
    expect(existsSync('NOTICE')).toBe(true)
  })

  it('contains no package under anything but an open licence', () => {
    const shipped = Object.entries(lock.packages).filter(([path, v]) => path && !v.dev)
    expect(shipped.length).toBeGreaterThan(20)
    const closed = shipped.map(([path, v]) => [path.replace(/^.*node_modules\//, ''), licenceOf(path, v)] as const).filter(([, l]) => !isOpen(l))
    expect(closed).toEqual([])
  })

  it('names every direct dependency on the licence pages', () => {
    const named = [...SOFTWARE, ...FONTS].map((c) => c.name.toLowerCase()).join(' | ')
    for (const dep of Object.keys(pkg.dependencies)) {
      // (a typeface's package is named by the face: @fontsource-variable/geist-mono is "Geist Mono")
      const name = dep.replace(/^@fontsource(-variable)?\//, '').replace(/-/g, ' ')
      expect(named.includes(dep.toLowerCase()) || named.includes(name), dep).toBe(true)
    }
  })
})

describe('the list of third-party materials', () => {
  const doc = readFileSync('THIRD_PARTY.md', 'utf8')

  it('has a maker, a use, a licence and a link for every entry, each named once', () => {
    for (const c of ALL_CREDITS) {
      expect(c.by.length, c.name).toBeGreaterThan(2)
      expect(c.what.length, c.name).toBeGreaterThan(3)
      expect(c.licence.length, c.name).toBeGreaterThan(2)
      expect(c.url, c.name).toMatch(/^https:\/\//)
    }
    expect(new Set(ALL_CREDITS.map((c) => c.name)).size).toBe(ALL_CREDITS.length)
  })

  it('is written out in THIRD_PARTY.md, entry for entry (node scripts/third-party.mjs)', () => {
    for (const c of ALL_CREDITS) expect(doc.includes(`[${c.name.replace(/\|/g, '\\|')}](${c.url})`), c.name).toBe(true)
    for (const [path, v] of Object.entries(lock.packages)) {
      if (!path || v.dev) continue
      expect(doc.includes(`| ${path.replace(/^.*node_modules\//, '')} | ${v.version} |`), path).toBe(true)
    }
  })

  it('puts whatever is not plainly open on the owner’s list, with what makes it so', () => {
    const owner = readFileSync('docs/SPACE-APPS-COMPLIANCE.md', 'utf8')
    expect(OPEN_QUESTIONS.length).toBeGreaterThan(0)
    for (const c of OPEN_QUESTIONS) {
      expect(doc.includes(`**${c.name}**`), c.name).toBe(true)
      // the compliance sheet names each by its common name (the first words of the entry's)
      const key = c.name.replace(/^Tour voice, English.*$/, 'English tour voice').replace(/ v\d.*$/, '').replace(/ \d.*$/, '').replace(/^Global Dataset of Historical Yields$/, 'Global Dataset of Historical').replace(/^Street View$/, 'Google Street View').replace(/^World Imagery$/, 'Esri World Imagery')
      expect(owner.includes(key), `${c.name} → ${key}`).toBe(true)
    }
    // and a material is never called open while its licence line says otherwise
    for (const c of ALL_CREDITS) if (c.terms === 'open' || c.terms === 'credit') expect(c.licence, c.name).not.toMatch(/non-commercial|not confirmed|terms of use/i)
  })
})

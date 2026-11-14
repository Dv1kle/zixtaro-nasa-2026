// src/lib/data/registry.test.ts
import { describe, expect, it } from 'vitest'
import { ASKED } from './asked'
import { METRICS, METRIC_BY_ID } from './metrics'
import { SOURCES } from './sources'
import { GROUPS, SOURCE_IDS } from './types'

describe('metric registry', () => {
  it('has unique metric ids with known groups and sources', () => {
    const ids = METRICS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of METRICS) {
      expect(GROUPS).toContain(m.group)
      expect(m.sources.length, m.id).toBeGreaterThan(0)
      for (const s of m.sources) expect(SOURCES[s], `${m.id} → ${s}`).toBeDefined()
      expect(m.method.length, m.id).toBeGreaterThan(10)
    }
  })
  it('describes every source id once', () => {
    expect(Object.keys(SOURCES).sort()).toEqual([...SOURCE_IDS].sort())
  })
  it('catalogues all 105 asked metrics exactly once, in order', () => {
    expect(ASKED.map((a) => a.n)).toEqual(Array.from({ length: 105 }, (_, i) => i + 1))
  })
  it('links asked metrics only to real metrics and explains every X', () => {
    for (const a of ASKED) {
      for (const id of a.metrics) expect(METRIC_BY_ID.has(id), `${a.n} → ${id}`).toBe(true)
      if (a.tags.includes('X')) expect(a.note.length, `asked ${a.n}`).toBeGreaterThan(20)
      if (!a.tags.includes('X') && !(a.tags.length === 1 && a.tags[0] === 'I')) expect(a.metrics.length, `asked ${a.n}`).toBeGreaterThan(0)
    }
  })
  it('counts 31 items that cannot be measured in full or in part', () => {
    expect(ASKED.filter((a) => a.tags.includes('X')).length).toBe(31)
  })
  it('never uses an en or em dash in page text', () => {
    expect(JSON.stringify([METRICS, ASKED, SOURCES])).not.toMatch(/[–—]/)
  })
})

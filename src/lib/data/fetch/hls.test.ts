// src/lib/data/fetch/hls.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeArea } from '../../geo'
import { EXPR, featureBbox, fetchHls, fieldFeature, LANDSAT_CLOUD, statFrom, zoneUrl } from './hls'

afterEach(() => vi.unstubAllGlobals())

describe('Planetary Computer field statistics', () => {
  it('uses the field ring, or a 300 m square around a point', () => {
    const area = fieldFeature(makeArea([[13, 51], [13.01, 51], [13.01, 51.01], [13, 51.01]]))
    expect(area.geometry.coordinates[0]).toHaveLength(5) // closed ring
    const pt = fieldFeature({ kind: 'point', lat: 0, lon: 30 })
    const [w, s, e, n] = featureBbox(pt)
    expect((n - s) * 111_320).toBeCloseTo(300, -1)
    expect((e - w) * 111_320).toBeCloseTo(300, -1)
  })
  it('has red-edge indices only for the Sentinel-2 half', () => {
    expect(EXPR.s30.ndre).toContain('B05')
    expect(EXPR.l30.ndre).toBeUndefined()
    expect(EXPR.l30.ndvi).toBe('(B05-B04)/(B05+B04)')
    // the statistics API rejects bitwise operators (HTTP 500): cloud bits are read with floor and modulo
    expect(EXPR.s30.cloud).not.toContain('&')
    expect(EXPR.l30.cloud).not.toContain('&')
    expect(LANDSAT_CLOUD).not.toContain('&')
  })
  it('reads a statistics answer and rejects empty ones', () => {
    expect(statFrom({ mean: 0.5, std: 0.1, percentile_2: 0.2, percentile_98: 0.7, count: 1225 })).toEqual({ mean: 0.5, std: 0.1, p2: 0.2, p98: 0.7, count: 1225 })
    expect(statFrom({ mean: NaN, std: 0, count: 0 })).toBeNull()
    expect(statFrom(undefined)).toBeNull()
  })
  it('builds a zone image URL for the field bbox', () => {
    const u = zoneUrl('hls2-s30', 'HLS.S30.X', [75.79, 30.89, 75.81, 30.91], EXPR.s30.ndvi, [0.1, 0.9], 'rdylgn')
    expect(u).toContain('/api/data/v1/item/bbox/75.79,30.89,75.81,30.91.png')
    expect(u).toContain('colormap_name=rdylgn')
    expect(u).toContain(encodeURIComponent(EXPR.s30.ndvi))
  })
  it('falls back to radar when no optical scene is clear (monsoon clouds)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/search')) {
        const body = JSON.parse(String(init?.body))
        const features = body.collections[0] === 'sentinel-1-rtc' ? [{ id: 'S1X', collection: 'sentinel-1-rtc', properties: { datetime: '2026-09-25T00:00:00Z' } }] : []
        return new Response(JSON.stringify({ features }))
      }
      const statistics = { '10*log10(vv)': { mean: -9, std: 1, count: 100 }, '10*log10(vh)': { mean: -15, std: 1, count: 100 }, '4*vh/(vv+vh)': { mean: 0.6, std: 0.1, count: 100 } }
      return new Response(JSON.stringify({ properties: { statistics } }))
    }))
    const r = await fetchHls({ kind: 'point', lat: 23.7, lon: 90.4 })
    expect(r.values.map((v) => v.id)).toEqual(['s1_vv', 's1_vh', 's1_rvi'])
    expect(r.zones).toEqual([])
  })
})

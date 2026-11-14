import { afterEach, describe, expect, it, vi } from 'vitest'
import data from '../data/perennials.json'
import { GAEZ_CLASSES, gaezAt, longTerm, parseTrees, siClass, treesAround, treesAt, type GaezLayer } from './perennials'

const layers = data.layers as GaezLayer[]

describe('GAEZ suitability classes', () => {
  it('match the class layers GAEZ v4 publishes beside the index (siHr_*, sampled at 14 points)', () => {
    // index (0-100) -> class 1 very high … 8 not suitable, as read from siHr_cof / siHr_olv / siHr_olp
    const seen: [number, number][] = [[50.78, 4], [5.43, 7], [15.42, 6], [21.51, 6], [53.81, 4], [46.14, 4], [0, 8], [76.47, 2], [63.19, 3], [31.82, 5], [49.09, 4], [7.74, 7]]
    for (const [si, k] of seen) expect(siClass(si).n, String(si)).toBe(k)
    expect(siClass(90).n).toBe(1)
    expect(GAEZ_CLASSES.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('long-term planting view', () => {
  it('reads every crop now and in the 2050s under both scenarios, on cropland first', () => {
    const rows = longTerm(data.presets.pergamino, layers, null)
    expect(rows.map((r) => r.id).sort()).toEqual(['banana', 'citrus', 'cocoa', 'coconut', 'coffee', 'oilpalm', 'olive', 'rubber', 'tea'])
    const citrus = rows.find((r) => r.id === 'citrus')!
    expect(citrus.now).toBe(100)
    expect(citrus.land).toBe('cropland')
    expect(citrus.otherLand).toBeNull()
    expect(citrus.rcp45).toBeGreaterThanOrEqual(0)
    expect(citrus.rcp85).toBeGreaterThanOrEqual(0)
    // best first
    expect(rows[0].id).toBe('citrus')
  })
  it('a temperate field gets an honest "none of them" (Torgau)', () => {
    const rows = longTerm(data.presets.torgau, layers, null)
    expect(rows.every((r) => r.now === 0)).toBe(true)
  })
  it('a crop unsuitable on the cell\'s cropland but rated on its other land says so instead of reading 0 as all', () => {
    const v = layers.map((l) => (l.crop === 'coffee' ? (l.land === 'all' ? 3200 : 0) : 0))
    const coffee = longTerm(v, layers, null).find((r) => r.id === 'coffee')!
    expect(coffee.now).toBe(0)
    expect(coffee.otherLand).toBe(32)
  })
  it('a cell without cropland (GAEZ codes it -1) is rated on all its land, and says so', () => {
    const v = layers.map((l) => (l.land === 'cropland' ? -1 : l.crop === 'coffee' ? 5556 : 0))
    const coffee = longTerm(v, layers, null).find((r) => r.id === 'coffee')!
    expect(coffee.land).toBe('all')
    expect(coffee.now).toBeCloseTo(55.56, 6)
    expect(coffee.otherLand).toBeNull()
  })
  it("no data (-9: water or ice in GAEZ's land mask) is not read as 'not suitable'", () => {
    const rows = longTerm(layers.map(() => -9), layers, null)
    expect(rows.every((r) => Number.isNaN(r.now))).toBe(true)
  })
  it('keeps the all-land index beside the cropland one (a cell with little cropland swings; all its land does not)', () => {
    // Pereira, Colombia (4.8 N 75.7 W), read from GAEZ: cocoa on the cell's cropland 0 now, 100 in the
    // 2050s under both scenarios; on all its land 0 -> 53.5 / 61.2
    const v = layers.map((l) => {
      if (l.crop !== 'cocoa') return 0
      if (l.land === 'cropland') return l.when === 'now' ? 0 : 10000
      return l.when === 'now' ? 0 : l.rcp === '4.5' ? 5354 : 6117
    })
    const cocoa = longTerm(v, layers, null).find((r) => r.id === 'cocoa')!
    expect([cocoa.now, cocoa.rcp45, cocoa.rcp85]).toEqual([0, 100, 100])
    expect(cocoa.allLand).toEqual({ now: 0, rcp45: 53.54, rcp85: 61.17 })
  })
  it('sets what the farmland around grows beside the rating', () => {
    const around = { coffee: 0.12, grape: 0.04 }
    const rows = longTerm(layers.map(() => 0), layers, around)
    expect(rows.find((r) => r.id === 'coffee')!.around).toBe(0.12)
    expect(rows.find((r) => r.id === 'tea')!.around).toBe(0)
  })
})

describe('CROPGRIDS tree-crop grid', () => {
  it('parses records and finds the 0.5° cell of a point', () => {
    // one record: row 104 (37.75 N), col 348 (5.75 W -> -6.0..-5.5), 2 crops: olive 21 %, citrus 3 %
    const buf = new ArrayBuffer(9)
    const v = new DataView(buf)
    v.setUint16(0, 104, true)
    v.setUint16(2, 348, true)
    v.setUint8(4, 2)
    v.setUint8(5, 3) // olive
    v.setUint8(6, 21)
    v.setUint8(7, 8) // citrus
    v.setUint8(8, 3)
    const ids = ['oilpalm', 'rubber', 'cocoa', 'olive', 'coconut', 'coffee', 'banana', 'tea', 'citrus']
    const grid = parseTrees(buf, ids)
    expect(treesAt(grid, 37.6, -5.9)).toEqual({ olive: 0.21, citrus: 0.03 })
    expect(treesAt(grid, 10, 10)).toEqual({})
  })
})

describe('reading GAEZ live', () => {
  afterEach(() => vi.unstubAllGlobals())
  const answer = (values: string[], ids = layers) =>
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      properties: { Values: values },
      catalogItems: { features: ids.map((l) => ({ attributes: { objectid: l.id, name: l.name } })) },
    })))
  it('reads "NoData" as no data, not as a broken answer (an ocean point answers NoData for every layer)', async () => {
    answer(layers.map(() => 'NoData'))
    const v = await gaezAt(-30, -20)
    expect(v.every(Number.isNaN)).toBe(true)
    expect(longTerm(v, layers, null).every((r) => Number.isNaN(r.now))).toBe(true)
  })
  it('refuses an answer whose layers are not the baked ones (FAO republished the service with new ids)', async () => {
    answer(layers.map(() => '5000'), layers.map((l, i) => ({ ...l, name: layers[(i + 1) % layers.length].name })))
    await expect(gaezAt(4.8, -75.7)).rejects.toThrow(/layer/)
  })
  it('refuses an answer that lacks a layer', async () => {
    answer(layers.slice(1).map(() => '5000'), layers.slice(1))
    await expect(gaezAt(4.8, -75.7)).rejects.toThrow(/layer/)
  })
})

describe('what grows around, before it has loaded', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('an unknown neighbourhood is null, not "nobody grows it"', () => {
    const rows = longTerm(data.presets.pergamino, layers, null)
    expect(rows.every((r) => r.around === null)).toBe(true)
    expect(longTerm(data.presets.pergamino, layers, {}).every((r) => r.around === 0)).toBe(true)
  })
  it('a failed download is tried again next time, not remembered for the session', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline') })
    expect(await treesAround(37.6, -5.9)).toBeNull()
    const ids = ['oilpalm', 'rubber', 'cocoa', 'olive']
    const bin = new Uint8Array([104, 0, 92, 1, 1, 3, 21]) // row 104, col 348, olive 21 %
    vi.stubGlobal('fetch', async (u: string) => new Response(String(u).endsWith('.json') ? JSON.stringify({ crops: ids, source: 's', url: 'u' }) : bin))
    expect((await treesAround(37.6, -5.9))?.here).toEqual({ olive: 0.21 })
  })
})

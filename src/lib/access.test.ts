import { afterEach, describe, expect, it, vi } from 'vitest'
import data from '../data/access.json'
import { cityHours, hoursAt, MARKET_REACH_GATE, marketReach, parseAccess } from './access'
import { compare } from './explain'
import type { CropId } from './crops'
import { rankNext } from './rotation'
import { load } from './testkit'

describe('market reach of fresh produce (Nelson 2019 travel time × CROPGRIDS 2020)', () => {
  it('the reach is the data’s: 95 % of the crop’s world harvested area lies within it; storable crops have none', () => {
    expect(marketReach('tomato')).toBe(data.hours.tomato.p95)
    expect(marketReach('okra')).toBe(data.hours.okra.p95)
    expect(marketReach('onion')).toBeNull() // keeps for months
    expect(marketReach('wheat')).toBeNull()
  })
  it('reads the 0.25° grid: 10-minute steps, 255 = no data', () => {
    const grid = new Uint8Array(720 * 1440).fill(255)
    grid[Math.floor((90 - 51.55) / 0.25) * 1440 + Math.floor((13.0 + 180) / 0.25)] = 9 // 90 min
    const g = parseAccess(grid.buffer)
    expect(hoursAt(g, 51.55, 13.0)).toBe(1.5)
    expect(hoursAt(g, 0, 0)).toBeNull()
  })
  it('a field farther from a city of 50 000 than 95 % of the world’s tomato keeps half its standing; a near one all', () => {
    const base = load('torgau').ctx
    const w = { soil: 60, water: 15, profit: 45 }
    const at = (id: CropId, h: number | null) => rankNext([], { ...base, cityHours: h }, w, new Set<CropId>()).find((e) => e.crop.id === id)!
    const near = at('tomato', 0.5)
    const far = at('tomato', 9)
    expect(far.score).toBeCloseTo(near.score * MARKET_REACH_GATE, 9)
    expect(far.science).toBeCloseTo(near.science * MARKET_REACH_GATE, 9) // logistics, not observed practice: mode A too
    expect(at('tomato', null).score).toBeCloseTo(near.score, 9) // unknown: no gate
    expect(far.notes.some((n) => /city of 50 000/.test(n.text))).toBe(true)
    expect(at('onion', 9).score).toBeCloseTo(at('onion', 0.5).score, 9)
  })
  it('is a factor of its own, not "national practice": the gap goes to reach, the national proof stays as it was', () => {
    const base = load('torgau').ctx
    const w = { soil: 60, water: 15, profit: 45 }
    const at = (h: number) => rankNext([], { ...base, cityHours: h }, w, new Set<CropId>()).find((e) => e.crop.id === 'tomato')!
    const far = at(9)
    const near = at(0.5)
    expect(far.sub.viability).toBe(near.sub.viability)
    expect(far.sub.reach).toBe(MARKET_REACH_GATE)
    expect(near.sub.reach).toBe(1)
    const parts = compare(far, near, w).parts
    expect(parts.find((p) => p.key === 'reach')!.points).toBeCloseTo(far.score - near.score, 6)
    expect(Math.abs(parts.find((p) => p.key === 'viability')!.points)).toBeLessThan(1e-9)
  })
  it('a failed download of the grid is tried again next time', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline') })
    expect(await cityHours(51.55, 13.0)).toBeNull()
    const grid = new Uint8Array(720 * 1440).fill(255)
    grid[Math.floor((90 - 51.55) / 0.25) * 1440 + Math.floor((13.0 + 180) / 0.25)] = 7
    vi.stubGlobal('fetch', async () => new Response(grid))
    expect(await cityHours(51.55, 13.0)).toBeCloseTo(70 / 60, 9)
    vi.unstubAllGlobals()
  })
})

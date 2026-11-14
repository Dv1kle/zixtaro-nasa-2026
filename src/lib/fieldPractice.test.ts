import { describe, expect, it } from 'vitest'
import { cropOfClass } from './cropMaps'
import { CROP_BY_ID, type CropId } from './crops'
import { fieldOrder, fieldPrior, fieldPriorAt, MIN_LOCAL, PRACTICE_LAYER, transitions, windowShares, type FieldPractice } from './fieldPractice'
import { windowHistories } from './fieldWindow'
import { practiceFactors, REGION_CAP, REGION_LAMBDA, type PracticePrior } from './prior'
import type { RotationWindows } from './rotationPrior'
import { withPractice, type Evaluation } from './rotation'

const ev = (id: CropId, science: number) =>
  ({
    crop: CROP_BY_ID[id],
    score: science,
    science,
    proof: 1,
    parts: { soil: science * 0.4, water: science * 0.1, profit: science * 0.3, fit: science * 0.2, lost: 3 },
    sub: { rotation: 1, soil: 0.5, water: 0.5, profit: 0.5, fit: 0.5, viability: 1, reach: 1, carbon: 0.5 },
  }) as unknown as Evaluation

// a window of 40 fields that sowed wheat, then maize, then soybean, then wheat, then maize (2019-2023), and 12 that
// broke the cycle with peas after maize in 2021
const cycle: CropId[] = ['wheat', 'maize', 'soybean', 'wheat', 'maize']
const histories: (CropId | null)[][] = [...Array.from({ length: 40 }, () => cycle), ...Array.from({ length: 12 }, () => ['wheat', 'maize', 'pea', 'wheat', 'maize'] as CropId[])]
const noRotations: RotationWindows = { years: [2019, 2020, 2021, 2022, 2023], windows: [] }
const field = (national: Partial<Record<CropId, number>>): FieldPractice => ({ map: 'cdl', rot: noRotations, lat: 42, lon: -93, national, t: transitions(histories) })

describe('the practice of the field and the fields around it (fieldPractice.ts, H8)', () => {
  it('reads what the window sowed after the field\'s last two crops, without the field itself where it is one of them', () => {
    const t = transitions(histories)
    const after = windowShares(t, ['soybean', 'wheat', 'maize', 'soybean', 'wheat'])!
    // after soybean > wheat: maize, 40 times (the cycle's fields, 2021-2023)
    expect(after.maize).toBe(1)
    expect(windowShares(t, ['wheat', 'maize', 'oats', 'lupin', 'rye'])).toBeNull() // no transition on record
    const self = windowShares(t, cycle, true)!
    const others = windowShares(t, cycle)!
    expect(Object.keys(others)).toEqual(Object.keys(self))
    expect(MIN_LOCAL).toBe(10)
  })

  it('blends own cycle 0.15 and window 0.6 at every level of the neighbours\' prior (H8\'s setting)', () => {
    const national = { wheat: 0.5, maize: 0.3, soybean: 0.2 }
    const p = fieldPrior(cycle, null, national, { soybean: 0.8, pea: 0.2 })
    expect(PRACTICE_LAYER).toEqual({ a: 0.15, b: 0.6, lambda: 1, cap: 16, gate: 0.3, all: true })
    // no neighbours' prior: the country's mix stands in, blended all the same; the push is the country's
    expect(p.lambda).toBe(0.3)
    expect(p.cap).toBe(2)
    expect(p.shares.pea).toBeCloseTo(0.6 * 0.2)
    const total = Object.values(p.shares).reduce((s, v) => s + (v ?? 0), 0)
    expect(total).toBeCloseTo(1)
  })

  it('ranks on the page as the layer H8 judged: withPractice with the field\'s practice gives the layer\'s order', () => {
    const ranking = [ev('maize', 60), ev('wheat', 58), ev('soybean', 50), ev('pea', 30), ev('oats', 25)]
    const f = field({ wheat: 0.4, maize: 0.4, soybean: 0.2 })
    const history: CropId[] = ['maize', 'soybean', 'wheat', 'maize', 'pea']
    const prior: PracticePrior = { shares: {}, lambda: REGION_LAMBDA, cap: REGION_CAP, source: 'field', field: f }
    const page = withPractice(ranking, prior, history).map((e) => e.crop.id)
    const p = fieldPriorAt(f, history)
    expect(page).toEqual(fieldOrder(ranking.map((e) => ({ id: e.crop.id, science: e.science })), p.shares, p.lambda, p.cap, p.gate))
  })

  it('lets practice lift a crop the science puts at 0.3-0.5 of the best, which the region\'s prior (gate 0.5) keeps down', () => {
    const ranking = [ev('maize', 60), ev('wheat', 59), ev('soybean', 58), ev('pea', 22)]
    const shares = { pea: 0.9, maize: 0.04, wheat: 0.03, soybean: 0.03 }
    const region = practiceFactors(ranking, { shares, lambda: 1, cap: 16, source: 'region' })
    expect([...ranking].sort((a, b) => b.science * region.get(b.crop.id)! - a.science * region.get(a.crop.id)!)[0].crop.id).not.toBe('pea')
    expect(fieldOrder(ranking.map((e) => ({ id: e.crop.id, science: e.science })), shares, 1, 16, 0.3)[0]).toBe('pea')
  })
})

describe('the crop-map window as the page reads it (fieldWindow.ts)', () => {
  it('turns each year\'s classes into each point\'s history, as the experiments read them', () => {
    // CDL: 1 maize, 5 soybean, 26 double crop (no single crop), 111 water; RPG: BTH wheat, MID sweet corn (a crop in a history)
    expect(windowHistories('cdl', [[1, 5], [5, 26], [1, 111]])).toEqual([['maize', 'soybean', 'maize'], ['soybean', null, null]])
    expect(windowHistories('rpg', [['BTH', null], ['MID', 'BTH']])).toEqual([['wheat', 'maize'], [null, 'wheat']])
    expect(cropOfClass('rpg', 'MID', true)).toBeNull()
  })
})

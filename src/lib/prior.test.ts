import { describe, expect, it } from 'vitest'
import { CROP_BY_ID, type CropId } from './crops'
import { ringMix } from './localCrops'
import { nationalShares, practiceFor, practicePosterior, regionalShares } from './practice'
import { COUNTRY_CAP, COUNTRY_LAMBDA, posteriorPushes, practiceFactors, REGION_CAP, REGION_LAMBDA, type PracticePrior } from './prior'
import { withPractice, type Evaluation } from './rotation'

/** an evaluation whose parts add up to its score, as evaluate() makes them */
const ev = (id: CropId, science: number) =>
  ({
    crop: CROP_BY_ID[id],
    score: science,
    science,
    proof: 1,
    parts: { soil: science * 0.4, water: science * 0.1, profit: science * 0.3, fit: science * 0.2, lost: 3 },
    sub: { rotation: 1, soil: 0.5, water: 0.5, profit: 0.5, fit: 0.5, viability: 1, reach: 1, carbon: 0.5 },
  }) as unknown as Evaluation

const prior = (shares: Partial<Record<CropId, number>>): PracticePrior => ({ shares, lambda: REGION_LAMBDA, cap: REGION_CAP, source: 'region' })

describe('practice prior (prior.ts)', () => {
  const ranking = [ev('soybean', 60), ev('maize', 55), ev('sorghum', 50), ev('millet', 20)]
  const shares = { maize: 0.6, sorghum: 0.3, millet: 0.1 }

  it('the pushes are the ones practicePosterior sorts by', () => {
    const pushes = posteriorPushes(ranking, shares, REGION_LAMBDA, REGION_CAP)
    const post = practicePosterior(ranking, shares, REGION_LAMBDA, REGION_CAP)
    for (const p of post) expect(p.push).toBeCloseTo(pushes[p.was - 1])
  })

  it('factors are at most 1 and order the crops as science x e^push', () => {
    const f = practiceFactors(ranking, prior(shares))
    expect(Math.max(...f.values())).toBeCloseTo(1)
    for (const v of f.values()) expect(v).toBeLessThanOrEqual(1)
    const byFactor = [...ranking].sort((a, b) => b.science * f.get(b.crop.id)! - a.science * f.get(a.crop.id)!).map((e) => e.crop.id)
    expect(byFactor).toEqual(practicePosterior(ranking, shares, REGION_LAMBDA, REGION_CAP).map((p) => p.e.crop.id))
  })

  it('a season that sells nothing does not set the plausible bar (a bare fallow at 66 left the region’s wheat at 29 out)', () => {
    const r = [ev('fallow', 66), ev('soybean', 37), ev('wheat', 29)]
    expect(practicePosterior(r, { wheat: 0.9, soybean: 0.1 }, REGION_LAMBDA, REGION_CAP)[0].e.crop.id).toBe('wheat')
  })

  it('withPractice: the region moves maize first; parts still add up; science untouched', () => {
    const out = withPractice(ranking, prior(shares))
    expect(out[0].crop.id).toBe('maize')
    for (const e of out) {
      const before = ranking.find((r) => r.crop.id === e.crop.id)!
      expect(e.science).toBe(before.science)
      expect(e.parts.soil + e.parts.water + e.parts.profit + e.parts.fit).toBeCloseTo(e.score)
      expect(e.parts.lost - before.parts.lost).toBeCloseTo(before.score - e.score)
      expect(e.sub.viability).toBeCloseTo(e.score / before.score)
    }
  })

  it('a crop the science rules out (under half the best) gains on no plausible crop', () => {
    const out = withPractice(ranking, prior({ millet: 0.97, soybean: 0.01, maize: 0.01, sorghum: 0.01 }))
    expect(out[out.length - 1].crop.id).toBe('millet')
  })

  it('no practice, no change', () => {
    expect(withPractice(ranking, prior({})).map((e) => e.crop.id)).toEqual(ranking.map((e) => e.crop.id))
  })
})

describe('the region around a field (localCrops ringMix, practice.ts)', () => {
  const key = (r: number, c: number) => r * 720 + c
  // the field at 50.1 N, 10.1 E is in row 79, col 380
  const grid = new Map([
    [key(79, 380), { areaKm2: 1000, crops: [{ id: 'maize', share: 1 }] }], // own cell: out
    [key(80, 381), { areaKm2: 1000, crops: [{ id: 'maize', share: 1 }] }], // a neighbour: out
    [key(81, 380), { areaKm2: 300, crops: [{ id: 'bean', share: 0.5 }, { id: 'vegetables', share: 0.5 }] }], // ring 2
    [key(83, 384), { areaKm2: 100, crops: [{ id: 'wheat', share: 1 }] }], // ring 4
    [key(84, 380), { areaKm2: 900, crops: [{ id: 'rye', share: 1 }] }], // ring 5: out
  ])

  it('ring 2-4: own cell and neighbours out, shares of all the ring area', () => {
    const m = ringMix(grid, 50.1, 10.1, 2, 4)!
    expect(m.maize).toBeUndefined()
    expect(m.rye).toBeUndefined()
    expect(m.bean).toBeCloseTo(150 / 400)
    expect(m.wheat).toBeCloseTo(100 / 400)
    expect(ringMix(new Map(), 50.1, 10.1, 2, 4)).toBeNull()
  })

  it('CROPGRIDS bean is the model\'s dry bean; vegetables are no model crop', () => {
    const s = regionalShares(ringMix(grid, 50.1, 10.1, 2, 4), 50.1)
    expect(s.drybean).toBeCloseTo(0.375)
    expect(Object.keys(s).sort()).toEqual(['drybean', 'wheat'])
  })

  it('practiceFor: the region where CROPGRIDS has cropland around, else the country', () => {
    expect(practiceFor({ wheat: 0.5 }, 50, 'DEU')).toMatchObject({ source: 'region', lambda: REGION_LAMBDA, cap: REGION_CAP })
    const c = practiceFor(null, 50, 'DEU')
    expect(c).toMatchObject({ source: 'country', lambda: COUNTRY_LAMBDA, cap: COUNTRY_CAP })
    expect(c.shares).toEqual(nationalShares('DEU'))
    expect(practiceFor({ vegetables: 1 }, 50, 'DEU').source).toBe('country')
  })
})

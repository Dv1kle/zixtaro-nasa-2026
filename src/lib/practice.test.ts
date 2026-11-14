// Three views of one field: the scientific ranking, what farms around it grow (CROPGRIDS), and the scientific ranking
// with a small, visible prior for local practice - plus why the science and the practice disagree.
import { describe, expect, it } from 'vitest'
import { CROP_BY_ID, type CropId } from './crops'
import { disagreement, localShares, nationalShares, PLAUSIBLE, PRACTICE_WEIGHT, PRIOR_CAP, practiceInformed, practicePosterior } from './practice'
import { rankNext, type Evaluation } from './rotation'
import { load } from './testkit'

const fake = (id: CropId, score: number) => ({ crop: CROP_BY_ID[id], score, science: score, proof: 1 }) as Evaluation

describe('local practice as model crops', () => {
  it('reads CROPGRIDS millet as pearl millet near the equator and proso millet in the temperate north, beans as dry beans', () => {
    const at = (lat: number) => localShares({ cell: { lat, lon: 0 }, crops: [{ id: 'millet', share: 0.3 }, { id: 'bean', share: 0.2 }, { id: 'vegetables', share: 0.1 }] } as never)
    expect(at(12)).toEqual({ pearlmillet: 0.3, drybean: 0.2 })
    expect(at(50)).toEqual({ millet: 0.3, drybean: 0.2 })
  })
})

describe('practice-informed ranking', () => {
  const ranking = [fake('millet', 60), fake('sorghum', 58), fake('maize', 55), fake('groundnut', 40)]
  it('lifts a crop the farms around grow, by at most the practice weight', () => {
    const r = practiceInformed(ranking, { maize: 0.6 })
    const maize = r.find((x) => x.e.crop.id === 'maize')!
    expect(maize.rank).toBeLessThan(maize.was)
    expect(maize.score).toBeCloseTo(55 * (1 + PRACTICE_WEIGHT * Math.sqrt(0.6)), 6)
    expect(maize.score).toBeLessThanOrEqual(55 * (1 + PRACTICE_WEIGHT))
  })
  it('leaves the order alone where nobody around grows any of the crops', () => {
    expect(practiceInformed(ranking, {}).map((x) => x.e.crop.id)).toEqual(['millet', 'sorghum', 'maize', 'groundnut'])
  })
  it('does not carry a crop from far down to the top: practice is evidence, not the answer', () => {
    const r = practiceInformed(ranking, { groundnut: 1 })
    expect(r.find((x) => x.e.crop.id === 'groundnut')!.rank).toBeGreaterThan(1)
  })
})

describe('mode C as a bounded log-prior (accuracy plan)', () => {
  const ranking = [fake('millet', 60), fake('sorghum', 58), fake('maize', 55), fake('groundnut', 25), fake('soybean', 50)]
  it('reorders plausible candidates by the practice share', () => {
    const r = practicePosterior(ranking, { maize: 0.7, millet: 0.05 })
    expect(r[0].e.crop.id).toBe('maize')
    expect(r.find((x) => x.e.crop.id === 'maize')!.was).toBe(3)
  })
  it('cannot rescue a crop the science rates implausible (under PLAUSIBLE of the best score)', () => {
    const r = practicePosterior(ranking, { groundnut: 1 })
    const g = r.find((x) => x.e.crop.id === 'groundnut')!
    expect(25).toBeLessThan(PLAUSIBLE * 60)
    expect(g.push).toBeLessThanOrEqual(0)
    expect(g.rank).toBe(5)
  })
  it('never more than doubles a score (bounded push)', () => {
    for (const x of practicePosterior(ranking, { soybean: 1 })) {
      expect(x.score / x.e.science).toBeLessThanOrEqual(PRIOR_CAP + 1e-9)
      expect(x.score / x.e.science).toBeGreaterThanOrEqual(1 / PRIOR_CAP - 1e-9)
    }
  })
  it('keeps the science order where the practice says nothing', () => {
    expect(practicePosterior(ranking, {}).map((x) => x.e.crop.id)).toEqual(['millet', 'sorghum', 'maize', 'soybean', 'groundnut'])
  })
  it('reads the country mix from FAOSTAT production and yield', () => {
    const s = nationalShares('USA')
    expect(s.maize! + s.soybean!).toBeGreaterThan(0.5)
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
    expect(nationalShares('XXX')).toEqual({})
  })
})

describe('why the science and the practice disagree', () => {
  it('explains the crop farms grow most when the model does not pick it', () => {
    const { ctx, p } = load('iowa')
    const ranking = rankNext([], ctx, p.priorities, new Set(p.exclude))
    const grown = ranking.find((e) => e.crop.id === 'maize')!
    const d = disagreement(ranking, { maize: 0.55, soybean: 0.35 }, ctx, p.priorities)
    if (ranking[0].crop.id === 'maize') expect(d).toBeNull()
    else {
      expect(d!.grown.crop.id).toBe('maize')
      expect(d!.ourRank).toBe(ranking.indexOf(grown) + 1)
      expect(d!.cmp.a.crop.id).toBe(ranking[0].crop.id)
      expect(['close', 'physics', 'economics']).toContain(d!.verdict)
      expect(d!.factors.water).toBeGreaterThan(0)
    }
  })
  it('has nothing to explain when the model already picks what farms grow most', () => {
    const { ctx, p } = load('iowa')
    const ranking = rankNext([], ctx, p.priorities, new Set(p.exclude))
    expect(disagreement(ranking, { [ranking[0].crop.id]: 0.6 }, ctx, p.priorities)).toBeNull()
  })
})

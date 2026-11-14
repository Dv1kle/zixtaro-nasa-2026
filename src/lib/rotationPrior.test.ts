import { describe, expect, it } from 'vitest'
import type { CropId } from './crops'
import { O2_WEIGHTS, OWN_CYCLE_WEIGHT, ownCycle, rotationPrior, rotationShares, windowPrior, withOwnAndWindow, withOwnCycle, type RotationWindows } from './rotationPrior'

describe('what the fields right around sowed after the same crops (O2)', () => {
  // nine fields in a maize > soybean rotation (triples m s m, s m s, m s m) and three that broke it with wheat (s m w,
  // m w s, w s m): after soybean then maize, 9 sowed soybean and 3 wheat
  const others = [
    ...Array.from({ length: 9 }, () => ['maize', 'soybean', 'maize', 'soybean', 'maize']),
    ...Array.from({ length: 3 }, () => ['soybean', 'maize', 'wheat', 'soybean', 'maize']),
  ] as (CropId | null)[][]
  it('reads the other fields’ triples at this field’s last two crops', () => {
    const p = windowPrior(others, ['wheat', 'barley', 'wheat', 'soybean', 'maize'])!
    expect(p.soybean).toBeCloseTo(9 / 12, 9)
    expect(p.wheat).toBeCloseTo(3 / 12, 9)
  })
  it('backs off to the last crop, and says nothing under WINDOW_MIN_N transitions', () => {
    const p = windowPrior(others, ['rye', 'oats', 'rye', 'barley', 'maize'])! // barley > maize unseen: after maize alone
    expect(p.soybean).toBeCloseTo(9 / 12, 9)
    expect(p.wheat).toBeCloseTo(3 / 12, 9)
    expect(windowPrior(others.slice(0, 2), ['maize', 'soybean'])).toBeNull() // 4 transitions
  })
  it('gives a missing part’s weight back to the neighbours’ table', () => {
    const nb = { soybean: 0.6, maize: 0.4 }
    const both = withOwnAndWindow(nb, ['maize', 'soybean', 'maize', 'soybean', 'maize'], others)
    const own = ownCycle(['maize', 'soybean', 'maize', 'soybean', 'maize'])!
    const win = windowPrior(others, ['maize', 'soybean', 'maize', 'soybean', 'maize'])!
    const w = 1 - O2_WEIGHTS.own - O2_WEIGHTS.window
    expect(both.soybean).toBeCloseTo(w * 0.6 + O2_WEIGHTS.own * (own.soybean ?? 0) + O2_WEIGHTS.window * (win.soybean ?? 0), 9)
    const noWindow = withOwnAndWindow(nb, ['maize', 'soybean', 'maize', 'soybean', 'maize'], [])
    expect(noWindow.maize).toBeCloseTo((1 - O2_WEIGHTS.own) * 0.4 + O2_WEIGHTS.own * (own.maize ?? 0), 9)
    expect(withOwnAndWindow(nb, [null, null, null, null, 'maize'], [])).toBe(nb)
  })
})

const W = (lat: number, lon: number, counts: Record<string, number>) => ({ id: `w${lat}`, iso3: 'USA', source: 'cdl' as const, lat, lon, points: 1, triples: Object.values(counts).reduce((a, b) => a + b, 0), counts })
const data: RotationWindows = {
  years: [2019, 2024],
  windows: [
    W(40, -90, { 'soybean>maize>soybean': 90, 'soybean>maize>maize': 10, 'maize>soybean>maize': 80, 'maize>soybean>_': 20 }),
    W(43, -90, { 'soybean>maize>wheat': 1000 }), // ~330 km away: outside the 250 km reach
  ],
}

describe('the rotation practice prior: what farms around sow after the last two crops', () => {
  it('reads the triple when the window holds it (after soybean then maize, soybean 90 %)', () => {
    const p = rotationPrior(data, 40.1, -90, ['soybean', 'maize'])!
    expect(p.level).toBe('two')
    expect(p.probs.soybean).toBeCloseTo(0.9, 9)
    expect(p.probs.maize).toBeCloseTo(0.1, 9)
    expect(p.probs.wheat).toBeUndefined() // the far window does not count
    expect(p.sources).toEqual(['cdl'])
  })
  it('backs off to the last crop when the pair is unseen, then to the region', () => {
    const one = rotationPrior(data, 40, -90, ['wheat', 'maize'])!
    expect(one.level).toBe('one')
    expect(one.probs.soybean).toBeCloseTo(0.9, 9)
    const region = rotationPrior(data, 40, -90, [])!
    expect(region.level).toBe('region')
    expect(region.probs.soybean).toBeCloseTo(90 / 200, 9)
  })
  it('keeps the share of crops the engine does not rank in the total (after maize then soybean: maize 80 %, not 100 %)', () => {
    expect(rotationPrior(data, 40, -90, ['maize', 'soybean'])!.probs.maize).toBeCloseTo(0.8, 9)
  })
  it('says nothing outside the windows’ reach', () => {
    expect(rotationPrior(data, 10, 10, ['soybean', 'maize'])).toBeNull()
  })
  it('stands in for the crop shares only where the field’s own history backs it', () => {
    expect(rotationShares(rotationPrior(data, 40.1, -90, ['soybean', 'maize']))!.soybean).toBeCloseTo(0.9, 9)
    expect(rotationShares(rotationPrior(data, 40, -90, ['wheat', 'maize']))!.soybean).toBeCloseTo(0.9, 9)
    expect(rotationShares(rotationPrior(data, 40, -90, []))).toBeNull() // the region's sowings: CROPGRIDS speaks for those
    expect(rotationShares(null)).toBeNull()
  })
})

describe('the field’s own cycle beside its neighbours’ rotations', () => {
  it('follows a three-year rotation the last two crops cannot show (wheat > rapeseed > barley > wheat > rapeseed -> barley)', () => {
    const own = ownCycle(['wheat', 'rapeseed', 'barley', 'wheat', 'rapeseed'])!
    expect(own.barley).toBeCloseTo(1, 9) // period 3 repeats in both of its pairs
    expect(own.wheat ?? 0).toBeCloseTo(0, 9)
  })
  it('takes the shorter period on a tie and spreads the rest over the field’s own crops', () => {
    expect(ownCycle(['maize', 'soybean', 'maize', 'soybean', 'maize'])!.soybean).toBeCloseTo(1, 9) // periods 2 and 4 tie
    // period 1: 1 of 4 pairs repeat, period 2: 1 of 3, period 3: 1 of 2 (wheat at seasons 1 and 4) -> barley, weight 1/2
    const mixed = ownCycle(['wheat', 'wheat', 'barley', 'wheat', 'rapeseed'])!
    expect(mixed.barley).toBeCloseTo(0.5 + 0.5 * (1 / 5), 9)
    expect(mixed.wheat).toBeCloseTo(0.5 * (3 / 5), 9)
    expect(Object.values(mixed).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1, 9)
  })
  it('skips unknown seasons and says nothing under two known ones', () => {
    expect(ownCycle([null, null, null, null, 'maize'])).toBeNull()
    expect(ownCycle([null, 'maize', null, 'maize', null])!.maize).toBeCloseTo(1, 9)
  })
  it('blends at OWN_CYCLE_WEIGHT and leaves the neighbours’ shares alone without an own cycle', () => {
    const nb = { soybean: 0.8, maize: 0.2 }
    const b = withOwnCycle(nb, ['wheat', 'rapeseed', 'barley', 'wheat', 'rapeseed'])
    expect(b.barley).toBeCloseTo(OWN_CYCLE_WEIGHT, 9)
    expect(b.soybean).toBeCloseTo((1 - OWN_CYCLE_WEIGHT) * 0.8, 9)
    expect(withOwnCycle(nb, [null, null, null, null, 'maize'])).toBe(nb)
  })
})

import { CROP_BY_ID } from './crops'
import { practiceInformed, PRACTICE_WEIGHT, verdictText, whyDifferent } from './practice'
import { rankNext } from './rotation'
import { load } from './testkit'

describe('the practice-informed view with a known history', () => {
  it('weighs what farms sow after these crops instead of the region’s crop shares', () => {
    const { ctx } = load('iowa')
    const ranking = rankNext(['maize', 'soybean', 'maize'], ctx, { soil: 60, water: 15, profit: 45 })
    const shares = { maize: 0.6, soybean: 0.35 }
    const byShare = practiceInformed(ranking, shares)
    const byRotation = practiceInformed(ranking, shares, PRACTICE_WEIGHT, { soybean: 0.9, maize: 0.1 })
    const prior = (rows: typeof byShare, id: string) => rows.find((x) => x.e.crop.id === id)!.prior / rows.find((x) => x.e.crop.id === id)!.proof
    expect(prior(byShare, 'maize')).toBeCloseTo(1 + PRACTICE_WEIGHT * Math.sqrt(0.6), 9)
    expect(prior(byRotation, 'maize')).toBeCloseTo(1 + PRACTICE_WEIGHT * Math.sqrt(0.1), 9)
    expect(prior(byRotation, 'soybean')).toBeCloseTo(1 + PRACTICE_WEIGHT * Math.sqrt(0.9), 9)
    expect(prior(byRotation, 'wheat')).toBeCloseTo(1, 9) // not sown after these crops around here
  })
})

describe('why the model differs from what farms here sow next', () => {
  const w = { soil: 60, water: 15, profit: 45 }
  it('names the crop sown most after these crops, its rank, the split of the gap and its unpriced flags', () => {
    const { ctx } = load('torgau')
    // pea two seasons ago: every pulse after it carries a high flag (legume root rots), whatever the ranking's #1 is
    const ranking = rankNext(['pea', 'wheat'], ctx, w)
    const flagged = ranking.find((e, i) => i > 0 && e.flags.some((f) => f.level === 'high' && f.cause === 'pea-rots'))!
    const d = whyDifferent(ranking, { [flagged.crop.id]: 0.6, [ranking[0].crop.id]: 0.3 }, ctx, w)!
    expect(d.grown.crop.id).toBe(flagged.crop.id)
    expect(d.ourRank).toBe(ranking.indexOf(flagged) + 1)
    expect(d.cmp.parts.reduce((a, p) => a + p.points, 0)).toBeCloseTo(d.cmp.gap, 6)
    expect(d.flags.some((f) => f.level === 'high' && f.cause === 'pea-rots')).toBe(true)
  })
  it('says nothing when the model already picks it, or when the history backs no rotation', () => {
    const { ctx } = load('torgau')
    const ranking = rankNext(['wheat'], ctx, w)
    expect(whyDifferent(ranking, { [ranking[0].crop.id]: 0.9 }, ctx, w)).toBeNull()
    expect(whyDifferent(ranking, null, ctx, w)).toBeNull()
  })
  it('compares with the most common crop that is ranked when the most common one is switched off', () => {
    const { ctx } = load('torgau')
    const ranking = rankNext(['wheat'], ctx, w).filter((e) => e.crop.id !== 'barley')
    const second = ranking.find((e, i) => i > 0)!.crop.id
    const d = whyDifferent(ranking, { barley: 0.7, [second]: 0.2 }, ctx, w)!
    expect(d.grown.crop.id).toBe(second)
    expect(CROP_BY_ID[d.grown.crop.id]).toBeDefined()
  })
})

describe('the reason given follows what makes most of the gap', () => {
  // a comparison as disagreement() builds it, cut to what verdictText reads
  const gapOn = (key: string, points: number, verdict = 'economics') => ({
    verdict, weakest: { key: 'water', value: 0.8 },
    grown: { crop: { name: 'Winter barley' }, proof: 1, notes: [
      { tone: 'warn', tag: 'rotation', text: 'Winter wheat last season carries take-all root rot: winter barley after it gives about 10 % less yield, as a second wheat does.' },
      { tone: 'warn', tag: 'soil', text: 'Bare soil over winter on a sloping field.' },
    ] },
    cmp: { a: { crop: { name: 'Maize' }, notes: [] }, gap: 10.7, parts: [{ key, points }, { key: 'profit', points: 1 }] },
  }) as unknown as Parameters<typeof verdictText>[0]
  it('the rotation, as the model prices it, when it makes most of the gap - not money', () => {
    expect(verdictText(gapOn('rotation', 6.6))).toMatch(/rotation.*take-all/)
    expect(verdictText(gapOn('rotation', 6.6))).not.toMatch(/pays less/)
  })
  it('the reason is the largest factor in the model\'s favour - not a larger one that favours the farms\' crop', () => {
    const d = gapOn('rotation', 6)
    ;(d.cmp as unknown as { parts: { key: string; points: number }[] }).parts = [{ key: 'soil', points: -9 }, { key: 'rotation', points: 6 }, { key: 'profit', points: 1 }]
    expect(verdictText(d)).toMatch(/rotation.*take-all/)
  })
  it('soil health when soil makes most of it; money when money does; the top three stays the top three', () => {
    expect(verdictText(gapOn('soil', 2.6))).toMatch(/soil health.*bare soil over winter/i)
    expect(verdictText(gapOn('profit', 6))).toMatch(/pays less than maize/)
    expect(verdictText(gapOn('rotation', 6.6, 'close'))).toMatch(/top three/)
  })
})

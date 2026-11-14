import { describe, expect, it } from 'vitest'
import type { CropId } from './crops'
import { DEFAULT_PRESET, defaultExcludeFor, initialHistory, noHistory, PRESETS } from './presets'
import { rankNext } from './rotation'

describe('the crop history a page opens with (experiment H found it leaking between fields)', () => {
  it('a field from a link without a history has five unknown seasons to fill in - not the Torgau demo’s', () => {
    expect(initialHistory({ field: { kind: 'point', lat: 4.8, lon: -75.7 } })).toEqual([null, null, null, null, null])
    expect(noHistory()).toEqual([null, null, null, null, null])
    expect(noHistory()).not.toBe(noHistory()) // a fresh array each time: editing one field's seasons never touches another's
  })
  it('unknown seasons rank exactly as no history at all', () => {
    const { ctx } = load('iowa')
    const w = { soil: 60, water: 15, profit: 45 }
    const by = (h: (CropId | null)[]) => rankNext(h, ctx, w).map((e) => `${e.crop.id} ${e.score.toFixed(6)}`)
    expect(by(noHistory())).toEqual(by([]))
  })
  it('a demo field keeps its own history; the link’s history wins; no field at all opens the default demo', () => {
    const iowa = PRESETS.find((p) => p.id === 'iowa')!
    expect(initialHistory({ field: iowa.field })).toEqual(iowa.history)
    expect(initialHistory({ field: { kind: 'point', lat: 4.8, lon: -75.7 }, history: ['maize', null] })).toEqual(['maize', null])
    expect(initialHistory({})).toEqual(DEFAULT_PRESET.history)
  })
})

import { CROP_BY_ID, CROPS } from './crops'
import { winterDrainage } from './nitrate'
import { evaluate, type FieldContext } from './rotation'
import { load, prairieClimate } from './testkit'
import { allCropRisks } from './water'

describe('a past crop is read in the form it took on this field', () => {
  it('on the Prairies last season’s wheat was spring wheat - the rules and notes say so (not winter wheat)', () => {
    const climate = prairieClimate()
    const { soil } = load('torgau')
    const risks = allCropRisks(climate, soil)
    expect(risks.wheat.crop.form).toBe('spring')
    const ctx: FieldContext = {
      risks, soil, stressYear: null, irrigated: false, drying: climate.signal.drying, slopePct: 0.5, recentLabel: 'recent', baselineLabel: 'baseline',
      winterDrain: winterDrainage(climate, soil),
    }
    const notes = ['potato', 'soybean', 'barley'].flatMap((id) => evaluate(CROP_BY_ID[id as 'potato'], ['wheat'], ctx, { soil: 60, water: 15, profit: 45 }).notes)
    expect(notes.filter((n) => /winter wheat/i.test(n.text)).map((n) => n.text)).toEqual([])
    expect(notes.some((n) => /spring wheat/i.test(n.text))).toBe(true)
  })
})

describe('one disease pathway, one penalty', () => {
  // rotation factor R on the German demo field (winter forms), one previous crop; base 0.9
  const R = (crop: string, prev: string) => evaluate(CROP_BY_ID[crop as 'wheat'], [prev as 'wheat'], load('torgau').ctx, { soil: 60, water: 15, profit: 45 }).sub.rotation
  // a small grain after another host of its cereal diseases loses what a second wheat loses, 10 % (and no more)
  it('Fusarium after maize is not charged again as "same family" (wheat after maize: a second cereal’s 10 %)', () => {
    expect(R('wheat', 'maize')).toBeCloseTo(0.9 * (1 - 0.1), 9)
  })
  it('take-all from a grass ley or a cereal is not charged again as "same family" (a second cereal’s 10 %)', () => {
    expect(R('triticale', 'grassley')).toBeCloseTo(0.9 * (1 - 0.1), 9)
    expect(R('barley', 'wheat')).toBeCloseTo(0.9 * (1 - 0.1), 9)
  })
  it('the note says what the loss is', () => {
    const notes = (crop: string, prev: string) => evaluate(CROP_BY_ID[crop as 'wheat'], [prev as 'wheat'], load('torgau').ctx, { soil: 60, water: 15, profit: 45 }).notes.map((n) => n.text)
    expect(notes('wheat', 'maize').filter((t) => /Fusarium/.test(t))).toEqual([expect.stringMatching(/about 10 % less yield/)])
    expect(notes('barley', 'wheat').filter((t) => /take-all/.test(t))).toEqual([expect.stringMatching(/about 10 % less yield/)])
  })
  it('where no disease links the two, the family is a moderate flag, not priced (oats after wheat, sorghum after maize)', () => {
    expect(R('oats', 'wheat')).toBeCloseTo(0.9, 9)
    expect(R('sorghum', 'maize')).toBeCloseTo(0.9, 9)
    const e = evaluate(CROP_BY_ID.oats, ['wheat'], load('torgau').ctx, { soil: 60, water: 15, profit: 45 })
    expect(e.flags.map((f) => [f.rule, f.level])).toEqual([['same-family', 'moderate']])
    expect(e.notes.some((n) => /Same plant family as last season.* - a risk, not priced in the score\./.test(n.text))).toBe(true)
  })
  it('a soil-borne bridge is a high flag, not priced (canola after soybean: Sclerotinia)', () => {
    const e = evaluate(CROP_BY_ID.rapeseed, ['soybean'], load('torgau').ctx, { soil: 60, water: 15, profit: 45 })
    expect(e.sub.rotation).toBeCloseTo(0.9, 9)
    expect(e.flags).toEqual([expect.objectContaining({ rule: 'disease-host', level: 'high', cause: 'sclerotinia' })])
  })
  it('the break-crop credit is the second-cereal loss the next cereal is spared (rapeseed after wheat and barley)', () => {
    const e = evaluate(CROP_BY_ID.rapeseed, ['wheat', 'barley'], load('torgau').ctx, { soil: 60, water: 15, profit: 45 })
    expect(e.sub.rotation).toBeCloseTo(0.9 + 0.9 * 0.1, 9)
    expect(e.notes.some((n) => n.tone === 'good' && /Break crop after 2 cereal seasons.*about 10 % less yield/.test(n.text))).toBe(true)
  })
  it('flags survive the irrigation mix when the watering is unknown', () => {
    const ctx = { ...load('torgau').ctx, irrigationPrior: 0.4 }
    const e = evaluate(CROP_BY_ID.rapeseed, ['soybean'], ctx, { soil: 60, water: 15, profit: 45 })
    expect(e.flags.map((f) => f.cause)).toEqual(['sclerotinia'])
  })
})

describe('a crop repeated too soon loses what field records and trials measure, not a fixed gate', () => {
  const R = (crop: string, history: string[]) => evaluate(CROP_BY_ID[crop as 'wheat'], history as 'wheat'[], load('torgau').ctx, { soil: 60, water: 15, profit: 45 }).sub.rotation
  it('maize after maize 4.3 %, soybean after soybean 10.4 % (Seifert et al. 2017, 748 374 US fields)', () => {
    expect(R('maize', ['maize'])).toBeCloseTo(0.9 * (1 - 0.043), 9)
    expect(R('maize', ['maize', 'maize', 'maize'])).toBeCloseTo(0.9 * (1 - 0.043), 9)
    expect(R('soybean', ['soybean'])).toBeCloseTo(0.9 * (1 - 0.104), 9)
  })
  it('a small grain after itself 10 % - take-all is in that figure, not charged again; a fourth wheat no worse', () => {
    expect(R('wheat', ['wheat'])).toBeCloseTo(0.9 * (1 - 0.1), 9)
    expect(R('wheat', ['wheat', 'wheat', 'wheat'])).toBeCloseTo(0.9 * (1 - 0.1), 9)
    expect(R('barley', ['barley'])).toBeCloseTo(0.9 * (1 - 0.1), 9)
  })
  it('canola after canola 7.5 %, one year between 4.7 %, two years none (field records, Western Canada)', () => {
    expect(R('rapeseed', ['rapeseed'])).toBeCloseTo(0.9 * (1 - 0.075), 9)
    expect(R('rapeseed', ['rapeseed', 'wheat'])).toBeCloseTo(0.9 * (1 - 0.047), 9)
    expect(R('rapeseed', ['rapeseed', 'wheat', 'barley'])).toBeGreaterThan(0.9 - 1e-9)
  })
  it('crops with soil-borne pests and no measured drag are flagged inside their minimum breaks, not priced (sugar beet, pea)', () => {
    expect(R('sugarbeet', ['sugarbeet', 'wheat'])).toBeCloseTo(0.9, 9)
    expect(R('pea', ['pea', 'wheat'])).toBeCloseTo(0.9, 9)
    const e = evaluate(CROP_BY_ID.sugarbeet, ['sugarbeet', 'wheat'], load('torgau').ctx, { soil: 60, water: 15, profit: 45 })
    expect(e.flags).toEqual([expect.objectContaining({ rule: 'min-break', level: 'high' })])
    expect(e.notes.some((n) => n.tone === 'bad' && /seasons between crops.* - a risk, not priced in the score\./.test(n.text))).toBe(true)
  })
})

import { buildStrategies } from './rotation'

describe('multi-season plans do not choose an unpriced high rotation risk', () => {
  const w = { soil: 60, water: 15, profit: 45 }
  it('a crop that pays three times as much is not planned again inside its break', () => {
    const ctx = { ...load('torgau').ctx, priceFactor: { potato: 3 } }
    for (const s of buildStrategies(['wheat'], ctx, w)) {
      for (const e of s.seq.slice(1)) expect(e.flags.filter((f) => f.level === 'high'), `${s.key}: ${s.seq.map((x) => x.crop.id).join(' > ')}`).toEqual([])
    }
  })
  it('still plans when every crop left would be a high risk', () => {
    const { ctx } = load('torgau')
    const only = new Set(CROPS.map((c) => c.id).filter((id) => id !== 'potato'))
    const plans = buildStrategies(['wheat'], ctx, w, only)
    expect(plans.length).toBeGreaterThan(0)
    expect(plans[0].seq.map((e) => e.crop.id)).toEqual(['potato', 'potato', 'potato', 'potato'])
  })
})

import { flagSummary } from './rotation'

describe('the rotation risk shown with a crop', () => {
  it('takes the worst level and names each disease once', () => {
    expect(flagSummary([])).toBeNull()
    expect(flagSummary([
      { rule: 'same-family', level: 'moderate', cause: null, text: 'x' },
      { rule: 'min-break', level: 'high', cause: 'sclerotinia', text: 'y' },
      { rule: 'disease-host', level: 'high', cause: 'sclerotinia', text: 'z' },
    ])).toEqual({ level: 'high', causes: ['white mould (Sclerotinia)'] })
  })
})

import { compare } from './explain'

describe('an unpriced flag never explains a part of the score', () => {
  it('the rotation part cites the priced loss, not a flag noted before it', () => {
    const { ctx } = load('torgau')
    const w = { soil: 60, water: 15, profit: 45 }
    const a = evaluate(CROP_BY_ID.maize, ['rapeseed'], ctx, w) // R 0.9, no rotation note
    const b0 = evaluate(CROP_BY_ID.barley, ['wheat'], ctx, w) // R 0.81: take-all, priced
    const flagged = { tone: 'bad' as const, tag: 'rotation' as const, text: 'Barley was grown 2 seasons ago - it needs 3+ seasons between crops - a risk, not priced in the score.' }
    const rot = compare(a, { ...b0, notes: [flagged, ...b0.notes] }, w).parts.find((p) => p.key === 'rotation')!
    expect(rot.points).toBeGreaterThan(0)
    expect(rot.reason?.text).toMatch(/take-all/)
  })
})

describe('the crops a field starts with', () => {
  it('leaves out what nobody grows around it, where the mix around is asked for', () => {
    const around = { wheat: 0.2, rapeseed: 0.07, buckwheat: 0.0003, sunflower: 0.00001 }
    const off = defaultExcludeFor(null, around)
    for (const id of ['chickpea', 'sunflower', 'rice'] as const) expect(off).toContain(id)
    for (const id of ['wheat', 'rapeseed', 'buckwheat'] as const) expect(off).not.toContain(id)
    // without the mix the rule is as it was: chickpea is the farmer's to switch off
    expect(defaultExcludeFor(null)).not.toContain('chickpea')
  })
  it('opens on Lithuania, with Lithuania’s own fields as the demo row', () => {
    expect(DEFAULT_PRESET.region).toMatch(/Lithuania/)
    const shown = PRESETS.filter((p) => !p.hidden)
    expect(shown.length).toBeGreaterThanOrEqual(4)
    for (const p of shown) expect(p.region, p.id).toMatch(/Lithuania/)
    // every season of a demo field's history is a crop the field is allowed to grow
    for (const p of shown) for (const c of p.history) if (c) expect(p.exclude, `${p.id}: ${c}`).not.toContain(c)
  })
})

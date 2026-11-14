// Crop calendars that follow the field: spring sowing waits for warmth, winter kill turns winter crops into their
// spring forms, and north of the tropic a summer monsoon sets the sowing date the way it does in the tropics.
import { describe, expect, it } from 'vitest'
import { calendarShift, CROPS, CROP_BY_ID, cropSeason, MILD_WINTER_T, monsoonal, rainsRuns, sowingSpan, summerRainsShare, tempOnDay, type CropId } from './crops'
import { evaluate, type FieldContext } from './rotation'
import { manualProfile } from './soil'
import { highlandClimate, load, monsoonNorthClimate, nigeriaClimate, prairieClimate, steppeClimate, syntheticClimate } from './testkit'
import { warmClimate } from './scenario'
import { allCropRisks, cropRisk, formsOf } from './water'
import { fieldValidity } from './validity'

const loam = manualProfile('loam', 6.5)
const firstMonth = (id: CropId, climate: ReturnType<typeof steppeClimate>) =>
  cropSeason(CROP_BY_ID[id], climate.season.hemisphere, climate.monthly.recent)[0].month
const contextFor = (climate: ReturnType<typeof steppeClimate>): FieldContext => ({
  risks: allCropRisks(climate, loam), soil: loam, stressYear: null, irrigated: false, drying: false, slopePct: 1, recentLabel: '', baselineLabel: '',
})

describe('spring sowing waits for the field to warm', () => {
  it('sows oats on the steppe in April, not in the European March', () => {
    expect(firstMonth('oats', steppeClimate())).toBe(4)
  })
  it('lets oats ripen on the Saskatchewan prairie, where a March sowing leaves them too few warm days', () => {
    expect([4, 5]).toContain(firstMonth('oats', prairieClimate()))
    expect(allCropRisks(prairieClimate(), loam).oats.thermal.recent).toBeGreaterThan(0.8)
  })
  it('moves no calendar of a crop the demo fields consider - the reference dates were made for such fields', () => {
    for (const id of ['torgau', 'poltava', 'iowa', 'kansas', 'pergamino']) {
      const { climate, p } = load(id)
      for (const c of CROPS.filter((c) => !p.exclude.includes(c.id))) {
        const got = cropSeason(c, climate.season.hemisphere, climate.monthly.recent)[0].month
        const want = climate.season.hemisphere === 'south' ? ((c.sow + 5) % 12) + 1 : c.sow
        expect(`${id} ${c.id} ${got}`).toBe(`${id} ${c.id} ${want}`)
      }
    }
  })
})

describe('winter or spring form', () => {
  it('plans spring wheat, barley and rapeseed where the winters kill the winter forms', () => {
    const r = allCropRisks(steppeClimate(), loam)
    expect(r.wheat.crop.name).toBe('Spring wheat')
    expect(r.barley.crop.name).toBe('Spring barley')
    expect(r.rapeseed.crop.name).toBe('Spring rapeseed')
    expect(r.wheat.cold.recent).toBe(0)
  })
  it('keeps the winter forms where they survive the winter', () => {
    const { risks } = load('torgau')
    expect(risks.wheat.crop.name).toBe('Winter wheat')
    expect(risks.barley.crop.name).toBe('Winter barley')
    expect(risks.rapeseed.crop.name).toBe(CROP_BY_ID.rapeseed.name)
  })
  it('scores the form the field grows, without winter kill', () => {
    const e = evaluate(CROP_BY_ID.wheat, [], contextFor(steppeClimate()), { soil: 60, water: 60, profit: 60 })
    expect(e.crop.name).toBe('Spring wheat')
    expect(e.notes.some((n) => n.text.startsWith('Winter kill'))).toBe(false)
  })
})

describe('monsoon calendars north of the tropic', () => {
  it('transplants rice once the monsoon floods the field at 24° N, not into the dry May heat', () => {
    expect(firstMonth('rice', monsoonNorthClimate())).toBe(7)
    expect(firstMonth('sorghum', monsoonNorthClimate())).toBe(6)
  })
  it('grows chickpea after the rains, as rabi', () => {
    expect(firstMonth('chickpea', monsoonNorthClimate())).toBe(10)
  })
})

describe('warmth to ripen, wherever the crop is really grown', () => {
  it('lets maize ripen on the Mexican plateau: GAEZ asks whether some cultivar ripens, and its temperate ones do', () => {
    expect(allCropRisks(highlandClimate(), loam).maize.thermal.recent).toBeGreaterThan(0.6)
  })
  it('lets cassava ripen in the Nigerian cassava belt, the largest producer on Earth', () => {
    expect(allCropRisks(nigeriaClimate(), loam).cassava.thermal.recent).toBeGreaterThan(0.9)
  })
  it('still finds Central European summers far too short for cassava', () => {
    expect(load('torgau').risks.cassava.thermal.recent).toBeLessThan(0.2)
  })
})

describe('the validity panel tells what the calendar did', () => {
  it('a monsoon field north of the tropic says its calendars follow the rains', () => {
    const flags = fieldValidity({ climate: monsoonNorthClimate(), soil: loam, daily: null })
    expect(flags.find((f) => f.id === 'tropics')?.title).toMatch(/Rainy season/)
  })
  it('a steppe field says the winter crops are planned in their spring forms, and why that may be too strict', () => {
    const flag = fieldValidity({ climate: steppeClimate(), soil: loam, daily: null }).find((f) => f.id === 'springform')
    expect(flag?.level).toBe('stretch')
    expect(flag?.detail).toMatch(/snow/)
    expect(fieldValidity({ climate: load('torgau').climate, soil: loam, daily: null }).some((f) => f.id === 'springform')).toBe(false)
  })
})

describe('switches between forms move without steps (water.ts formsOf)', () => {
  // south-western Australia's normals (check D) shifted so the coldest month sits just either side of the mild-winter line
  const near = (coldest: number) => syntheticClimate({
    lat: -34.75, lon: 117.75, tRange: 11,
    t: [21, 21, 19, 16, 13, 11, 10, 10, 12, 14, 16, 19].map((t) => t - 10 + coldest),
    p: [19, 16, 32, 45, 65, 86, 111, 104, 61, 44, 27, 15],
    pet: [216, 179, 147, 92, 66, 40, 38, 47, 69, 106, 144, 203],
  })
  it('scores wheat on both forms across the line, so a hair either side changes little', () => {
    const lo = near(MILD_WINTER_T - 0.05)
    const hi = near(MILD_WINTER_T + 0.05)
    const a = formsOf(CROP_BY_ID.wheat, lo)
    const b = formsOf(CROP_BY_ID.wheat, hi)
    expect(a.main.form).toBeUndefined() // the winter form just below the line, the autumn-sown spring type just above
    expect(b.main.form).toBe('mild')
    expect(a.alt?.w).toBeGreaterThan(0.45)
    expect(b.alt?.w).toBeGreaterThan(0.45)
    const w = { soil: 60, water: 15, profit: 45 }
    const s = (c: ReturnType<typeof near>) => evaluate(CROP_BY_ID.wheat, [], contextFor(c), w).score
    expect(Math.abs(s(lo) - s(hi))).toBeLessThan(1)
  })
  it('reads the same mixed water beside the score (the explanation, the plan, the Monte Carlo)', async () => {
    const { chainFor } = await import('./explain')
    const { contextFor: drawFor, simulateAll, SOIL_FACTORS } = await import('./robust')
    const c = near(MILD_WINTER_T - 0.3)
    const ctx = contextFor(c)
    const e = evaluate(CROP_BY_ID.wheat, [], ctx, { soil: 60, water: 15, profit: 45 })
    expect(ctx.risks.wheat.alt).toBeDefined()
    expect(chainFor(e, ctx, c).loss).toBeCloseTo(e.loss)
    // the Monte Carlo draws the other form too: a draw of one season is that season of each form
    const sim = simulateAll(ctx, c, ['wheat'])
    const y = sim.recentYears[0]
    const d = drawFor(ctx, ['wheat'], sim, { soil: SOIL_FACTORS.indexOf(1), seasons: [y], ky: {}, price: {}, w: { soil: 60, water: 15, profit: 45 } })
    const alt = ctx.risks.wheat.alt!.risk
    expect(d.risks.wheat.alt!.risk.recent.loss).toBeCloseTo(alt.byYear.find((s) => s.year === y)!.loss)
  })
  it('scores one form only away from the line', () => {
    expect(formsOf(CROP_BY_ID.wheat, near(MILD_WINTER_T + 1.5)).alt).toBeUndefined()
    expect(formsOf(CROP_BY_ID.wheat, near(MILD_WINTER_T - 1.5)).alt).toBeUndefined()
  })
})

describe('a winter-rain season is not a monsoon (crops.ts summerRains)', () => {
  it('reads autumn rains that last through a mild winter as Mediterranean, and summer rains as a monsoon', () => {
    // coldest month 11 °C both: rain from September to March (Sicily-like), or from June to September (Punjab-like)
    const t = [11, 12, 14, 17, 21, 25, 28, 28, 25, 20, 16, 12]
    const pet = [40, 50, 75, 100, 135, 160, 175, 160, 115, 80, 50, 40]
    const med = [80, 70, 55, 30, 15, 5, 2, 8, 65, 90, 95, 90]
    const mon = [10, 10, 8, 6, 10, 90, 180, 170, 90, 12, 4, 6]
    const normals = (p: number[]) => t.map((x, i) => ({ month: i + 1, t: x, p: p[i], pet: pet[i] }))
    expect(monsoonal('north', normals(med))).toBe(false)
    expect(monsoonal('north', normals(mon))).toBe(true)
  })
})

describe('wet-season disease moves without steps (water.ts wetSeason)', () => {
  it('grows smoothly as the rain grows, while the share of seasons over the limit still jumps', () => {
    // a field pea on a temperate field whose in-season rain sweeps across its 350 mm limit
    const t = [0, 1, 5, 9, 14, 17, 19, 18, 14, 9, 4, 1]
    const pet = [5, 10, 30, 60, 95, 115, 125, 105, 65, 30, 10, 5]
    const risk = (k: number) => cropRisk(CROP_BY_ID.pea, syntheticClimate({ lat: 51.5, lon: 13, t, p: [40, 35, 45, 50, 60, 70, 75, 65, 50, 45, 45, 45].map((p) => p * k), pet }), loam)
    const ks = Array.from({ length: 81 }, (_, i) => 1 + i * 0.01)
    const wet = ks.map((k) => risk(k).wet)
    const steps = (xs: number[]) => Math.max(...xs.slice(1).map((x, i) => Math.abs(x - xs[i])))
    expect(Math.max(...wet.map((w) => w.seasons!.recent))).toBeGreaterThan(0) // the sweep crosses the limit
    expect(steps(wet.map((w) => w.seasons!.recent))).toBeGreaterThanOrEqual(0.1) // the plain share jumps a season at a time
    expect(steps(wet.map((w) => w.recent))).toBeLessThan(0.08) // the ramp does not
  })
})

describe('the sowing rule and month move without steps (crops.ts coolSpan, water.ts sowingBand)', () => {
  const w = { soil: 60, water: 15, profit: 45 }
  // a Punjab-like summer-rain field, shifted so its coldest month (January) sits where the test needs it
  const punjab = (coldest: number) => syntheticClimate({
    lat: 31.25, lon: 76.75,
    t: [0, 3, 8, 14, 19, 21, 20, 19, 18, 14, 8, 2].map((t) => t + coldest),
    p: [40, 45, 35, 15, 20, 110, 290, 280, 120, 15, 5, 15],
    pet: [40, 55, 95, 140, 180, 190, 150, 130, 120, 100, 60, 40],
  })
  it('scores a summer-rain field just above the mild-winter line on both sowing rules, weighted', () => {
    expect(formsOf(CROP_BY_ID.maize, punjab(MILD_WINTER_T - 0.1)).alt).toBeUndefined() // below the line: warmth only
    // the weight on the warmth rule: half in the band (the rains side may hold more than one season: water.ts rainsBand)
    const share = (f: ReturnType<typeof formsOf>, of = 1): number => (f.main.sowBy === 'warmth' ? of * (f.alt ? 1 - f.alt.w : 1) : 0) + (f.alt ? share(f.alt.forms, of * f.alt.w) : 0)
    expect(share(formsOf(CROP_BY_ID.maize, punjab(MILD_WINTER_T + 0.5)))).toBeCloseTo(0.5, 2)
    expect(share(formsOf(CROP_BY_ID.maize, punjab(MILD_WINTER_T + 1.1)))).toBe(0) // past the band: the rains only
  })
  it('moves a warm-season crop little across the line and the band edge (it moved its sowing by months)', () => {
    // after a crop scored on both rules too (its reference harvest month is read without the field's normals)
    const s = (c: number) => evaluate(CROP_BY_ID.maize, ['sorghum'], contextFor(punjab(c)), w).score
    expect(Math.abs(s(MILD_WINTER_T - 0.02) - s(MILD_WINTER_T + 0.02))).toBeLessThan(0.5)
    expect(Math.abs(s(MILD_WINTER_T + 0.98) - s(MILD_WINTER_T + 1.02))).toBeLessThan(0.5)
  })
  // a continental spring: chickpea waits for 6 °C on 1 April (its FAO-56 reference day)
  const spring = (at1April: number) => {
    const t = [-6, -4, 1, 9, 15, 19, 21, 20, 15, 8, 2, -3]
    const base = tempOnDay(t.map((x, i) => ({ month: i + 1, t: x })), [4, 1])
    return syntheticClimate({ lat: 49.6, lon: 34.5, t: t.map((x) => x + at1April - base), p: [35, 35, 35, 40, 50, 65, 60, 45, 40, 35, 40, 40], pet: [5, 10, 30, 70, 110, 130, 145, 125, 80, 40, 15, 5] })
  }
  const offset = (c: ReturnType<typeof spring>) => {
    const span = sowingSpan(CROP_BY_ID.chickpea, c.season.hemisphere, c.monthly.recent)
    return span ? span.lo + span.f : calendarShift(CROP_BY_ID.chickpea, c.season.hemisphere, c.monthly.recent)
  }
  it('moves a cool-season sowing gradually across its seed-bed minimum (it moved a whole month)', () => {
    expect(offset(spring(5.95))).toBeCloseTo(0.5, 1)
    expect(offset(spring(6.05))).toBeCloseTo(0.5, 1)
    expect(offset(spring(4.5))).toBe(1) // well below: the next month, as before
    expect(offset(spring(7.5))).toBe(0)
  })
  it('gives a calendar with a sliver of weight that calendar\'s water (the blended season had added a month)', () => {
    const loss = (c: ReturnType<typeof spring>) => cropRisk(CROP_BY_ID.chickpea, c, loam).recent.loss
    expect(Math.abs(loss(spring(4.99)) - loss(spring(5.01)))).toBeLessThan(0.01) // the band's lower edge, 5 °C
  })
})

describe('a dry spell inside the rains moves the sowing gradually (crops.ts rainsSplit, water.ts rainsBand)', () => {
  const w = { soil: 60, water: 15, profit: 45 }
  // a southern-tropics field: rains November to April, December's rain/PET set by the test
  const field = (december: number) => {
    const pet = [120, 115, 110, 95, 85, 75, 80, 100, 120, 135, 135, 125]
    const ratio = [1.2, 1.1, 1.0, 0.8, 0.2, 0.1, 0.05, 0.05, 0.1, 0.3, 0.8, december]
    return syntheticClimate({ lat: -15, lon: 30, t: [24, 24, 23, 22, 20, 18, 18, 20, 23, 25, 25, 24], p: pet.map((x, i) => x * ratio[i]), pet })
  }
  it('scores a crop sown with the rains on both seasons where December sits at half PET', () => {
    expect(formsOf(CROP_BY_ID.maize, field(0.7)).alt).toBeUndefined()
    expect(formsOf(CROP_BY_ID.maize, field(0.3)).alt).toBeUndefined()
    const mid = formsOf(CROP_BY_ID.maize, field(0.5))
    expect(mid.alt?.kind).toBe('rains')
    expect(mid.alt?.w).toBeGreaterThan(0.4)
  })
  it('moves the score little as December crosses the threshold (the season had split, the sowing moving two months)', () => {
    // sampled where the synthetic record's wobble keeps December's mean ratio near each value
    const s = (d: number) => evaluate(CROP_BY_ID.maize, [], contextFor(field(d)), w).score
    expect(Math.abs(s(0.49) - s(0.51))).toBeLessThan(1)
  })
})

describe('a field near two lines is scored on every variant (water.ts formsOf)', () => {
  const w = { soil: 60, water: 15, profit: 45 }
  // a Cordoba-like summer-rain field: July (the coldest month) 0.3 °C above the mild-winter line, rains October to
  // March, December's rain/PET set by the test - at half PET it decides whether the rains start in October or January
  const field = (december: number) => {
    const pet = [150, 120, 100, 70, 50, 35, 40, 60, 90, 120, 140, 155]
    const ratio = [1.0, 1.0, 0.8, 0.4, 0.2, 0.1, 0.1, 0.1, 0.2, 0.7, 0.8, december]
    const t = [24, 23, 21, 17, 14, 11, 10, 12.5, 15, 18, 21, 23].map((x) => x + MILD_WINTER_T + 0.3 - 10)
    return syntheticClimate({ lat: -31.4, lon: -64.2, t, p: pet.map((x, i) => x * ratio[i]), pet })
  }
  const variants = (f: ReturnType<typeof formsOf>, of = 1): { crop: (typeof f)['main']; w: number }[] =>
    f.alt ? [{ crop: f.main, w: of * (1 - f.alt.w) }, ...variants(f.alt.forms, of * f.alt.w)] : [{ crop: f.main, w: of }]
  it('splits the rains-sown side of the sowing band at the split, the weights as the two lines give them', () => {
    const v = variants(formsOf(CROP_BY_ID.maize, field(0.5)))
    expect(v).toHaveLength(3)
    expect(v.reduce((s, x) => s + x.w, 0)).toBeCloseTo(1, 9)
    expect(v[0].crop.sowBy).toBe('warmth')
    expect(v[0].w).toBeCloseTo(0.7, 1) // the band: 0.3 of the way above the line
    const rains = v.filter((x) => x.crop.sowBy === 'rains')
    expect(new Set(rains.map((x) => x.crop.rains?.onset)).size).toBe(2) // the split: both seasons
    expect(rains.reduce((s, x) => s + x.w, 0)).toBeCloseTo(1 - v[0].w, 9)
  })
  it('moves the score little as December crosses half PET inside the band (it kept the band only and stepped)', () => {
    const s = (d: number) => evaluate(CROP_BY_ID.maize, [], contextFor(field(d)), w)
    expect(Math.abs(s(0.49).score - s(0.51).score)).toBeLessThan(0.5)
    // both notes, each with its line's two sides as shares of the whole: the band's warmth / rains, then the two seasons
    const notes = s(0.5).notes.filter((n) => n.text.startsWith('Close to')).map((n) => n.text)
    expect(notes).toHaveLength(2)
    const shares = notes.flatMap((t) => t.match(/scored (\d+) \/ (\d+)/)!.slice(1).map(Number))
    expect(Math.abs(shares[0] + shares[1] - 100)).toBeLessThanOrEqual(1) // warmth / rains: the whole
    expect(Math.abs(shares[2] + shares[3] - shares[1])).toBeLessThanOrEqual(1) // the two seasons: the rains side
  })
})

describe('the rains keep or lose the shape of a monsoon gradually (crops.ts summerRainsShare, water.ts monsoonBand)', () => {
  const w = { soil: 60, water: 15, profit: 45 }
  // a southern summer-rain field past the sowing band (coldest month 12 °C): eight rainy months October to May, June's
  // rain/PET set by the test - wet, it makes nine, past a monsoon's eight
  const field = (june: number) => {
    const pet = [150, 120, 100, 70, 50, 35, 40, 60, 90, 120, 140, 155]
    const ratio = [0.9, 0.9, 0.8, 0.7, 0.65, june, 0.1, 0.1, 0.2, 0.7, 0.8, 0.9]
    return syntheticClimate({ lat: -31.4, lon: -64.2, t: [26, 25, 23, 19, 16, 13, 12, 14.5, 17, 20, 23, 25], p: pet.map((x, i) => x * ratio[i]), pet })
  }
  const share = (c: ReturnType<typeof field>) => summerRainsShare(c.season.hemisphere, c.monthly.recent)
  it('weighs the monsoon by the place of June in the band - all of it dry, none of it wet, half at ½', () => {
    expect(share(field(0.3))).toBe(1)
    expect(share(field(0.7))).toBe(0)
    expect(share(field(0.5))).toBeGreaterThan(0.35)
    expect(share(field(0.5))).toBeLessThan(0.65)
    expect(share(field(0.45))).toBeGreaterThan(share(field(0.55)))
  })
  it('moves the score little across the threshold of June (the sowing rule switched from the rains to warmth at once)', () => {
    // potato, whose two rules give it different seasons here: 41.5 points at once under the old rule (June's mean ratio,
    // through the synthetic record's wobble, crosses ½ between these two)
    const s = (june: number) => evaluate(CROP_BY_ID.potato, [], contextFor(field(june)), w).score
    expect(Math.abs(s(0.5) - s(0.51))).toBeLessThan(5)
  })
})

describe('several months at half PET give every season its chance (crops.ts rainsRuns)', () => {
  const w = { soil: 60, water: 15, profit: 45 }
  // November and December both at the threshold before a sure January to April: the season starts in November,
  // December or January depending on both - one deciding month at a time moved the onset by two months at once
  const field = (december: number) => {
    const pet = [150, 120, 100, 70, 50, 35, 40, 60, 90, 120, 140, 155]
    const ratio = [0.8, 0.8, 0.75, 0.7, 0.2, 0.1, 0.1, 0.1, 0.2, 0.3, 0.54, december]
    return syntheticClimate({ lat: -15, lon: 30, t: [24, 24, 23, 22, 20, 18, 18, 20, 23, 25, 25, 24], p: pet.map((x, i) => x * ratio[i]), pet })
  }
  it('scores the seasons from November, December and January, their chances summing to one', () => {
    const runs = rainsRuns(field(0.5).monthly.recent)!
    expect(new Set(runs.map((r) => r.season.onset))).toEqual(new Set([11, 12, 1]))
    expect(runs.reduce((a, r) => a + r.w, 0)).toBeCloseTo(1, 9)
  })
  it('moves the score little as December crosses ½ with November wet (the onset jumped from November to January)', () => {
    const s = (december: number) => evaluate(CROP_BY_ID.maize, [], contextFor(field(december)), w).score
    expect(Math.abs(s(0.49) - s(0.51))).toBeLessThan(0.5)
  })
  it('moves the score little where January to March all sit at ½ (watermelon leapt 19 points as February crossed)', () => {
    const pet = [150, 120, 100, 70, 50, 35, 40, 60, 90, 120, 140, 155]
    const at = (feb: number) => syntheticClimate({ lat: -15, lon: 30, t: [24, 24, 23, 22, 20, 18, 18, 20, 23, 25, 25, 24], p: pet.map((x, i) => x * [0.48, feb, 0.48, 0.65, 0.3, 0.1, 0.1, 0.1, 0.15, 0.25, 0.3, 0.35][i]), pet })
    const s = Array.from({ length: 17 }, (_, i) => evaluate(CROP_BY_ID.watermelon, [], contextFor(at(0.46 + i * 0.005)), w).score)
    expect(Math.max(...s.slice(1).map((x, i) => Math.abs(x - s[i])))).toBeLessThan(6)
  }, 30_000) // 17 fields, each read on every combination of months at ½ PET: over 5 s while the other files run
  it('moves the score little along the rain what-if of the page', () => {
    // every point re-analysed by warmClimate (rain 0 returns the synthetic climate itself, whose normals the records do
    // not reproduce exactly)
    const c = field(0.5)
    const s = (rain: number) => evaluate(CROP_BY_ID.maize, [], contextFor(warmClimate(c, { dT: 0, rain })), w).score
    for (const r of [-0.045, -0.025, -0.005, 0.015]) expect(Math.abs(s(r) - s(r + 0.01))).toBeLessThan(0.5)
  })
})

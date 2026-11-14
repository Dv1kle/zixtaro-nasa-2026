// Nitrate leaching over winter - where the water and the soil halves of the plan meet.
//
// After harvest, mineral nitrogen left in the soil (residues, unused fertiliser, a legume's credit mineralising
// early) is washed down by winter drainage unless something green takes it up. Three pieces:
//
// · Winter drainage: the root-zone bucket (SoilGrids water in the top metre) run over September-March of each
//   recent season on NASA POWER rain and ET₀; bare soil evaporates at Kc 0.3, a crop or catch crop at 0.6.
// · Mineral N left at harvest: typical post-harvest soil mineral N (0-90 cm) from Central-European surveys -
//   cereals 30-40, maize 60, oilseed rape ~80, grain legumes 60-80, potatoes ~100 kg N/ha - minus what the next
//   crop or a catch crop takes up before winter (rapeseed ~50, cereals 15-25, catch crop ~40 kg N/ha).
// · How much of it passes below the roots: Burns (1974), f = (D / (D + θfc))^h, with D the drainage (cm),
//   θfc the soil's water content at field capacity and h = 90 cm.
// The result reads as kg N/ha per year and as the nitrate concentration of the water leaving the field, next to
// the EU Nitrates Directive limit of 50 mg NO₃⁻/L. It is a risk index for comparing rotations, not a measurement.

import type { ClimateAnalysis } from './climate'
import { baseForm, CROP_BY_ID, tableId, type CropId, type FormOf } from './crops'
import { catchWindow } from './soilcarbon'
import type { SoilProfile } from './soil'
import { EXTRA_N_RESIDUAL } from './cropsExtra'

/** Typical mineral N left in 0-90 cm at harvest, kg N/ha. */
export const N_RESIDUAL: Record<CropId, number> = {
  wheat: 40, barley: 35, rye: 30, triticale: 35, oats: 30, maize: 60, sorghum: 45, millet: 35,
  sunflower: 40, rapeseed: 80, linseed: 35, buckwheat: 35,
  soybean: 50, pea: 80, lupin: 70, faba: 80, lentil: 60, chickpea: 60,
  sugarbeet: 30, potato: 100, clover: 20, cover: 20, fallow: 60, // fallow: mineralised and not taken up - assumed
  rice: 30, cassava: 30, sweetpotato: 40, groundnut: 60, cowpea: 60, drybean: 60, cotton: 50, pearlmillet: 35,
  ...EXTRA_N_RESIDUAL,
}
/** Ploughing out a clover-grass ley releases a flush of nitrogen. */
export const LEY_BREAK_N = 90
/** N taken up before winter by an autumn-sown crop, kg N/ha. */
export const AUTUMN_UPTAKE: Partial<Record<CropId, number>> = { rapeseed: 50, rye: 25, barley: 20, wheat: 15, triticale: 15 }
export const CATCH_UPTAKE = 40
export const BURNS_DEPTH_CM = 90
export const NO3_PER_N = 62 / 14
export const EU_NO3_LIMIT = 50

export type WinterDrainage = { bare: number; covered: number; years: number }

/** Mean drainage below the root zone over the cool half-year (Sep-Mar north, Mar-Sep south) of the recent decade, mm. */
export function winterDrainage(climate: ClimateAnalysis, soil: SoilProfile): WinterDrainage {
  const taw = Math.max(20, soil.paw100)
  const south = climate.season.hemisphere === 'south'
  const months = (y: number): [number, number][] =>
    south ? [3, 4, 5, 6, 7, 8, 9].map((m) => [y, m]) : [[y - 1, 9], [y - 1, 10], [y - 1, 11], [y - 1, 12], [y, 1], [y, 2], [y, 3]]
  const run = (kc: number) => {
    const out: number[] = []
    for (let y = climate.recent.from; y <= climate.recent.to; y++) {
      let storage = 0.4 * taw // late summer: the tank is mostly empty
      let drain = 0
      let ok = true
      for (const [yy, m] of months(y)) {
        const r = climate.byMonth.get(`${yy}-${m}`)
        if (!r) { ok = false; break }
        storage += 0.95 * r.p
        storage -= Math.min(storage, kc * r.pet)
        if (storage > taw) {
          drain += storage - taw
          storage = taw
        }
      }
      if (ok) out.push(drain)
    }
    return out
  }
  const bare = run(0.3)
  const covered = run(0.6)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  return { bare: mean(bare), covered: mean(covered), years: bare.length }
}

/** Volumetric water content at field capacity over the top metre. */
export function fieldCapacity(soil: SoilProfile): number {
  let s = 0
  let w = 0
  for (const l of soil.layers) {
    const cm = Math.max(0, Math.min(l.bottom, 100) - l.top)
    s += l.fc * cm
    w += cm
  }
  return w ? s / w : 0.3
}

/** Burns (1974): share of surface nitrate carried below `h` cm by `drainMm` of drainage. */
export const burnsFraction = (drainMm: number, fc: number, h = BURNS_DEPTH_CM) => (drainMm <= 0 ? 0 : (drainMm / 10 / (drainMm / 10 + fc)) ** h)

export type Leaching = {
  kgN: number // mean N leached per year, kg N/ha
  mgNO3: number // mean nitrate concentration of the drainage water, mg NO₃⁻/L
  drainage: number // mean winter drainage under the plan, mm
  worst: { after: CropId; before: CropId; kgN: number } | null
}

export function leaching(seq: CropId[], drain: WinterDrainage, soil: SoilProfile, catchCrops: boolean, form: FormOf = baseForm): Leaching {
  const fc = fieldCapacity(soil)
  let kg = 0
  let water = 0
  let worst: Leaching['worst'] = null
  seq.forEach((id, i) => {
    const a = form(id)
    const b = form(seq[(i + 1) % seq.length])
    let residual = a.id === 'clover' && b.id !== 'clover' ? LEY_BREAK_N : N_RESIDUAL[tableId(a)]
    let d = drain.bare
    if (b.perennial && b.family !== 'none') { // a bare fallow after the crop takes up nothing
      residual -= CATCH_UPTAKE
      d = drain.covered
    } else if (b.sow >= 7) {
      residual -= AUTUMN_UPTAKE[b.id] ?? 15
      d = (drain.bare + drain.covered) / 2 // the new crop covers the soil only from late autumn
    } else if (catchCrops && catchWindow(a, b)) {
      residual -= CATCH_UPTAKE
      d = drain.covered
    }
    const lost = Math.max(0, residual) * burnsFraction(d, fc)
    kg += lost
    water += d
    if (!worst || lost > worst.kgN) worst = { after: a.id, before: b.id, kgN: lost }
  })
  const n = seq.length || 1
  const kgN = kg / n
  const drainage = water / n
  return { kgN, drainage, mgNO3: drainage > 0 ? ((100 * kgN) / drainage) * NO3_PER_N : 0, worst }
}

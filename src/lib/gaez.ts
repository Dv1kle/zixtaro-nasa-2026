// Soil suitability from FAO/IIASA GAEZ v4 - how much of a crop's yield potential a soil's pH and texture allow.
//
// GAEZ v4 (Fischer et al. 2021) rates each soil characteristic by the share of the attainable yield a crop keeps:
// Table A6-3.1 gives, per crop, the pH at which it falls to 90, 70, 50, 30 and 10 %; Table A6-3.2 rates the USDA
// texture classes for rooting conditions, workability and nutrient retention. Zixtaro uses the high-input columns -
// fertilised, limed, mechanised farming, the setting its reference yields and prices describe - interpolates linearly
// between the published points, and takes the most limiting of pH and texture (Liebig's law of the minimum).
//
// Where crop-specific extension research says otherwise, it wins and the reason is recorded: GAEZ gives sugar beet the
// potato's acid-tolerant row, while British Beet Research Organisation trials put its optimum at pH 7 with ≈ 15 % less
// sugar at pH 6; AHDB gives oilseed rape 6.5-7.0 as ideal on mineral soils. Crops GAEZ does not rate (lupin, faba bean,
// lentil, a green fallow) keep a rule-of-thumb range with the shape of GAEZ's nearest pulse, and say so.

import type { CropId } from './crops'
import { GAEZ_HEAT, GAEZ_PH, GAEZ_TEXTURE, GAEZ_TEXTURES, type GaezTexture } from './gaez-tables'
import type { SoilProfile } from './soil'
import { clamp } from './stats'
import { EXTRA_GAEZ_CROP, EXTRA_HEAT_GROUP } from './cropsExtra'

export const ACID_R = [1, 0.9, 0.7, 0.5, 0.3, 0.1]
export const ALK_R = [1, 0.9, 0.7, 0.5, 0.1]

export type PhCurve = { acid: number[]; alk: number[]; source: 'gaez' | 'gaez+bbro' | 'gaez+ahdb' | 'heuristic'; gaez: string | null; note?: string }

/** Which GAEZ row stands behind each crop (null: GAEZ does not rate it). */
export const GAEZ_CROP: Record<CropId, string | null> = {
  wheat: 'Wheat', barley: 'Barley', rye: 'Rye', triticale: 'Wheat', oats: 'Oat', maize: 'Maize', sorghum: 'Sorghum',
  millet: 'Foxtail Millet', buckwheat: 'Buckwheat', sunflower: 'Sunflower', rapeseed: 'Rape', linseed: 'Flax',
  soybean: 'Soybean', pea: 'Dry Pea', chickpea: 'Chickpea', potato: 'White Potato', sugarbeet: 'Sugar Beet',
  clover: 'Pasture Legume', lupin: null, faba: null, lentil: null, cover: null, fallow: null,
  rice: 'Wetland Rice', cassava: 'Cassava', sweetpotato: 'Sweet Potato', groundnut: 'Groundnut', cowpea: 'Cowpea', drybean: 'Phaseolus Bean',
  cotton: 'Cotton', pearlmillet: 'Pearl Millet',
  ...EXTRA_GAEZ_CROP,
}

const shift = (xs: number[], by: number) => xs.map((x) => Math.round((x + by) * 100) / 100)
/** GAEZ's own spacing of a curve, re-anchored at a new optimum edge. */
const reanchor = (xs: number[], edge: number) => shift(xs, edge - xs[0])

function curveFor(id: CropId): PhCurve {
  const g = GAEZ_CROP[id]
  if (id === 'sugarbeet') {
    const row = GAEZ_PH['Sugar Beet']
    return {
      // BBRO: mild losses below 6.5, ≈ 15 % less sugar at pH 6 than at 7 → the acid side re-anchored at 6.5 with GAEZ's
      // own spacing (90 % at 6.1, 70 % at 5.7); the alkaline side as GAEZ's cereals - beet thrives on calcareous soils
      acid: reanchor(row.acid, 6.5), alk: GAEZ_PH.Wheat.alk, source: 'gaez+bbro', gaez: 'Sugar Beet',
      note: 'GAEZ gives sugar beet the potato’s acid-tolerant row; BBRO trials put its optimum at pH 7 and ≈ 15 % less sugar at pH 6',
    }
  }
  if (id === 'rapeseed') {
    const row = GAEZ_PH.Rape
    return { acid: row.acid, alk: reanchor(row.alk, 7.0), source: 'gaez+ahdb', gaez: 'Rape', note: 'AHDB: 6.5-7.0 ideal on mineral soils; GAEZ already rates it 90 % at 7.0 - the alkaline edge moved to 7.0' }
  }
  if (g) return { ...GAEZ_PH[g], source: 'gaez', gaez: g, note: id === 'triticale' ? 'no GAEZ row: wheat’s' : id === 'millet' ? 'proso millet: GAEZ’s foxtail millet, the temperate millet it rates' : undefined }
  // not rated by GAEZ: our range, with the spacing of GAEZ's dry pea
  const pea = GAEZ_PH['Dry Pea']
  const range: Record<'lupin' | 'faba' | 'lentil' | 'cover' | 'fallow', [number, number]> = { lupin: [5.0, 6.8], faba: [6.0, 8.0], lentil: [6.0, 8.0], cover: [5.5, 7.5], fallow: [3.5, 9.5] }
  const [lo, hi] = range[id as keyof typeof range]
  return { acid: reanchor(pea.acid, lo), alk: reanchor(pea.alk, hi), source: 'heuristic', gaez: null, note: 'not rated by GAEZ: a rule-of-thumb range with the spacing of GAEZ’s dry-pea curve' }
}

const CURVES = new Map<CropId, PhCurve>()
export function phCurve(id: CropId): PhCurve {
  let c = CURVES.get(id)
  if (!c) CURVES.set(id, (c = curveFor(id)))
  return c
}

/** The pH range in which the crop keeps its full yield potential. */
export const phOptimum = (id: CropId): [number, number] => {
  const c = phCurve(id)
  return [c.acid[0], c.alk[0]]
}

/** Piecewise-linear through (threshold, rating) points ordered away from the optimum; flat beyond the last. */
function along(x: number, pts: number[], ratings: number[], up: boolean): number {
  if (up ? x <= pts[0] : x >= pts[0]) return 1
  for (let i = 1; i < pts.length; i++) {
    const past = up ? x <= pts[i] : x >= pts[i]
    if (past) {
      const t = (x - pts[i - 1]) / (pts[i] - pts[i - 1])
      return ratings[i - 1] + t * (ratings[i] - ratings[i - 1])
    }
  }
  return ratings[ratings.length - 1]
}

/** Share of the yield potential the topsoil pH allows (0.1-1). */
export function phRating(id: CropId, ph: number): number {
  const c = phCurve(id)
  return ph < c.acid[0] ? along(ph, c.acid, ACID_R, false) : along(ph, c.alk, ALK_R, true)
}

/** USDA texture class → GAEZ class (GAEZ splits clay at 60 %). */
export function gaezTexture(texture: string, clayPct: number): GaezTexture | null {
  const t = texture.toLowerCase().trim()
  if (t === 'clay') return clayPct >= 60 ? 'clay (heavy)' : 'clay (light)'
  return (GAEZ_TEXTURES as readonly string[]).includes(t) ? (t as GaezTexture) : null
}

export type TextureRating = { rating: number; limit: 'rooting' | 'workability' | 'retention' | null; klass: GaezTexture | null }

/** Share of the yield potential the topsoil texture allows: the lowest of rooting, workability and nutrient retention. */
export function textureRating(id: CropId, soil: SoilProfile): TextureRating {
  const klass = gaezTexture(soil.texture, soil.top.clay)
  if (!klass) return { rating: 1, limit: null, klass }
  const row = GAEZ_TEXTURE[GAEZ_CROP[id] ?? 'Dry Pea']
  const i = GAEZ_TEXTURES.indexOf(klass)
  const parts = { rooting: row.rooting[i], workability: row.workability[i], retention: row.retention[i] }
  const [limit, v] = (Object.entries(parts) as [TextureRating['limit'] & string, number][]).sort((a, b) => a[1] - b[1])[0]
  return { rating: clamp(v / 100), limit: v < 100 ? limit : null, klass }
}

export type SoilSuitability = { rating: number; ph: number; texture: TextureRating; limiting: 'ph' | 'texture' | null }

/** GAEZ soil suitability for a crop on this topsoil: the most limiting of its pH and texture ratings. */
export function soilSuitability(id: CropId, soil: SoilProfile): SoilSuitability {
  // a bare fallow has no yield potential for the soil to limit
  if (id === 'fallow') return { rating: 1, ph: 1, texture: { rating: 1, limit: null, klass: null }, limiting: null }
  const ph = phRating(id, soil.top.ph)
  const texture = textureRating(id, soil)
  const rating = Math.min(ph, texture.rating)
  return { rating, ph, texture, limiting: rating >= 1 ? null : ph <= texture.rating ? 'ph' : 'texture' }
}

// ---------- warmth to ripen: GAEZ heat units ----------

/**
 * GAEZ v4 cultivar groups behind each crop's warmth requirement (Table A4-6.1). Heat units are the sum of daily mean
 * temperature over the cycle; the tropical group is used on tropical fields where GAEZ has one. Proso millet keeps a
 * rule-of-thumb degree-day need; winter crops are not limited. Lupin, faba bean and lentil, which GAEZ does not rate,
 * take the nearest cool-season grain legume it does (dry pea, the same stand-in their pH curve uses): with no need at
 * all they were never limited by warmth, and ranked first to third at 66 °N under a 10 °C July (sanity tests).
 */
export const GAEZ_HEAT_GROUP: Partial<Record<CropId, { temperate: string; tropical?: string }>> = {
  maize: { temperate: 'Maize', tropical: 'Maize tropical' },
  sorghum: { temperate: 'Sorghum', tropical: 'Sorghum tropical' },
  soybean: { temperate: 'Soybean', tropical: 'Soybean tropical' },
  sunflower: { temperate: 'Sunflower' },
  chickpea: { temperate: 'Chickpea' },
  pea: { temperate: 'Dry pea' },
  lupin: { temperate: 'Dry pea' },
  faba: { temperate: 'Dry pea' },
  lentil: { temperate: 'Dry pea' },
  buckwheat: { temperate: 'Buckwheat' },
  potato: { temperate: 'White potato' },
  sugarbeet: { temperate: 'Sugar beet' },
  oats: { temperate: 'Spring oat' },
  // the spring forms of wheat, barley and rapeseed (their winter forms have no FAO-56 calendar and never read this, and
  // the autumn-sown form of a mild winter ripens on its own degree-days): GAEZ's own spring rows; on tropical fields its
  // tropical-highland wheat and barley and its rabi (cool-season) rape. Earlier, spring oat's rows stood in.
  wheat: { temperate: 'Spring wheat', tropical: 'Wheat tropical highland' },
  barley: { temperate: 'Spring barley', tropical: 'Barley tropical highland' },
  rapeseed: { temperate: 'Spring rape', tropical: 'Rabi rape' },
  linseed: { temperate: 'Flax' },
  rice: { temperate: 'Japonica wetland rice', tropical: 'Indica wetland rice' },
  sweetpotato: { temperate: 'Sweet potato' },
  groundnut: { temperate: 'Groundnut' },
  cowpea: { temperate: 'Cowpea' },
  drybean: { temperate: 'Phaseolus bean', tropical: 'Phaseolus bean tropical' },
  cotton: { temperate: 'Cotton', tropical: 'Cotton tropical' },
  pearlmillet: { temperate: 'Pearl millet' },
  ...EXTRA_HEAT_GROUP,
}

export type HeatNeed = { group: string; days: number; low: number; opt: number; optHigh: number; high: number; tmin: number }

/**
 * Every GAEZ cultivar (cycle length) of the crop's groups - both the tropical and the temperate ones wherever GAEZ has
 * two, as GAEZ asks whether some cultivar ripens; `tropics` only puts the tropical group first. The temperate cultivars
 * (lower minimum temperature) are what tropical highlands grow - maize on the Mexican plateau at 2 300 m ripened nothing
 * with the tropical group alone; the tropical ones are what the subtropical monsoon grows - with the upper heat limit
 * read, japonica alone made Bangladesh's rice (24.8 °N) too hot to grow.
 */
export function heatNeeds(id: CropId, tropics: boolean): HeatNeed[] {
  const g = GAEZ_HEAT_GROUP[id]
  if (!g) return []
  const groups = !g.tropical ? [g.temperate] : tropics ? [g.tropical, g.temperate] : [g.temperate, g.tropical]
  const rows = groups.flatMap((group) => (GAEZ_HEAT[group] ?? []).map((r) => ({ group, days: r.days, low: r.hu[0], opt: r.hu[1], optHigh: r.hu[2], high: r.hu[3], tmin: r.tmin })))
  return id === 'soybean' && EARLY_ROW.soybean ? [SOYBEAN_EARLY, ...rows] : rows
}

/** Only a check turns the row off, to score the engine without it on the same inputs (held-out
 *  check U); the page never does. */
export const EARLY_ROW = { soybean: true }

/**
 * Soybean's earliest commercial cultivars, shorter than GAEZ's shortest (105 days, lower limit 1 850, lower optimum
 * 2 100): in Heilongjiang's sixth accumulated-temperature belt the cultivars approved in 2025 ripen about 95 days after
 * emergence on about 1 800 °C of active accumulated temperature above 10 °C (Heilongjiang Department of Agriculture and
 * Rural Affairs 2025: Jiadou 1, Jinyuan 606, Keyan 5), the sum GAEZ's heat units are with soybean's 10 °C minimum; in the
 * Amur oblast Sentyabrinka (87-99 days) is grown where that sum passes 1 600 °C (Fokina et al. 2020). So 1 600 the lower
 * limit and 1 800 the lower optimum; the upper optimum and limit are the 105-day row's per day - no source rates a short
 * cultivar's ceiling, and it is a cultivar for cool seasons. Earlier, the coldest soybean fields (north-east
 * China, the Russian Far East) fit no cultivar fully today and gained +100 % and more from a degree of warming. Held-out
 * check U: on 48 never-seen cold-margin cells it brought soybean's harvest closer to GDHY's and the crop
 * grown most ranked better. Evidence register: soyearly.
 */
const SOYBEAN_EARLY: HeatNeed = { group: 'Soybean, early (Heilongjiang belt 6, Amur)', days: 95, tmin: 10, low: 1600, opt: 1800, optHigh: Math.round((2800 * 95) / 105), high: Math.round((3150 * 95) / 105) }

/**
 * 0-1: GAEZ's heat-unit rating of a cultivar - rising from the lower limit (0) to the lower optimum (1), 1 across the
 * optimum range, falling from the upper optimum to the upper limit (0): a season with more heat units than the cycle
 * takes is too hot for it (development races, grain filling is cut short). Earlier, only the lower half was
 * read, so no crop was ever too warm: rye, lupin and buckwheat kept full warmth in the equatorial lowlands and ranked
 * above the crops farms there grow (accuracy plan, phase 1).
 */
export const heatFit = (hu: number, need: HeatNeed) =>
  Math.min(clamp((hu - need.low) / Math.max(1, need.opt - need.low)), clamp((need.high - hu) / Math.max(1, need.high - need.optHigh)))

/**
 * The warmest season - as its mean daily temperature, °C - that some cultivar of these groups still takes within its
 * upper optimum (`opt`) and its upper limit (`max`): each cultivar's upper heat units spread over its cycle. For forms
 * whose season is not one of GAEZ's fixed cycles (the spring type sown into a mild winter).
 */
export function warmestSeason(needs: HeatNeed[]): { opt: number; max: number } | null {
  if (!needs.length) return null
  return { opt: Math.max(...needs.map((n) => n.optHigh / n.days)), max: Math.max(...needs.map((n) => n.high / n.days)) }
}

/** Days after sowing a cultivar's cycle may wait for the first day warm enough for it to grow (bestCultivar). */
export const CYCLE_WAIT = 60

/**
 * The best GAEZ cultivar for a sowing date, as GAEZ itself asks "can some cultivar of this crop ripen here?": for each
 * cycle length, the heat units against that cultivar's requirement (days below the cultivar's minimum growth
 * temperature add nothing), the cycle starting on the sowing day or - if that fits better - on the first day (at most
 * CYCLE_WAIT after sowing) that reaches the minimum: GAEZ places a crop cycle where in the thermal growing period it
 * fits best. `dailyT` is the mean temperature of each day from sowing. Earlier, the cycle always started on the
 * sowing day: in Denmark the oats and peas sown on 25 March spent their first week below 5 °C, no 90-120-day cultivar
 * ripened in most years, and they were rated far below barley where GAEZ's own suitability map rates them close to it
 * (oats 0.58, peas 0.41-0.59, barley 0.57). Always waiting instead pushed Iowa's spring rapeseed into July heat.
 */
export function bestCultivar(dailyT: number[], needs: HeatNeed[]): { fit: number; need: HeatNeed; hu: number } | null {
  let best: { fit: number; need: HeatNeed; hu: number } | null = null
  for (const need of needs) {
    let warm = 0
    while (warm < CYCLE_WAIT && warm < dailyT.length && dailyT[warm] < need.tmin) warm++
    for (const start of warm > 0 ? [0, warm] : [0]) {
      if (start + need.days > dailyT.length) continue
      let hu = 0
      for (let d = start; d < start + need.days; d++) if (dailyT[d] >= need.tmin) hu += dailyT[d]
      const fit = heatFit(hu, need)
      if (!best || fit > best.fit || (fit === best.fit && need.days < best.need.days)) best = { fit, need, hu }
    }
  }
  return best
}

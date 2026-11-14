// Greenhouses under a shifting climate. Inside the glass the climate is man-made, but what it costs
// is set outside: NASA POWER sunlight (CERES) decides how much free light the crop gets and how much
// the lamps must add, outdoor air temperature decides the boiler bill and the summer overheating, and
// rain on the roof can fill a tank for the drip lines. Everything is computed per m² of floor, month
// by month, for the baseline and the recent decade, from the same POWER series as the fields.
//
// Deliberately simple steady-state physics - a planning estimate, not a climate-computer model:
//  • light: PAR = 48 % of shortwave, 4.57 mol photons per MJ PAR, × cover transmission
//  • heat: hourly loss U·(cover/floor)·ΔT + air leakage, against a sinusoidal day built from
//    POWER mean & range, minus half the solar gain in daylight and the lamps' waste heat; + a share for
//    venting humid air (dehumidification)
//  • CO₂ dosing: more yield while the vents are shut (Mortensen 1987), paid per kg dosed
//  • water: roof runoff 85 % of rain; crop use ≈ 65 % of inside radiation as latent heat + 15 % drain
//  • yield: light-use efficiency ("1 % more light ≈ 1 % more yield"), calibrated to what Dutch glasshouses
//    report to Eurostat and checked against the other countries (scripts/ghvalidate.mjs)
//  • prices: what the crop fetched month by month on the EU market (DG AGRI, 2015-2025, farm-gate), so the
//    calendar chases the scarce months; crops without an open market record need the grower's own price
//  • costs: young plants, substrate and crop care per month in crop, picking and packing per kg harvested,
//    energy, CO₂ - from published budgets (see evidence.ts)
//  • calendar: every planting month × season length is tried; the months between planting and first
//    harvest cost energy but earn nothing, so "is January worth heating?" is answered for the whole run
//  • the recommendation weighs margin, the house's CO₂ and how steady the margin was over the real
//    years of weather, crop prices and energy prices (the grower sets the weights)

import type { ClimateAnalysis } from './climate'
import { chpFor, energyHistory, marketFor, PRICE_YEARS, typicalPrices, yearPrices, type ChpPrices, type PriceCropId } from './ghMarket'
import { daysInMonth, monthlyRa } from './solar'
import { clamp, mean } from './stats'

export type Cover = 'glass' | 'poly' | 'film2' | 'film'

export const COVERS: Record<Cover, { label: string; short: string; tau: number; u: number; ratio: number; ach: number; height: number }> = {
  // tau: whole-structure PAR transmission; u: W m-2 K-1 of cover; ratio: cover area / floor area;
  // ach: air changes per hour (leakage; glass: a Venlo house measured at 0.5 in a 4 m/s wind, GTB-1366); height: mean air height, m
  glass: { label: 'Glass, single pane', short: 'Glass', tau: 0.7, u: 6.2, ratio: 1.3, ach: 0.5, height: 4.5 },
  poly: { label: 'Twin-wall polycarbonate', short: 'Polycarbonate', tau: 0.62, u: 3.4, ratio: 1.3, ach: 0.75, height: 4 },
  film2: { label: 'Double inflated film', short: 'Double film', tau: 0.63, u: 4, ratio: 1.45, ach: 0.5, height: 3.5 },
  film: { label: 'Single-film tunnel', short: 'Film tunnel', tau: 0.72, u: 6.8, ratio: 1.5, ach: 1, height: 3 },
}

export type GhCropId = 'tomato' | 'cherry' | 'cucumber' | 'pepper' | 'eggplant' | 'courgette' | 'lettuce' | 'strawberry' | 'basil'

export type GhCrop = {
  id: GhCropId
  n: number
  symbol: string
  name: string
  latin: string
  color: string
  dayT: number // heating set point by day, °C
  nightT: number // … and by night
  minT: number // below this (mean night inside) an unheated house can't carry the crop
  maxT: number // above this inside by day: heat stress, shade or cool
  dli: number // daily light integral the crop is lit up to, mol m-2 d-1
  lue: number // fresh yield per mol of PAR inside, kg (calibrated on Dutch glasshouse yields, see ghvalidation.json)
  lag: number // months from planting to first harvest
  /** DG AGRI market series this crop sells on; null = no open market record (a specialty crop) */
  market: PriceCropId | null
  /** € per kg for a crop without a market series: a published reference the grower must confirm (see `own` prices) */
  price: number
  /**
   * Direct costs other than energy and harvest labour - young plants or seed, substrate, fertiliser, crop protection,
   * crop care - € per m² for twelve months in crop, charged for each month the crop is in. Heated glass.
   */
  other: number
  /** picking, grading and packing labour, € per kg harvested (heated glass) */
  harvest: number
  /**
   * What the unheated factors (LOW_TECH) scale where it differs from the heated costs: the fruit vegetables' heated costs
   * moved to farm accounts, the plastic-house costs stay where they were fitted on the Andalusian surveys.
   */
  lowBase?: { other: number; harvest: number }
  /** relative uncertainty of the costs (0.3 = ±30 %): wider where the only source is a small US operation */
  otherSpread: number
  /** extra yield from CO₂ dosing while the vents are shut (0.2 = +20 %) */
  co2: number
  /** share of the heated-house light-use an unheated plastic house achieves (calibrated on Spanish yields) */
  low: number
  /**
   * Share of a month's harvest lost when the house runs above `maxT` all month even fully vented (a third of it in a
   * month with hot spells): fruit crops lose fruit set; lettuce bolts and strawberries go soft, so they lose far more.
   */
  hot: number
  blurb: string
}

export const GH_CROPS: GhCrop[] = [
  { id: 'tomato', n: 31, symbol: 'To', name: 'Tomato', latin: 'Solanum lycopersicum', color: '#ff6b6b', dayT: 21, nightT: 17, minT: 10, maxT: 32, dli: 22, lue: 0.0097, lag: 2, market: 'tomato', price: 0.9, other: 16.4, harvest: 0.08, lowBase: { other: 17, harvest: 0.3 }, otherSpread: 0.3, co2: 0.2, low: 0.2362, hot: 0.15, blurb: 'The greenhouse benchmark: light-hungry, heat-tolerant, long season; winter and spring fruit fetch the best prices.' },
  { id: 'cherry', n: 32, symbol: 'Ct', name: 'Cherry tomato', latin: 'Solanum lycopersicum var. cerasiforme', color: '#ff4f6d', dayT: 21, nightT: 17, minT: 10, maxT: 32, dli: 22, lue: 0.0047, lag: 2, market: 'cherry', price: 1.8, other: 20.3, harvest: 0.24, lowBase: { other: 21, harvest: 0.9 }, otherSpread: 0.35, co2: 0.2, low: 0.29, hot: 0.15, blurb: 'Fewer kilos than round tomatoes but twice the price - and three times the picking time per kilo.' },
  { id: 'cucumber', n: 33, symbol: 'Cu', name: 'Cucumber', latin: 'Cucumis sativus', color: '#8fe08a', dayT: 22, nightT: 19, minT: 13, maxT: 33, dli: 20, lue: 0.0108, lag: 1, market: 'cucumber', price: 0.7, other: 19.4, harvest: 0.08, lowBase: { other: 16, harvest: 0.25 }, otherSpread: 0.3, co2: 0.2, low: 0.25, hot: 0.15, blurb: 'Fast and high-yielding, but wants warm nights - expensive to heat in winter.' },
  { id: 'pepper', n: 34, symbol: 'Pp', name: 'Sweet pepper', latin: 'Capsicum annuum', color: '#ffae42', dayT: 22, nightT: 18, minT: 10, maxT: 32, dli: 20, lue: 0.0046, lag: 3, market: 'pepper', price: 1.0, other: 12.4, harvest: 0.11, lowBase: { other: 19, harvest: 0.45 }, otherSpread: 0.3, co2: 0.2, low: 0.56, hot: 0.2, blurb: 'Lower yield, higher price; slow to first harvest and sets poorly in heat.' },
  { id: 'eggplant', n: 35, symbol: 'Au', name: 'Aubergine', latin: 'Solanum melongena', color: '#9b7bff', dayT: 23, nightT: 18, minT: 10, maxT: 33, dli: 20, lue: 0.0055, lag: 2, market: 'eggplant', price: 0.8, other: 16.4, harvest: 0.09, lowBase: { other: 17, harvest: 0.35 }, otherSpread: 0.35, co2: 0.15, low: 0.74, hot: 0.12, blurb: 'A warm-house fruit crop like pepper, with more kilos at a lower price.' },
  { id: 'courgette', n: 36, symbol: 'Zc', name: 'Courgette', latin: 'Cucurbita pepo', color: '#b7d96b', dayT: 21, nightT: 15, minT: 9, maxT: 32, dli: 18, lue: 0.0049, lag: 1, market: 'courgette', price: 0.8, other: 11.6, harvest: 0.08, lowBase: { other: 12, harvest: 0.3 }, otherSpread: 0.35, co2: 0.15, low: 0.37, hot: 0.15, blurb: 'The Mediterranean winter crop: cheap to start, fast to harvest, tolerant of cool nights.' },
  { id: 'lettuce', n: 37, symbol: 'Lt', name: 'Lettuce & leafy greens', latin: 'Lactuca sativa', color: '#c8f07a', dayT: 18, nightT: 12, minT: 4, maxT: 27, dli: 14, lue: 0.008, lag: 1, market: 'lettuce', price: 0.8, other: 5, harvest: 0.6, otherSpread: 0.5, co2: 0.15, low: 0.37, hot: 0.7, blurb: 'Cool-house crop: cheap to heat, bolts in summer heat; most houses grow it only through the winter.' },
  { id: 'strawberry', n: 38, symbol: 'St', name: 'Strawberry', latin: 'Fragaria × ananassa', color: '#ff5d8f', dayT: 20, nightT: 12, minT: 3, maxT: 28, dli: 17, lue: 0.002, lag: 2, market: 'strawberry', price: 3.7, other: 6, harvest: 0.6, otherSpread: 0.3, co2: 0.15, low: 0.43, hot: 0.4, blurb: 'High value, tolerates cold nights; out of season it sells dear - and in the south it has no market in autumn.' },
  { id: 'basil', n: 39, symbol: 'Bs', name: 'Basil & herbs', latin: 'Ocimum basilicum', color: '#5fd6a8', dayT: 24, nightT: 18, minT: 12, maxT: 33, dli: 16, lue: 0.005, lag: 1, market: null, price: 5, other: 0, harvest: 3, otherSpread: 0.5, co2: 0.15, low: 0.37, hot: 0.2, blurb: 'Pot herbs: warm and bright, high value per m² - sold to a buyer you have, not on an open market.' },
]
export const GH_CROP_BY_ID = Object.fromEntries(GH_CROPS.map((c) => [c.id, c])) as Record<GhCropId, GhCrop>
export const isGhCropId = (x: unknown): x is GhCropId => typeof x === 'string' && Object.hasOwn(GH_CROP_BY_ID, x)
export const isCover = (x: unknown): x is Cover => typeof x === 'string' && Object.hasOwn(COVERS, x)

export type GreenhouseSpec = {
  cover: Cover
  floorM2: number
  heated: boolean
  lit: boolean // supplemental LED lighting
  screen: boolean // night energy screen
  /** CO₂ dosing; absent in older links and farms = on in heated houses (as nearly all heated glasshouses do) */
  co2?: boolean
  /** combined heat and power: a gas engine heats the house and makes power (heated houses; absent = off) */
  chp?: boolean
  crop: GhCropId
}
export const co2On = (s: GreenhouseSpec) => s.co2 ?? s.heated

export const DEFAULT_GH: GreenhouseSpec = { cover: 'glass', floorM2: 5000, heated: true, lit: false, screen: true, crop: 'tomato' }

export type Prices = {
  heat: number // € per kWh of fuel heat (gas)
  power: number // € per kWh of electricity
  /** crop prices against the EU market record (1 = as reported; 1.2 = your buyers pay 20 % more) */
  level?: number
  /** the grower's own € per kg for a crop - replaces the market; the only price a specialty crop has */
  own?: Partial<Record<GhCropId, number>>
  /** selling somewhere else (marketProfit.ts): price level against the EU record and what reaching it costs per kg */
  market?: { level: Partial<Record<GhCropId, number>>; perKg: Partial<Record<GhCropId, number>>; label: string }
  /** what a combined heat and power engine buys gas and sells power at (ghMarket.ts chpFor), where it is kept */
  chp?: ChpPrices
}
export const DEFAULT_PRICES: Prices = { heat: 0.05, power: 0.18, level: 1 }
/** Prices with gas and electricity scaled - the CHP's gas and power move with them. */
export const scalePrices = (p: Prices, gas: number, power = 1): Prices => ({
  ...p,
  heat: p.heat * gas,
  power: p.power * power,
  chp: p.chp && { ...p.chp, gas: p.chp.gas * gas, power: p.chp.power.map((x) => x * power) },
})

// Gas is counted on its lower heating value, as the IPCC factor and the Dutch m³ a.e. benchmarks are; Eurostat prices
// it per kWh of the gross (upper) value, so the bill converts.
/** kg CO₂ per kWh of natural gas burnt (lower heating value): IPCC 2006 Vol. 2 Table 2.2, 56 100 kg/TJ. */
export const GAS_CO2 = 56_100 / 277_777.8
/** kg CO₂ per kWh of grid electricity - an EU-mix order of magnitude; national mixes run from ≈ 0.05 to ≈ 0.7. */
export const GRID_CO2 = 0.25
/** Natural gas, kWh per m³ (Dutch reference, lower heating value 31.65 MJ/m³) - to compare with m³/m² benchmarks. */
export const GAS_KWH_PER_M3 = 31.65 / 3.6
/** Gross over lower heating value of the same gas (Dutch reference: 35.17 against 31.65 MJ/m³). */
const GAS_GROSS_PER_NET = 35.17 / 31.65
/**
 * Heat per kWh of gas (lower value) from a condensing boiler: 30.6 m³ of gas per GJ of heat, the Dutch energy monitor's
 * protocol (WEcR Nota 2020-109a) - 103 %, as condensing the flue gas recovers part of the gross value.
 */
export const BOILER_EFFICIENCY = 1000 / (30.6 * 31.65)

const PAR_MOL_PER_MJ_SW = 0.48 * 4.57
const LAMP_PPFD = 180 // µmol m-2 s-1, a typical LED top-light
const LAMP_EFF = 2.8 // µmol per J (modern LED)
const LAMP_MAX_MOL = (LAMP_PPFD * 16 * 3600) / 1e6 // lamps on ≤ 16 h/day
const BOILER_EFF = BOILER_EFFICIENCY
/**
 * Combined heat and power: a glasshouse gas engine turns 43 % of its gas (lower value) into power and 47 % into heat -
 * glasshouse engines of 2-3 MWe run at 42-44 % electrical and 88-92 % total efficiency (Trinomics & BlueTerra 2024, for
 * the Dutch Ministry of Finance). Sized at 0.5 MWe a hectare, upkeep €0.02 per kWh of power: both assumptions.
 */
export const CHP_ELECTRIC = 0.43
export const CHP_HEAT = 0.47
const CHP_KW_EL_PER_M2 = 0.05
const CHP_UPKEEP = 0.02
/**
 * Share of the cover's heat loss a closed night energy screen leaves: with the glasshouse's leakage that is 4.4 W m⁻² K⁻¹
 * of floor, the top of the 3.8-4.4 measured with one closed screen over unlit Dutch tomatoes (WPR-779, 2018).
 */
export const SCREEN = 0.45
const ROOF_RUNOFF = 0.85
const TRANSP_FRACTION = 0.65 // share of inside radiation turned into transpiration
const DRAIN = 1.15
/** heat spent venting humid air, as a share of the heating demand (humidity control in closed, heated houses) */
export const DEHUMID = 0.12
/** CO₂ dosed per m² and month: with the vents mostly shut, and topping up to outside levels when they are open */
const CO2_DOSE = { closed: 2.5, open: 0.5 } // kg
/** € per kg of CO₂ dosed (bought liquid CO₂; flue gas from the boiler can make it cheaper) */
export const CO2_PRICE = 0.12
/** a house counts as closed (vents shut most of the day, dosing pays in full) below this mean outside temperature */
const CLOSED_BELOW = 14

/**
 * Two ways of growing under cover. A heated house is run like a north-west European glasshouse - substrate, climate
 * computer, CO₂, Dutch or Flemish wages - and the crops' light-use and costs above are that house's. An unheated one
 * is run like a Mediterranean plastic house - soil, no climate control, lower wages - which harvests fewer kilos per
 * unit of light at a fraction of the cost. Light-use of heated houses is calibrated on Dutch yields and the unheated
 * factors on Spanish yields and Andalusian cost surveys; every other country is a test (scripts/ghvalidate.mjs).
 */
export const LOW_TECH = { fixed: 0.15, harvest: 0.6 }
export const techOf = (spec: GreenhouseSpec, crop: GhCrop) => (spec.heated ? { yield: 1, fixed: 1, harvest: 1 } : { yield: crop.low, ...LOW_TECH })

/**
 * Multipliers for the uncertainty analysis (ghTrust.ts): heat loss of the cover and leakage, the crop's light-use
 * efficiency, its price and its other direct costs - and optionally a real year's crop prices. All 1 in the normal model.
 */
export type Tweak = { heat: number; lue: number; price: number; other: number; priceYear?: number }
export const NO_TWEAK: Tweak = { heat: 1, lue: 1, price: 1, other: 1 }

export type ShadeNeed = 'none' | 'peaks' | 'month'

/** closed: too cold without heating · idle: could carry the crop but is left empty · establish: planted, not yet harvesting */
export type MonthState = 'closed' | 'idle' | 'establish' | 'harvest'

export type GhMonth = {
  month: number
  tOut: number
  tMinOut: number
  dliOut: number
  dliIn: number
  supp: number // lamp light, mol m-2 d-1
  lampHours: number
  heatKwh: number // useful heat per m² per month, if the crop is in
  lightKwh: number // lamp electricity per m² per month, if the crop is in
  active: boolean // the crop can be carried this month
  state: MonthState // in the best calendar
  insideNight: number // unheated: mean night temperature inside
  insideDayMax: number // mean daily max inside with full ventilation
  shade: ShadeNeed
  price: number | null // € per kg the crop fetches this month (null: no market)
  yieldKg: number // if harvesting this month
  revenue: number
  energyCost: number
  co2Cost: number // CO₂ dosing, if the crop is in
  otherCost: number // young plants, substrate, crop care … if the crop is in this month
  harvestCost: number // picking and packing, if harvesting
  carbonKg: number // CO₂ emitted for heat and light, if the crop is in
  chpSales: number // € of power the CHP sold to the grid (netted in energyCost)
  net: number // what this month adds to the plan: revenue and harvest labour (once harvesting) − energy − CO₂ − other costs
  catchMm: number
  demandMm: number // drip water if the crop is in
}

/** Climate side: the whole year as if every possible month carried the crop. */
export type GhTotals = { heatKwh: number; lightKwh: number; activeMonths: number; shadeMonths: number }

/** One crop run: plant, wait `lag` months, harvest until clearing. Months are 1..12 in order. */
export type GhPlan = {
  months: number[]
  plant: number | null
  firstHarvest: number | null
  clear: number | null
  yieldKg: number
  revenue: number
  energyCost: number
  co2Cost: number
  otherCost: number // other direct costs + harvest labour
  heatKwh: number
  lightKwh: number
  carbonKg: number
  chpSales: number // € of power a CHP sold to the grid over the run (netted in energyCost)
  margin: number // revenue − energy − CO₂ − other direct costs − harvest labour
}

export type Water = {
  catchM3: number // per year, whole house
  demandM3: number
  tankM3: number // recommended tank
  cover: number // share of drip demand met from the roof with that tank
  maxCover: number // with an unlimited tank
  overflowM3: number // rain the tank cannot hold - could go to a field pond
}

/** The plan replayed on one real year: that year's weather, crop prices and energy prices. */
export type GhYear = { year: number; margin: number; revenue: number; energyCost: number; heat: number; power: number; yieldKg: number; chpSales: number }

export type GhPriorities = { profit: number; climate: number; steady: number }
export const DEFAULT_GH_PRIORITIES: GhPriorities = { profit: 60, climate: 20, steady: 20 }

/** 0-1 parts of the recommendation score */
export type GhScore = { score: number; profit: number; climate: number; steady: number }

export type GhResult = {
  spec: GreenhouseSpec
  crop: GhCrop
  months: GhMonth[]
  totals: GhTotals
  baseline: GhTotals
  baselineMonths: GhMonth[]
  /** the best calendar for this crop, house and climate (empty when no run pays) */
  plan: GhPlan
  /** the best run even when it loses money - how far from paying the crop is */
  bestRun: GhPlan | null
  /** heated houses: the best year-round run, to show what leaving the cold months empty saves */
  allYear: GhPlan | null
  water: Water
  /** the typical monthly price the plan was made with (€ per kg; null = no market that month) */
  prices: (number | null)[]
  /** the grower's own price replaced the market */
  ownPrice: boolean
  /** the plan replayed on each real year with weather, crop and energy prices on record */
  years: GhYear[]
  score: GhScore
}

export type Normal = { month: number; t: number; tRange: number; tMaxAbs: number; rs: number; p: number }

const finiteMean = (xs: number[], fallback: number) => {
  const f = xs.filter(Number.isFinite)
  return f.length ? mean(f) : fallback
}

export function normalsFor(climate: ClimateAnalysis, win: { from: number; to: number }): Normal[] {
  const years: number[] = []
  for (let y = win.from; y <= win.to; y++) years.push(y)
  return normalsForYears(climate, years)
}

/** Monthly normals over a list of years; a year listed twice counts twice (the bootstrap resamples years). */
export function normalsForYears(climate: ClimateAnalysis, years: number[]): Normal[] {
  const recs = years.flatMap((y) => Array.from({ length: 12 }, (_, m) => climate.byMonth.get(`${y}-${m + 1}`)).filter((r) => r !== undefined))
  const ra = monthlyRa(climate.lat)
  return Array.from({ length: 12 }, (_, i) => {
    const ms = recs.filter((r) => r.month === i + 1)
    // POWER radiation starts in 1984; without it, estimate from the temperature range (FAO-56 eq. 50).
    const estimated = mean(ms.map((r) => 0.16 * Math.sqrt(Math.max(0, r.tRange)) * ra[i]))
    return {
      month: i + 1,
      t: mean(ms.map((r) => r.t)),
      tRange: mean(ms.map((r) => r.tRange)),
      tMaxAbs: finiteMean(ms.map((r) => r.tMaxAbs), mean(ms.map((r) => r.t + r.tRange / 2)) + 6),
      rs: finiteMean(ms.map((r) => r.rs), estimated),
      p: mean(ms.map((r) => r.p)),
    }
  })
}

/** Hours of daylight at mid-month (FAO-56 eq. 34). */
export function dayLength(lat: number, month: number): number {
  const doy = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][month - 1]
  const delta = 0.409 * Math.sin(((2 * Math.PI) / 365) * doy - 1.39)
  const x = clamp(-Math.tan((lat * Math.PI) / 180) * Math.tan(delta), -1, 1)
  return (24 / Math.PI) * Math.acos(x)
}

/**
 * What the crop fetches each month at this site, € per kg: the grower's own price if set, else the EU market
 * record (the typical 2020-2024 curve, or one real year) × the price level; null where there is no market.
 */
export function cropPrices(crop: GhCrop, lat: number, prices: Prices, year?: number): (number | null)[] {
  const own = prices.own?.[crop.id]
  if (own && own > 0) return Array(12).fill(own)
  if (!crop.market) return Array(12).fill(null)
  const typical = typicalPrices(crop.market, lat)
  // another market: its price level, less freight, duty and spoilage per kg (a month can go below zero: it is skipped)
  const level = (prices.level ?? 1) * (prices.market?.level[crop.id] ?? 1)
  const cut = prices.market?.perKg[crop.id] ?? 0
  const at = (v: number) => v * level - cut
  if (year === undefined) return typical.map((v) => (v === null ? null : at(v)))
  const y = yearPrices(crop.market, lat, year)
  if (!y) return typical.map((v) => (v === null ? null : at(v)))
  // a month the year did not report takes the typical price scaled by how dear that year was elsewhere
  const both = y.map((v, i) => (v !== null && typical[i] !== null ? [v, typical[i]!] : null)).filter((x): x is number[] => x !== null)
  const ratio = both.length ? both.reduce((s, [a]) => s + a, 0) / both.reduce((s, [, b]) => s + b, 0) : 1
  return y.map((v, i) => (v !== null ? at(v) : typical[i] === null ? null : at(typical[i]! * ratio)))
}

/** A crop can be ranked when it has a price: a market record or the grower's own. */
export const hasPrice = (crop: GhCrop, prices: Prices) => !!crop.market || (prices.own?.[crop.id] ?? 0) > 0

function monthModel(n: Normal, lat: number, spec: GreenhouseSpec, crop: GhCrop, prices: Prices, price: number | null, tw: Tweak = NO_TWEAK): GhMonth {
  const cov = COVERS[spec.cover]
  const days = daysInMonth(n.month)
  const rs = n.rs
  const dliOut = rs * PAR_MOL_PER_MJ_SW
  const dliIn = cov.tau * dliOut
  const tMinOut = n.t - n.tRange / 2
  const tMaxOut = n.t + n.tRange / 2

  // Can the crop be carried? Heated houses always; unheated ones only when nights stay above its minimum.
  const buffer = spec.screen ? 3 : 2
  const insideNight = tMinOut + buffer
  const active = spec.heated || insideNight >= crop.minT

  // Lamps top up to the crop's target light, within what the fixtures can deliver.
  const supp = active && spec.lit ? clamp(crop.dli - dliIn, 0, LAMP_MAX_MOL) : 0
  const lampHours = supp / ((LAMP_PPFD * 3600) / 1e6)
  const lightKwhDay = supp / LAMP_EFF / 3.6

  // Heating: hour by hour over a mean day.
  let heatWhDay = 0
  if (active && spec.heated) {
    const N = dayLength(lat, n.month)
    const sunrise = 12 - N / 2
    const rsWhDay = rs * 277.8
    const leak = cov.ach * cov.height * 0.33
    for (let h = 0; h < 24; h++) {
      const hh = h + 0.5
      const tOut = n.t + (n.tRange / 2) * Math.cos((2 * Math.PI * (hh - 15)) / 24)
      const day = hh > sunrise && hh < sunrise + N
      const set = day ? crop.dayT : crop.nightT
      const k = (cov.u * cov.ratio * (spec.screen && !day ? SCREEN : 1) + leak) * tw.heat
      const loss = k * Math.max(0, set - tOut)
      const sun = day ? ((rsWhDay * Math.PI) / (2 * N)) * Math.sin((Math.PI * (hh - sunrise)) / N) : 0
      heatWhDay += Math.max(0, loss - 0.5 * cov.tau * sun)
    }
  }
  // Lamp electricity ends up as heat in the house - it offsets the boiler when heat is needed; venting humid air
  // out of a heated house costs extra heat on top.
  const heatKwhDay = Math.max(0, heatWhDay / 1000 - 0.9 * lightKwhDay) * (spec.heated ? 1 + DEHUMID : 1)

  // Overheating: with full ventilation the house still runs a few degrees above the air outside.
  const rise = 1 + 0.25 * cov.tau * rs
  const insideDayMax = tMaxOut + rise
  const shade: ShadeNeed = !active ? 'none' : insideDayMax > crop.maxT ? 'month' : n.tMaxAbs + rise > crop.maxT ? 'peaks' : 'none'

  // CO₂ dosing pays most while the vents stay shut (a heated house in the cool months).
  const dosing = active && co2On(spec)
  const closed = dosing && spec.heated && n.t < CLOSED_BELOW
  const co2Gain = dosing ? (closed ? crop.co2 : crop.co2 * 0.25) : 0
  const co2Kg = dosing ? (closed ? CO2_DOSE.closed : CO2_DOSE.open) : 0

  // Yield from light, trimmed by cold (unheated) and heat stress, raised by CO₂.
  const light = Math.min(dliIn + supp, crop.dli * 1.3)
  const insideMean = n.t + (spec.heated ? 0 : 0.2 * cov.tau * rs + buffer / 2)
  const warm = spec.heated ? 1 : clamp((insideMean - crop.minT) / (crop.nightT + 4 - crop.minT), 0.2, 1)
  const heatHit = shade === 'month' ? 1 - crop.hot : shade === 'peaks' ? 1 - crop.hot / 3 : 1
  const tech = techOf(spec, crop)
  const yieldKg = active ? crop.lue * tw.lue * tech.yield * light * days * warm * heatHit * (1 + co2Gain) : 0

  const heatKwh = heatKwhDay * days
  const lightKwh = lightKwhDay * days
  const revenue = price === null ? 0 : yieldKg * price * tw.price
  // Combined heat and power, month by month: the engine takes the heat it can make when its gas and upkeep, less the
  // power it makes, cost less than the boiler's gas for that heat. Its power runs the house's lamps first (power not
  // bought) and the rest is sold at the month's day-ahead price.
  let chpHeat = 0
  let chpFuel = 0
  let chpCost = 0
  let chpOwn = 0
  let chpSales = 0
  if (spec.chp && spec.heated && prices.chp && heatKwh > 0) {
    const h = Math.min(heatKwh, CHP_KW_EL_PER_M2 * (CHP_HEAT / CHP_ELECTRIC) * 24 * days)
    const fuel = h / CHP_HEAT
    const el = fuel * CHP_ELECTRIC
    const own = Math.min(el, lightKwh)
    const sales = (el - own) * prices.chp.power[n.month - 1]
    const cost = fuel * GAS_GROSS_PER_NET * prices.chp.gas + el * CHP_UPKEEP - sales - own * prices.power
    if (cost < (h / BOILER_EFF) * GAS_GROSS_PER_NET * prices.heat) [chpHeat, chpFuel, chpCost, chpOwn, chpSales] = [h, fuel, cost, own, sales]
  }
  const energyCost = ((heatKwh - chpHeat) / BOILER_EFF) * GAS_GROSS_PER_NET * prices.heat + chpCost + lightKwh * prices.power
  const co2Cost = co2Kg * CO2_PRICE
  const cost = spec.heated ? crop : (crop.lowBase ?? crop)
  const otherCost = active ? (cost.other / 12) * tech.fixed * tw.other : 0
  const harvestCost = yieldKg * cost.harvest * tech.harvest * tw.other
  // what the house emits: all the gas it burns, the engine's too, and the grid power it buys (power sold is not credited)
  const carbonKg = ((heatKwh - chpHeat) / BOILER_EFF + chpFuel) * GAS_CO2 + (lightKwh - chpOwn) * GRID_CO2

  const insideRad = cov.tau * rs
  const demandMm = active ? ((TRANSP_FRACTION * insideRad) / 2.45) * days * DRAIN : 0
  return {
    month: n.month, tOut: n.t, tMinOut, dliOut, dliIn, supp, lampHours, heatKwh, lightKwh, active, state: active ? 'idle' : 'closed',
    insideNight, insideDayMax, shade, price, yieldKg, revenue, energyCost, co2Cost, otherCost, harvestCost, carbonKg, chpSales, net: 0,
    catchMm: n.p * ROOF_RUNOFF, demandMm,
  }
}

const totalsOf = (ms: GhMonth[]): GhTotals => ({
  heatKwh: ms.reduce((s, m) => s + (m.active ? m.heatKwh : 0), 0),
  lightKwh: ms.reduce((s, m) => s + (m.active ? m.lightKwh : 0), 0),
  activeMonths: ms.filter((m) => m.active).length,
  shadeMonths: ms.filter((m) => m.shade !== 'none').length,
})

const EMPTY_PLAN: GhPlan = {
  months: [], plant: null, firstHarvest: null, clear: null, yieldKg: 0, revenue: 0, energyCost: 0, co2Cost: 0, otherCost: 0, heatKwh: 0, lightKwh: 0, carbonKg: 0, chpSales: 0, margin: 0,
}

/** A run: plant in month `start` (0-based), keep the crop in for `len` months, harvest from month `lag` of the run. */
export function planOf(months: GhMonth[], start: number, len: number, lag: number): GhPlan {
  const idx = Array.from({ length: len }, (_, k) => (start + k) % 12)
  const p = { ...EMPTY_PLAN, months: idx.map((i) => i + 1), plant: start + 1, firstHarvest: ((start + lag) % 12) + 1, clear: idx[len - 1] + 1 }
  idx.forEach((i, k) => {
    const m = months[i]
    const harvesting = k >= lag
    p.yieldKg += harvesting ? m.yieldKg : 0
    p.revenue += harvesting ? m.revenue : 0
    p.energyCost += m.energyCost
    p.co2Cost += m.co2Cost
    p.otherCost += m.otherCost + (harvesting ? m.harvestCost : 0)
    p.heatKwh += m.heatKwh
    p.lightKwh += m.lightKwh
    p.carbonKg += m.carbonKg
    p.chpSales += m.chpSales
  })
  p.margin = p.revenue - p.energyCost - p.co2Cost - p.otherCost
  return p
}

/**
 * Try every planting month and season length the climate allows; keep the run that leaves the most
 * after running costs. `yearRound` forces a 12-month run (a heated house that is never left cold).
 */
export function bestPlan(months: GhMonth[], lag: number, yearRound = false): GhPlan | null {
  let best: GhPlan | null = null
  for (let len = yearRound ? 12 : lag + 1; len <= 12; len++) {
    for (let start = 0; start < 12; start++) {
      let ok = true
      for (let k = 0; k < len; k++) if (!months[(start + k) % 12].active) ok = false
      if (!ok) continue
      const p = planOf(months, start, len, lag)
      if (!best || p.margin > best.margin + 1e-9) best = p
    }
  }
  return best
}

function applyPlan(months: GhMonth[], plan: GhPlan, lag: number): GhMonth[] {
  return months.map((m) => {
    const k = plan.months.indexOf(m.month)
    if (k < 0) return { ...m, state: m.active ? 'idle' : 'closed', net: 0 }
    const harvesting = k >= lag
    return { ...m, state: harvesting ? 'harvest' : 'establish', net: (harvesting ? m.revenue - m.harvestCost : 0) - m.energyCost - m.co2Cost - m.otherCost }
  })
}

/** Rainwater tank: simulate every month of the recent decade and size the tank. */
function waterBalance(climate: ClimateAnalysis, months: GhMonth[], floorM2: number): Water {
  const recs = [...climate.byMonth.values()]
    .filter((r) => r.year >= climate.recent.from && r.year <= climate.recent.to)
    .sort((a, b) => a.year - b.year || a.month - b.month)
  const years = new Set(recs.map((r) => r.year)).size || 1
  const run = (cap: number) => {
    let store = 0
    let used = 0
    let demand = 0
    let overflow = 0
    for (const r of recs) {
      const inflow = (r.p * ROOF_RUNOFF * floorM2) / 1000
      const m = months[r.month - 1]
      const need = m.state === 'establish' || m.state === 'harvest' ? (m.demandMm * floorM2) / 1000 : 0
      const room = cap - store
      overflow += Math.max(0, inflow - room)
      store = Math.min(cap, store + inflow)
      const take = Math.min(need, store)
      store -= take
      used += take
      demand += need
    }
    return { cover: demand > 0 ? used / demand : 1, demand, overflow }
  }
  const catchM3 = recs.reduce((s, r) => s + (r.p * ROOF_RUNOFF * floorM2) / 1000, 0) / years
  const big = run(floorM2 * 1)
  // Smallest tank that gets within 5 percentage points of the unlimited-tank coverage.
  const steps = [0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1]
  let tank = floorM2
  let pick = big
  for (const s of steps) {
    const r = run(s * floorM2)
    if (r.cover >= big.cover - 0.05) {
      tank = s * floorM2
      pick = r
      break
    }
  }
  return {
    catchM3,
    demandM3: big.demand / years,
    tankM3: tank,
    cover: pick.cover,
    maxCover: big.cover,
    overflowM3: pick.overflow / years,
  }
}

const monthsFor = (normals: Normal[], lat: number, spec: GreenhouseSpec, crop: GhCrop, prices: Prices, curve: (number | null)[], tw: Tweak = NO_TWEAK) =>
  normals.map((n, i) => monthModel(n, lat, spec, crop, prices, curve[i], tw))

/** The years a replay can use: in the recent decade, with crop prices on record. */
export function replayYears(climate: ClimateAnalysis): number[] {
  return PRICE_YEARS.filter((y) => y >= climate.recent.from && y <= climate.recent.to && climate.byMonth.has(`${y}-12`))
}

/**
 * The plan replayed on real years: that year's NASA POWER weather, that year's market prices for the crop, and that
 * year's business gas and electricity prices (Eurostat, the site's country or the European median). The calendar
 * stays the one planned on the typical year - this is what following the advice would have earned.
 */
export function replayPlan(climate: ClimateAnalysis, spec: GreenhouseSpec, crop: GhCrop, prices: Prices, plan: GhPlan, country: string | null): GhYear[] {
  if (!plan.plant) return []
  const energy = energyHistory(country)
  const start = plan.plant - 1
  const len = plan.months.length
  return replayYears(climate).flatMap((y) => {
    const e = energy.get(y)
    if (!e) return []
    const p: Prices = { ...prices, heat: e.heat, power: e.power, chp: chpFor(country, y) ?? undefined }
    const months = monthsFor(normalsForYears(climate, [y]), climate.lat, spec, crop, p, cropPrices(crop, climate.lat, prices, y))
    const run = planOf(months, start, len, crop.lag)
    return [{ year: y, margin: run.margin, revenue: run.revenue, energyCost: run.energyCost, heat: e.heat, power: e.power, yieldKg: run.yieldKg, chpSales: run.chpSales }]
  })
}

const MARGIN_SCALE = 25 // € per m² a year: a margin this size earns 63 % of the profit part
const CARBON_SCALE = 120 // kg CO₂ per m² a year: about what a heated glass tomato house emits - scores zero

/** The recommendation score: weighted margin, climate (the house's CO₂) and steadiness over the real years. */
export function scoreOf(plan: GhPlan, years: GhYear[], w: GhPriorities): GhScore {
  const profit = 1 - Math.exp(-Math.max(0, plan.margin) / MARGIN_SCALE)
  const climate = 1 - Math.min(1, plan.carbonKg / CARBON_SCALE)
  const steady = years.length ? years.filter((y) => y.margin > 0).length / years.length : 0.5
  const sum = w.profit + w.climate + w.steady || 1
  const blended = (w.profit * profit + w.climate * climate + w.steady * steady) / sum
  // a run that loses money is no recommendation, whatever its footprint
  return { score: 100 * blended * (plan.margin > 0 ? 1 : 0.2), profit, climate, steady }
}

export type GhOptions = { priorities?: GhPriorities; country?: string | null }

export function greenhouseModel(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices = DEFAULT_PRICES, opts: GhOptions = {}): GhResult {
  const crop = GH_CROP_BY_ID[spec.crop]
  const recentN = normalsFor(climate, climate.recent)
  const baseN = normalsFor(climate, climate.baseline)
  const curve = cropPrices(crop, climate.lat, prices)
  const raw = monthsFor(recentN, climate.lat, spec, crop, prices, curve)
  const baselineMonths = monthsFor(baseN, climate.lat, spec, crop, prices, curve)
  // Leaving the house empty is always an option: a run that loses money is no plan.
  const found = bestPlan(raw, crop.lag)
  const plan = found && found.margin > 0 ? found : EMPTY_PLAN
  const months = applyPlan(raw, plan, crop.lag)
  const years = replayPlan(climate, spec, crop, prices, plan, opts.country ?? null)
  return {
    spec,
    crop,
    months,
    totals: totalsOf(months),
    baseline: totalsOf(baselineMonths),
    baselineMonths,
    plan,
    bestRun: found,
    allYear: spec.heated ? bestPlan(raw, crop.lag, true) : null,
    water: waterBalance(climate, months, spec.floorM2),
    prices: curve,
    ownPrice: (prices.own?.[crop.id] ?? 0) > 0,
    years,
    score: scoreOf(plan, years, opts.priorities ?? DEFAULT_GH_PRIORITIES),
  }
}

/**
 * What the best calendar leaves after running costs, € per m² and year - the ranking quantity alone, without the
 * water balance or the replay, for the thousands of re-runs of the uncertainty analysis. Also returns the planting month.
 */
export function marginFor(normals: Normal[], lat: number, spec: GreenhouseSpec, crop: GhCrop, prices: Prices, tw: Tweak = NO_TWEAK): { margin: number; plant: number | null; carbonKg: number } {
  const curve = cropPrices(crop, lat, prices, tw.priceYear)
  const found = bestPlan(monthsFor(normals, lat, spec, crop, prices, curve, tw), crop.lag)
  return found && found.margin > 0 ? { margin: found.margin, plant: found.plant, carbonKg: found.carbonKg } : { margin: 0, plant: null, carbonKg: 0 }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The longest run of months in crop, wrapping over New Year (southern-hemisphere seasons do). */
export function seasonSpan(months: { active: boolean }[]): string {
  const on = months.map((m) => m.active)
  const count = on.filter(Boolean).length
  if (!count) return 'no month of the year'
  if (count === 12) return 'January to December'
  let best = { start: 0, len: 0 }
  for (let s = 0; s < 12; s++) {
    if (!on[s] || on[(s + 11) % 12]) continue // a run starts after an idle month
    let len = 0
    while (len < 12 && on[(s + len) % 12]) len++
    if (len > best.len) best = { start: s, len }
  }
  return `${MONTH_NAMES[best.start]} to ${MONTH_NAMES[(best.start + best.len - 1) % 12]}`
}

/** Mean afternoon temperature inside: the set point while heated and in crop, else outside + solar gain with full vents. */
export function insideByDay(m: GhMonth, spec: GreenhouseSpec, crop: GhCrop): number {
  const heatedNow = spec.heated && (m.state === 'establish' || m.state === 'harvest')
  return heatedNow ? Math.max(crop.dayT, m.insideDayMax) : m.insideDayMax
}

/** What the best calendar leaves after running costs, € per m² and year. */
export const planMargin = (r: GhResult) => r.plan.margin

/** € per m² and year the plan saves over heating (and lighting) the house all year round. */
export const coldGain = (r: GhResult) => (r.allYear && r.plan.months.length < 12 ? Math.max(0, r.plan.margin - r.allYear.margin) : 0)

/** kg CO₂ per kg harvested (heat and light), or null when nothing is harvested. */
export const carbonPerKg = (p: GhPlan) => (p.yieldKg > 0 ? p.carbonKg / p.yieldKg : null)

export type GhRankOptions = GhOptions & { exclude?: GhCropId[] }

/** Every crop the grower can sell in the same house, best score first (crops without a price are left out). */
export function rankGreenhouseCrops(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices = DEFAULT_PRICES, opts: GhRankOptions = {}): GhResult[] {
  const out = new Set(opts.exclude ?? [])
  return GH_CROPS.filter((c) => !out.has(c.id) && hasPrice(c, prices))
    .map((c) => greenhouseModel(climate, { ...spec, crop: c.id }, prices, opts))
    .sort((a, b) => b.score.score - a.score.score || (b.bestRun?.margin ?? -1e9) - (a.bestRun?.margin ?? -1e9))
}

/** Two crops in one year: a main run and a second crop in the months it leaves. */
export type GhYearPlan = { runs: { crop: GhCrop; plan: GhPlan }[]; margin: number; gain: number }

/**
 * The best pair of crops sharing the year (e.g. lettuce through the winter, tomato from spring): every run of every
 * ranked crop against every run of another that does not overlap it. Returned when it beats the best single crop
 * by at least 3 %.
 */
export function yearPlan(ranking: GhResult[]): GhYearPlan | null {
  const single = ranking.reduce((b, r) => Math.max(b, r.plan.margin), 0)
  type Run = { crop: GhCrop; plan: GhPlan; mask: number }
  const runs: Run[] = []
  for (const r of ranking) {
    for (let len = r.crop.lag + 1; len <= 11; len++) {
      for (let start = 0; start < 12; start++) {
        let ok = true
        let mask = 0
        for (let k = 0; k < len; k++) {
          const i = (start + k) % 12
          if (!r.months[i].active) ok = false
          mask |= 1 << i
        }
        if (!ok) continue
        const plan = planOf(r.months, start, len, r.crop.lag)
        if (plan.margin > 0) runs.push({ crop: r.crop, plan, mask })
      }
    }
  }
  let best: { a: Run; b: Run; margin: number } | null = null
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i]
      const b = runs[j]
      if (a.crop.id === b.crop.id || a.mask & b.mask) continue
      const m = a.plan.margin + b.plan.margin
      if (!best || m > best.margin) best = { a, b, margin: m }
    }
  }
  if (!best || best.margin < single * 1.03 || best.margin - single < 0.5) return null
  const ordered = [best.a, best.b].sort((x, y) => x.plan.plant! - y.plan.plant!)
  return { runs: ordered.map((r) => ({ crop: r.crop, plan: r.plan })), margin: best.margin, gain: best.margin - single }
}

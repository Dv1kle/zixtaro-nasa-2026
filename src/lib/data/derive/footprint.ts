// src/lib/data/derive/footprint.ts
// What a harvest takes and costs: nutrient offtake, carbon footprint, energy return and water footprint per crop,
// with the published tables they rest on. Typical inputs, not the farm's records: every number here is labelled so.
import { CROP_BY_ID, type CropId } from '../../crops'

export type Offtake = { n: number; p2o5: number; k2o: number; approx?: boolean } // kg per t of harvested product

/** AHDB RB209 (2023) Section 4 offtakes where listed (grain at 85 % DM, roots fresh); approximate otherwise (IPNI, FAO). */
export const OFFTAKE: Partial<Record<CropId, Offtake>> = {
  wheat: { n: 20, p2o5: 7.8, k2o: 5.6 }, barley: { n: 17, p2o5: 7.8, k2o: 5.6 }, rye: { n: 16, p2o5: 7.8, k2o: 5.6 },
  oats: { n: 17, p2o5: 7.8, k2o: 5.6 }, triticale: { n: 18, p2o5: 7.8, k2o: 5.6 }, maize: { n: 15, p2o5: 7, k2o: 5 },
  sorghum: { n: 15, p2o5: 7, k2o: 5, approx: true }, millet: { n: 20, p2o5: 8, k2o: 6, approx: true },
  pearlmillet: { n: 20, p2o5: 8, k2o: 6, approx: true }, buckwheat: { n: 17, p2o5: 7, k2o: 6, approx: true },
  rice: { n: 12, p2o5: 5, k2o: 3, approx: true }, sunflower: { n: 28, p2o5: 12, k2o: 10, approx: true },
  rapeseed: { n: 33, p2o5: 14, k2o: 11 }, linseed: { n: 35, p2o5: 14, k2o: 10, approx: true },
  soybean: { n: 63, p2o5: 13, k2o: 23 }, pea: { n: 36, p2o5: 8.3, k2o: 10 }, faba: { n: 45, p2o5: 11, k2o: 12 },
  lupin: { n: 55, p2o5: 10, k2o: 12, approx: true }, lentil: { n: 40, p2o5: 8, k2o: 10, approx: true },
  chickpea: { n: 35, p2o5: 8, k2o: 10, approx: true }, drybean: { n: 35, p2o5: 10, k2o: 14, approx: true },
  cowpea: { n: 38, p2o5: 9, k2o: 13, approx: true }, groundnut: { n: 40, p2o5: 8, k2o: 12, approx: true },
  potato: { n: 3.5, p2o5: 1, k2o: 5.8 }, sugarbeet: { n: 1.8, p2o5: 0.8, k2o: 1.7 },
  cassava: { n: 2.5, p2o5: 0.8, k2o: 4.5, approx: true }, sweetpotato: { n: 3, p2o5: 1, k2o: 5, approx: true },
  cotton: { n: 25, p2o5: 10, k2o: 13, approx: true },
  // the all-crops plan: approximate (IPNI / FAO orders of magnitude; seeds as the nearest older crop, fresh produce per t fresh)
  sesame: { n: 30, p2o5: 13, k2o: 10, approx: true }, safflower: { n: 28, p2o5: 12, k2o: 10, approx: true },
  castor: { n: 30, p2o5: 12, k2o: 10, approx: true }, quinoa: { n: 25, p2o5: 10, k2o: 8, approx: true },
  fonio: { n: 20, p2o5: 8, k2o: 6, approx: true }, pigeonpea: { n: 35, p2o5: 8, k2o: 13, approx: true },
  bambara: { n: 40, p2o5: 8, k2o: 12, approx: true }, yam: { n: 3.5, p2o5: 0.8, k2o: 5, approx: true },
  taro: { n: 3, p2o5: 1, k2o: 5, approx: true }, sugarcane: { n: 1, p2o5: 0.5, k2o: 1.5, approx: true },
  tobacco: { n: 40, p2o5: 10, k2o: 60, approx: true }, jute: { n: 20, p2o5: 10, k2o: 30, approx: true },
  vetch: { n: 30, p2o5: 7, k2o: 25, approx: true }, silagemaize: { n: 12, p2o5: 5, k2o: 12, approx: true },
  grassley: { n: 25, p2o5: 8, k2o: 25, approx: true }, foragesorghum: { n: 15, p2o5: 6, k2o: 15, approx: true },
  tomato: { n: 2.5, p2o5: 0.8, k2o: 4.5, approx: true }, onion: { n: 2.5, p2o5: 1, k2o: 2.5, approx: true },
  cabbage: { n: 3.5, p2o5: 1.2, k2o: 4, approx: true }, chilli: { n: 3, p2o5: 1, k2o: 4.5, approx: true },
  watermelon: { n: 1.5, p2o5: 0.5, k2o: 2.5, approx: true }, okra: { n: 4.5, p2o5: 1.5, k2o: 4.5, approx: true },
}

export function removal(id: CropId, yieldT: number): Offtake | null {
  const o = OFFTAKE[id]
  if (!o) return null
  const r = (x: number) => Math.round(x * yieldT * 10) / 10
  return { n: r(o.n), p2o5: r(o.p2o5), k2o: r(o.k2o) }
}

/** kg of water transpired per kg of dry matter: Briggs & Shantz (1914, Akron) where measured, else approximate. */
export const TRANSPIRATION_RATIO: Partial<Record<CropId, { v: number; approx?: boolean }>> = {
  millet: { v: 310 }, pearlmillet: { v: 300, approx: true }, sorghum: { v: 322 }, maize: { v: 368 }, wheat: { v: 513 },
  barley: { v: 534 }, oats: { v: 597 }, rye: { v: 634 }, triticale: { v: 520, approx: true }, potato: { v: 636 },
  sugarbeet: { v: 397 }, sunflower: { v: 705 }, rapeseed: { v: 700, approx: true }, linseed: { v: 905 },
  buckwheat: { v: 578 }, pea: { v: 788 }, faba: { v: 750, approx: true }, lupin: { v: 750, approx: true },
  lentil: { v: 750, approx: true }, chickpea: { v: 700, approx: true }, soybean: { v: 744 }, drybean: { v: 736 },
  cowpea: { v: 570, approx: true }, groundnut: { v: 600, approx: true }, rice: { v: 680, approx: true },
  cotton: { v: 646 }, cassava: { v: 500, approx: true }, sweetpotato: { v: 500, approx: true }, clover: { v: 797 },
  // the all-crops plan: whole-plant maize and sorghum as measured; C4 crops near millet, C3 crops near their kin (approximate)
  silagemaize: { v: 368 }, foragesorghum: { v: 322 }, sugarcane: { v: 300, approx: true }, fonio: { v: 310, approx: true },
  sesame: { v: 650, approx: true }, safflower: { v: 650, approx: true }, castor: { v: 650, approx: true }, quinoa: { v: 600, approx: true },
  pigeonpea: { v: 650, approx: true }, bambara: { v: 600, approx: true }, vetch: { v: 750, approx: true }, grassley: { v: 900, approx: true },
  yam: { v: 500, approx: true }, taro: { v: 500, approx: true }, tobacco: { v: 600, approx: true }, jute: { v: 600, approx: true },
  tomato: { v: 600, approx: true }, onion: { v: 600, approx: true }, cabbage: { v: 550, approx: true }, chilli: { v: 600, approx: true },
  watermelon: { v: 580, approx: true }, okra: { v: 600, approx: true },
}

/** Typical N fixed per season, kg N/ha (Herridge et al. 2008; Peoples et al. 2009), ±50 %. */
export const N_FIXED: Partial<Record<CropId, number>> = {
  soybean: 140, faba: 150, pea: 100, lupin: 150, lentil: 80, chickpea: 60, drybean: 40, cowpea: 80, groundnut: 100, clover: 200,
}

export type Dependence = 'none' | 'little' | 'modest' | 'great' | 'essential'
/** Klein et al. (2007) dependence of the harvested product on animal pollination. */
export const POLLINATOR: Partial<Record<CropId, Dependence>> = {
  wheat: 'none', barley: 'none', rye: 'none', oats: 'none', triticale: 'none', maize: 'none', sorghum: 'none', millet: 'none',
  pearlmillet: 'none', rice: 'none', potato: 'none', sugarbeet: 'none', cassava: 'none', sweetpotato: 'none', lentil: 'none',
  chickpea: 'none', sunflower: 'modest', rapeseed: 'modest', buckwheat: 'great', faba: 'modest', cotton: 'modest',
  soybean: 'little', linseed: 'little', pea: 'little', lupin: 'little', drybean: 'little', cowpea: 'little', groundnut: 'little',
  // the all-crops plan: Klein et al. (2007) where it lists the crop; leaf, stem, root and forage harvests need no pollinators
  sesame: 'modest', safflower: 'little', castor: 'little', pigeonpea: 'little', tomato: 'little', chilli: 'little', okra: 'modest',
  watermelon: 'essential', quinoa: 'none', fonio: 'none', bambara: 'none', yam: 'none', taro: 'none', sugarcane: 'none',
  tobacco: 'none', jute: 'none', vetch: 'none', silagemaize: 'none', grassley: 'none', foragesorghum: 'none', onion: 'none', cabbage: 'none',
}
export const DEPENDENCE_MID: Record<Dependence, number> = { none: 0, little: 0.05, modest: 0.25, great: 0.65, essential: 0.95 }

/** Share of yield at risk: dependence mid-point x the missing part of 20 % semi-natural habitat around the field. */
export const pollinationRisk = (dep: Dependence, habitatShare: number) => DEPENDENCE_MID[dep] * (1 - Math.min(1, Math.max(0, habitatShare) / 0.2))

// ---- carbon and energy (typical inputs) ----
/** Direct field N2O at IPCC 2019 EF1 1 %, 44/28, GWP 273: the same constant as the plan's nitrogen panel. */
export const N2O_PER_KG_N = 0.01 * (44 / 28) * 273
export const MAKE_PER_KG_N = 3.5 // European ammonium nitrate (PlanSection.tsx)
const CO2_PER_KG = { p2o5: 1.0, k2o: 0.5 } // Brentrup et al. 2016, rounded
const DIESEL_CO2 = 3.2 // kg CO2e per litre incl. upstream (2.68 burning)
const PUMP_KWH_PER_M3 = 0.3
const GRID_CO2 = 0.4 // kg CO2e per kWh, world average order
const ROOTS: CropId[] = ['potato', 'sugarbeet', 'cassava', 'sweetpotato', 'yam', 'taro', 'sugarcane']
const OILS: CropId[] = ['sunflower', 'rapeseed', 'linseed', 'groundnut', 'soybean', 'sesame', 'safflower', 'castor']
/** dry-matter share of fresh produce (USDA FoodData Central, rounded); yields of these crops are fresh weight */
const FRESH_DM: Partial<Record<CropId, number>> = { tomato: 0.06, onion: 0.11, cabbage: 0.08, chilli: 0.1, watermelon: 0.08, okra: 0.1 }
/** forage yields are already tonnes of dry matter */
const FORAGE_DM: CropId[] = ['silagemaize', 'grassley', 'foragesorghum']
const dieselL = (id: CropId) => (ROOTS.includes(id) ? 150 : 90)

export function co2ePerTonne(id: CropId, yieldT: number, irrigationMm: number): number | null {
  const o = OFFTAKE[id]
  if (!o || yieldT <= 0) return null
  const n = CROP_BY_ID[id].nDemand
  const kg =
    n * (N2O_PER_KG_N + MAKE_PER_KG_N) +
    o.p2o5 * yieldT * CO2_PER_KG.p2o5 +
    o.k2o * yieldT * CO2_PER_KG.k2o +
    dieselL(id) * DIESEL_CO2 +
    irrigationMm * 10 * PUMP_KWH_PER_M3 * GRID_CO2
  return kg / yieldT
}

/** Dry matter share and gross energy (MJ per kg DM) of the harvested product. */
function energyOf(id: CropId): { dm: number; ge: number } {
  if (id === 'potato') return { dm: 0.22, ge: 17 }
  if (id === 'sugarbeet') return { dm: 0.23, ge: 17 }
  if (id === 'cassava') return { dm: 0.35, ge: 17 }
  if (id === 'sweetpotato') return { dm: 0.3, ge: 17 }
  if (id === 'cotton') return { dm: 0.9, ge: 20 }
  if (id === 'yam' || id === 'taro' || id === 'sugarcane') return { dm: 0.3, ge: 17 }
  if (FRESH_DM[id]) return { dm: FRESH_DM[id]!, ge: 17 }
  if (FORAGE_DM.includes(id)) return { dm: 1, ge: 18.4 }
  if (id === 'tobacco') return { dm: 0.85, ge: 16 }
  if (id === 'jute') return { dm: 0.9, ge: 17 }
  if (OILS.includes(id)) return { dm: 0.91, ge: id === 'soybean' ? 23 : 25 }
  return { dm: 0.86, ge: 18.5 }
}

const MJ = { n: 45, p2o5: 15, k2o: 10, dieselL: 44, other: 3000, otherRoots: 5000, kWhPrimary: 3.6 * 2.5 }

/** Gross energy harvested over energy put in (Hülsbergen et al. 2001 style inventory, typical inputs). */
export function eroi(id: CropId, yieldT: number, irrigationMm: number): number | null {
  const o = OFFTAKE[id]
  if (!o || yieldT <= 0) return null
  const e = energyOf(id)
  const out = yieldT * 1000 * e.dm * e.ge
  const input =
    CROP_BY_ID[id].nDemand * MJ.n +
    o.p2o5 * yieldT * MJ.p2o5 +
    o.k2o * yieldT * MJ.k2o +
    dieselL(id) * MJ.dieselL +
    (ROOTS.includes(id) ? MJ.otherRoots : MJ.other) +
    irrigationMm * 10 * PUMP_KWH_PER_M3 * MJ.kWhPrimary
  return out / input
}

/** m³ of water per tonne and the irrigation (blue) share of it (Mekonnen & Hoekstra 2011 method). */
export function waterFootprint(yieldT: number, etMm: number, irrigationMm: number): { total: number; blueShare: number } | null {
  if (yieldT <= 0 || etMm <= 0) return null
  return { total: (10 * etMm) / yieldT, blueShare: Math.min(1, Math.max(0, irrigationMm / etMm)) }
}

/** Weeks from sowing until the canopy closes: FAO-56 initial stage plus half the development stage. */
export function weedWindowWeeks(id: CropId): number | null {
  const days = CROP_BY_ID[id].fao?.days
  return days ? (days[0] + days[1] / 2) / 7 : null
}

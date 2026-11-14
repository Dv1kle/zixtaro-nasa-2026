// Crop characteristics. Sources: FAO-56 (Allen et al. 1998: Kc curves from Tables 11-12, rooting depth from
// Table 22 - its upper values, "for modelling soil water stress or for rainfed conditions" - and depletion
// fraction p), FAO-33 (yield response factor Ky - values marked `kyAssumed` are not tabulated there),
// and common Central-European rotation guidance for break intervals and disease links.
// Calendars are for the temperate Northern Hemisphere and are shifted six months for the south.

import { monthlyKc, type Fao56Stages } from './fao56.ts'
import { EXTRA_MIN_SOW_T, EXTRA_SPECS, type ExtraId } from './cropsExtra'

export type CropId =
  | 'wheat' | 'barley' | 'rye' | 'maize' | 'sorghum' | 'sunflower' | 'rapeseed'
  | 'soybean' | 'pea' | 'lupin' | 'sugarbeet' | 'potato' | 'clover' | 'cover'
  | 'oats' | 'triticale' | 'faba' | 'lentil' | 'chickpea' | 'buckwheat' | 'millet' | 'linseed'
  | 'rice' | 'cassava' | 'sweetpotato' | 'groundnut' | 'cowpea' | 'drybean' | 'cotton' | 'pearlmillet'
  | 'fallow'
  | ExtraId // the all-crops plan: cropsExtra.ts, generated from docs/audit/new-crops.json + FAOSTAT

export type Family = 'poaceae' | 'brassicaceae' | 'asteraceae' | 'fabaceae' | 'amaranthaceae' | 'solanaceae' | 'polygonaceae' | 'linaceae' | 'euphorbiaceae' | 'convolvulaceae' | 'malvaceae' | 'mixed'
  | 'pedaliaceae' | 'dioscoreaceae' | 'araceae' | 'cucurbitaceae' | 'amaryllidaceae'
  | 'none' // a bare fallow: no plant at all
export type Group = 'small-grain' | 'rice' | 'c4-cereal' | 'pseudo-cereal' | 'oilseed' | 'legume' | 'root' | 'fibre' | 'forage' | 'cover' | 'sugar' | 'vegetable'
export type Disease = 'sclerotinia' | 'beet-cyst' | 'clubroot' | 'take-all' | 'pea-rots' | 'potato-cyst' | 'rootworm'

export type Crop = {
  id: CropId
  n: number // element number on the "periodic table of crops"
  symbol: string
  name: string
  latin: string
  family: Family
  group: Group
  /** monthly crop coefficient, Jan..Dec (Northern Hemisphere); 0 = not in the field */
  kc: number[]
  sow: number // sowing month (Northern Hemisphere)
  perennial?: boolean // occupies the field all year
  rootDepth: number // effective rooting depth, m
  p: number // fraction of available water usable before stress (FAO-56)
  ky: number // yield response to water deficit (FAO-33)
  kyAssumed?: boolean
  gddNeed: number // growing-degree-days (base 10 °C, monthly means) the crop needs; 0 = never limiting
  heat: { month: number; tMax: number } | null // most heat-sensitive month (NH) and mean daily Tmax limit, °C
  nFix: number // nitrogen left for the next crop, kg N/ha
  nDemand: number // typical fertiliser N demand, kg N/ha
  carbon: number // 0..1 residue & root carbon returned to soil
  coverGap: number // 0..1 how long the soil lies bare (erosion exposure)
  minBreak: number // seasons that must pass before the same crop returns
  maxRun: number // max consecutive seasons of this crop
  diseases: Disease[]
  /**
   * Reference economics. `yield`: attainable yield without water stress, t/ha (dry matter for forage) - calibrated
   * for maize, wheat, soybean, sunflower and sorghum so the model reproduces reported harvests at the rainfed demo
   * sites, other crops by typical ratios to them. `price` €/t and `cost` (variable
   * costs at full yield, €/ha): rounded EU/US values for 2019-2023. A yardstick for comparing crops, not a forecast.
   */
  econ: { yield: number; price: number; cost: number }
  /** FAO-56 stage lengths and Kc - when given, `kc` and `sow` are derived from it */
  fao?: Fao56Stages
  /** winter crops: mean daily minimum of the coldest month (°C) below which winter kill becomes likely */
  hardiness?: number
  /**
   * autumn-sown crops: growing degree-days (base 0 °C, from sowing) to ripen. Where the spring is warmer than in
   * Central Europe the harvest comes earlier, so the season is cut at the month this sum is reached.
   */
  ripenGdd0?: number
  /** in-season rain (mm) above which foliar disease (Ascochyta, Sclerotinia, grey mould…) cuts yield */
  wetLimit?: number
  /** needs a processor contract, storage or livestock - off unless the farmer switches it on */
  contract?: boolean
  /** what a contract crop needs, where it is not a processor and storage (the page's note) */
  contractWhy?: string
  /** winter crops: the spring-sown form, grown where the winters kill the winter form (see springOf) */
  spring?: SpringForm
  /**
   * the forage crop this crop becomes where it is grown for silage (maize -> silage maize, see silageOf): its calendar,
   * economics and GAEZ heat-unit rows
   */
  silage?: CropId
  /** 'spring' on the spring form of a winter crop; 'mild' on its spring-type form sown in a mild winter (mildWinterOf);
   *  'silage' on a crop grown for silage where its grain does not ripen (silageOf) */
  form?: 'spring' | 'mild' | 'silage'
  /** the calendar is final as given (sowing-date experiments): no waiting for warmth or rains; the south still adds six months */
  fixedSow?: boolean
  /** the sowing rule this crop is scored on outside the tropics - warmth or the rains - where a field sits in the band
   *  above the mild-winter line (water.ts formsOf); absent: the field's own rule (monsoonal) */
  sowBy?: 'warmth' | 'rains'
  /** the rainy season this crop's rains calendar is scored on, where a month inside the field's season sits at the
   *  rule's threshold and decides where the season starts (water.ts rainsBand); absent: the field's own (rainySeason) */
  rains?: RainySeason
  color: string
  blurb: string
}

/**
 * The spring-sown form of a winter cereal or oilseed: an FAO-56 calendar (Table 11 stage lengths for spring small grains,
 * a 120-day northern cultivar), FAO-33 Ky where it is tabulated, and reference economics below the winter form's -
 * a shorter season yields less. Heat need: GAEZ's spring-oat requirement stands in (see gaez.ts).
 */
export type SpringForm = Pick<Crop, 'name' | 'rootDepth' | 'p' | 'ky' | 'kyAssumed' | 'heat' | 'nDemand' | 'carbon' | 'coverGap' | 'econ' | 'blurb'> & { fao: Fao56Stages }

export const FAMILY_LABEL: Record<Family, string> = {
  poaceae: 'Grasses (cereals)',
  brassicaceae: 'Mustard family', // was 'Cabbage family' until cabbage became a crop (its name would turn into a dictionary placeholder)
  asteraceae: 'Daisy family',
  fabaceae: 'Legumes',
  amaranthaceae: 'Beet family',
  solanaceae: 'Nightshades',
  polygonaceae: 'Buckwheat family',
  linaceae: 'Flax family',
  euphorbiaceae: 'Spurge family',
  convolvulaceae: 'Morning-glory family',
  malvaceae: 'Mallow family',
  mixed: 'Mixed species',
  // no crop names in family labels: the dictionary would turn them into placeholders (lib/dictionary.ts)
  pedaliaceae: 'Pedalium family',
  dioscoreaceae: 'Dioscorea family',
  araceae: 'Arum family',
  cucurbitaceae: 'Gourd family',
  amaryllidaceae: 'Amaryllis family',
  none: 'No crop',
}

export const FAMILY_COLOR: Record<Family, string> = {
  poaceae: '#e9b44c',
  brassicaceae: '#d6e05a',
  asteraceae: '#ff9f5a',
  fabaceae: '#6fd08c',
  amaranthaceae: '#f0708f',
  solanaceae: '#b79cf0',
  polygonaceae: '#e79bd0',
  linaceae: '#7fa8ff',
  euphorbiaceae: '#c9a27a',
  convolvulaceae: '#e0876a',
  malvaceae: '#f2e6c9',
  mixed: '#4fc7b8',
  pedaliaceae: '#d9b98a',
  dioscoreaceae: '#b5835a',
  araceae: '#7fc4a0',
  cucurbitaceae: '#9fd36a',
  amaryllidaceae: '#e6c3e8',
  none: '#8f949c',
}

/**
 * Soil-borne diseases and pests that bridge crops, with the break (seasons between hosts) that guidance asks for
 * where the disease is present: clubroot at least 4 (AHDB), peas, beans and lupins no more than one crop in five
 * (PGRO), potato cyst nematode at least 6 years between potatoes to fall below the damage threshold (BSPP), one
 * season out of wheat or barley against take-all (AHDB), rotation against western corn rootworm (EU Rec. 2014/63).
 */
export const DISEASE_INFO: Record<Disease, { name: string; gap: number; hosts: string }> = {
  sclerotinia: { name: 'white mould (Sclerotinia)', gap: 3, hosts: 'rapeseed, sunflower, soybean, pea, lupin, faba bean' },
  'beet-cyst': { name: 'beet cyst nematode', gap: 3, hosts: 'sugar beet and rapeseed' },
  clubroot: { name: 'clubroot', gap: 4, hosts: 'brassicas' },
  'take-all': { name: 'take-all root rot', gap: 1, hosts: 'wheat, barley and triticale' },
  'pea-rots': { name: 'legume foot & root rots', gap: 4, hosts: 'peas, beans, lupins, lentils and chickpeas' },
  'potato-cyst': { name: 'potato cyst nematode', gap: 5, hosts: 'potato' },
  rootworm: { name: 'western corn rootworm', gap: 1, hosts: 'maize' },
}

type CropSpec = Omit<Crop, 'color' | 'kc' | 'sow'> & { kc?: number[]; sow?: number }
const C = (c: CropSpec): Crop => ({
  ...c,
  kc: c.fao ? monthlyKc(c.fao) : c.kc!,
  sow: c.fao ? c.fao.sow[0] : c.sow!,
  color: FAMILY_COLOR[c.family],
})

export const CROPS: Crop[] = [
  C({
    id: 'wheat', n: 1, symbol: 'Wh', name: 'Winter wheat', latin: 'Triticum aestivum', family: 'poaceae', group: 'small-grain',
    kc: [0.4, 0.4, 0.55, 0.85, 1.15, 1.15, 0.55, 0, 0, 0.4, 0.4, 0.4], sow: 10,
    rootDepth: 1.8, p: 0.55, ky: 1.05, gddNeed: 0, heat: { month: 6, tMax: 27 },
    nFix: 0, nDemand: 190, carbon: 0.6, coverGap: 0.15,
    minBreak: 0, maxRun: 2, diseases: ['take-all'], econ: { yield: 7.5, price: 210, cost: 750 }, hardiness: -12, ripenGdd0: 2100,
    blurb: 'The workhorse cash cereal. Loves loam; June heat at flowering hurts.',
    spring: {
      name: 'Spring wheat', fao: { sow: [3, 25], days: [15, 25, 50, 30], kc: [0.3, 1.15, 0.3] },
      rootDepth: 1.5, p: 0.55, ky: 1.15, heat: { month: 6, tMax: 27 }, nDemand: 150, carbon: 0.55, coverGap: 0.45,
      econ: { yield: 6.0, price: 210, cost: 650 },
      blurb: 'Sown in spring where the winters kill winter wheat - the Canadian prairies, the Kazakh steppe, Siberia.',
    },
  }),
  C({
    id: 'barley', n: 2, symbol: 'Ba', name: 'Winter barley', latin: 'Hordeum vulgare', family: 'poaceae', group: 'small-grain',
    kc: [0.4, 0.4, 0.6, 0.95, 1.15, 1.0, 0.3, 0, 0.3, 0.4, 0.4, 0.4], sow: 9,
    rootDepth: 1.5, p: 0.55, ky: 1.0, kyAssumed: true, gddNeed: 0, heat: { month: 5, tMax: 25 },
    nFix: 0, nDemand: 150, carbon: 0.55, coverGap: 0.15,
    minBreak: 0, maxRun: 2, diseases: ['take-all'], econ: { yield: 6.8, price: 190, cost: 680 }, hardiness: -7, ripenGdd0: 1850,
    blurb: 'Harvested in early July - it escapes most of the summer drought.',
    spring: {
      name: 'Spring barley', fao: { sow: [3, 25], days: [15, 25, 50, 30], kc: [0.3, 1.15, 0.25] },
      rootDepth: 1.3, p: 0.55, ky: 1.0, kyAssumed: true, heat: { month: 6, tMax: 26 }, nDemand: 110, carbon: 0.5, coverGap: 0.45,
      econ: { yield: 5.5, price: 190, cost: 580 },
      blurb: 'The short-season cereal of cold and dry places: 100-120 days from sowing to harvest.',
    },
  }),
  C({
    id: 'rye', n: 3, symbol: 'Ry', name: 'Winter rye', latin: 'Secale cereale', family: 'poaceae', group: 'small-grain',
    kc: [0.4, 0.4, 0.55, 0.85, 1.1, 1.0, 0.35, 0, 0, 0.4, 0.4, 0.4], sow: 10,
    rootDepth: 1.8, p: 0.55, ky: 0.95, kyAssumed: true, gddNeed: 0, heat: { month: 6, tMax: 28 },
    nFix: 0, nDemand: 120, carbon: 0.65, coverGap: 0.1,
    minBreak: 0, maxRun: 2, diseases: [], econ: { yield: 6.0, price: 175, cost: 560 }, hardiness: -18, ripenGdd0: 1950,
    blurb: 'The sandy-soil specialist: deep roots, frugal with water and nitrogen.',
  }),
  C({
    id: 'maize', n: 4, symbol: 'Mz', name: 'Maize', latin: 'Zea mays', family: 'poaceae', group: 'c4-cereal',
    fao: { sow: [5, 1], days: [30, 40, 50, 30], kc: [0.3, 1.2, 0.35] },
    rootDepth: 1.7, p: 0.55, ky: 1.25, gddNeed: 850, heat: { month: 7, tMax: 31 },
    nFix: 0, nDemand: 180, carbon: 0.75, coverGap: 0.6,
    minBreak: 0, maxRun: 2, diseases: ['rootworm'], econ: { yield: 12.5, price: 195, cost: 1000 }, silage: 'silagemaize',
    blurb: 'Huge biomass, huge thirst - July and August decide the harvest.',
  }),
  C({
    id: 'sorghum', n: 5, symbol: 'So', name: 'Sorghum', latin: 'Sorghum bicolor', family: 'poaceae', group: 'c4-cereal',
    fao: { sow: [5, 10], days: [20, 35, 40, 30], kc: [0.3, 1.0, 0.55] },
    rootDepth: 2.0, p: 0.55, ky: 0.9, gddNeed: 1000, heat: { month: 8, tMax: 35 },
    nFix: 0, nDemand: 130, carbon: 0.8, coverGap: 0.6,
    minBreak: 0, maxRun: 2, diseases: [], econ: { yield: 6.5, price: 180, cost: 560 },
    blurb: 'Maize’s drought-hardy cousin. Warming is making it viable further north.',
  }),
  C({
    id: 'sunflower', n: 6, symbol: 'Sf', name: 'Sunflower', latin: 'Helianthus annuus', family: 'asteraceae', group: 'oilseed',
    fao: { sow: [4, 15], days: [25, 35, 45, 25], kc: [0.35, 1.0, 0.35] },
    rootDepth: 1.5, p: 0.45, ky: 0.95, gddNeed: 750, heat: { month: 7, tMax: 32 },
    nFix: 0, nDemand: 80, carbon: 0.5, coverGap: 0.6,
    minBreak: 4, maxRun: 1, diseases: ['sclerotinia'], econ: { yield: 3.4, price: 440, cost: 520 }, wetLimit: 450,
    blurb: 'Its taproot mines subsoil water. Needs long breaks against white mould.',
  }),
  C({
    id: 'rapeseed', n: 7, symbol: 'Rp', name: 'Winter rapeseed', latin: 'Brassica napus', family: 'brassicaceae', group: 'oilseed',
    kc: [0.4, 0.4, 0.7, 1.05, 1.15, 1.0, 0.35, 0.3, 0.6, 0.7, 0.5, 0.4], sow: 8,
    rootDepth: 1.5, p: 0.6, ky: 1.0, kyAssumed: true, gddNeed: 0, heat: { month: 5, tMax: 24 },
    nFix: 0, nDemand: 180, carbon: 0.55, coverGap: 0.1,
    minBreak: 3, maxRun: 1, diseases: ['sclerotinia', 'beet-cyst', 'clubroot'], econ: { yield: 3.8, price: 460, cost: 780 }, hardiness: -9, ripenGdd0: 1950,
    blurb: 'Classic break crop and bee pasture - but it is sown in August and needs rain then.',
    spring: {
      name: 'Spring rapeseed', fao: { sow: [4, 10], days: [20, 30, 35, 25], kc: [0.35, 1.05, 0.35] },
      rootDepth: 1.2, p: 0.6, ky: 1.0, kyAssumed: true, heat: { month: 7, tMax: 27 }, nDemand: 140, carbon: 0.5, coverGap: 0.45,
      econ: { yield: 2.8, price: 460, cost: 600 },
      blurb: 'Canola: sown in spring on the Canadian prairies and in Siberia; heat at flowering costs pods.',
    },
  }),
  C({
    id: 'soybean', n: 8, symbol: 'Sb', name: 'Soybean', latin: 'Glycine max', family: 'fabaceae', group: 'legume',
    fao: { sow: [5, 15], days: [20, 30, 60, 25], kc: [0.5, 1.15, 0.5] },
    rootDepth: 1.3, p: 0.5, ky: 0.85, gddNeed: 800, heat: { month: 8, tMax: 31 },
    nFix: 25, nDemand: 0, carbon: 0.35, coverGap: 0.5,
    minBreak: 1, maxRun: 1, diseases: ['sclerotinia'], econ: { yield: 4.0, price: 420, cost: 520 },
    blurb: 'Makes its own nitrogen; wants warmth and rain in August.',
  }),
  C({
    id: 'pea', n: 9, symbol: 'Pe', name: 'Field pea', latin: 'Pisum sativum', family: 'fabaceae', group: 'legume',
    fao: { sow: [3, 25], days: [20, 30, 35, 15], kc: [0.5, 1.15, 0.3] },
    rootDepth: 1.0, p: 0.4, ky: 1.15, gddNeed: 0, heat: { month: 6, tMax: 26 },
    nFix: 35, nDemand: 0, carbon: 0.3, coverGap: 0.45,
    minBreak: 5, maxRun: 1, diseases: ['sclerotinia', 'pea-rots'], econ: { yield: 3.8, price: 280, cost: 480 }, wetLimit: 350,
    blurb: 'Spring legume, off the field by July - escapes drought, leaves ~35 kg N.',
  }),
  C({
    id: 'lupin', n: 10, symbol: 'Lu', name: 'Blue lupin', latin: 'Lupinus angustifolius', family: 'fabaceae', group: 'legume',
    fao: { sow: [3, 25], days: [20, 35, 40, 20], kc: [0.4, 1.1, 0.3] },
    rootDepth: 1.2, p: 0.45, ky: 1.0, kyAssumed: true, gddNeed: 0, heat: { month: 6, tMax: 26 },
    nFix: 45, nDemand: 0, carbon: 0.4, coverGap: 0.45,
    minBreak: 4, maxRun: 1, diseases: ['sclerotinia', 'pea-rots'], econ: { yield: 3.0, price: 300, cost: 420 }, wetLimit: 400,
    blurb: 'The legume for acid, sandy soils: taproot plus ~45 kg N for the next crop.',
  }),
  C({
    id: 'sugarbeet', n: 11, symbol: 'Be', name: 'Sugar beet', latin: 'Beta vulgaris', family: 'amaranthaceae', group: 'root',
    fao: { sow: [4, 1], days: [45, 60, 70, 20], kc: [0.35, 1.2, 0.7] },
    rootDepth: 1.2, p: 0.55, ky: 1.0, gddNeed: 0, heat: { month: 8, tMax: 30 },
    nFix: 0, nDemand: 140, carbon: 0.2, coverGap: 0.8,
    minBreak: 3, maxRun: 1, diseases: ['beet-cyst'], econ: { yield: 85, price: 40, cost: 1900 }, contract: true,
    blurb: 'Top margin, top water use; heavy harvest traffic and long bare soil.',
  }),
  C({
    id: 'potato', n: 12, symbol: 'Po', name: 'Potato', latin: 'Solanum tuberosum', family: 'solanaceae', group: 'root',
    fao: { sow: [4, 20], days: [30, 35, 50, 30], kc: [0.5, 1.15, 0.75] },
    rootDepth: 0.6, p: 0.35, ky: 1.1, gddNeed: 0, heat: { month: 7, tMax: 27 },
    nFix: 0, nDemand: 150, carbon: 0.15, coverGap: 0.9,
    minBreak: 3, maxRun: 1, diseases: ['potato-cyst'], econ: { yield: 50, price: 170, cost: 4600 }, contract: true,
    blurb: 'High value, shallow roots - the thirstiest crop per centimetre of root.',
  }),
  C({
    id: 'clover', n: 13, symbol: 'Cl', name: 'Clover-grass ley', latin: 'Trifolium + Lolium', family: 'fabaceae', group: 'forage',
    kc: [0.4, 0.4, 0.5, 0.8, 0.95, 0.95, 0.95, 0.95, 0.9, 0.7, 0.5, 0.4], sow: 1, perennial: true,
    rootDepth: 1.5, p: 0.55, ky: 1.1, gddNeed: 0, heat: { month: 7, tMax: 30 },
    nFix: 80, nDemand: 0, carbon: 1, coverGap: 0,
    minBreak: 4, maxRun: 3, diseases: [], econ: { yield: 10, price: 150, cost: 500 }, hardiness: -20, contract: true,
    blurb: 'The soil rebuilder: year-round cover, carbon and ~80 kg N - plus fodder.',
  }),
  C({
    id: 'cover', n: 14, symbol: 'Cv', name: 'Green fallow', latin: 'multi-species cover', family: 'mixed', group: 'cover',
    kc: [0.35, 0.35, 0.45, 0.65, 0.85, 0.9, 0.85, 0.75, 0.6, 0.5, 0.4, 0.35], sow: 1, perennial: true,
    rootDepth: 0.8, p: 0.5, ky: 0, gddNeed: 0, heat: null,
    nFix: 30, nDemand: 0, carbon: 0.9, coverGap: 0,
    minBreak: 0, maxRun: 2, diseases: [], econ: { yield: 0, price: 0, cost: 120 },
    blurb: 'A season of legume-rich cover: no harvest, all soil. Often paid by eco-schemes.',
  }),
  C({
    id: 'oats', n: 15, symbol: 'Oa', name: 'Spring oats', latin: 'Avena sativa', family: 'poaceae', group: 'small-grain',
    fao: { sow: [3, 25], days: [20, 30, 40, 25], kc: [0.3, 1.15, 0.25] },
    rootDepth: 1.5, p: 0.55, ky: 1.0, kyAssumed: true, gddNeed: 0, heat: { month: 6, tMax: 26 },
    nFix: 0, nDemand: 110, carbon: 0.55, coverGap: 0.3,
    minBreak: 0, maxRun: 1, diseases: [], econ: { yield: 5.3, price: 190, cost: 520 },
    blurb: 'The cereal break crop: oats host almost no take-all, so the wheat after them thrives.',
  }),
  C({
    id: 'triticale', n: 16, symbol: 'Tc', name: 'Winter triticale', latin: '× Triticosecale', family: 'poaceae', group: 'small-grain',
    kc: [0.4, 0.4, 0.55, 0.85, 1.1, 1.1, 0.5, 0, 0, 0.4, 0.4, 0.4], sow: 10,
    rootDepth: 1.8, p: 0.55, ky: 1.0, kyAssumed: true, gddNeed: 0, heat: { month: 6, tMax: 28 },
    nFix: 0, nDemand: 150, carbon: 0.65, coverGap: 0.1,
    minBreak: 0, maxRun: 2, diseases: ['take-all'], econ: { yield: 6.4, price: 180, cost: 560 }, hardiness: -11, ripenGdd0: 2050,
    blurb: 'Wheat’s yield with rye’s toughness - a feed cereal for lighter, drier soils.',
  }),
  C({
    id: 'faba', n: 17, symbol: 'Fb', name: 'Faba bean', latin: 'Vicia faba', family: 'fabaceae', group: 'legume',
    fao: { sow: [3, 20], days: [20, 30, 40, 20], kc: [0.5, 1.15, 0.3] },
    rootDepth: 0.7, p: 0.45, ky: 1.15, gddNeed: 0, heat: { month: 6, tMax: 26 },
    nFix: 40, nDemand: 0, carbon: 0.35, coverGap: 0.45,
    minBreak: 4, maxRun: 1, diseases: ['pea-rots', 'sclerotinia'], econ: { yield: 4.1, price: 280, cost: 500 }, wetLimit: 400,
    blurb: 'Protein crop for heavier soils: ~40 kg N for the next crop, but it wants water in June.',
  }),
  C({
    id: 'lentil', n: 18, symbol: 'Le', name: 'Lentil', latin: 'Lens culinaris', family: 'fabaceae', group: 'legume',
    fao: { sow: [4, 1], days: [20, 30, 40, 20], kc: [0.4, 1.1, 0.3] },
    rootDepth: 0.8, p: 0.5, ky: 1.0, kyAssumed: true, gddNeed: 0, heat: { month: 6, tMax: 28 },
    nFix: 30, nDemand: 0, carbon: 0.25, coverGap: 0.5,
    minBreak: 4, maxRun: 1, diseases: ['pea-rots'], econ: { yield: 1.9, price: 650, cost: 450 }, wetLimit: 280,
    blurb: 'A frugal, high-value pulse for dry springs; harvested by July.',
  }),
  C({
    id: 'chickpea', n: 19, symbol: 'Cp', name: 'Chickpea', latin: 'Cicer arietinum', family: 'fabaceae', group: 'legume',
    fao: { sow: [4, 1], days: [20, 25, 35, 20], kc: [0.4, 1.0, 0.35] },
    rootDepth: 1.0, p: 0.5, ky: 0.85, kyAssumed: true, gddNeed: 600, heat: { month: 7, tMax: 32 },
    nFix: 30, nDemand: 0, carbon: 0.3, coverGap: 0.55,
    minBreak: 3, maxRun: 1, diseases: ['pea-rots'], econ: { yield: 2.1, price: 650, cost: 480 }, wetLimit: 250,
    blurb: 'Heat- and drought-hardy pulse that is moving north with the warming.',
  }),
  C({
    id: 'buckwheat', n: 20, symbol: 'Bw', name: 'Buckwheat', latin: 'Fagopyrum esculentum', family: 'polygonaceae', group: 'pseudo-cereal',
    fao: { sow: [5, 20], days: [15, 25, 35, 15], kc: [0.3, 1.0, 0.25] },
    rootDepth: 0.8, p: 0.5, ky: 1.0, kyAssumed: true, gddNeed: 500, heat: { month: 7, tMax: 28 },
    nFix: 0, nDemand: 50, carbon: 0.35, coverGap: 0.5,
    minBreak: 1, maxRun: 1, diseases: [], econ: { yield: 1.7, price: 500, cost: 380 },
    blurb: 'Fast, low-input and bee-friendly - a pseudo-cereal that breaks every grain disease.',
  }),
  C({
    id: 'millet', n: 21, symbol: 'Mi', name: 'Proso millet', latin: 'Panicum miliaceum', family: 'poaceae', group: 'c4-cereal',
    fao: { sow: [5, 15], days: [15, 25, 40, 25], kc: [0.3, 1.0, 0.3] },
    rootDepth: 2.0, p: 0.55, ky: 0.8, kyAssumed: true, gddNeed: 700, heat: { month: 8, tMax: 35 },
    nFix: 0, nDemand: 70, carbon: 0.6, coverGap: 0.6,
    minBreak: 0, maxRun: 2, diseases: [], econ: { yield: 3.0, price: 300, cost: 380 },
    blurb: 'The most water-thrifty grain here: 90 days, sandy soils, summer heat.',
  }),
  C({
    id: 'linseed', n: 22, symbol: 'Ls', name: 'Linseed', latin: 'Linum usitatissimum', family: 'linaceae', group: 'oilseed',
    fao: { sow: [4, 10], days: [25, 35, 40, 20], kc: [0.35, 1.1, 0.25] },
    rootDepth: 1.5, p: 0.5, ky: 1.0, kyAssumed: true, gddNeed: 0, heat: { month: 6, tMax: 27 },
    nFix: 0, nDemand: 70, carbon: 0.4, coverGap: 0.45,
    minBreak: 5, maxRun: 1, diseases: [], econ: { yield: 2.3, price: 520, cost: 450 }, wetLimit: 400,
    blurb: 'Spring oilseed with low inputs; needs long breaks against flax wilt.',
  }),
  // ---- crops of the tropics and warm temperate zones: FAO-56 via pyfao56, GAEZ v4 for soil and warmth ----
  C({
    id: 'rice', n: 23, symbol: 'Ri', name: 'Rice', latin: 'Oryza sativa', family: 'poaceae', group: 'rice',
    fao: { sow: [5, 1], days: [30, 30, 60, 30], kc: [1.05, 1.2, 0.75] },
    rootDepth: 1.0, p: 0.2, ky: 1.0, kyAssumed: true, gddNeed: 0, heat: { month: 7, tMax: 33 },
    nFix: 0, nDemand: 120, carbon: 0.6, coverGap: 0.25,
    minBreak: 0, maxRun: 5, diseases: [], econ: { yield: 7.0, price: 300, cost: 1100 },
    blurb: 'The monsoon staple. Lowland rice grows in standing water - here it is judged as a very thirsty field crop.',
  }),
  C({
    id: 'cassava', n: 24, symbol: 'Cs', name: 'Cassava', latin: 'Manihot esculenta', family: 'euphorbiaceae', group: 'root',
    fao: { sow: [4, 15], days: [20, 40, 90, 60], kc: [0.3, 0.8, 0.3] },
    // warmth: ~8 months at a mean of 18 °C (the usual lower limit for cassava) - GAEZ's cassava heat table asks for a
    // 28 °C year and failed the Nigerian cassava belt, so the degree-day rule stands in
    rootDepth: 0.8, p: 0.35, ky: 0.8, kyAssumed: true, gddNeed: 2000, heat: null,
    nFix: 0, nDemand: 80, carbon: 0.3, coverGap: 0.6,
    minBreak: 1, maxRun: 2, diseases: [], econ: { yield: 25, price: 60, cost: 900 },
    blurb: 'Root staple of the humid tropics: tolerates drought and poor soil, seven months or more in the field.',
  }),
  C({
    id: 'sweetpotato', n: 25, symbol: 'Sp', name: 'Sweet potato', latin: 'Ipomoea batatas', family: 'convolvulaceae', group: 'root',
    fao: { sow: [5, 1], days: [20, 30, 60, 40], kc: [0.5, 1.15, 0.65] },
    rootDepth: 1.5, p: 0.65, ky: 1.0, kyAssumed: true, gddNeed: 0, heat: null,
    nFix: 0, nDemand: 80, carbon: 0.3, coverGap: 0.45,
    minBreak: 2, maxRun: 1, diseases: [], econ: { yield: 25, price: 250, cost: 4500 }, contract: true,
    blurb: 'Warm-season root crop from Africa to China: covers the ground fast, frost kills it.',
  }),
  C({
    id: 'groundnut', n: 26, symbol: 'Gn', name: 'Groundnut', latin: 'Arachis hypogaea', family: 'fabaceae', group: 'legume',
    fao: { sow: [5, 15], days: [35, 45, 35, 25], kc: [0.4, 1.15, 0.6] },
    rootDepth: 1.0, p: 0.5, ky: 0.7, gddNeed: 0, heat: { month: 7, tMax: 34 },
    nFix: 30, nDemand: 20, carbon: 0.3, coverGap: 0.5,
    minBreak: 2, maxRun: 1, diseases: ['sclerotinia'], econ: { yield: 4.0, price: 500, cost: 1200 },
    blurb: 'Peanut: a warm-season legume for light soils, from West Africa to Shandong and Georgia.',
  }),
  C({
    id: 'cowpea', n: 27, symbol: 'Cw', name: 'Cowpea', latin: 'Vigna unguiculata', family: 'fabaceae', group: 'legume',
    fao: { sow: [5, 20], days: [20, 30, 30, 20], kc: [0.4, 1.05, 0.35] },
    rootDepth: 1.0, p: 0.45, ky: 0.9, kyAssumed: true, gddNeed: 0, heat: { month: 7, tMax: 34 },
    nFix: 35, nDemand: 0, carbon: 0.3, coverGap: 0.45,
    minBreak: 2, maxRun: 1, diseases: [], econ: { yield: 1.8, price: 550, cost: 450 },
    blurb: 'The drought-hardy pulse of the Sahel and savanna: grain, fodder and nitrogen in a hundred days.',
  }),
  C({
    id: 'drybean', n: 28, symbol: 'Db', name: 'Dry bean', latin: 'Phaseolus vulgaris', family: 'fabaceae', group: 'legume',
    fao: { sow: [5, 25], days: [20, 30, 40, 20], kc: [0.4, 1.15, 0.35] },
    rootDepth: 0.9, p: 0.45, ky: 1.15, gddNeed: 0, heat: { month: 7, tMax: 30 },
    nFix: 20, nDemand: 40, carbon: 0.3, coverGap: 0.5,
    minBreak: 3, maxRun: 1, diseases: ['sclerotinia', 'pea-rots'], econ: { yield: 2.5, price: 750, cost: 900 },
    blurb: 'Common bean of the Americas and East Africa: a short warm season, sensitive to heat at flowering.',
  }),
  C({
    id: 'cotton', n: 29, symbol: 'Co', name: 'Cotton', latin: 'Gossypium hirsutum', family: 'malvaceae', group: 'fibre',
    fao: { sow: [4, 25], days: [30, 50, 55, 45], kc: [0.35, 1.15, 0.6] },
    rootDepth: 1.7, p: 0.65, ky: 0.85, gddNeed: 0, heat: { month: 7, tMax: 35 },
    nFix: 0, nDemand: 150, carbon: 0.5, coverGap: 0.6,
    minBreak: 0, maxRun: 3, diseases: [], econ: { yield: 3.5, price: 600, cost: 1400 }, contract: true,
    blurb: 'The warm-climate fibre crop: a long season and deep roots - and it needs a gin nearby.',
  }),
  C({
    id: 'pearlmillet', n: 30, symbol: 'Pm', name: 'Pearl millet', latin: 'Pennisetum glaucum', family: 'poaceae', group: 'c4-cereal',
    fao: { sow: [6, 15], days: [15, 25, 40, 25], kc: [0.3, 1.0, 0.3] },
    rootDepth: 2.0, p: 0.55, ky: 0.8, kyAssumed: true, gddNeed: 0, heat: { month: 8, tMax: 36 },
    nFix: 0, nDemand: 60, carbon: 0.6, coverGap: 0.6,
    minBreak: 0, maxRun: 2, diseases: [], econ: { yield: 3.0, price: 220, cost: 380 },
    blurb: 'The last grain before the desert: Sahel and Rajasthan, sandy soils, 300 mm of rain.',
  }),
  // A season with no crop and no weeds (kept clean by herbicide or tillage): the dryland practice of the Great Plains,
  // the steppe and dry Australia, where the rain one year stores carries the next crop (water.ts afterFallow). Kc is
  // FAO-56's basal value of bare soil; the soil evaporates from its top layer only (water.ts, bare months).
  C({
    id: 'fallow', n: 53, symbol: 'Fw', name: 'Bare fallow', latin: 'no crop, weeds controlled', family: 'none', group: 'cover',
    kc: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15], sow: 1, perennial: true,
    rootDepth: 1.0, p: 0.5, ky: 0, gddNeed: 0, heat: null,
    nFix: 0, nDemand: 0, carbon: 0, coverGap: 1, // RUSLE's bare-fallow reference, C = 1
    minBreak: 0, maxRun: 1, diseases: [], econ: { yield: 0, price: 0, cost: 60 },
    blurb: 'A season without a crop: the soil stores rain for the next one - and lies open to wind and storms.',
  }),
  // the all-crops plan: field crops, contract crops, forage and open-field vegetables (cropsExtra.ts)
  ...EXTRA_SPECS.map((c) => C(c as unknown as CropSpec)),
]

/** Crop types for filtering the lists. */
export const CATEGORIES: { id: string; label: string; groups: Group[] }[] = [
  { id: 'cereals', label: 'Cereals', groups: ['small-grain', 'rice', 'c4-cereal', 'pseudo-cereal'] },
  { id: 'legumes', label: 'Legumes', groups: ['legume'] },
  { id: 'oilseeds', label: 'Oilseeds', groups: ['oilseed'] },
  { id: 'roots', label: 'Root crops', groups: ['root'] },
  { id: 'fibre', label: 'Fibre & industrial', groups: ['fibre', 'sugar'] },
  { id: 'vegetables', label: 'Vegetables', groups: ['vegetable'] },
  { id: 'soil', label: 'Forage & cover', groups: ['forage', 'cover'] },
]
export const categoryOf = (c: Crop) => CATEGORIES.find((k) => k.groups.includes(c.group))?.id ?? 'cereals'

export const CROP_BY_ID: Record<CropId, Crop> = Object.fromEntries(CROPS.map((c) => [c.id, c])) as Record<CropId, Crop>
export const isCropId = (x: string): x is CropId => Object.hasOwn(CROP_BY_ID, x) // own keys only: a shared URL may carry `constructor`

export type SeasonMonthKc = { month: number; yearOffset: number; kc: number }
export type Hemisphere = 'north' | 'south' | 'tropics'
/** Monthly normals as the calendar needs them (Jan…Dec); rain and PET are only needed in the tropics. */
export type CalendarNormal = { month?: number; t: number; p?: number; pet?: number }

/**
 * Cool-season crops. In the tropics and the monsoon belt they are grown after the rains, on stored soil water and in
 * the cooler dry season (rabi in South Asia); warm-season crops are sown when the rains begin (kharif).
 */
export const COOL_SEASON = new Set<CropId>(['wheat', 'barley', 'rye', 'triticale', 'oats', 'rapeseed', 'linseed', 'pea', 'faba', 'lentil', 'chickpea', 'potato', 'sugarbeet'])

const normalOf = (normals: CalendarNormal[], m: number) => normals.find((n) => n.month === m) ?? normals[m - 1]

/**
 * The rainy season from monthly normals by FAO's growing-period rule (FAO 1978, Agro-ecological Zones project):
 * a month counts when rain reaches half the potential evapotranspiration. Returns the longest such run (it may wrap
 * past December); null when no month qualifies; 12 months when there is no dry season.
 */
export type RainySeason = { onset: number; end: number; months: number }
export function rainySeason(normals: CalendarNormal[], force?: Partial<Record<number, boolean>>): RainySeason | null {
  const wet = Array.from({ length: 12 }, (_, i) => {
    const f = force?.[i + 1]
    if (f !== undefined) return f
    const n = normalOf(normals, i + 1)
    return !!n && n.p !== undefined && n.pet !== undefined && n.p >= 0.5 * n.pet
  })
  const count = wet.filter(Boolean).length
  if (count === 0) return null
  if (count === 12) return { onset: 1, end: 12, months: 12 }
  let best = { onset: 1, months: 0 }
  for (let start = 0; start < 12; start++) {
    if (!wet[start] || wet[(start + 11) % 12]) continue // runs start after a dry month
    let len = 0
    while (len < 12 && wet[(start + len) % 12]) len++
    if (len > best.months) best = { onset: start + 1, months: len }
  }
  return { onset: best.onset, end: ((best.onset - 1 + best.months - 1) % 12) + 1, months: best.months }
}

/** Half-width of the band of rain/PET around FAO's ½ in which a month inside the rainy season counts both ways. */
export const RAINS_BAND = 0.1

/** The months within RAINS_BAND of FAO's ½ PET, each with the share of the way its ratio lies across the band (0 at
 *  0.4, 1 at 0.6): the chance it counts wet. */
function nearHalf(normals: CalendarNormal[]): { m: number; w: number }[] {
  const near: { m: number; w: number }[] = []
  for (let m = 1; m <= 12; m++) {
    const n = normalOf(normals, m)
    if (!n || n.p === undefined || !n.pet) continue
    const r = n.p / n.pet
    if (Math.abs(r - 0.5) < RAINS_BAND) near.push({ m, w: (r - 0.5 + RAINS_BAND) / (2 * RAINS_BAND) })
  }
  return near
}
/** every combination of those months wet or dry, with its chance (the product) - the others as they are */
function* combinations(near: { m: number; w: number }[]): Generator<{ force: Record<number, boolean>; p: number }> {
  for (let mask = 0; mask < 1 << near.length; mask++) {
    let p = 1
    const force: Record<number, boolean> = {}
    near.forEach((x, j) => {
      const wet = (mask & (1 << j)) !== 0
      force[x.m] = wet
      p *= wet ? x.w : 1 - x.w
    })
    if (p > 0) yield { force, p }
  }
}

const runsMemo = new WeakMap<CalendarNormal[], { season: RainySeason; w: number }[] | null>()
/**
 * The rainy seasons a field may have where months sit within RAINS_BAND of FAO's ½ PET: every combination of those
 * months, each wet by its share of the band, the chance of a combination the product; each distinct season with the
 * sum of its combinations' chances (the season's longest run, as rainySeason reads it). One season: null. Each season
 * reads its own calendar continuously (rainSpan, on the field's own ratios), so the mixture moves without steps; at a
 * season's edge the seasons a doubtful month makes all but coincide there, and only a month that splits or joins runs,
 * or a shift to another run, moves the score. Earlier, one deciding month at a time (rainsSplit):
 * where several sat at ½ (Cordoba's November and December, or January to March under less rain) the season jumped as
 * another month crossed.
 */
export function rainsRuns(normals: CalendarNormal[]): { season: RainySeason; w: number }[] | null {
  if (runsMemo.has(normals)) return runsMemo.get(normals)!
  const seasons = new Map<string, { season: RainySeason; w: number }>()
  let total = 0
  for (const { force, p } of combinations(nearHalf(normals))) {
    const season = rainySeason(normals, force)
    if (!season) continue
    total += p
    const key = `${season.onset}-${season.end}-${season.months}`
    const r = seasons.get(key)
    if (r) r.w += p
    else seasons.set(key, { season, w: p })
  }
  const out = seasons.size < 2 ? null : [...seasons.values()].sort((x, y) => y.w - x.w).map((r) => ({ season: r.season, w: r.w / total }))
  runsMemo.set(normals, out)
  return out
}

const shareMemo = new WeakMap<CalendarNormal[], Map<Hemisphere, number>>()
/**
 * The share of summerRains (the rains keep a monsoon's shape: 2-8 months from the warm half, not a winter-rain season)
 * when every month within RAINS_BAND of FAO's ½ PET counts wet by the share of the way its ratio lies across the band -
 * the expectation over every combination of those months, the others as they are. 1 or 0 where no such month moves
 * it; it moves continuously, as a month leaves the band at a share of 0 or 1. A little more rain made Cordoba's eight
 * rainy months nine and switched its sowing rule from the rains to warmth at once (10 of the 217
 * development cells over the page's ±30 % rain); one month at a time was not enough where two interact.
 */
export function summerRainsShare(hemisphere: Hemisphere, normals: CalendarNormal[]): number {
  const memo = shareMemo.get(normals)?.get(hemisphere)
  if (memo !== undefined) return memo
  let share = 0
  for (const { force, p } of combinations(nearHalf(normals))) if (summerRains(hemisphere, normals, force)) share += p
  if (!shareMemo.has(normals)) shareMemo.set(normals, new Map())
  shareMemo.get(normals)!.set(hemisphere, share)
  return share
}

/** Whether this crop's sowing on this field follows the rains (the tropics with rain data, or byRains outside). */
export const rainSet = (crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]) =>
  !crop.perennial && !crop.fixedSow && !!crop.fao && !!normals?.some((n) => n.p !== undefined) && (hemisphere === 'tropics' || byRains(crop, hemisphere, normals))

/** Minimum mean air temperature on the sowing day for germination and emergence, °C (seed-bed guidance). */
export const MIN_SOW_T: Partial<Record<CropId, number>> = {
  maize: 10, sorghum: 13, millet: 12, soybean: 10, sunflower: 7, potato: 6, buckwheat: 10, chickpea: 6,
  lentil: 5, pea: 4, lupin: 4, faba: 3, oats: 3, linseed: 5, sugarbeet: 5,
  rice: 13, cassava: 18, sweetpotato: 15, groundnut: 16, cowpea: 16, drybean: 12, cotton: 16, pearlmillet: 15,
  // the spring forms of winter crops (winter forms have no FAO-56 calendar and never wait)
  wheat: 3, barley: 3, rapeseed: 5,
  ...EXTRA_MIN_SOW_T,
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
/** Mean air temperature on a calendar day, interpolated between mid-month normals. */
export function tempOnDay(normals: CalendarNormal[], [m, d]: [number, number]): number {
  const t = (mm: number) => normalOf(normals, ((mm - 1 + 12) % 12) + 1)?.t ?? NaN
  const mid = DAYS_IN_MONTH[m - 1] / 2
  if (d >= mid) return t(m) + ((t(m + 1) - t(m)) * (d - mid)) / DAYS_IN_MONTH[m - 1]
  return t(m) - ((t(m) - t(m - 1)) * (mid - d)) / DAYS_IN_MONTH[(m + 10) % 12]
}

/** The seed-bed minimum a spring or summer sowing waits for on this field, or undefined where warmth does not set the date. */
function sowingMinT(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): number | undefined {
  const minT = MIN_SOW_T[crop.id]
  if (hemisphere === 'tropics' || crop.fixedSow || crop.perennial || minT === undefined || !crop.fao || !normals?.length) return undefined
  return byRains(crop, hemisphere, normals) ? undefined : minT
}

/** Whether the rains, not warmth, set this crop's sowing outside the tropics: the field's rule (monsoonal), unless the
 *  crop carries the rule it is scored on near the mild-winter line (sowBy) - and only with rain to read: a calendar
 *  asked without the field's normals (the reference Northern-Hemisphere season) is the warmth one, as monsoonal says. */
const byRains = (crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]) =>
  hemisphere !== 'tropics' && (crop.sowBy ? crop.sowBy === 'rains' && !!normals?.some((n) => n.p !== undefined) : monsoonal(hemisphere, normals))

/** at most about three months, as warmthDelay */
export const WARMTH_WAIT_MAX = 92

/**
 * Days a warm-season sowing waits on this field, from its reference date, for the seed-bed to warm to MIN_SOW_T: the
 * first day whose normal temperature (tempOnDay, between monthly means) reaches it, at most WARMTH_WAIT_MAX. Cool-season
 * crops (COOL_SEASON) return 0 - they wait in whole months (warmthDelay).
 */
export function warmthWait(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): number {
  if (COOL_SEASON.has(crop.id) || !normals) return 0
  // the field's normals and the crop's calendar fix it: once per field and form (thermalFit asks every season)
  const key = `${crop.id}|${crop.form ?? ''}|${crop.fao?.sow}|${crop.fixedSow ?? ''}|${crop.sowBy ?? ''}|${crop.rains?.onset ?? ''}|${hemisphere}`
  const memo = waitMemo.get(normals) ?? new Map<string, number>()
  waitMemo.set(normals, memo)
  let wait = memo.get(key)
  if (wait === undefined) memo.set(key, (wait = daysToWarmth(crop, hemisphere, normals)))
  return wait
}
const waitMemo = new WeakMap<CalendarNormal[], Map<string, number>>()
function daysToWarmth(crop: Crop, hemisphere: Hemisphere, normals: CalendarNormal[]): number {
  const minT = sowingMinT(crop, hemisphere, normals)
  if (minT === undefined) return 0
  let m = ((crop.fao!.sow[0] - 1 + (hemisphere === 'south' ? 6 : 0)) % 12) + 1
  let d = crop.fao!.sow[1]
  for (let wait = 0; wait < WARMTH_WAIT_MAX; wait++) {
    if (tempOnDay(normals, [m, d]) >= minT) return wait
    if (++d > DAYS_IN_MONTH[m - 1]) {
      d = 1
      m = (m % 12) + 1
    }
  }
  return WARMTH_WAIT_MAX
}

/**
 * Months a spring or summer sowing waits on this field for the seed-bed to warm to MIN_SOW_T (at most three). The
 * reference dates are Central European; on the prairies and the steppe March is frozen, so oats go in in late April.
 * A cool-season crop moves to the same day of the first month warm enough - frost risk and soil workability hold it
 * back past the first warm day; a warm-season crop by its wait in days (warmthWait), rounded to the nearest month.
 * Earlier, warm-season crops also moved whole months: Danish maize, at 9.x °C on 1 May against its 10 °C, went
 * in on 1 June instead of in May.
 */
export function warmthDelay(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): number {
  const minT = sowingMinT(crop, hemisphere, normals)
  if (minT === undefined) return 0
  if (!COOL_SEASON.has(crop.id)) return Math.min(3, Math.round(warmthWait(crop, hemisphere, normals) / 30.4))
  const base = hemisphere === 'south' ? 6 : 0
  for (let k = 0; k <= 3; k++) {
    const month = ((crop.fao!.sow[0] - 1 + base + k) % 12) + 1
    if (tempOnDay(normals!, [month, crop.fao!.sow[1]]) >= minT) return k
  }
  return 3
}

/**
 * A summer-rain field without a cold winter outside the tropics - the monsoon belt of South Asia up to ~30° N, the
 * Mexican plateau, the southern African highveld: water, not warmth, sets the sowing date, as in the tropics.
 */
export function monsoonal(hemisphere: Hemisphere, normals?: CalendarNormal[]): boolean {
  // the winter first: it is the cheap test, and this runs for every crop and month
  if (!normals?.length || Math.min(...normals.map((n) => n.t)) < MILD_WINTER_T) return false
  return summerRains(hemisphere, normals)
}

/**
 * The monsoon's rains, the winter left aside: 2-8 rainy months starting in the warm half of the year - and not a
 * winter-rain season, one that holds the coldest month but not the warmest. Autumn rains that start in September and
 * last into March (the Mediterranean) had passed for a monsoon wherever the winter was mild, and a warm-season crop
 * was then sown with them in September (an Adriatic field at +2.5 °C).
 */
export function summerRains(hemisphere: Hemisphere, normals?: CalendarNormal[], force?: Partial<Record<number, boolean>>): boolean {
  if (hemisphere === 'tropics' || !normals?.length || !normals.some((n) => n.p !== undefined)) return false
  const rains = rainySeason(normals, force)
  if (!rains || rains.months < 2 || rains.months > 8) return false
  if (!(hemisphere === 'north' ? [4, 5, 6, 7, 8, 9] : [10, 11, 12, 1, 2, 3]).includes(rains.onset)) return false
  const t = Array.from({ length: 12 }, (_, i) => normalOf(normals, i + 1)?.t ?? NaN)
  const rainy = new Set(Array.from({ length: rains.months }, (_, k) => ((rains.onset - 1 + k) % 12) + 1))
  return !(rainy.has(t.indexOf(Math.min(...t)) + 1) && !rainy.has(t.indexOf(Math.max(...t)) + 1))
}


/** Warm-season crops start with the rains, cool-season crops in the month after they end. */
function rainShift(crop: Crop, normals: CalendarNormal[]): number {
  const rains = crop.rains ?? rainySeason(normals)
  let target: number
  if (!rains) {
    let wettest = 1
    for (let m = 2; m <= 12; m++) if ((normalOf(normals, m)?.p ?? 0) > (normalOf(normals, wettest)?.p ?? 0)) wettest = m
    target = wettest
  } else if (rains.months >= 12) return 0
  else target = COOL_SEASON.has(crop.id) ? (rains.end % 12) + 1 : crop.group === 'rice' ? floodMonth(normals, rains) : rains.onset
  return (target - crop.sow + 12) % 12
}

/** Paddy rice is transplanted once the rains flood the field: the first month of the rainy season with rain ≥ PET. */
function floodMonth(normals: CalendarNormal[], rains: { onset: number; months: number }): number {
  for (let k = 0; k < rains.months; k++) {
    const m = ((rains.onset - 1 + k) % 12) + 1
    const n = normalOf(normals, m)
    if (n?.p !== undefined && n.pet !== undefined && n.p >= n.pet) return m
  }
  return rains.onset
}

/**
 * Months to add to a crop's Northern-Hemisphere calendar on this field: 6 in the south; in the tropics and on
 * monsoonal fields beyond them warm-season crops move to the onset of the rains and cool-season crops to the month
 * after they end; elsewhere spring sowings wait for the seed-bed to warm. Without a dry season (or rain data) a
 * tropical calendar stays as it is; in a desert it follows the wettest month.
 */
export function calendarShift(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): number {
  const base = hemisphere === 'south' ? 6 : 0
  if (crop.perennial || crop.fixedSow) return base
  const hasRain = !!normals?.some((n) => n.p !== undefined)
  if (hemisphere === 'tropics') return hasRain ? rainShift(crop, normals!) : 0
  if (byRains(crop, hemisphere, normals)) return rainShift(crop, normals!)
  return base + warmthDelay(crop, hemisphere, normals)
}

/**
 * A warm-season sowing that waits for warmth, as the two whole-month calendars around its wait (months added to the
 * calendar) and the weight of the later one - calendarShift rounds the wait to the nearest month. Null where warmth does
 * not set the date or the wait is whole months.
 */
export function sowingSpan(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): { lo: number; hi: number; f: number } | null {
  if (crop.perennial || crop.fixedSow || !normals?.some((n) => n.p !== undefined)) return null
  if (hemisphere === 'tropics' || byRains(crop, hemisphere, normals)) return rainSpan(crop, normals)
  if (COOL_SEASON.has(crop.id)) return coolSpan(crop, hemisphere, normals)
  const wait = warmthWait(crop, hemisphere, normals)
  if (!wait) return null
  const m = Math.min(3, wait / 30.4)
  const lo = Math.floor(m)
  const base = hemisphere === 'south' ? 6 : 0
  return m > lo ? { lo: base + lo, hi: base + lo + 1, f: m - lo } : null
}

/** Half-width of the band (°C) around a cool-season crop's seed-bed minimum in which coolSpan blends two months. */
const COOL_SOW_BAND = 1

/**
 * A cool-season sowing that waits for warmth moves in whole months (warmthDelay: the same day of the first month warm
 * enough). Within COOL_SOW_BAND of the seed-bed minimum on a candidate day the two calendars around it are blended - the
 * later one's weight (minimum + band − that day's temperature) / (2 × band) - so the weight is a half on either side of
 * the minimum and a warmer spring moves the sowing gradually. Earlier, a spring a tenth of a degree warmer moved
 * oats, spring wheat or peas a whole month at once (a step under the warming what-if). A judgement: the same ±1 °C as
 * the other bands (water.ts BAND_T); null where no candidate day lies in the band.
 */
function coolSpan(crop: Crop, hemisphere: Hemisphere, normals: CalendarNormal[]): { lo: number; hi: number; f: number } | null {
  const minT = sowingMinT(crop, hemisphere, normals)
  if (minT === undefined) return null
  const k = warmthDelay(crop, hemisphere, normals)
  const base = hemisphere === 'south' ? 6 : 0
  const at = (j: number) => tempOnDay(normals, [((crop.fao!.sow[0] - 1 + base + j) % 12) + 1, crop.fao!.sow[1]])
  const later = (t: number) => Math.min(1, Math.max(0, (minT + COOL_SOW_BAND - t) / (2 * COOL_SOW_BAND)))
  // the month before the one it moved to only just missed the minimum, or the month it moved to only just reached it
  if (k > 0 && later(at(k - 1)) < 1) return { lo: base + k - 1, hi: base + k, f: later(at(k - 1)) }
  if (k < 3 && later(at(k)) > 0) return { lo: base + k, hi: base + k + 1, f: later(at(k)) }
  return null
}

/**
 * Where the rains set the sowing (calendarShift → rainShift), the month they start or end read continuously: the ratio
 * of rain to PET between two mid-month normals is taken as linear, and the day it crosses the rule's threshold (½ PET;
 * PET itself for a flooded paddy) moves the calendar by the share of a month - a crossing at the turn of the month gives
 * the former whole month. Earlier, a warmer scenario (more PET) moved the onset a whole month at once, and with
 * it the season's water. Null without a dry season.
 */
function rainSpan(crop: Crop, normals: CalendarNormal[]): { lo: number; hi: number; f: number } | null {
  const rains = crop.rains ?? rainySeason(normals)
  if (!rains || rains.months >= 12) return null
  const ratio = (m: number) => {
    const n = normalOf(normals, ((m - 1 + 12) % 12) + 1)
    return n?.p !== undefined && n.pet ? n.p / n.pet : NaN
  }
  // the share of the way from mid-month `from` to mid-month `from + 1` at which the ratio crosses `at`, rising into
  // the rains (falling out of them: mirrored). The field's own season always crosses between the two; a season scored
  // as one variant (water.ts rainsBand) can hold months its ratios put on the other side, and there the share moves
  // continuously into those cases - the later month dry too: the end of the way; the earlier wet too: its start; both:
  // between, as they lie. It had leapt half a month or more as two ratios swapped order.
  const cross = (from: number, at: number, rising = true) => {
    const [x, y] = [ratio(from), ratio(from + 1)]
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0.5
    const [a, b, t] = rising ? [x, y, at] : [-x, -y, -at]
    if (a < t && b >= t) return (t - a) / (b - a)
    if (a < t) return 1
    if (b >= t) return 0
    return a !== b ? (t - b) / (a - b) : 0.5
  }
  let target: number
  let offset: number // months from the start of the target month, -0.5 .. 0.5
  if (COOL_SEASON.has(crop.id)) {
    target = (rains.end % 12) + 1
    offset = cross(rains.end, 0.5, false) - 0.5
  } else if (crop.group === 'rice') {
    target = floodMonth(normals, rains)
    offset = ratio(target - 1) < 1 ? cross(target - 1, 1) - 0.5 : 0
  } else {
    target = rains.onset
    offset = cross(rains.onset - 1, 0.5) - 0.5
  }
  const o = ((target - crop.sow + 12) % 12) + offset
  const lo = Math.floor(o)
  return o > lo ? { lo: (lo + 12) % 12, hi: (lo + 13) % 12, f: o - lo } : null
}

/** The crop's spring form as a whole crop (same id): its own calendar and economics, no winter hardiness to test. */
export function springOf(crop: Crop): Crop | null {
  const s = crop.spring
  if (!s) return null
  return {
    ...crop, ...s, kc: monthlyKc(s.fao), sow: s.fao.sow[0], gddNeed: 0,
    hardiness: undefined, ripenGdd0: undefined, spring: undefined, form: 'spring',
  }
}

/**
 * The crop grown for silage, as a whole crop with its own id kept (maize stays maize in a history and in what farms
 * report): the whole plant chopped green at about 30-35 % dry matter, before the grain is ripe. FAO GAEZ v4 rates
 * silage maize as a crop of its own with lower heat-unit needs (Table A4-6.1); where the summers are too cool to ripen
 * grain maize - Denmark, northern Germany, Ireland - farms grow maize this way (Denmark's maize was ruled out by the
 * grain-maize warmth check in experiment H4). Calendar, nitrogen, residues and economics (whole-plant dry
 * matter at a feed value) are the forage crop's (`silage`); rooting, water response, heat at flowering, diseases and its
 * group stay the crop's own - the measured drag of a small grain after maize (rotation.ts) still applies, no field record
 * having measured it after silage maize apart. Which form a field grows: water.ts formOf.
 */
export function silageOf(crop: Crop): Crop | null {
  const f = crop.silage ? CROP_BY_ID[crop.silage] : null
  if (!f) return null
  return {
    ...crop, name: f.name, fao: f.fao, kc: f.kc, sow: f.sow, econ: f.econ, nDemand: f.nDemand,
    carbon: f.carbon, coverGap: f.coverGap, blurb: f.blurb, form: 'silage',
  }
}

/**
 * Coldest-month mean (°C) from which a winter crop's winter form is not grown: vernalisation works best near 5 °C and
 * stops around 16 °C (wheat; Porter & Gawith 1999), so where even the coldest month averages 10 °C or more the winter
 * is too mild for it, and farmers sow spring-type cultivars in late autumn instead - rabi wheat and mustard in India
 * and Pakistan, wheat and barley in Egypt, Morocco, northern Argentina, the Mexican plateau. A judgement, listed in
 * the evidence register.
 */
export const MILD_WINTER_T = 10

/** The name of the spring type sown in late autumn (mildWinterOf): "Spring wheat" -> "Autumn-sown wheat". */
export const autumnSownName = (springName: string) => springName.replace(/^Spring /, 'Autumn-sown ').replace(/^./, (c) => c.toUpperCase())

/** A crop by its id as a field grows it - spring wheat on the prairies, the autumn-sown type, silage maize (water.ts
 *  formsOf; FieldContext risks carry it). Plan figures read crops through one, so they describe what the score scored. */
export type FormOf = (id: CropId) => Crop
export const baseForm: FormOf = (id) => CROP_BY_ID[id]
/** The row of a per-crop table (residues, nitrogen left) for a crop as grown: silage maize keeps the id 'maize'
 *  (silageOf) but its residues and nitrogen are the forage crop's. */
export const tableId = (c: Crop): CropId => (c.form === 'silage' && c.silage ? c.silage : c.id)

/**
 * The crop's spring form sown in the cool season of a mild winter; null where the winter is cold enough for the
 * winter form (or the crop has no spring form). Sown two months before the coldest month (mid-November in the north,
 * mid-May in the south; in the tropics the rains still set the month), and ripe when the degree-days since sowing
 * reach the crop's own need (ripenGdd0) - its FAO-56 stages stretched to that season.
 */
export function mildWinterOf(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[], minT = MILD_WINTER_T): Crop | null {
  const spring = springOf(crop)
  if (!spring?.fao || !crop.ripenGdd0 || !normals?.length) return null
  const t = Array.from({ length: 12 }, (_, i) => normalOf(normals, i + 1)?.t ?? NaN)
  if (!t.every(Number.isFinite)) return null
  const coldest = t.indexOf(Math.min(...t)) + 1
  if (t[coldest - 1] < minT) return null // minT below the line: the band where formsOf scores both forms
  const base = hemisphere === 'south' ? 6 : 0
  const tropics = hemisphere === 'tropics'
  // local sowing month: the rains decide in the tropics (calendarShift), the cool season elsewhere
  const local = tropics ? ((spring.fao.sow[0] - 1 + calendarShift(spring, hemisphere, normals)) % 12) + 1 : ((coldest - 3 + 12) % 12) + 1
  const day = tropics ? spring.fao.sow[1] : 15
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gdd = 0
  let days = 0
  for (let m = local, d = day; gdd < crop.ripenGdd0 && days < 300; days++) {
    gdd += Math.max(0, tempOnDay(normals, [m, d]))
    if (++d > DAYS[m - 1]) {
      d = 1
      m = (m % 12) + 1
    }
  }
  const total = spring.fao.days.reduce((a, b) => a + b, 0)
  const stages = spring.fao.days.map((x) => Math.max(5, Math.round((x * days) / total))) as Fao56Stages['days']
  const nh = tropics ? spring.fao.sow[0] : ((local - 1 - base + 12) % 12) + 1
  const fao: Fao56Stages = { ...spring.fao, sow: [nh, day], days: stages }
  return {
    ...spring, name: autumnSownName(spring.name), fao, sow: nh, kc: monthlyKc(fao),
    fixedSow: tropics ? undefined : true, form: 'mild',
    blurb: `Sown in late autumn where the winters are too mild for the winter form - a spring-type ${crop.id === 'rapeseed' ? 'oilseed' : 'cereal'} that grows through the cool season.`,
  }
}

/** Days of each calendar month (Jan…Dec, on this field's calendar) that the crop is in the field; null without an FAO-56 calendar. */
export function seasonDays(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): number[] | null {
  if (!crop.fao) return null
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const out = new Array<number>(12).fill(0)
  const shift = calendarShift(crop, hemisphere, normals)
  let month = (crop.fao.sow[0] - 1 + shift) % 12
  let day = crop.fao.sow[1] - 1
  const total = crop.fao.days.reduce((a, b) => a + b, 0)
  for (let d = 0; d < total; d++) {
    out[month]++
    if (++day >= DAYS[month]) {
      day = 0
      month = (month + 1) % 12
    }
  }
  return out
}

/** Days a crop flowers over: the window its heat-at-flowering check reads, from the start of FAO-56's mid-season stage. */
export const FLOWERING_DAYS = 21

/**
 * When flowering starts on this field's calendar: for a crop with an FAO-56 calendar, the sowing date plus the initial
 * and development stages (the mid-season stage starts at full cover, around flowering); null for the other crops,
 * whose heat month (Crop.heat) stands in.
 */
export function floweringStart(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): { month: number; day: number; afterSowing: number } | null {
  if (!crop.fao) return null
  const afterSowing = crop.fao.days[0] + crop.fao.days[1]
  // a warm-season sowing that waits for the seed-bed to warm is sown on the day it does (warmthWait), as thermalFit
  // reads it - not on the reference day of the month the monthly calendar rounds it to, so a warmer spring moves
  // flowering by days rather than a month
  const wait = warmthWait(crop, hemisphere, normals)
  // where the rains set the date, the day they start (sowingSpan reads it continuously), not the month it rounds to
  const rain = wait > 0 ? null : sowingSpan(crop, hemisphere, normals)
  const shift = rain ? rain.lo : calendarShift(crop, hemisphere, normals) - (wait > 0 ? warmthDelay(crop, hemisphere, normals) : 0)
  return dayOn(crop, shift, afterSowing + wait + (rain ? Math.round(rain.f * 30.44) : 0))
}

/** When flowering starts on one whole-month calendar (months added to the crop's own): its reference sowing day plus the
 *  initial and development stages - the window extremes.ts reads for each calendar of a sowing between two months. */
export function floweringOn(crop: Crop, shift: number): { month: number; day: number; afterSowing: number } | null {
  return crop.fao ? dayOn(crop, shift, crop.fao.days[0] + crop.fao.days[1]) : null
}

function dayOn(crop: Crop, shift: number, after: number): { month: number; day: number; afterSowing: number } {
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let month = (((crop.fao!.sow[0] - 1 + shift) % 12) + 12) % 12
  let day = crop.fao!.sow[1] - 1 + after
  while (day >= DAYS[month]) {
    day -= DAYS[month]
    month = (month + 1) % 12
  }
  return { month: month + 1, day: day + 1, afterSowing: crop.fao!.days[0] + crop.fao!.days[1] }
}

/** The calendar month of the crop's heat-sensitive stage on this field: flowering by its FAO-56 stages, else Crop.heat. */
export function flowerMonth(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): number | null {
  const f = floweringStart(crop, hemisphere, normals)
  if (f) return f.month
  return crop.heat ? localMonth(crop.heat.month, crop, hemisphere, normals) : null
}

/** A Northern-Hemisphere calendar month moved onto this field's calendar. */
export const localMonth = (nhMonth: number, crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]) =>
  ((nhMonth - 1 + calendarShift(crop, hemisphere, normals) - thermalAdvance(crop, hemisphere, normals) + 12) % 12) + 1

/**
 * Months by which a crop with a thermal-time need ripens earlier here than on its reference calendar: the degree-days
 * since sowing (NASA POWER monthly means, base 0 °C) reach its need sooner in a warmer climate. Winter wheat in
 * Kansas ripens in June, not July: its flowering and peak water use move a month earlier too. At most two months.
 */
export function thermalAdvance(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): number {
  const s = advanceSpan(crop, hemisphere, normals)
  return s.f < 0.5 ? s.lo : s.hi
}
/**
 * The same advance without rounding to whole months, as two whole-month advances and the weight of the second: a
 * warmer climate moves the season smoothly from one to the other (cropSeason blends them, the heat window moves
 * between them - extremes.ts). Rounded, it is thermalAdvance.
 */
export function advanceSpan(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[]): { lo: number; hi: number; f: number } {
  if (!normals || !crop.ripenGdd0) return { lo: 0, hi: 0, f: 0 }
  const months = calendarMonths(crop, hemisphere, normals)
  const t = ripenTime(crop, months, normals)
  if (t === null) return { lo: 0, hi: 0, f: 0 }
  const low = Math.min(...months.slice(1).map((m) => m.kc))
  const plateau = months.slice(1).filter((m, i) => m.kc === low && months[i].kc === low).length
  const at = (ripe: number) => Math.min(2, Math.max(0, months.length - 1 - ripe), plateau)
  const r = Math.floor(t)
  // a later ripening is a smaller advance: the whole-month calendar ripening in month r + 1 has the weight t - r
  return { lo: at(r), hi: at(r + 1), f: t - r }
}
/**
 * When the degree-days since sowing reach the crop's need, in months from the start of its calendar, read so that a
 * need met in the middle of month i gives i - the month the former whole-month rule ripened it in -
 * and earlier or later in the month moves it smoothly towards the neighbouring month. Only in the ripening months
 * after full canopy, so a mild winter can't cut the season in half; null when the season never collects it.
 */
function ripenTime(crop: Crop, months: SeasonMonthKc[], normals: CalendarNormal[]): number | null {
  const peak = Math.max(...months.map((m) => m.kc))
  const lastFull = months.reduce((last, m, i) => (m.kc >= 0.95 * peak ? i : last), 0)
  let gdd = 0
  for (let i = 0; i < months.length; i++) {
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][months[i].month - 1]
    const g = Math.max(0, normalOf(normals, months[i].month)?.t ?? 0) * days
    if (gdd + g >= crop.ripenGdd0! && i >= lastFull) return Math.max(lastFull, i - 0.5 + (g > 0 ? (crop.ripenGdd0! - gdd) / g : 1))
    gdd += g
  }
  return null
}

/** Kc profile on this field's calendar (southern = six months later, tropics = moved to the rains). */
export function kcFor(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[], shift = calendarShift(crop, hemisphere, normals)): number[] {
  if (!shift) return crop.kc
  return crop.kc.map((_, i) => crop.kc[(i - shift + 12) % 12])
}

/**
 * Months the crop occupies for the season harvested in year Y, as offsets from Y.
 * Crops sown in autumn start in the previous calendar year.
 */
export function cropSeason(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[], shift?: number): SeasonMonthKc[] {
  const months = calendarMonths(crop, hemisphere, normals, shift)
  if (!normals || !crop.ripenGdd0) return months
  const t = ripenTime(crop, months, normals)
  if (t === null) return months
  // Between two whole-month calendars (ripe in month r or r + 1) the crop coefficients are blended month by month from
  // the same sowing, so a slightly warmer climate shortens the season a little - the last month fades out - instead of
  // dropping a whole month at once. Earlier, the season jumped: +0.5 °C cut July from Torgau's winter wheat
  // and its water-stress loss fell from 16 % to 6 %.
  const r = Math.floor(t)
  const f = t - r
  const a = advanced(months, r)
  if (f === 0) return a
  const b = advanced(months, r + 1)
  return (b.length > a.length ? b : a).map((m, i) => ({ ...m, kc: (1 - f) * (a[i]?.kc ?? 0) + f * (b[i]?.kc ?? 0) }))
}

/** The whole-month calendar of a crop ripe in month `ripe` of its season. */
function advanced(months: SeasonMonthKc[], ripe: number): SeasonMonthKc[] {
  const advance = Math.min(2, Math.max(0, months.length - 1 - ripe))
  // ripens earlier than its reference calendar: the winter rest is shorter, so drop up to `advance` months of the
  // dormant plateau and let spring growth, flowering and ripening follow on - the same stages, sooner
  const low = Math.min(...months.slice(1).map((m) => m.kc))
  const kcs = months.map((m) => m.kc)
  let dropped = 0
  for (let i = kcs.length - 1; i >= 1 && dropped < advance; i--) {
    if (kcs[i] === low && kcs[i - 1] === low) {
      kcs.splice(i, 1)
      dropped++
    }
  }
  // any advance the plateau could not absorb: stop in the month the degree-days are reached
  return months.slice(0, Math.min(kcs.length, ripe + 1 + dropped)).map((m, i) => ({ ...m, kc: kcs[i] }))
}

function calendarMonths(crop: Crop, hemisphere: Hemisphere, normals?: CalendarNormal[], shift = calendarShift(crop, hemisphere, normals)): SeasonMonthKc[] {
  const kc = kcFor(crop, hemisphere, normals, shift)
  const start = (crop.sow - 1 + shift) % 12
  const months: SeasonMonthKc[] = []
  for (let i = 0; i < 12; i++) {
    const idx = (start + i) % 12
    if (kc[idx] === 0) break
    months.push({ month: idx + 1, yearOffset: 0, kc: kc[idx] })
  }
  // If the season wraps past December, the months before the wrap belong to the previous year.
  const wrapAt = months.findIndex((m, i) => i > 0 && m.month < months[i - 1].month)
  if (wrapAt > 0) for (let i = 0; i < wrapAt; i++) months[i].yearOffset = -1
  return months
}

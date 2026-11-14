// Generate src/lib/cropsExtra.ts - the crops added by the all-crops plan - from two data files:
//   docs/audit/new-crops.json  agronomy with a source per value (FAO-56 tables checked; the rest marked "assumed")
//   src/data/markets.json      FAOSTAT producer prices and national yields, put on the older crops' reference basis:
//   - price: in each country and year, the crop's price over the country's cereal level (the mean of price / reference
//     price over wheat, maize, rice, sorghum and barley the same year), the median of a country's last five such
//     years, then the median over countries weighted by the square root of production. The engine's reference prices
//     are one consistent set; a plain world price is not on it (a production-weighted median is one country's price:
//     fonio = Guinea, safflower = Kazakhstan, tomato = China). Checked on the 28 older crops with prices: the method
//     gives their reference prices back with a median error of 10 % (cassava is the outlier: 135 vs 60 €/t).
//   - yield: the 95th percentile of national yields - where the older crops' reference yields sit (median percentile
//     0.95, IQR 0.93-0.97; P95 gives them back with a median error of 20 %, P90 22 %).
// Costs stay the research table's (assumed), except where cost / gross at the reference yield and price falls outside
// the older crops' range (0.31-0.72): of the three numbers the cost is the one without data behind it, so it is the one
// moved to the range's edge (flagged in EXTRA_ECON_SOURCE) - left as it was, bambara cost 3.2x what it earns and
// tomato 0.2x, a crop that can never pay next to one that always does. Forage crops have no FAOSTAT series: their
// economics are all assumed.
//   (method check: scripts/crops-extra.mjs --check)
//
//   node scripts/crops-extra.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const research = JSON.parse(readFileSync('docs/audit/new-crops.json', 'utf8'))
const R = research.crops ?? research
/** Where the research table is wrong against the source it cites (the table is kept as delivered). */
const CORRECTIONS = {
  // FAO-66 (Steduto et al. 2012) Table 1 reproduces FAO-33's seasonal Ky: watermelon 1.1, and no tobacco or grass row
  watermelon: { ky: 1.1, kyAssumed: false },
  tobacco: { kyAssumed: true },
  grassley: { kyAssumed: true },
  // the table gives okra's 1.0 as "assumed: not tabulated" but did not flag it
  okra: { kyAssumed: true },
  // the yield is fresh cane (FAOSTAT) but the residue took it as dry matter: fresh stalks are 70-75 % water, so the
  // trash came out at ~50 t DM/ha (≈ 15 in the field) and sugarcane led the soil axis everywhere
  sugarcane: { residue: { ...R.sugarcane.residue, dry: 0.3 } },
  // yam's water season follows GAEZ v4's longest white-yam cycle (225 days, Table A4-6.1) instead of the table's 270,
  // which ran into the dry season and cost yam 62 % of its yield in the Nigerian yam belt; stages scaled alike
  yam: { fao: { ...R.yam.fao, days: [25, 50, 100, 50] } },
}
for (const [id, fix] of Object.entries(CORRECTIONS)) Object.assign(R[id], fix)
/** GAEZ v4 rates these crops itself (scripts/gaez.py): its own soil and heat-unit rows replace the research
 *  table's stand-ins - yam took sweet potato's heat units (a 4-month crop) and fitted Crimea and the Pampas */
const GAEZ_OWN = {
  yam: { crop: 'White Yam', heat: { temperate: 'White yam' } },
  taro: { crop: 'Cocoyam', heat: { temperate: 'Cocoyam' } },
  pigeonpea: { crop: 'Pigeonpea', heat: { temperate: 'Pigeon pea' } },
  tobacco: { crop: 'Tobacco', heat: { temperate: 'Tobacco', tropical: 'Tobacco tropical' } },
  tomato: { crop: 'Tomato', heat: { temperate: 'Tomato', tropical: 'Tomato tropical' } },
  onion: { crop: 'Onion', heat: { temperate: 'Onion', tropical: 'Onion tropical' } },
  cabbage: { crop: 'Cabbage', heat: { temperate: 'Cabbage' } },
  foragesorghum: { crop: 'Sorghum Biomass', heat: { temperate: 'Biomass sorghum', tropical: 'Biomass sorghum tropical' } },
  grassley: { crop: 'Grass' },
  // GAEZ's own silage maize heat units (scripts/gaez.py); grain maize's rows stood in - also maize's silage form
  silagemaize: { crop: 'Maize', heat: { temperate: 'Silage maize' } },
}
const M = JSON.parse(readFileSync('src/data/markets.json', 'utf8'))

/** id here (= the CROPGRIDS truth id) ← id in the research table; market key; display. Names and blurbs avoid other crops'
 * names and the dictionary's separators (' - ', ' · ', '; '): the page translates them whole (lib/dictionary.ts). */
const CROPS = [
  ['sesame', 'sesame', 'sesame', 'Ss', 'Sesame', 'An old oilseed of hot, dry summers: deep roots, a fortnight of rain to start, sold to traders by the sack.'],
  ['pigeonpea', 'pigeonpea', 'pigeonpea', 'Pp', 'Pigeon pea', 'A deep-rooted pulse of the semi-arid tropics that keeps growing into the dry season and feeds the next crop nitrogen.'],
  ['safflower', 'safflower', 'safflower', 'Sa', 'Safflower', 'A thistle-like oilseed with a taproot to two metres: grown on stored water where sunflower runs dry.'],
  ['yam', 'yam', 'yam', 'Ym', 'Yam', 'The staple tuber of West Africa from Côte d’Ivoire to Nigeria: planted on mounds, harvested after seven to ten months.'],
  ['taro', 'taro', 'taro', 'Ta', 'Taro', 'A corm crop of wet tropical soils, from Pacific gardens to West African lowlands.'],
  ['fonio', 'fonio', 'fonio', 'Fo', 'Fonio', 'The fastest West African cereal: ripe in two to three months on poor sandy soils.'],
  ['bambara', 'bambara', 'bambara', 'Bg', 'Bambara groundnut', 'A drought-hardy pulse of African smallholders that pods underground and fixes its own nitrogen.'],
  ['quinoa', 'quinoa', 'quinoa', 'Qu', 'Quinoa', 'An Andean pseudo-cereal that tolerates cold nights and salty soils, though heat at flowering empties its seed.'],
  ['sugarcane', 'sugarcane', 'sugarcane', 'Sc', 'Sugarcane', 'A year-round grass harvested for its stalks, which must reach a mill within a day or two of cutting.'],
  ['tobacco', 'tobacco', 'tobacco', 'Tb', 'Tobacco', 'A contract leaf crop: sold to a curing company, heavy on labour and on nitrogen.'],
  ['castor', 'castor', 'castor', 'Ca', 'Castor bean', 'An industrial oilseed whose seed holds ricin, so it is grown under contract and handled with care.'],
  ['jute', 'jute', 'jute', 'Ju', 'Jute', 'A fibre crop of warm floodplains that needs water to ret the stems and a mill in reach.'],
  ['vetch', 'vetch', 'vetch', 'Vt', 'Common vetch', 'A climbing legume grown for fodder or green manure, often sown with a cereal.'],
  ['silagemaize', 'silagemaize', 'silagemaize', 'Sm', 'Silage maize', 'The whole plant chopped green for cattle: grown where there is a herd to feed.'],
  ['grassley', 'grassley', 'grassley', 'Gl', 'Temporary grass', 'Sown grass for grazing or silage, kept for several years: soil-building, but only with livestock.'],
  ['foragesorghum', 'sorghumforage', 'foragesorghum', 'Fs', 'Forage sorghum', 'A heat- and drought-hardy fodder grass cut several times a summer.'],
  ['tomato', 'tomato', 'tomato', 'To', 'Tomato', 'An open-field vegetable for a fresh or processing market, worth a lot per hectare if a buyer is near.'],
  ['onion', 'onion', 'onion', 'On', 'Onion', 'A bulb vegetable that stores for months, a cash crop wherever a market can take it.'],
  ['cabbage', 'cabbage', 'cabbage', 'Cb', 'Cabbage', 'A cool-season vegetable that clubroot keeps away from other brassicas for years.'],
  ['chilli', 'chilli', 'chilli', 'Ch', 'Chilli & pepper', 'Hot and sweet peppers, fresh or dried: high value, high labour.'],
  ['watermelon', 'watermelon', 'watermelon', 'Wm', 'Watermelon', 'A warm-season fruit vegetable on sandy soils, perishable and sold close to the field.'],
  ['okra', 'okra', 'okra', 'Ok', 'Okra', 'A heat-loving vegetable of Africa and South Asia, picked every few days.'],
]
/** need a buyer, a mill, a curing company or livestock: off until the farmer switches them on (as potato, sugar beet) */
const CONTRACT = new Set(['yam', 'sugarcane', 'tobacco', 'castor', 'jute', 'vetch', 'silagemaize', 'grassley', 'foragesorghum', 'tomato', 'onion', 'cabbage', 'chilli', 'watermelon', 'okra'])
// yam joined them, as potato and sweet potato are: it grows from seed yams - about a third of a harvest goes
// back into the ground - and needs a fresh market; where nobody grows it there is neither
/** …and of those, the ones never switched on by themselves, even where the region grows them: forage needs a herd, and
 * the vegetables' economics are provisional until labour is modelled (market reach and open-field yields are, in
 * access.ts, rotation.ts GLASSHOUSE_IN_STATS) */
const OPT_IN = new Set(['tobacco', 'vetch', 'silagemaize', 'grassley', 'foragesorghum', 'tomato', 'onion', 'cabbage', 'chilli', 'watermelon', 'okra'])
// tobacco joined them: grown under licence for a leaf buyer, and on a country's FAOSTAT record alone it was
// the science pick in 18 of 169 development cells where farms grow none
/** what each contract crop needs (the page's note; forage keeps the engine's livestock note) */
const CONTRACT_WHY = {
  yam: 'Grows from seed yams - about a third of a harvest - and needs a fresh market nearby.',
  sugarcane: 'Needs a sugar mill within a day or two of the field.',
  tobacco: 'Grown under licence for a leaf buyer, with a curing barn.',
  castor: 'Needs a crusher contract: the seed holds ricin.',
  jute: 'Needs water to ret the stems and a fibre mill within reach.',
  tomato: 'Needs a fresh-market buyer or a cannery nearby, and hands at harvest.',
  onion: 'Needs a buyer and dry storage, and hands at harvest.',
  cabbage: 'Needs a fresh-market buyer nearby, and hands at harvest.',
  chilli: 'Needs a buyer or a drying yard, and hands for weeks of picking.',
  watermelon: 'Needs a fresh-market buyer within a few days of the field.',
  okra: 'Needs a fresh-market buyer nearby, and picking every few days.',
}
/** the engine's soil-borne disease links (crops.ts Disease) */
const DISEASES = { cabbage: ['clubroot'], silagemaize: ['rootworm'], grassley: ['take-all'], vetch: ['pea-rots'], bambara: ['pea-rots'], pigeonpea: [], tomato: [], chilli: [] }
const GROUP = { stimulant: 'fibre' } // the engine's groups: tobacco joins the non-food industrial crops
/** in-season rain (mm) above which foliar disease cuts the yield (crops.ts wetLimit; the older crops 250-450): assumed,
 *  for the two dry-climate crops whose humid-season diseases are their known limit - safflower (Alternaria, Botrytis;
 *  as linseed and faba bean, 400) and quinoa (downy mildew; as sunflower, 450). Both topped humid tropical cells. */
const WET_LIMIT = { safflower: 400, quinoa: 450 }

const q = (xs, p) => xs.length ? xs[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))] : null
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }
/** the older crops' reference prices of the cereals that set a country's price level, €/t (crops.ts) */
const CEREAL_REF = { wheat: 210, maize: 195, rice: 300, sorghum: 180, barley: 190 }
/** the reference price a crop's FAOSTAT prices imply on the older crops' basis (see the header); `self` is left out of
 * the cereal level when checking a cereal against itself */
function impliedPrice(k, self = '') {
  const rows = []
  for (const [iso, v] of Object.entries(M.prices)) {
    const xs = v[k]
    if (!xs) continue
    const per = []
    for (let y = 0; y < xs.length; y++) {
      if (!(xs[y] > 0)) continue
      const level = Object.keys(CEREAL_REF).filter((c) => c !== self && v[c]?.[y] > 0).map((c) => v[c][y] / CEREAL_REF[c])
      if (level.length) per.push(xs[y] / (level.reduce((a, b) => a + b, 0) / level.length))
    }
    const prod = M.trade[iso]?.[k]?.[0] ?? 0
    if (per.length && prod > 0) rows.push([median(per.slice(-5)), Math.sqrt(prod)])
  }
  rows.sort((a, b) => a[0] - b[0])
  const total = rows.reduce((a, r) => a + r[1], 0)
  let cum = 0
  for (const r of rows) if ((cum += r[1]) >= total / 2) return { price: r[0], n: rows.length }
  return { price: null, n: rows.length }
}
const nationalYields = (k) => Object.values(M.yields).map((v) => v[k]).filter((x) => x > 0).sort((a, b) => a - b)
const YIELD_P = 0.95
const COST_SHARE = [0.31, 0.72] // cost / gross of the older crops (wheat 0.48, soybean 0.31, sweet potato 0.72)

if (process.argv.includes('--check')) {
  // the method against the older crops' references (crops.ts): price and yield
  const OLD = { wheat: [7.5, 210], barley: [6.8, 190], rye: [6, 175], maize: [12.5, 195], sorghum: [6.5, 180], sunflower: [3.4, 440], rapeseed: [3.8, 460], soybean: [4, 420], pea: [3.8, 280], lupin: [3, 300], sugarbeet: [85, 40], potato: [50, 170], oats: [5.3, 190], triticale: [6.4, 180], faba: [4.1, 280], lentil: [1.9, 650], chickpea: [2.1, 650], buckwheat: [1.7, 500], millet: [3, 300], linseed: [2.3, 520], rice: [7, 300], cassava: [25, 60], sweetpotato: [25, 250], groundnut: [4, 500], cowpea: [1.8, 550], drybean: [2.5, 750], cotton: [3.5, 600] }
  const pe = [], ye = []
  for (const [k, [y, p]] of Object.entries(OLD)) {
    const ip = impliedPrice(k, k).price, iy = q(nationalYields(k), YIELD_P)
    if (ip) pe.push(Math.abs(Math.log(ip / p)))
    if (iy) ye.push(Math.abs(Math.log(iy / y)))
    console.log(`  ${k.padEnd(12)} price ${String(p).padStart(4)} → ${String(Math.round(ip)).padStart(4)}   yield ${String(y).padStart(5)} → ${iy}`)
  }
  const m = (e) => `${Math.round((Math.exp(median(e)) - 1) * 100)} %`
  console.log(`median error: price ${m(pe)} (${pe.length} crops), yield ${m(ye)} (${ye.length} crops)`)
  process.exit(0)
}
const r2 = (x) => Math.round(x * 100) / 100
const str = (s) => JSON.stringify(String(s ?? ''))

const specs = []
const tables = { tCrit: {}, minSowT: {}, frostTender: [], nResidual: {}, residue: {}, gaezCrop: {}, heatGroup: {}, contract: [], optIn: [], econSource: {} }
CROPS.forEach(([id, rid, mkey, symbol, name, blurb], i) => {
  const c = R[rid]
  if (!c) throw new Error(`no research row for ${rid}`)
  const group = GROUP[c.group] ?? c.group
  const ys = nationalYields(mkey)
  const { price: implied, n } = impliedPrice(mkey)
  const yieldRef = ys.length >= 5 ? r2(q(ys, YIELD_P)) : c.econ.yield
  const price = implied != null && n >= 3 ? implied : c.econ.price
  const gross = yieldRef * price
  const share = c.econ.cost / gross
  const cost = Math.round(Math.min(COST_SHARE[1], Math.max(COST_SHARE[0], share)) * gross / 10) * 10
  tables.econSource[id] = [
    implied != null && n >= 3 ? `FAOSTAT price on the reference basis, ${n} countries${n < 10 ? ' (few)' : ''}` : 'price assumed (research table)',
    ys.length >= 5 ? `yield P95 of ${ys.length} national yields${OPT_IN.has(id) && group === 'vegetable' ? ' (protected cultivation included)' : ''}` : 'yield assumed (research table)',
    share < COST_SHARE[0] || share > COST_SHARE[1]
      ? `cost assumed: research ${c.econ.cost} €/ha is ${share.toFixed(2)} of gross, moved to the older crops' ${share < COST_SHARE[0] ? 'lowest' : 'highest'} share ${share < COST_SHARE[0] ? COST_SHARE[0] : COST_SHARE[1]}`
      : 'cost assumed (research table)',
  ].join('; ')
  const sow = c.fao?.sow?.[0] ?? c.sow ?? 4
  const heatMonth = c.heatMonthOffset != null && c.tMax != null ? ((Math.round(sow - 1 + c.heatMonthOffset) % 12) + 12) % 12 + 1 : null
  const heatGroup = GAEZ_OWN[id]?.heat ?? (c.gaez?.heat?.reuse ? { temperate: c.gaez.heat.reuse } : null)
  const gddNeed = heatGroup ? 0 : c.perennial ? 0 : 1800 // no GAEZ heat row → the degree-day rule (assumed)
  const spec = {
    id, n: 31 + i, symbol, name, latin: c.latin, family: c.family, group,
    ...(c.fao && !c.perennial ? { fao: c.fao } : { kc: c.kcMonthly, sow }),
    ...(c.perennial ? { perennial: true } : {}),
    rootDepth: c.rootDepth, p: c.p, ky: c.ky, ...(c.kyAssumed ? { kyAssumed: true } : {}), gddNeed,
    heat: heatMonth ? { month: heatMonth, tMax: c.tMax } : null,
    nFix: c.nFix ?? 0, nDemand: c.nDemand ?? 0, carbon: c.carbon, coverGap: c.coverGap, minBreak: c.minBreak, maxRun: c.maxRun,
    diseases: DISEASES[id] ?? [], econ: { yield: yieldRef, price: Math.round(price), cost },
    ...(c.hardiness != null ? { hardiness: c.hardiness } : {}),
    ...(WET_LIMIT[id] ? { wetLimit: WET_LIMIT[id] } : {}),
    ...(CONTRACT.has(id) ? { contract: true } : {}),
    ...(CONTRACT_WHY[id] ? { contractWhy: CONTRACT_WHY[id] } : {}),
    blurb,
  }
  specs.push(spec)
  if (c.tCrit != null) tables.tCrit[id] = c.tCrit
  if (c.minSowT != null && !c.perennial) tables.minSowT[id] = c.minSowT
  if (c.frostTender) tables.frostTender.push(id)
  tables.nResidual[id] = c.nResidual ?? 30
  const res = c.residue ?? { dry: 0.9, slope: 1, intercept: 0.5, rbg: 0.22 }
  tables.residue[id] = { dry: res.dry, slope: res.slope, intercept: res.intercept, rbg: res.rbg, ...(group === 'root' ? { rootCrop: true } : {}), ref: /^IPCC/.test(String(res.ref ?? '')) ? 'IPCC 2006 (proxy)' : 'assumed' }
  tables.gaezCrop[id] = GAEZ_OWN[id]?.crop ?? c.gaez?.phGroup?.reuse ?? null
  if (heatGroup) tables.heatGroup[id] = heatGroup
  if (CONTRACT.has(id)) tables.contract.push(id)
  if (OPT_IN.has(id)) tables.optIn.push(id)
})

const ids = specs.map((s) => s.id)
const out = `// GENERATED by scripts/crops-extra.mjs - do not edit; change docs/audit/new-crops.json or the generator.
// The crops added by the all-crops plan. Agronomy: docs/audit/new-crops.md (a source per value; FAO-56
// stage lengths, Kc, rooting depth and p checked against the tables; temperatures, nitrogen and costs assumed). GAEZ
// rates few of these crops: where it does not, the nearest crop it does stands in (named below) - a weak point.
// Economics: FAOSTAT prices on the older crops' reference basis and the P95 national yield where FAOSTAT has the crop
// (method and its check against the older crops: the generator's header); costs and forage all assumed.
/* eslint-disable */

export const EXTRA_IDS = ${JSON.stringify(ids)} as const
export type ExtraId = (typeof EXTRA_IDS)[number]

/** Crop specs in the shape of crops.ts CropSpec (colour, monthly Kc and sowing month are derived there). */
export const EXTRA_SPECS = ${JSON.stringify(specs, null, 1)} as const

/** where each crop's reference price and yield come from */
export const EXTRA_ECON_SOURCE: Record<ExtraId, string> = ${JSON.stringify(tables.econSource, null, 1)}
export const EXTRA_T_CRIT: Partial<Record<ExtraId, number>> = ${JSON.stringify(tables.tCrit)}
export const EXTRA_MIN_SOW_T: Partial<Record<ExtraId, number>> = ${JSON.stringify(tables.minSowT)}
export const EXTRA_FROST_TENDER: ExtraId[] = ${JSON.stringify(tables.frostTender)}
export const EXTRA_N_RESIDUAL: Record<ExtraId, number> = ${JSON.stringify(tables.nResidual)}
export const EXTRA_RESIDUE: Record<ExtraId, { dry: number; slope: number; intercept: number; rbg: number; rootCrop?: boolean; ref: 'IPCC 2006 (proxy)' | 'assumed' }> = ${JSON.stringify(tables.residue, null, 1)}
/** GAEZ v4 crop whose pH and texture ratings apply: its own row where GAEZ rates the crop, else the nearest crop's */
export const EXTRA_GAEZ_CROP: Record<ExtraId, string | null> = ${JSON.stringify(tables.gaezCrop)}
/** GAEZ v4 heat-unit cultivar groups: the crop's own where GAEZ rates it, else the nearest crop's */
export const EXTRA_HEAT_GROUP: Partial<Record<ExtraId, { temperate: string; tropical?: string }>> = ${JSON.stringify(tables.heatGroup)}
/** off until the farmer switches them on: a buyer, mill, curing company or livestock is needed */
export const EXTRA_CONTRACT: ExtraId[] = ${JSON.stringify(tables.contract)}
/** never switched on by themselves, even where the region grows them: forage needs a herd; vegetable economics are
 * provisional until labour is modelled (a fresh crop's market reach and open-field yields: access.ts, rotation.ts) */
export const EXTRA_OPT_IN: ExtraId[] = ${JSON.stringify(tables.optIn)}
`
writeFileSync('src/lib/cropsExtra.ts', out)
console.log(`src/lib/cropsExtra.ts: ${ids.length} crops`)
for (const s of specs) console.log(`  ${s.id.padEnd(13)} yield ${String(s.econ.yield).padStart(6)} t/ha · price ${String(s.econ.price).padStart(5)} €/t · cost ${String(s.econ.cost).padStart(5)} · gross ${String(Math.round(s.econ.yield * s.econ.price)).padStart(5)} €/ha · ${tables.econSource[s.id]}${OPT_IN.has(s.id) ? ' · opt-in' : s.contract ? ' · contract' : ''}`)

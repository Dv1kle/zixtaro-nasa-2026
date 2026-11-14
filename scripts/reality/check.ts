// Reality check: does Zixtaro rank high what the farms around each demo field actually grow?
// Areas: USDA Cropland Data Layer county stats (CropScape, 2021–23) and Argentina MAGyP department estimates.
// Run: npx tsx scripts/reality/check.ts   (paths resolve from this file, so run it unbundled)
// Does Zixtaro rank high what thousands of farms around the demo field actually grow?
import { readFileSync } from 'node:fs'
import { analyzeClimate, parsePowerMonthly } from '../../src/lib/climate'
import { averageProfiles, parseSoilGrids } from '../../src/lib/soil'
import { allCropRisks } from '../../src/lib/water'
import { rankNext } from '../../src/lib/rotation'
import { CROPS } from '../../src/lib/crops'
import { buildMarket } from '../../src/lib/marketProfit'
import { observedYield } from '../../src/lib/markets'
import type { SeaMatrix } from '../../src/lib/logistics'
import { spearman } from '../../src/lib/stats'
const P = new URL('../../public/data/presets/', import.meta.url).pathname.replace(/%20/g, ' ')
const SEA = JSON.parse(readFileSync(new URL('../../public/data/markets/sea.json', import.meta.url).pathname.replace(/%20/g, ' '), 'utf8')) as SeaMatrix
const S = new URL('./', import.meta.url).pathname.replace(/%20/g, ' ') // CDL CSVs here; est.csv = MAGyP estimaciones-agricolas (see scripts/yields.py)
const CDL: Record<string, string> = { Corn: 'maize', Soybeans: 'soybean', 'Winter Wheat': 'wheat', Sorghum: 'sorghum', Sunflowers: 'sunflower', Barley: 'barley', Rye: 'rye', Oats: 'oats', Canola: 'rapeseed', Peas: 'pea', Lentils: 'lentil', Chickpeas: 'chickpea', Potatoes: 'potato', Sugarbeets: 'sugarbeet', Flaxseed: 'linseed', Millet: 'millet', Buckwheat: 'buckwheat', Triticale: 'triticale' }
const MAGYP: Record<string, string> = { 'maíz': 'maize', 'soja total': 'soybean', 'trigo total': 'wheat', girasol: 'sunflower', sorgo: 'sorghum', 'cebada total': 'barley', avena: 'oats', centeno: 'rye', colza: 'rapeseed', arveja: 'pea', lenteja: 'lentil', garbanzo: 'chickpea', 'papa total': 'potato', mijo: 'millet', lino: 'linseed' }
function cdlShares(fips: string) {
  const acc: Record<string, number> = {}
  for (const y of [2021, 2022, 2023]) for (const line of readFileSync(`${S}cdl_${fips}_${y}.csv`, 'utf8').split('\n').slice(1)) {
    const [, cat, , ac] = line.split(',').map((x) => x.trim())
    if (CDL[cat]) acc[CDL[cat]] = (acc[CDL[cat]] ?? 0) + Number(ac)
  }
  return acc
}
function magypShares() {
  const acc: Record<string, number> = {}
  for (const line of readFileSync(`${S}est.csv`, 'utf8').split('\n')) {
    const c = line.split('","').map((x) => x.replace(/"/g, ''))
    if (c[5] !== 'Pergamino' || !MAGYP[c[0]] || !['2021/2022', '2022/2023', '2023/2024'].includes(c[2])) continue
    acc[MAGYP[c[0]]] = (acc[MAGYP[c[0]]] ?? 0) + Number(c[7] || 0)
  }
  return acc
}
const TAGS = ['before', 'yields', 'after'] as const
const rhos: Record<(typeof TAGS)[number], number[]> = { before: [], yields: [], after: [] }
function run(id: string, lat: number, lon: number, shares: Record<string, number>, irrigated: boolean, label: string, home: string) {
  const b = JSON.parse(readFileSync(`${P}${id}.json`, 'utf8'))
  const climate = analyzeClimate(parsePowerMonthly(b.power, lat), lat, lon)
  const profiles = b.soil.map((r: never) => { try { return parseSoilGrids(r) } catch { return null } }).filter(Boolean)
  const soil = averageProfiles(profiles, b.samples?.length === profiles.length ? b.samples : profiles.map(() => ({ lat, lon })))
  const ctx = { risks: allCropRisks(climate, soil), soil, stressYear: null, irrigated, drying: climate.signal.drying, slopePct: 1, recentLabel: '', baselineLabel: '' }
  // the same field priced at the reference prices (before) and at its own market, auto mode (after)
  const market = buildMarket({ origin: [lon, lat], home, mode: { kind: 'auto' }, crops: CROPS.map((c) => c.id), sea: SEA })
  const yieldRef = Object.fromEntries(CROPS.map((c) => [c.id, observedYield(home, c.id)]).filter(([, y]) => y))
  console.log(`\n${label}`)
  // before: reference yields and prices · yields: the country's observed yields · after: observed yields + own market
  for (const [tag, extra] of [['before', {}], ['yields', { yieldRef }], ['after', { yieldRef, market }]] as const) {
    // no field history (so rotation rules don't decide) and even priorities: pure climate + soil + money
    const ranking = rankNext([], { ...ctx, ...extra } as never, { soil: 60, water: 60, profit: 60 }, new Set(['clover', 'cover'] as never[]))
    const top5 = ranking.slice(0, 5).map((e) => e.crop.id)
    if (!Object.keys(shares).length) {
      console.log(`  ${tag}: top-5 = ${top5.join(', ')}`)
      continue
    }
    const total = Object.values(shares).reduce((a, b) => a + b, 0)
    const grown = Object.entries(shares).map(([c, a]) => [c, a / total] as const).filter(([, s]) => s >= 0.005).sort((a, b) => b[1] - a[1])
    const rankOf = (c: string) => ranking.findIndex((e) => e.crop.id === c) + 1
    const inTop5 = grown.slice(0, 3).filter(([c]) => top5.includes(c as never)).length
    const both = grown.filter(([c]) => rankOf(c) > 0)
    const rho = both.length >= 4 ? spearman(both.map(([, s]) => s), both.map(([c]) => ranking[rankOf(c) - 1].score)).rho : NaN
    if (!Number.isNaN(rho)) rhos[tag].push(rho)
    console.log(`  ${tag}: top-5 = ${top5.join(', ')}`)
    console.log(`    grown (area share → rank of ${ranking.length}): ` + grown.map(([c, s]) => `${c} ${(s * 100).toFixed(0)}% → #${rankOf(c)}`).join(' · '))
    console.log(`    biggest 3 in top 5: ${inTop5}/3 · Spearman(area, score) over ${both.length} crops = ${Number.isNaN(rho) ? 'n/a' : rho.toFixed(2)}`)
  }
}
run('iowa', 42.03, -93.47, cdlShares('19169'), false, 'Story County, Iowa (USDA CDL 2021–23)', 'USA')
run('kansas', 37.98, -100.87, cdlShares('20055'), false, 'Finney County, Kansas — rainfed (USDA CDL 2021–23)', 'USA')
run('kansas', 37.98, -100.87, cdlShares('20055'), true, 'Finney County, Kansas — irrigated', 'USA')
run('pergamino', -33.955, -60.634, magypShares(), false, 'Pergamino, Argentina (MAGyP 2021/22–2023/24)', 'ARG')
run('torgau', 51.52, 13.05, {}, false, 'Torgau, Saxony (no area record here; top-5 only)', 'DEU')
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
console.log(`\nmean Spearman ρ: before ${mean(rhos.before).toFixed(2)} · observed yields ${mean(rhos.yields).toFixed(2)} · + market ${mean(rhos.after).toFixed(2)}`)

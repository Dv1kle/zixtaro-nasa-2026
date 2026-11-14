// "Checked against real glasshouses": runs the app's own greenhouse model in the main glasshouse region of nine EU
// countries on NASA POWER weather and compares the kilos with what those countries report to Eurostat (apro_cpsh1,
// "under glass or high accessible cover", median of 2015–2024).
//
//  • dev: the Netherlands (heated glass) sets each crop's light-use efficiency; Spain (unheated plastic) sets the
//    yield factor of unheated houses. Run with --calibrate to print the values to copy into greenhouse.ts.
//  • test: Belgium (heated) and Italy, Greece and Portugal (unheated) are not used to fit anything — their errors
//    are the honest ones. Germany, Poland and France report glass and simple tunnels together, so a heated glasshouse
//    is only an upper bound there ("mixed").
//  • Andalusia's price observatory adds a crop Eurostat does not split out: aubergine in Almería, 15 kg/m².
//
//   node scripts/ghvalidate.mjs [--calibrate]
//
// Writes src/data/ghvalidation.json. NASA POWER responses are cached in node_modules/.cache/zixtaro-ghvalidate.

import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const cacheDir = new URL('node_modules/.cache/zixtaro-ghvalidate/', root)
await mkdir(cacheDir, { recursive: true })
const bundle = new URL('model.mjs', cacheDir)
await build({
  stdin: {
    contents: `
      export { parsePowerMonthly, analyzeClimate } from './src/lib/climate'
      export { greenhouseModel, planOf, GH_CROP_BY_ID, LOW_TECH } from './src/lib/greenhouse'
      export { glassYields } from './src/lib/ghMarket'
      export { powerUrl } from './src/lib/sources'
    `,
    resolveDir: fileURLToPath(root),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: fileURLToPath(bundle),
  logLevel: 'warning',
  define: { 'import.meta.env.BASE_URL': '"/"' },
})
const m = await import(`${bundle.href}?t=${Date.now()}`)
const calibrate = process.argv.includes('--calibrate')

const HEATED = { cover: 'glass', floorM2: 10000, heated: true, lit: false, screen: true, co2: true }
const UNHEATED = { cover: 'film', floorM2: 10000, heated: false, lit: false, screen: false, co2: false }
// The glasshouse heart of each country. Strawberries under cover are heated glass only in the Netherlands and Belgium;
// elsewhere they are tunnels.
const SITES = [
  { country: 'NL', name: 'Westland', lat: 52.0, lon: 4.2, house: HEATED, role: 'dev' },
  { country: 'BE', name: 'Sint-Katelijne-Waver', lat: 51.07, lon: 4.53, house: HEATED, role: 'test' },
  { country: 'DE', name: 'Straelen, Lower Rhine', lat: 51.44, lon: 6.26, house: HEATED, role: 'mixed', tunnel: ['strawberry'] },
  { country: 'PL', name: 'Grójec, Masovia', lat: 51.87, lon: 20.87, house: HEATED, role: 'mixed', tunnel: ['strawberry'] },
  { country: 'FR', name: 'Nantes', lat: 47.22, lon: -1.55, house: HEATED, role: 'mixed', tunnel: ['strawberry'] },
  { country: 'ES', name: 'El Ejido, Almería', lat: 36.77, lon: -2.81, house: UNHEATED, role: 'dev' },
  { country: 'IT', name: 'Vittoria, Ragusa', lat: 36.95, lon: 14.53, house: UNHEATED, role: 'test' },
  { country: 'EL', name: 'Ierapetra, Crete', lat: 35.01, lon: 25.74, house: UNHEATED, role: 'test' },
  { country: 'PT', name: 'Oeste', lat: 39.35, lon: -9.18, house: UNHEATED, role: 'test' },
]
// Lettuce statistics count one or two winter crops a year, not a house full of lettuce: not comparable.
const CROPS = ['tomato', 'cucumber', 'pepper', 'strawberry']
const PRICES = { heat: 0.05, power: 0.18, level: 1 }

async function power(site) {
  const f = new URL(`power-${site.lat}-${site.lon}.json`, cacheDir)
  try {
    return JSON.parse(await readFile(f, 'utf8'))
  } catch {
    for (const end of [2025, 2024]) {
      const r = await fetch(m.powerUrl(site.lat, site.lon, end))
      if (!r.ok) continue
      const json = await r.json()
      if (!json.properties?.parameter) continue
      await writeFile(f, JSON.stringify(json.properties.parameter))
      return json.properties.parameter
    }
    throw new Error(`NASA POWER failed for ${site.name}`)
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN
}

/** What a grower following local practice harvests: the longest run the house allows, started where it yields most. */
function practiceYield(climate, house, crop) {
  const r = m.greenhouseModel(climate, { ...house, crop }, PRICES)
  const on = r.months.map((x) => x.active)
  let longest = 0
  for (let s = 0; s < 12; s++) {
    let len = 0
    while (len < 12 && on[(s + len) % 12]) len++
    longest = Math.max(longest, len)
  }
  const lag = m.GH_CROP_BY_ID[crop].lag
  if (longest < lag + 1) return { kg: 0, months: 0 }
  let best = { kg: 0, months: 0 }
  for (let s = 0; s < 12; s++) {
    if (!r.months.every((_, k) => k >= longest || on[(s + k) % 12])) continue
    const p = m.planOf(r.months, s, longest, lag)
    if (p.yieldKg > best.kg) best = { kg: p.yieldKg, months: longest - lag }
  }
  return best
}

// Eurostat's tomato counts every type, and cherry and cocktail tomatoes yield far fewer kilos than round and truss ones (the
// Dutch average of all types was 48 kg/m² in 2013 against 60-65 on specialised large-truss farms, LEI report 2016-068).
// The model's tomato sells at round and truss prices (DG AGRI), so its light-use is set on the round and truss yield.
const TARGET = {
  NL: { tomato: { kg: 62.5, source: 'Eurostat counts all tomato types; the model’s tomato is round and truss, calibrated on Dutch farm accounts: 60-65 kg/m² (LEI report 2016-068, specialised farms 2012-2014)' } },
  BE: { tomato: { source: 'Eurostat counts all tomato types; Flemish farm accounts (Landbouwmonitoringsnetwerk 2014-2018, mostly loose tomatoes) report 56.4 kg/m²' } },
}

// crops Eurostat does not split out under glass, from a regional survey
const EXTRA = [{ country: 'ES', crop: 'eggplant', reported: 15, source: 'Observatorio de Precios y Mercados, Junta de Andalucía: greenhouse aubergine, Almería, 2019/20 and 2024/25' }]

const sites = []
for (const site of SITES) {
  const raw = await power(site)
  const climate = m.analyzeClimate(m.parsePowerMonthly(raw, site.lat), site.lat, site.lon)
  const checks = []
  for (const crop of CROPS) {
    const rows = m.glassYields(site.country, crop).filter((x) => x.year >= 2015 && x.year <= 2024 && x.kgM2 > 0.3)
    if (rows.length < 3) continue
    const house = site.tunnel?.includes(crop) ? UNHEATED : site.house
    const model = practiceYield(climate, house, crop)
    const reported = median(rows.map((x) => x.kgM2))
    const ha = median(rows.map((x) => x.ha))
    const target = TARGET[site.country]?.[crop]
    checks.push({ crop, house: house.heated ? 'heated glass' : 'unheated plastic', model: Math.round(model.kg * 10) / 10, harvestMonths: model.months, reported: Math.round(reported * 10) / 10, years: rows.length, ha: Math.round(ha), ratio: Math.round((model.kg / reported) * 100) / 100, ...(target && { target: target.kg, source: target.source }) })
  }
  for (const x of EXTRA.filter((e) => e.country === site.country)) {
    const model = practiceYield(climate, site.house, x.crop)
    checks.push({ crop: x.crop, house: site.house.heated ? 'heated glass' : 'unheated plastic', model: Math.round(model.kg * 10) / 10, harvestMonths: model.months, reported: x.reported, years: 2, ha: null, ratio: Math.round((model.kg / x.reported) * 100) / 100, source: x.source })
  }
  sites.push({ ...site, house: site.house.heated ? 'heated glass' : 'unheated plastic', checks })
  console.log(`${site.role} ${site.country} ${site.name.padEnd(22)} ${checks.map((c) => `${c.crop} ${c.model}/${c.reported} (${c.ratio})`).join('  ')}`)
}

if (calibrate) {
  const nl = sites.find((s) => s.country === 'NL')
  console.log('\nlight-use efficiency to set (heated glass, the Netherlands):')
  for (const c of nl.checks) {
    const ratio = c.target ? c.model / c.target : c.ratio
    console.log(`  ${c.crop}: ${m.GH_CROP_BY_ID[c.crop].lue} × ${(1 / ratio).toFixed(3)} = ${(m.GH_CROP_BY_ID[c.crop].lue / ratio).toFixed(5)}${c.target ? ` (on ${c.target} kg/m², not Eurostat)` : ''}`)
  }
  const es = sites.find((s) => s.country === 'ES')
  console.log('unheated yield factor per crop (Spain):')
  for (const c of es.checks) console.log(`  ${c.crop}: ${m.GH_CROP_BY_ID[c.crop].low} × ${(1 / c.ratio).toFixed(3)} = ${(m.GH_CROP_BY_ID[c.crop].low / c.ratio).toFixed(3)}`)
}

const test = sites.filter((s) => s.role === 'test').flatMap((s) => s.checks)
const err = test.map((c) => Math.abs(Math.log(c.ratio)))
const summary = {
  tests: test.length,
  medianRatio: Math.round(median(test.map((c) => c.ratio)) * 100) / 100,
  within25: test.filter((c) => c.ratio >= 0.75 && c.ratio <= 1.25).length,
  within50: test.filter((c) => c.ratio >= 0.5 && c.ratio <= 1.5).length,
  medianAbsLogError: Math.round(median(err) * 100) / 100,
}
console.log('\ntest:', JSON.stringify(summary))
await writeFile(
  new URL('src/data/ghvalidation.json', root),
  JSON.stringify({
    source: 'Eurostat apro_cpsh1 (under glass or high accessible cover), median 2015-2024; model: NASA POWER monthly 1981-now, the longest season the house allows',
    calibrated: { heated: 'NL light-use efficiency per crop', unheated: 'ES yield factor per crop (aubergine from the Andalusian survey)' },
    sites,
    summary,
  }, null, 1),
)
console.log('wrote src/data/ghvalidation.json')

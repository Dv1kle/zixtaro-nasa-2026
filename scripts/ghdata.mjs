// Greenhouse market, harvest and energy records from open EU statistics, baked into src/data/greenhouse.json.
//
//   • Crop prices — DG AGRI fruit & vegetable supply-chain prices, weekly or monthly per member state since 2015
//     (https://api.tech.ec.europa.eu/agrifood, "pricesSupplyChain"): the farm-gate price where a country reports
//     it, else the packing-station ("ex-packaging") price.
//   • Harvests under glass — Eurostat apro_cpsh1: area and production "under glass or high accessible cover" per
//     country and crop; kg per m² = production / area.
//   • Energy for businesses — Eurostat nrg_pc_203 (natural gas, band I3: 10 000–99 999 GJ a year) and nrg_pc_205
//     (electricity, band IC: 500–1 999 MWh a year), half-yearly, excluding VAT and recoverable taxes.
//
//   node scripts/ghdata.mjs
//   node scripts/ghdata.mjs --offline   (rebuilds the curves from public/data/greenhouse-raw.json, no downloads)
//
// No keys, no logins. Re-run to refresh; the file records when it was fetched.

import { readFile, writeFile } from 'node:fs/promises'

const AGRI = 'https://api.tech.ec.europa.eu/agrifood/api/fruitAndVegetable/pricesSupplyChain'
const ESTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data'
const YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i)
const MARKETS = ['ES', 'IT', 'NL', 'PT', 'EL', 'BE', 'FR', 'DE', 'PL', 'HU', 'RO', 'BG', 'HR', 'CY', 'AT']
// --offline: the record fetched last time, so a change to how the curves are built does not refetch (and move) the data
const RAW = process.argv.includes('--offline') ? JSON.parse(await readFile(new URL('../public/data/greenhouse-raw.json', import.meta.url), 'utf8')) : null
const fetched = RAW?.fetched ?? new Date().toISOString().slice(0, 10)
const PRODUCTS = ['tomatoes', 'cucumbers', 'peppers', 'egg plants', 'courgettes', 'lettuces', 'strawberries']
// DG AGRI variety → the crop it prices in the greenhouse model
const VARIETY = {
  'Tomatoes - Round': 'tomato',
  'Tomatoes - Trusses=Vine/"Grappes"': 'tomato',
  'Tomatoes - Cherry/Special': 'cherry',
  'Cucumbers - All types and varieties': 'cucumber',
  'Peppers - All types and varieties': 'pepper',
  'Egg Plants - All types and varieties': 'eggplant',
  'Courgettes - All types and varieties': 'courgette',
  'Lettuces - All types and varieties': 'lettuce',
  'Strawberries - All types and varieties': 'strawberry',
}
// Eurostat crop codes "under glass or high accessible cover"
const GLASS = { V3100S: 'tomato', V3200S: 'cucumber', V3600S: 'pepper', V2300S: 'lettuce', S0000S: 'strawberry' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } })
      const text = await r.text()
      const json = JSON.parse(text)
      return json
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url}: ${e.message}`)
      await sleep(1500 * (i + 1))
    }
  }
}

// ---------- crop prices ----------
const dmy = (s) => {
  const [d, m, y] = s.split('/').map(Number)
  return Date.UTC(y, m - 1, d)
}
const monthOf = (r) => {
  const mid = new Date((dmy(r.beginDate) + dmy(r.endDate)) / 2)
  return `${mid.getUTCFullYear()}-${String(mid.getUTCMonth() + 1).padStart(2, '0')}`
}
const perKg = (r) => {
  const v = Number(String(r.price).replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(v) || v <= 0) return null
  if (r.unit === '€/100Kg') return v / 100
  if (r.unit === '€/Kg' || r.unit === '€/kg') return v
  return null // per-piece units are skipped (and counted below)
}

const series = new Map() // `${crop}|${ms}|${variety}|${stage}` → { weeks: Map(month → [€/kg]), months: Map(month → [€/kg]) }
const skippedUnits = new Map()
for (const ms of RAW ? [] : MARKETS) {
  for (const product of PRODUCTS) {
    const url = `${AGRI}?memberStateCodes=${ms}&products=${encodeURIComponent(product)}&years=${YEARS.join(',')}`
    let rows
    try {
      rows = await get(url)
    } catch (e) {
      console.warn('  skip', ms, product, e.message.slice(0, 80))
      continue
    }
    // "no results" answers come back as an object; anything else (a rate limit, a server error) is retried once
    if (!Array.isArray(rows) && rows?.status !== '404') {
      // the portal throttles bursts ("Message throttled out"): back off and try again a few times
      for (let wait = 20_000; wait <= 80_000 && !Array.isArray(rows); wait *= 2) {
        console.warn(`  throttled on ${ms} ${product}: waiting ${wait / 1000} s`)
        await sleep(wait)
        rows = await get(url).catch(() => null)
      }
    }
    if (!Array.isArray(rows)) continue
    let kept = 0
    for (const r of rows) {
      const crop = VARIETY[r.variety]
      if (!crop) continue
      const stage = r.productStage.startsWith('Farmgate') ? 'farmgate' : r.productStage.startsWith('Ex-packaging') ? 'expack' : null
      if (!stage || (r.periodType !== 'Week' && r.periodType !== 'Month')) continue
      const v = perKg(r)
      if (v === null) {
        skippedUnits.set(`${crop} ${r.unit}`, (skippedUnits.get(`${crop} ${r.unit}`) ?? 0) + 1)
        continue
      }
      const key = `${crop}|${ms}|${r.variety}|${stage}`
      if (!series.has(key)) series.set(key, { weeks: new Map(), months: new Map() })
      const s = series.get(key)
      const bucket = r.periodType === 'Week' ? s.weeks : s.months
      const m = monthOf(r)
      if (!bucket.has(m)) bucket.set(m, [])
      bucket.get(m).push(v)
      kept++
    }
    if (kept) console.log(`  ${ms} ${product}: ${kept} prices`)
    await sleep(1200)
  }
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d
// monthly € per kg: weekly means where a month has weeks, else the monthly figure
const priceSeries = RAW?.prices ?? [...series].map(([key, s]) => {
  const [crop, ms, variety, stage] = key.split('|')
  const months = new Set([...s.weeks.keys(), ...s.months.keys()])
  const monthly = {}
  for (const m of [...months].sort()) monthly[m] = round(mean(s.weeks.get(m) ?? s.months.get(m)))
  return { crop, ms, variety, stage, monthly }
}).filter((s) => Object.keys(s.monthly).length >= 12)
console.log(`${priceSeries.length} price series; per-piece prices skipped:`, Object.fromEntries(skippedUnits))

// ---------- harvests under glass ----------
function unpack(d) {
  // JSON-stat 2.0 → [{ dim: code, …, value }]
  const dims = d.id
  const codes = dims.map((k) => Object.entries(d.dimension[k].category.index).sort((a, b) => a[1] - b[1]).map(([c]) => c))
  const out = []
  for (const [i, v] of Object.entries(d.value)) {
    let rest = Number(i)
    const rec = {}
    for (let k = dims.length - 1; k >= 0; k--) {
      const n = d.size[k]
      rec[dims[k]] = codes[k][rest % n]
      rest = Math.floor(rest / n)
    }
    rec.value = v
    out.push(rec)
  }
  return out
}
const glassUrl = `${ESTAT}/apro_cpsh1?${Object.keys(GLASS).map((c) => `crops=${c}`).join('&')}&strucpro=AR_THS_HA&strucpro=HPRD_HUMD_EU_THS_T&sinceTimePeriod=2010`
const glassRows = RAW ? [] : unpack(await get(glassUrl))
const glass = {} // country → crop → year → { ha, t }
for (const r of glassRows) {
  const crop = GLASS[r.crops]
  const g = (glass[r.geo] ??= {})
  const c = (g[crop] ??= {})
  const y = (c[r.time] ??= {})
  if (r.strucpro === 'AR_THS_HA') y.ha = r.value * 1000
  else y.t = r.value * 1000
}
const harvests = RAW?.harvests ?? {}
for (const [geo, crops] of Object.entries(glass)) {
  if (geo.startsWith('EU')) continue
  for (const [crop, years] of Object.entries(crops)) {
    const rows = Object.entries(years)
      .filter(([, v]) => v.ha > 0 && v.t > 0)
      .map(([y, v]) => ({ year: Number(y), ha: round(v.ha, 0), kgM2: round((v.t * 1000) / (v.ha * 10_000), 2) }))
      .sort((a, b) => a.year - b.year)
    if (rows.length) (harvests[geo] ??= {})[crop] = rows
  }
}
console.log(`harvests under glass: ${Object.keys(harvests).length} countries`)

// ---------- energy for businesses ----------
async function energy(dataset, band) {
  const url = `${ESTAT}/${dataset}?nrg_cons=${band}&tax=X_VAT&currency=EUR&unit=KWH&sinceTimePeriod=2015`
  const rows = unpack(await get(url))
  const out = {}
  for (const r of rows) {
    if (r.geo.startsWith('EU') || r.geo.startsWith('EA')) continue
    const [year, half] = r.time.split('-')
    ;((out[r.geo] ??= {})[year] ??= {})[half] = r.value
  }
  // yearly mean of the two halves (one half alone when the other is missing)
  const yearly = {}
  for (const [geo, years] of Object.entries(out)) {
    for (const [y, h] of Object.entries(years)) {
      const v = Object.values(h).filter((x) => x > 0)
      if (v.length) (yearly[geo] ??= {})[y] = round(mean(v), 4)
    }
  }
  return yearly
}
const gas = RAW?.gas ?? await energy('nrg_pc_203', 'GJ10000-99999')
const power = RAW?.power ?? await energy('nrg_pc_205', 'MWH500-1999')
console.log(`energy: gas ${Object.keys(gas).length} countries, electricity ${Object.keys(power).length}`)

// ---------- market price curves ----------
// Every price is taken at the packing station (reported everywhere) and turned into what the grower gets with a
// farm-gate factor per market: the median farm-gate / ex-packaging ratio over the months where a country reports both
// (packing and selling take a far bigger cut in Spain and Italy than on the Dutch and Belgian auctions).
const byKey = (crop, ms, variety, stage) => priceSeries.find((s) => s.crop === crop && s.ms === ms && s.variety === variety && s.stage === stage)
const NORTH_MS = ['NL', 'BE', 'DE', 'FR', 'PL', 'AT']
const ratiosFor = (countries) => {
  const out = []
  for (const s of priceSeries.filter((x) => x.stage === 'farmgate' && countries.includes(x.ms))) {
    const e = byKey(s.crop, s.ms, s.variety, 'expack')
    if (!e) continue
    const both = Object.keys(s.monthly).filter((m) => e.monthly[m] > 0 && s.monthly[m] > 0)
    if (both.length < 12) continue
    out.push({ ms: s.ms, variety: s.variety, r: mean(both.map((m) => s.monthly[m])) / mean(both.map((m) => e.monthly[m])) })
  }
  return out.sort((a, b) => a.r - b.r)
}
const medianOf = (xs) => xs[Math.floor(xs.length / 2)]?.r
const northPairs = ratiosFor(NORTH_MS)
const southPairs = ratiosFor(MARKETS.filter((m) => !NORTH_MS.includes(m)))
const FARMGATE = { north: round(medianOf(northPairs) ?? 0.9, 3), south: round(medianOf(southPairs) ?? 0.75, 3) }
console.log(`farm-gate factor north ${FARMGATE.north} (${northPairs.map((x) => `${x.ms} ${x.r.toFixed(2)}`).join(', ')})`)
console.log(`farm-gate factor south ${FARMGATE.south} (${southPairs.map((x) => `${x.ms} ${x.r.toFixed(2)}`).join(', ')})`)

const MONTH_KEYS = YEARS.flatMap((y) => Array.from({ length: 12 }, (_, m) => `${y}-${String(m + 1).padStart(2, '0')}`))
/** Month-by-month mean over the listed ex-packaging series (null where none reports), farm-gate equivalent. */
function pooled(crop, markets, factor, varieties = null) {
  const list = priceSeries.filter((s) => s.crop === crop && s.stage === 'expack' && markets.includes(s.ms) && (!varieties || varieties.includes(s.variety)))
  const out = {}
  for (const k of MONTH_KEYS) {
    const v = list.map((s) => s.monthly[k]).filter((x) => x > 0)
    out[k] = v.length ? mean(v) * factor : null
  }
  return { series: list.map((s) => `${s.ms} ${s.variety}`), monthly: out }
}
const CROPS = ['tomato', 'cherry', 'cucumber', 'pepper', 'eggplant', 'courgette', 'lettuce', 'strawberry']
const SOUTH = ['ES', 'IT']
const south = Object.fromEntries(CROPS.map((c) => [c, pooled(c, SOUTH, FARMGATE.south)]))
// The north: real series where they exist; otherwise the southern price × the northern tomato premium that month.
const tomNorth = pooled('tomato', ['NL', 'BE'], FARMGATE.north)
const premium = {}
const premiumByMonth = Array.from({ length: 12 }, () => [])
for (const k of MONTH_KEYS) {
  const n = tomNorth.monthly[k]
  const s = south.tomato.monthly[k]
  if (n && s) {
    premium[k] = n / s
    premiumByMonth[Number(k.slice(5)) - 1].push(n / s)
  }
}
const premiumTypical = premiumByMonth.map((xs) => (xs.length ? mean(xs) : 1))
const north = {
  tomato: tomNorth,
  cherry: pooled('cherry', ['NL'], FARMGATE.north),
  strawberry: pooled('strawberry', ['BE'], FARMGATE.north),
}
// Cucumber, pepper, aubergine and courgette have a Dutch premium of their own - 1.3-2 × the southern price in the
// summer months the Dutch crop is picked, where tomato's is 0.7-0.8 - but DG AGRI reports them in the Netherlands only
// in 2015-2019: the Dutch price where reported, else the southern one × the crop's mean Dutch premium for that calendar
// month (two or more years reporting both), else × the tomato premium. Lettuce keeps the tomato premium: its Dutch
// series (≈ €0.3/kg) reads like a price per head.
const OWN_DUTCH = ['cucumber', 'pepper', 'eggplant', 'courgette']
for (const c of CROPS.filter((c) => !north[c])) {
  const s = south[c]
  const nl = OWN_DUTCH.includes(c) ? pooled(c, ['NL'], FARMGATE.north) : null
  const own = Array.from({ length: 12 }, () => [])
  for (const k of MONTH_KEYS) if (nl?.monthly[k] && s.monthly[k]) own[Number(k.slice(5)) - 1].push(nl.monthly[k] / s.monthly[k])
  const ownTypical = own.map((xs) => (xs.length >= 2 ? mean(xs) : null))
  const monthly = {}
  for (const k of MONTH_KEYS) {
    const i = Number(k.slice(5)) - 1
    monthly[k] = nl?.monthly[k] ?? (s.monthly[k] === null ? null : s.monthly[k] * (ownTypical[i] ?? premium[k] ?? premiumTypical[i]))
  }
  north[c] = { series: nl ? [...nl.series, ...s.series, 'own Dutch premium'] : [...s.series, 'NL/BE tomato premium'], monthly }
}
/** years → 12 monthly € per kg (null = no reported price that month) */
const asYears = (m) =>
  Object.fromEntries(YEARS.map((y) => [y, Array.from({ length: 12 }, (_, i) => {
    const v = m.monthly[`${y}-${String(i + 1).padStart(2, '0')}`]
    return v === null || v === undefined ? null : round(v, 3)
  })]).filter(([, xs]) => xs.some((x) => x !== null)))
const market = (label, crops) => ({ label, crops: Object.fromEntries(Object.entries(crops).map(([c, m]) => [c, { series: m.series, years: asYears(m) }])) })

// harvests and energy: 2015 on, compact
const harvestsOut = {}
for (const [geo, crops] of Object.entries(harvests)) {
  for (const [crop, rows] of Object.entries(crops)) {
    const r = rows.filter((x) => x.year >= 2015)
    if (r.length) (harvestsOut[geo] ??= {})[crop] = r.map((x) => [x.year, x.ha, x.kgM2])
  }
}

const SOURCES = {
  prices: { url: 'https://agridata.ec.europa.eu/extensions/DashboardFruitAndVeg/FruitAndVegetablePrices.html', api: AGRI, note: 'DG AGRI fruit & vegetable supply-chain prices; € per kg, monthly means of weekly (else monthly) national averages' },
  harvests: { url: 'https://ec.europa.eu/eurostat/databrowser/view/apro_cpsh1/default/table', note: 'Eurostat apro_cpsh1, "under glass or high accessible cover": area (ha) and harvested production; kg/m² = production / area' },
  gas: { url: 'https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_203/default/table', note: 'Eurostat nrg_pc_203, natural gas for non-household consumers, band I3 (10 000-99 999 GJ/yr), excl. VAT and recoverable taxes, € per kWh (gross calorific value), yearly mean of the two halves' },
  power: { url: 'https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_205/default/table', note: 'Eurostat nrg_pc_205, electricity for non-household consumers, band IC (500-1 999 MWh/yr), excl. VAT and recoverable taxes, € per kWh, yearly mean of the two halves' },
}

const out = {
  fetched,
  sources: SOURCES,
  farmgate: { ...FARMGATE, pairs: { north: northPairs.length, south: southPairs.length } },
  markets: {
    south: market(`Spain & Italy (packing-station prices × ${FARMGATE.south} to farm gate)`, south),
    north: market(`Netherlands & Belgium tomatoes and strawberries (× ${FARMGATE.north} to farm gate); cucumber, pepper, aubergine and courgette at Dutch prices (2015-2019) or Spanish & Italian prices × their own Dutch premium; lettuce × the northern tomato premium`, north),
  },
  harvests: harvestsOut,
  gas,
  power,
}
await writeFile(new URL('../src/data/greenhouse.json', import.meta.url), JSON.stringify(out))
console.log('wrote src/data/greenhouse.json', (JSON.stringify(out).length / 1024).toFixed(0), 'KB')

const raw = {
  fetched,
  sources: SOURCES,
  prices: priceSeries,
  harvests,
  gas,
  power,
}
// the full record (every country and variety) stays out of the app bundle: public/data, fetched only by the Method page
await writeFile(new URL('../public/data/greenhouse-raw.json', import.meta.url), JSON.stringify(raw))
console.log('wrote public/data/greenhouse-raw.json', (JSON.stringify(raw).length / 1024).toFixed(0), 'KB')

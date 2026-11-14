// Bake the market tables into src/data/markets.json and public/data/markets/: countries, capitals (hubs),
// land-connected groups and simplified shapes (Natural Earth); producer prices, trade and production (FAOSTAT);
// price levels, applied tariffs and the euro rate (World Bank); sea distances between hubs (searoute).
// Run: node scripts/markets.mjs   (downloads ~300 MB once into node_modules/.cache/markets)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cleanPrices, officialYears, worldAndRegions } from './markets-clean.mjs'
import { FAO_ITEM, NO_MARKET, PROD_ITEM, SHELF_DAYS, TRADE_ITEM, UNIONS } from './markets-map.mjs'

const CACHE = 'node_modules/.cache/markets'
mkdirSync(CACHE, { recursive: true })
mkdirSync('public/data/markets', { recursive: true })
async function get(url, file) {
  const p = `${CACHE}/${file}`
  if (!existsSync(p)) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`${r.status} ${url}`)
    writeFileSync(p, Buffer.from(await r.arrayBuffer()))
  }
  return p
}
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'

// ---------- countries, hubs, land groups, shapes ----------

const adm = JSON.parse(readFileSync(await get(`${NE}ne_50m_admin_0_countries.geojson`, 'adm0.geojson'), 'utf8'))
const places = JSON.parse(readFileSync(await get(`${NE}ne_50m_populated_places_simple.geojson`, 'places.geojson'), 'utf8'))

// Natural Earth's short name, and its Russian, Ukrainian and German names; a few formal ones shortened
const SHORT = {
  USA: { en: 'United States', ru: 'США', uk: 'США', de: 'USA' },
  CHN: { ru: 'Китай', uk: 'Китай', de: 'China' },
  COD: { en: 'DR Congo', ru: 'ДР Конго', uk: 'ДР Конго', de: 'DR Kongo' },
  KOR: { ru: 'Южная Корея' },
}
const iso = (p) => (p.ISO_A3 !== '-99' ? p.ISO_A3 : p.ADM0_A3) // France and Norway carry -99 in ISO_A3
const unionOf = (i) => Object.entries(UNIONS).find(([, xs]) => xs.includes(i))?.[0] ?? null
const rings = (g) => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat())
const hubOf = (i, f) => {
  const mine = places.features.filter((x) => x.properties.adm0_a3 === i)
  const c = mine.find((x) => x.properties.featurecla === 'Admin-0 capital') ?? mine.find((x) => x.properties.featurecla?.startsWith('Admin-0 capital'))
  return c ? c.geometry.coordinates : [f.properties.LABEL_X, f.properties.LABEL_Y]
}

// land groups: countries whose polygons share a border vertex are connected (Natural Earth is topologically clean)
const feats = adm.features.filter((f) => f.properties.CONTINENT !== 'Antarctica')
const verts = feats.map((f) => new Set(rings(f.geometry).flat().map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)))
const parent = feats.map((_, i) => i)
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
for (let a = 0; a < feats.length; a++) {
  for (let b = a + 1; b < feats.length; b++) {
    if (find(a) === find(b)) continue
    const [small, big] = verts[a].size < verts[b].size ? [verts[a], verts[b]] : [verts[b], verts[a]]
    for (const v of small) if (big.has(v)) { parent[find(a)] = find(b); break }
  }
}
const countries = feats.map((f, i) => {
  const code = iso(f.properties)
  const group = find(i)
  const alone = feats.every((_, j) => j === i || find(j) !== group)
  const a2 = [f.properties.ISO_A2_EH, f.properties.ISO_A2].find((x) => /^[A-Z]{2}$/.test(x ?? '')) ?? ''
  return {
    n3: f.properties.ISO_N3 !== '-99' ? f.properties.ISO_N3 : f.properties.ISO_N3_EH,
    iso3: code, a2, name: SHORT[code]?.en ?? f.properties.NAME, names: { ru: SHORT[code]?.ru ?? f.properties.NAME_RU, uk: SHORT[code]?.uk ?? f.properties.NAME_UK, de: SHORT[code]?.de ?? f.properties.NAME_DE }, hub: hubOf(code, f).map((v) => +v.toFixed(3)),
    sub: f.properties.SUBREGION, union: unionOf(code), land: group, island: alone, plr: null, tariff: null,
  }
})

execFileSync('npx', ['mapshaper', `${CACHE}/adm0.geojson`, '-simplify', '8%', 'keep-shapes', '-o', `${CACHE}/adm0-s.geojson`, 'format=geojson', 'precision=0.01', 'force'], { stdio: 'inherit' })
const simp = JSON.parse(readFileSync(`${CACHE}/adm0-s.geojson`, 'utf8'))
const shapes = simp.features.filter((f) => f.properties.CONTINENT !== 'Antarctica').map((f) => {
  const rs = rings(f.geometry)
  const xs = rs.flat().map((p) => p[0])
  const ys = rs.flat().map((p) => p[1])
  return { iso3: iso(f.properties), bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], rings: rs }
})
writeFileSync('public/data/markets/shapes.json', JSON.stringify(shapes))
console.log(`countries ${countries.length}, shapes ${(JSON.stringify(shapes).length / 1e3).toFixed(0)} kB`)

// ---------- FAOSTAT: producer prices, production, trade ----------

const FAO = 'https://bulks-faostat.fao.org/production/'
const unpack = (zip, name) => {
  if (!existsSync(`${CACHE}/${name}`)) execFileSync('python3', ['-c', `import zipfile; zipfile.ZipFile('${zip}').extractall('${CACHE}')`])
}
unpack(await get(`${FAO}Prices_E_All_Data_(Normalized).zip`, 'prices.zip'), 'Prices_E_All_Data_(Normalized).csv')
unpack(await get(`${FAO}Production_Crops_Livestock_E_All_Data_(Normalized).zip`, 'prod.zip'), 'Production_Crops_Livestock_E_All_Data_(Normalized).csv')
unpack(await get(`${FAO}Trade_CropsLivestock_E_All_Data_(Normalized).zip`, 'trade.zip'), 'Trade_CropsLivestock_E_All_Data_(Normalized).csv')
const crops = Object.keys(FAO_ITEM).filter((k) => !NO_MARKET.includes(k))
const tradeItem = (k) => TRADE_ITEM[k] ?? FAO_ITEM[k]
const prodItem = (k) => PROD_ITEM[k] ?? FAO_ITEM[k]
if (!existsSync(`${CACHE}/fao.json`) || process.env.FAO_REBUILD) {
  execFileSync('python3', ['scripts/markets_fao.py'], {
    input: JSON.stringify({ price: crops.map((k) => FAO_ITEM[k]), trade: crops.map(tradeItem), prod: crops.map(prodItem) }),
    stdio: ['pipe', 'inherit', 'inherit'],
  })
}
const fao = JSON.parse(readFileSync(`${CACHE}/fao.json`, 'utf8'))

// ---------- World Bank: euro rate, price levels, applied tariffs ----------

async function wb(ind, dates) {
  const r = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${ind}?format=json&per_page=20000&date=${dates}`)
  if (!r.ok) throw new Error(`${r.status} World Bank ${ind}`)
  return (await r.json())[1] ?? []
}
const latest = (rows) => {
  const out = {}
  for (const r of rows) if (r.value !== null && r.countryiso3code && !(r.countryiso3code in out)) out[r.countryiso3code] = r.value // rows come newest first
  return out
}
const YEARS = Array.from({ length: 10 }, (_, i) => 2015 + i)
const fxRows = await wb('PA.NUS.FCRF', '2015:2024')
const fx = {} // iso3 → year → local currency per US$
for (const r of fxRows) if (r.value !== null && r.countryiso3code) (fx[r.countryiso3code] ??= {})[r.date] = r.value
const eurPerUsd = {}
for (const y of YEARS) eurPerUsd[y] = fx.EMU?.[y] ? +fx.EMU[y].toFixed(4) : null
for (const y of YEARS) if (!eurPerUsd[y]) eurPerUsd[y] = eurPerUsd[Math.max(...YEARS.filter((x) => eurPerUsd[x]))] // the latest year may lag
// price level ratio = PPP conversion factor (LCU per international $) ÷ market rate (LCU per US$); the WDI series
// PA.NUS.PPPC.RF that published it directly was archived, so it is rebuilt from its two parts
const ppp = latest(await wb('PA.NUS.PPP', '2019:2024'))
const plrRaw = {}
for (const [i, v] of Object.entries(ppp)) {
  const rates = Object.entries(fx[i] ?? {}).filter(([y]) => +y >= 2019).sort((a, b) => +b[0] - +a[0])
  if (rates[0]) plrRaw[i] = v / rates[0][1]
}
const tariffRaw = latest(await wb('TM.TAX.TCOM.SM.AR.ZS', '2015:2024'))
/** The primary-products mean includes tobacco and alcohol; food staples are rarely dearer to import than this. */
const TARIFF_CAP = 0.3
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null
}
const euPlr = median(UNIONS.EU.map((i) => plrRaw[i]))
for (const c of countries) {
  c.plr = plrRaw[c.iso3] != null ? +(plrRaw[c.iso3] / euPlr).toFixed(3) : null
  c.tariff = tariffRaw[c.iso3] != null ? +Math.min(TARIFF_CAP, tariffRaw[c.iso3] / 100).toFixed(4) : null
}

// ---------- sea distances between hubs ----------
// The Eurostat maritime network (marnet, shipped in searoute-js) as a graph; each hub drives to the nearest node of
// the main connected network (road = great-circle × 1.3), then one Dijkstra per country gives every sea distance.

const marnet = JSON.parse(readFileSync('node_modules/searoute-js/data/marnet_densified.json', 'utf8'))
const gc = ([lon1, lat1], [lon2, lat2]) => {
  const r = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}
const nodeId = new Map()
const coords = []
const adj = []
const node = (c) => {
  const k = `${c[0].toFixed(4)},${c[1].toFixed(4)}`
  let i = nodeId.get(k)
  if (i === undefined) { i = coords.length; nodeId.set(k, i); coords.push(c); adj.push([]) }
  return i
}
for (const f of marnet.features) {
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
  for (const line of lines) for (let j = 1; j < line.length; j++) {
    const a = node(line[j - 1]), b = node(line[j])
    // the network crosses the antimeridian as two ends at ±180: a segment longer than 180° of longitude wraps
    const w = gc(line[j - 1], line[j])
    adj[a].push([b, w]); adj[b].push([a, w])
  }
}
// join the two sides of the antimeridian
const east = coords.map((c, i) => [c, i]).filter(([c]) => c[0] >= 179.999)
for (const [c, i] of coords.map((c, i) => [c, i]).filter(([c]) => c[0] <= -179.999)) {
  const m = east.find(([e]) => Math.abs(e[1] - c[1]) < 1e-3)
  if (m) { adj[i].push([m[1], 0]); adj[m[1]].push([i, 0]) }
}
const comp = new Int32Array(coords.length).fill(-1)
let biggest = -1, bigSize = 0
for (let s0 = 0, c = 0; s0 < coords.length; s0++) {
  if (comp[s0] >= 0) continue
  const stack = [s0]; comp[s0] = c; let size = 0
  while (stack.length) { const u = stack.pop(); size++; for (const [v] of adj[u]) if (comp[v] < 0) { comp[v] = c; stack.push(v) } }
  if (size > bigSize) { bigSize = size; biggest = c }
  c++
}
const mainNodes = coords.map((_, i) => i).filter((i) => comp[i] === biggest)
// ports: the capital and up to three of the largest cities each drive to their nearest network node; a country
// ships through whichever pair of its ports makes the trip shortest (Japan → Los Angeles, not Washington via Panama)
const snapNode = (p) => {
  let best = mainNodes[0], bd = Infinity
  for (const i of mainNodes) { const d = gc(p, coords[i]); if (d < bd) { bd = d; best = i } }
  return { node: best, km: Math.round(bd * 1.3) }
}
const cities = (c) => places.features
  .filter((x) => x.properties.adm0_a3 === c.iso3)
  .sort((a, b) => (b.properties.pop_max ?? 0) - (a.properties.pop_max ?? 0))
  .slice(0, 3)
  .map((x) => x.geometry.coordinates)
const ports = countries.map((c) => {
  const seen = new Set()
  return [c.hub, ...cities(c)].map(snapNode).filter((p) => !seen.has(p.node) && seen.add(p.node))
})
const port = ports.map((ps) => ps[0]) // the capital's own port, for drawing
function dijkstra(src) {
  const dist = new Float64Array(coords.length).fill(Infinity)
  dist[src] = 0
  const heap = [[0, src]]
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return top }
  while (heap.length) {
    const [d, u] = pop()
    if (d > dist[u]) continue
    for (const [v, w] of adj[u]) if (d + w < dist[v]) { dist[v] = d + w; push([dist[v], v]) }
  }
  return dist
}
const order = countries.map((c) => c.iso3)
const n = order.length
const km = new Array(n * n).fill(null)
const t0 = Date.now()
// km[a→b] = sea from the best of a's ports + the drive from b's port to b's city; the drive from the field to a's
// port is added at runtime (a US field ships from the nearest US port, not from Washington)
for (let a = 0; a < n; a++) {
  for (const pa of ports[a]) {
    const dist = dijkstra(pa.node)
    for (let b = 0; b < n; b++) {
      if (a === b) continue
      for (const pb of ports[b]) {
        if (!Number.isFinite(dist[pb.node])) continue
        const total = Math.round(dist[pb.node] + pb.km)
        if (km[a * n + b] === null || total < km[a * n + b]) km[a * n + b] = total
      }
    }
  }
}
const portXY = ports.map((ps) => ps.map((p) => coords[p.node].map((v) => +v.toFixed(2))))
writeFileSync('public/data/markets/sea.json', JSON.stringify({ order, km, snap: port.map((p) => p.km), ports: portXY }))
console.log(`sea: ${coords.length} nodes (main ${bigSize}), ${n}×${n} in ${((Date.now() - t0) / 1000).toFixed(1)} s`)

// ---------- tables per country ----------

const byN3 = Object.fromEntries(countries.map((c) => [String(c.n3).padStart(3, '0'), c.iso3]))
const prices = {}
const trade = {}
for (const m of new Set([...Object.keys(fao.prices), ...Object.keys(fao.lcu)])) {
  const i = byN3[m]
  if (!i) continue
  for (const k of crops) {
    const usd = fao.prices[m]?.[FAO_ITEM[k]] ?? {}
    const loc = fao.lcu[m]?.[FAO_ITEM[k]] ?? {}
    const eur = (y) => {
      if (usd[y]) return usd[y] * eurPerUsd[y]
      const rate = fx[i]?.[y] ?? (UNIONS.EU.includes(i) ? fx.EMU?.[y] : undefined)
      return loc[y] && rate ? (loc[y] / rate) * eurPerUsd[y] : null
    }
    const series = YEARS.map((y) => {
      const v = eur(y)
      return v ? Math.round(v) : null
    })
    if (series.filter((v) => v !== null).length >= 3) (prices[i] ??= {})[k] = series
  }
}
for (const c of countries) {
  const m = String(c.n3).padStart(3, '0')
  for (const k of crops) {
    const t = fao.trade[m]?.[tradeItem(k)]
    const p = fao.prod[m]?.[prodItem(k)] ?? 0
    if (!t && !p) continue
    ;(trade[c.iso3] ??= {})[k] = [Math.round(p), Math.round(t?.[0] ?? 0), Math.round(t?.[1] ?? 0)]
  }
}
// observed yields, t/ha (FAOSTAT QCL, mean 2019-2023): the country's own, only where it grows a real area of the crop
const yields = {}
const MIN_AREA_HA = 1000
for (const c of countries) {
  const m = String(c.n3).padStart(3, '0')
  for (const k of crops) {
    const y = fao.yields?.[m]?.[prodItem(k)]
    if (y && y[0] > 0 && y[1] >= MIN_AREA_HA) (yields[c.iso3] ??= {})[k] = y[0]
  }
}
const med = (series) => median(series.filter((v) => v !== null))
const world = {}
for (const k of crops) {
  const m = median(Object.values(prices).map((p) => (p[k] ? med(p[k]) : NaN)))
  if (m) world[k] = Math.round(m)
}
// a year below a quarter or above six times the world median is a conversion artefact (hyperinflation at the
// official rate, a unit slip), not a price: dropped, and a crop left with fewer than three years falls back to an estimate
let dropped = 0
for (const [i, p] of Object.entries(prices)) {
  for (const [k, s] of Object.entries(p)) {
    p[k] = s.map((v) => (v !== null && (v < world[k] / 4 || v > world[k] * 6) ? (dropped++, null) : v))
    if (p[k].filter((v) => v !== null).length < 3) delete p[k]
  }
  if (!Object.keys(p).length) delete prices[i]
}
console.log(`${dropped} implausible price-years dropped`)
// levels chained from FAOSTAT's price index that drifted off the world with a devaluation (scripts/markets-clean.mjs)
if (!existsSync(`${CACHE}/official.json`) || process.env.FAO_REBUILD) execFileSync('python3', ['scripts/markets_official.py'], { stdio: 'inherit' })
const artefacts = cleanPrices(prices, YEARS, officialYears(countries, `${CACHE}/official.json`))
console.log(`${artefacts.length} chained price-years dropped as currency artefacts`)
const { world: cleanWorld, subRatio } = worldAndRegions(prices, countries)
Object.assign(world, cleanWorld)
const shelf = Object.fromEntries(Object.entries(SHELF_DAYS))

const sources = {
  prices: { url: `${FAO}Prices_E_All_Data_(Normalized).zip`, note: 'FAOSTAT PP: producer price per tonne, annual, 2015-2024; USD where reported, else local currency at the World Bank annual rate (levels a country stopped publishing are chained from its last level by the FAOSTAT producer price index); to euro at each year’s euro-area rate' },
  production: { url: `${FAO}Production_Crops_Livestock_E_All_Data_(Normalized).zip`, note: 'FAOSTAT QCL: production (t), yield (kg/ha) and area harvested, mean 2019-2023; yields kept where a country harvests ≥ 1 000 ha of the crop' },
  trade: { url: `${FAO}Trade_CropsLivestock_E_All_Data_(Normalized).zip`, note: 'FAOSTAT TCL: import and export quantity, tonnes, mean 2019-2023' },
  fx: { url: 'https://data.worldbank.org/indicator/PA.NUS.FCRF?locations=XC', note: 'World Bank PA.NUS.FCRF, euro area: official exchange rate, LCU per US$, period average' },
  plr: { url: 'https://data.worldbank.org/indicator/PA.NUS.PPP', note: 'Price level ratio = World Bank ICP PA.NUS.PPP (PPP conversion factor, GDP) ÷ PA.NUS.FCRF (market rate), latest 2019-2024, ÷ EU median' },
  tariff: { url: 'https://data.worldbank.org/indicator/TM.TAX.TCOM.SM.AR.ZS', note: 'World Bank TM.TAX.TCOM.SM.AR.ZS: tariff rate, applied, simple mean, primary products (%), latest 2015-2024, capped at 30 % (the mean includes tobacco and alcohol)' },
  shapes: { url: `${NE}ne_50m_admin_0_countries.geojson`, note: 'Natural Earth 1:50m admin-0 countries and capitals' },
  routes: { url: 'https://github.com/eurostat/searoute', note: 'Eurostat maritime network (marnet, via searoute-js): shortest sea path between the ports nearest each capital' },
  shelf: { url: 'https://www.ars.usda.gov/arsuserfiles/oc/np/commercialstorage/commercialstorage.pdf', note: 'USDA Agriculture Handbook 66 (2016): storage life under standard conditions' },
}
const out = countries.map(({ n3, ...c }) => c)
const baked = { fetched: new Date().toISOString().slice(0, 10), years: YEARS, eurPerUsd, countries: out, prices, world, subRatio, trade, yields, shelf, sources }
writeFileSync('src/data/markets.json', JSON.stringify(baked).replace(/[\u2013\u2014]/g, '-')) // plain hyphens on the page
console.log(`prices for ${Object.keys(prices).length} countries, trade for ${Object.keys(trade).length}, markets.json ${(JSON.stringify(baked).length / 1e3).toFixed(0)} kB`)

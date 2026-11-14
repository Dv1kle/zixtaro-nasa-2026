// Crop belts: the same crop-water model Zixtaro runs for one field, run for every NASA POWER cell of a whole
// farming region — so the globe can show how each crop's climate belt moved between 1981–2010 and the last
// decade. Two steps, both cached (node_modules/.cache/zixtaro-belts):
//
//   1. download NASA POWER monthly data for the region, one parameter per request (the regional API's limit)
//   2. run analyzeClimate + cropRisk (bundled from src/lib with esbuild) on a typical loam in every land cell
//
//   node scripts/belts.mjs            # all regions
//   node scripts/belts.mjs europe     # one region
//
// Needs node_modules/.cache/zixtaro-landmask.json from scripts/grace.py (GRACE land mask on the POWER grid).

import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const REGIONS = {
  europe: { label: 'Europe & the Black Sea steppe', lat: [36, 60], lon: [-10, 50] },
  plains: { label: 'North American Plains & Corn Belt', lat: [28, 52], lon: [-110, -80] },
  pampas: { label: 'Argentine Pampas', lat: [-42, -22], lon: [-70, -54] },
}
const PARAMS = ['PRECTOTCORR_SUM', 'T2M', 'T2M_RANGE', 'T2M_MAX', 'ALLSKY_SFC_SW_DWN', 'T2MDEW', 'WS2M', 'PS']
const START = 1981
const END = 2025
const IN_FLIGHT = 3

const only = process.argv[2]
const root = new URL('../', import.meta.url)
const cacheDir = new URL('node_modules/.cache/zixtaro-belts/', root)
const outDir = new URL('public/data/belts/', root)
await mkdir(cacheDir, { recursive: true })
await mkdir(outDir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, tries = 6) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(240_000) })
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
      return await res.json()
    } catch (e) {
      if (i >= tries - 1) throw e
      await sleep(5000 * (i + 1))
    }
  }
}

async function cached(key, fn) {
  const file = new URL(`${key}.json`, cacheDir)
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    const v = await fn()
    await writeFile(file, JSON.stringify(v))
    return v
  }
}

async function pool(tasks, k) {
  let next = 0
  let done = 0
  await Promise.all(Array.from({ length: k }, async () => {
    while (next < tasks.length) {
      const i = next++
      await tasks[i]()
      if (++done % 8 === 0 || done === tasks.length) process.stdout.write(`  ${done}/${tasks.length}\n`)
    }
  }))
}

/** 10° boxes (the regional API's limit), edges on the POWER grid. */
function boxes(r) {
  const out = []
  for (let la = r.lat[0]; la < r.lat[1]; la += 10) for (let lo = r.lon[0]; lo < r.lon[1]; lo += 10) out.push([la, Math.min(la + 10, r.lat[1]), lo, Math.min(lo + 10, r.lon[1])])
  return out
}

/** Step 1: every cell's monthly series, as the point API would return them. */
async function download(name, r) {
  const cells = new Map() // "lat,lon" → { lat, lon, raw: { PARAM: { YYYYMM: v } } }
  const solar = new Map() // CERES/SRB sunlight comes on its own 1° grid (cell centres at x.5)
  const tasks = []
  for (const [la0, la1, lo0, lo1] of boxes(r)) {
    for (const p of PARAMS) {
      tasks.push(async () => {
        const json = await cached(`${name}-${p}-${la0}-${lo0}`, () =>
          getJson(`https://power.larc.nasa.gov/api/temporal/monthly/regional?parameters=${p}&community=AG&longitude-min=${lo0}&longitude-max=${lo1}&latitude-min=${la0}&latitude-max=${la1}&start=${START}&end=${END}&format=json`),
        )
        for (const f of json.features ?? []) {
          const [lon, lat] = f.geometry.coordinates
          if (p === 'ALLSKY_SFC_SW_DWN') {
            solar.set(`${lat.toFixed(1)},${lon.toFixed(1)}`, f.properties.parameter[p])
            continue
          }
          const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
          let c = cells.get(key)
          if (!c) cells.set(key, (c = { lat, lon, raw: {} }))
          c.raw[p] = f.properties.parameter[p]
        }
      })
    }
  }
  await pool(tasks, IN_FLIGHT)
  for (const c of cells.values()) {
    const s = solar.get(`${(Math.floor(c.lat) + 0.5).toFixed(1)},${(Math.floor(c.lon) + 0.5).toFixed(1)}`)
    if (s) c.raw.ALLSKY_SFC_SW_DWN = s
  }
  return [...cells.values()].filter((c) => PARAMS.every((p) => c.raw[p]))
}

// Step 2 runs the app's own model code — bundled once per run.
async function model() {
  const out = new URL('model.mjs', cacheDir)
  await build({
    stdin: {
      contents: `
        export { parsePowerMonthly, analyzeClimate } from './src/lib/climate'
        export { cropRisk } from './src/lib/water'
        export { CROPS } from './src/lib/crops'
        export { manualProfile } from './src/lib/soil'
      `,
      resolveDir: fileURLToPath(root),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: fileURLToPath(out),
    logLevel: 'warning',
  })
  return import(out.href)
}

const landmask = JSON.parse(await readFile(new URL('node_modules/.cache/zixtaro-landmask.json', root), 'utf8'))
const isLand = (lat, lon) => {
  const r = Math.round((lat - landmask.lat0) / landmask.dlat)
  const c = Math.round((((lon + 180) % 360) + 360) % 360 / landmask.dlon)
  return landmask.rows[r]?.[c] === '1'
}

/** 0–100: warm enough to mature × rainfed yield kept × heat at flowering × winter kill × wet-season disease. */
const suit = (thermal, loss, heat, cold, wet) =>
  Math.round(100 * Math.max(0, Math.min(1, thermal)) * (1 - loss) * (1 - 0.5 * heat) * (1 - 0.7 * cold) * (1 - 0.35 * wet))

const m = await model()
const soil = m.manualProfile('loam', 6.5)
for (const [name, r] of Object.entries(REGIONS).filter(([k]) => !only || k === only)) {
  console.log(`▶ ${name}: downloading NASA POWER (${boxes(r).length} boxes × ${PARAMS.length} parameters)`)
  const cells = (await download(name, r)).filter((c) => isLand(c.lat, c.lon))
  console.log(`  ${cells.length} land cells — running the crop model`)
  const lats = [...new Set(cells.map((c) => c.lat))].sort((a, b) => a - b)
  const lons = [...new Set(cells.map((c) => c.lon))].sort((a, b) => a - b)
  const dlat = 0.5
  const dlon = 0.625
  const lat0 = lats[0]
  const lon0 = lons[0]
  const rows = Math.round((lats[lats.length - 1] - lat0) / dlat) + 1
  const cols = Math.round((lons[lons.length - 1] - lon0) / dlon) + 1
  const grids = Object.fromEntries(m.CROPS.map((c) => [c.id, { base: new Uint8Array(rows * cols).fill(255), recent: new Uint8Array(rows * cols).fill(255) }]))
  let periods = null
  let n = 0
  for (const c of cells) {
    let climate
    try {
      climate = m.analyzeClimate(m.parsePowerMonthly(c.raw, c.lat), c.lat, c.lon)
    } catch {
      continue
    }
    periods ??= { baseline: climate.baseline, recent: climate.recent }
    const idx = Math.round((c.lat - lat0) / dlat) * cols + Math.round((c.lon - lon0) / dlon)
    for (const crop of m.CROPS) {
      if (crop.ky <= 0) continue
      const risk = m.cropRisk(crop, climate, soil)
      const b = suit(risk.thermal.baseline, risk.baseline.loss, risk.heat.baseline, risk.cold.baseline, risk.wet.baseline)
      const rr = suit(risk.thermal.recent, risk.recent.loss, risk.heat.recent, risk.cold.recent, risk.wet.recent)
      if (Number.isFinite(b)) grids[crop.id].base[idx] = b
      if (Number.isFinite(rr)) grids[crop.id].recent[idx] = rr
    }
    if (++n % 500 === 0) process.stdout.write(`  ${n}/${cells.length}\n`)
  }
  const crops = Object.fromEntries(
    Object.entries(grids)
      .filter(([id]) => m.CROPS.find((c) => c.id === id).ky > 0)
      .map(([id, g]) => [id, { base: Buffer.from(g.base).toString('base64'), recent: Buffer.from(g.recent).toString('base64') }]),
  )
  const out = {
    region: name,
    label: r.label,
    lat0, lon0, dlat, dlon, rows, cols,
    periods: { baseline: [periods.baseline.from, periods.baseline.to], recent: [periods.recent.from, periods.recent.to] },
    soil: 'typical loam (≈150 mm plant-available water in the top metre), rainfed',
    source: `NASA POWER monthly (MERRA-2, CERES) ${START}–${END}, regional API, 0.5° × 0.625°`,
    scoring: 'suitability = thermal fit × (1 − FAO-33 water-stress loss) × (1 − ½·heat at flowering) × (1 − 0.7·winter kill) × (1 − 0.35·wet-season disease), shares of seasons',
    crops,
  }
  await writeFile(new URL(`${name}.json`, outDir), JSON.stringify(out))
  console.log(`  ✓ ${name}.json · ${rows}×${cols} grid, ${n} cells`)
}
await writeFile(new URL('index.json', outDir), JSON.stringify({ regions: Object.fromEntries(Object.entries(REGIONS).map(([k, v]) => [k, v])) }))

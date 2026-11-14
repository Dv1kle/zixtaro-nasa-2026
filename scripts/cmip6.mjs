// Pre-bakes NASA NEX-GDDP-CMIP6 climate-change deltas for the demo fields (0.25°, bias-corrected, daily).
// For each field and model: monthly mean air temperature and rain in the 2050s (2046–2055) vs 2016–2025 —
// the same decade Zixtaro treats as "recent" in the NASA POWER record — under SSP2-4.5 and SSP5-8.5.
// The app adds these monthly deltas to the observed recent decade (delta-change method).
//
//   node scripts/cmip6.mjs            # all demo fields (~900 point requests, ~20 min at 4 in flight)
//   node scripts/cmip6.mjs torgau     # one field
//
// Data: NASA NCCS THREDDS NetCDF Subset Service, https://ds.nccs.nasa.gov/thredds (no login needed).

import { mkdir, writeFile } from 'node:fs/promises'
import { PRESETS } from '../src/lib/presets.ts'

const THREDDS = 'https://ds.nccs.nasa.gov/thredds'
const ROOT = 'AMES/NEX/GDDP-CMIP6'
// Three models with different climate sensitivity, so the spread means something.
const MODELS = ['MPI-ESM1-2-HR', 'GFDL-ESM4', 'EC-Earth3']
const SCENARIOS = ['ssp245', 'ssp585']
const BASE = [2016, 2025]
const FUTURE = [2046, 2055]
const VARS = ['tas', 'pr']
const IN_FLIGHT = 4

const only = process.argv[2]
const outDir = new URL('../public/data/cmip6/', import.meta.url)
await mkdir(outDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      return await res.text()
    } catch (e) {
      if (i >= tries - 1) throw e
      await sleep(3000 * (i + 1))
    }
  }
}

// catalog → { year: urlPath } for one model / scenario / variable (file names carry version suffixes)
const catalogCache = new Map()
async function files(model, scenario, v) {
  const key = `${model}/${scenario}/${v}`
  if (catalogCache.has(key)) return catalogCache.get(key)
  const runs = await get(`${THREDDS}/catalog/${ROOT}/${model}/${scenario}/catalog.xml`)
  const run = runs.match(/title="(r\d+i\d+p\d+f\d+)"/)?.[1]
  if (!run) throw new Error(`no run for ${key}`)
  const xml = await get(`${THREDDS}/catalog/${ROOT}/${model}/${scenario}/${run}/${v}/catalog.xml`)
  const byYear = {}
  for (const m of xml.matchAll(/urlPath="([^"]*_(\d{4})(?:_v[\d.]+)?\.nc)"/g)) {
    const y = Number(m[2])
    // prefer the newest version when several exist
    if (!byYear[y] || m[1] > byYear[y]) byYear[y] = m[1]
  }
  catalogCache.set(key, byYear)
  return byYear
}

/** Monthly means of one year at one point: tas in °C, pr in mm/day. */
async function yearMonthly(path, v, lat, lon, year) {
  const q = `var=${v}&latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&time_start=${year}-01-01T00:00:00Z&time_end=${year}-12-31T23:59:59Z&accept=csv`
  const csv = await get(`${THREDDS}/ncss/grid/${path}?${q}`)
  const sum = Array(12).fill(0)
  const n = Array(12).fill(0)
  for (const line of csv.split('\n').slice(1)) {
    const cells = line.split(',')
    if (cells.length < 5) continue
    const m = Number(cells[0].slice(5, 7)) - 1
    const x = Number(cells[cells.length - 1])
    if (!Number.isFinite(x) || m < 0) continue
    sum[m] += v === 'tas' ? x - 273.15 : x * 86400
    n[m]++
  }
  return sum.map((s, i) => (n[i] ? s / n[i] : NaN))
}

async function pool(tasks, k) {
  const out = new Array(tasks.length)
  let next = 0
  let done = 0
  await Promise.all(Array.from({ length: k }, async () => {
    while (next < tasks.length) {
      const i = next++
      out[i] = await tasks[i]()
      if (++done % 20 === 0) process.stdout.write(`  ${done}/${tasks.length}\n`)
    }
  }))
  return out
}

const mean = (rows) => rows[0].map((_, m) => {
  const v = rows.map((r) => r[m]).filter(Number.isFinite)
  return v.reduce((a, b) => a + b, 0) / v.length
})

/** NEX-GDDP-CMIP6 grid cell (0.25°) — fields in one cell share the same projection. */
const cellOf = (lat, lon) => `${Math.floor(lat / 0.25)},${Math.floor((((lon % 360) + 360) % 360) / 0.25)}`
const index = []
const seen = new Map() // cell → preset id already baked

for (const p of PRESETS.filter((x) => !x.bundle && (!only || x.id === only))) {
  const { lat, lon } = p.field
  const cell = cellOf(lat, lon)
  if (seen.has(cell)) {
    console.log(`= ${p.id} shares the ${cell} cell with ${seen.get(cell)}`)
    continue
  }
  console.log(`▶ ${p.id} (${lat.toFixed(3)}, ${lon.toFixed(3)})`)
  const perModel = {}
  for (const model of MODELS) {
    const jobs = []
    const slots = {} // `${scen}|${window}|${v}` → [year monthly arrays]
    for (const scen of SCENARIOS) {
      for (const [win, [a, b]] of [['base', BASE], ['future', FUTURE]]) {
        if (win === 'base' && scen !== SCENARIOS[0]) continue // 2016–2025 barely differs between SSPs: one base serves both
        for (const v of VARS) {
          const key = `${scen}|${win}|${v}`
          slots[key] = []
          for (let y = a; y <= b; y++) {
            jobs.push(async () => {
              const path = (await files(model, scen, v))[y]
              if (!path) throw new Error(`missing ${model} ${scen} ${v} ${y}`)
              slots[key].push(await yearMonthly(path, v, lat, lon, y))
            })
          }
        }
      }
    }
    try {
      await pool(jobs, IN_FLIGHT)
    } catch (e) {
      console.log(`  ✗ ${model}: ${e.message}`)
      continue
    }
    const baseT = mean(slots[`${SCENARIOS[0]}|base|tas`])
    const baseP = mean(slots[`${SCENARIOS[0]}|base|pr`])
    perModel[model] = Object.fromEntries(SCENARIOS.map((scen) => {
      const futT = mean(slots[`${scen}|future|tas`])
      const futP = mean(slots[`${scen}|future|pr`])
      return [scen, {
        dT: futT.map((t, m) => Math.round((t - baseT[m]) * 100) / 100),
        rain: futP.map((x, m) => Math.round((baseP[m] > 0.05 ? x / baseP[m] - 1 : 0) * 1000) / 1000),
      }]
    }))
    console.log(`  ✓ ${model}: annual ΔT ${SCENARIOS.map((s) => `${s} ${(perModel[model][s].dT.reduce((a, b) => a + b, 0) / 12).toFixed(2)}`).join(' · ')}`)
  }
  const models = Object.keys(perModel)
  if (!models.length) {
    console.log(`  ✗ no model succeeded for ${p.id}`)
    continue
  }
  const ensemble = Object.fromEntries(SCENARIOS.map((scen) => {
    const dT = Array.from({ length: 12 }, (_, m) => models.reduce((s, k) => s + perModel[k][scen].dT[m], 0) / models.length)
    const rain = Array.from({ length: 12 }, (_, m) => models.reduce((s, k) => s + perModel[k][scen].rain[m], 0) / models.length)
    const annual = models.map((k) => perModel[k][scen].dT.reduce((a, b) => a + b, 0) / 12)
    return [scen, {
      dT: dT.map((x) => Math.round(x * 100) / 100),
      rain: rain.map((x) => Math.round(x * 1000) / 1000),
      spread: [Math.min(...annual), Math.max(...annual)].map((x) => Math.round(x * 100) / 100),
    }]
  }))
  const out = {
    id: p.id,
    cell,
    source: 'NASA NEX-GDDP-CMIP6 (NCCS THREDDS), daily 0.25°, bias-corrected',
    point: { lat, lon },
    base: BASE,
    future: FUTURE,
    models,
    scenarios: ensemble,
    perModel,
    fetchedAt: new Date().toISOString(),
  }
  await writeFile(new URL(`${p.id}.json`, outDir), JSON.stringify(out))
  seen.set(cell, p.id)
  index.push({ id: p.id, cell })
  console.log(`✓ ${p.id}: ${models.length} models · SSP2-4.5 ΔT ${ensemble.ssp245 ? (ensemble.ssp245.dT.reduce((a, b) => a + b, 0) / 12).toFixed(2) : '?'} °C · SSP5-8.5 ΔT ${ensemble.ssp585 ? (ensemble.ssp585.dT.reduce((a, b) => a + b, 0) / 12).toFixed(2) : '?'} °C`)
}

// Which cells have a projection: the app finds a field's cell here (any field in a baked cell gets it).
if (!only) await writeFile(new URL('index.json', outDir), JSON.stringify({ cellSize: 0.25, cells: index }))

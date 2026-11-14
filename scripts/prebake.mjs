// Pre-bakes NASA POWER (monthly + daily) and SoilGrids data for the demo fields into
// public/data/presets/, so the demo works offline. Run: npm run prebake [presetId]
// (Node ≥ 22.18 strips the TS types of the imported modules.)
import { mkdir, writeFile } from 'node:fs/promises'
import { compactDaily } from '../src/lib/dailyFormat.ts'
import { samplePoints } from '../src/lib/geo.ts'
import { PRESETS } from '../src/lib/presets.ts'
import { powerDailyUrl, powerUrl, soilUrl } from '../src/lib/sources.ts'

const outDir = new URL('../public/data/presets/', import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return await res.json()
    } catch (e) {
      if (i >= tries) throw new Error(`${url}\n  → ${e.message}`)
      await sleep(15_000 * i)
    }
  }
}

let lastSoil = 0
async function soil(lat, lon) {
  const wait = lastSoil + 13_000 - Date.now() // SoilGrids fair use: ≤ 5 requests per minute
  if (wait > 0) await sleep(wait)
  lastSoil = Date.now()
  return getJson(soilUrl(lat, lon))
}

const only = process.argv[2]
await mkdir(outDir, { recursive: true })
const end = new Date().getFullYear() - 1
for (const p of PRESETS.filter((x) => !x.bundle && (!only || x.id === only))) {
  const f = p.field
  const samples = f.kind === 'area' ? samplePoints(f.ring, f.areaHa) : [{ lat: f.lat, lon: f.lon }]
  const sources = { power: powerUrl(f.lat, f.lon, end), daily: powerDailyUrl(f.lat, f.lon, end), soil: samples.map((s) => soilUrl(s.lat, s.lon)) }
  const power = (await getJson(sources.power)).properties.parameter
  const daily = compactDaily((await getJson(sources.daily)).properties.parameter)
  const soils = []
  for (const s of samples) soils.push(await soil(s.lat, s.lon))
  const bundle = { id: p.id, fetchedAt: new Date().toISOString(), sources, power, daily, samples, soil: soils }
  await writeFile(new URL(`${p.id}.json`, outDir), JSON.stringify(bundle))
  console.log(`✓ ${p.id.padEnd(10)} POWER ${Object.keys(power.T2M).length} months · daily ${daily.tmax.length} days · SoilGrids ${soils.length} sample(s)`)
}

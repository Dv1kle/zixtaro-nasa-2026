// Pre-bakes what NASA's MODIS satellites saw on each demo field, from the ORNL DAAC MODIS/VIIRS subset
// web service (no login): the 250 m NDVI time series (MOD13Q1, every 16 days since Feb 2000) and, for the
// main demo sites, the 500 m evapotranspiration vs potential evapotranspiration (MOD16A2GF, 8-day) in the
// growing season — an independent satellite view of water stress to check the crop water model against.
//
//   node scripts/modis.mjs              # every demo field (slow: the service answers ~10 dates per request)
//   node scripts/modis.mjs torgau       # one field
//
// Raw answers are cached in node_modules/.cache/zixtaro-modis, so an interrupted run resumes.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { PRESETS } from '../src/lib/presets.ts'

const API = 'https://modis.ornl.gov/rst/api/v1'
const IN_FLIGHT = 4
const only = process.argv[2]
const outDir = new URL('../public/data/modis/', import.meta.url)
const cacheDir = new URL('../node_modules/.cache/zixtaro-modis/', import.meta.url)
await mkdir(outDir, { recursive: true })
await mkdir(cacheDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000), headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      return await res.json()
    } catch (e) {
      if (i >= tries - 1) throw e
      await sleep(4000 * (i + 1))
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

async function pool(tasks, k, label) {
  const out = new Array(tasks.length)
  let next = 0
  let done = 0
  await Promise.all(Array.from({ length: k }, async () => {
    while (next < tasks.length) {
      const i = next++
      out[i] = await tasks[i]()
      if (++done % 10 === 0 || done === tasks.length) process.stdout.write(`  ${label} ${done}/${tasks.length}\n`)
    }
  }))
  return out
}

/** Consecutive runs of at most 10 composites — the service's limit per request. */
function chunks(dates) {
  const out = []
  for (let i = 0; i < dates.length; i += 10) out.push(dates.slice(i, i + 10))
  return out
}

async function series(product, band, lat, lon, dates, key) {
  const parts = await pool(
    chunks(dates).map((c, i) => () =>
      cached(`${key}-${band}-${i}-${c[0].modis_date}`, async () => {
        const q = `latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&band=${band}&startDate=${c[0].modis_date}&endDate=${c[c.length - 1].modis_date}&kmAboveBelow=0&kmLeftRight=0`
        const json = await getJson(`${API}/${product}/subset?${q}`)
        return json.subset.map((s) => [s.calendar_date, s.data[0]])
      }),
    ),
    IN_FLIGHT,
    `${key} ${band}`,
  )
  return new Map(parts.flat())
}

const doy = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1
}

const index = []
for (const p of PRESETS.filter((x) => !only || x.id === only)) {
  const { lat, lon } = p.field
  const south = lat < 0
  console.log(`▶ ${p.id} (${lat.toFixed(4)}, ${lon.toFixed(4)})`)
  const out = { id: p.id, lat, lon, source: 'NASA MODIS via ORNL DAAC MODIS/VIIRS Subsets', fetchedAt: new Date().toISOString() }

  // NDVI: every 16-day composite, one 250 m pixel at the field centre
  const ndviDates = (await getJson(`${API}/MOD13Q1/dates?latitude=${lat}&longitude=${lon}`)).dates
  const ndvi = await series('MOD13Q1', '250m_16_days_NDVI', lat, lon, ndviDates, `${p.id}-ndvi`)
  out.ndvi = {
    product: 'MOD13Q1 v6.1 · 250 m · 16-day',
    dates: ndviDates.map((d) => d.calendar_date),
    values: ndviDates.map((d) => {
      const v = ndvi.get(d.calendar_date)
      return v == null || v <= -3000 ? null : Math.round(v) / 10_000
    }),
  }

  // ET / PET in the growing season (NH Apr–Sep, SH Oct–Mar) for the sites that carry their own climate bundle
  if (!p.bundle && !p.hidden) {
    const all = (await getJson(`${API}/MOD16A2GF/dates?latitude=${lat}&longitude=${lon}`)).dates
    const season = all.filter((d) => {
      const n = doy(d.calendar_date)
      return south ? n >= 274 || n <= 96 : n >= 89 && n <= 281
    })
    // split into runs of consecutive composites so no request spans the off-season
    const runs = []
    let run = []
    for (const d of season) {
      const prev = run[run.length - 1]
      if (prev && Math.abs(new Date(d.calendar_date) - new Date(prev.calendar_date)) > 9 * 86_400_000) {
        runs.push(run)
        run = []
      }
      run.push(d)
    }
    if (run.length) runs.push(run)
    const flat = runs.flatMap((r) => chunks(r))
    const get = async (band) =>
      new Map(
        (
          await pool(
            flat.map((c, i) => () =>
              cached(`${p.id}-${band}-${i}-${c[0].modis_date}`, async () => {
                const q = `latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&band=${band}&startDate=${c[0].modis_date}&endDate=${c[c.length - 1].modis_date}&kmAboveBelow=0&kmLeftRight=0`
                const json = await getJson(`${API}/MOD16A2GF/subset?${q}`)
                return json.subset.map((s) => [s.calendar_date, s.data[0]])
              }),
            ),
            IN_FLIGHT,
            `${p.id} ${band}`,
          )
        ).flat(),
      )
    const et = await get('ET_500m')
    const pet = await get('PET_500m')
    const val = (m, k) => {
      const v = m.get(k)
      return v == null || v >= 32760 ? null : Math.round(v) / 10 // kg/m² = mm per 8 days
    }
    out.et = {
      product: 'MOD16A2GF v6.1 · 500 m · 8-day, gap-filled',
      dates: season.map((d) => d.calendar_date),
      et: season.map((d) => val(et, d.calendar_date)),
      pet: season.map((d) => val(pet, d.calendar_date)),
    }
  }
  await writeFile(new URL(`${p.id}.json`, outDir), JSON.stringify(out))
  index.push(p.id)
  console.log(`  ✓ ${p.id}: ${out.ndvi.dates.length} NDVI composites${out.et ? `, ${out.et.dates.length} ET composites` : ''}`)
}
if (!only) await writeFile(new URL('index.json', outDir), JSON.stringify({ ids: index }))

// FAO GAEZ v4 suitability of the plantation and orchard crops it rates, for the long-term planting view
// (src/lib/perennials.ts). Finds the layers in GAEZ's res05 catalogue (an ArcGIS ImageServer: one record per raster),
// then reads them at the demo fields so the demos work offline and the tests have real values.
//
//   npx tsx scripts/perennials.ts          -> src/data/perennials.json
//
// Layers: suitability index (0-10 000), rain-fed, high inputs, on the current cropland of the 5′ grid cell (su…) and on
// all its land (sx…, for cells without cropland); 1981-2010 (CRU TS 3.2) and 2041-2070 (ensemble of four CMIP5 models,
// RCP 4.5 and 8.5, without CO₂ fertilisation - its size is uncertain, so the lower estimate).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PRESETS } from '../src/lib/presets'

const SERVICE = 'https://gaez-services.fao.org/server/rest/services/res05/ImageServer'
/** GAEZ crop name -> Zixtaro id (the same ids as public/data/crops/trees.json) */
const CROPS: Record<string, string> = {
  'Oil palm': 'oilpalm', Rubber: 'rubber', Cocoa: 'cocoa', Olive: 'olive', Coconut: 'coconut', Coffee: 'coffee',
  Banana: 'banana', Tea: 'tea', Citrus: 'citrus',
}

type Attr = { objectid: number; name: string; crop: string; year: string; model: string; rcp: string; c02_fertilization: string; variable: string }
type Layer = { id: number; crop: string; when: 'now' | '2050s'; rcp: '4.5' | '8.5' | null; land: 'cropland' | 'all'; name: string }

async function query(where: string): Promise<Attr[]> {
  const u = new URL(`${SERVICE}/query`)
  u.search = new URLSearchParams({ where, returnGeometry: 'false', outFields: 'objectid,name,crop,year,model,rcp,c02_fertilization,variable', f: 'json' }).toString()
  const r = await fetch(u)
  const j = (await r.json()) as { features?: { attributes: Attr }[]; error?: unknown }
  if (!j.features) throw new Error(`GAEZ query failed: ${JSON.stringify(j.error)}`)
  return j.features.map((f) => f.attributes)
}

const crops = Object.keys(CROPS).map((c) => `'${c}'`).join(',')
const base = `crop IN (${crops}) AND water_supply='Rainfed' AND input_level='High' AND variable LIKE 'Suitability index  range%'`
const rows = [
  ...(await query(`${base} AND model='CRUTS32' AND year='1981-2010'`)),
  ...(await query(`${base} AND model='ENSEMBLE' AND year='2041-2070' AND rcp IN ('RCP4.5','RCP8.5') AND c02_fertilization='Without CO2 Fertilization'`)),
]
const layers: Layer[] = rows
  .map((a): Layer | null => {
    const land = a.variable.includes('current cropland') ? 'cropland' : a.variable.includes('all land') ? 'all' : null
    if (!land || !/^s[ux]Hr0?_/.test(a.name)) return null
    const now = a.year === '1981-2010'
    return { id: a.objectid, crop: CROPS[a.crop], when: now ? 'now' : '2050s', rcp: now ? null : (a.rcp.replace('RCP', '') as '4.5' | '8.5'), land, name: a.name }
  })
  .filter((l): l is Layer => l !== null)
  .sort((a, b) => a.crop.localeCompare(b.crop) || a.when.localeCompare(b.when) || (a.rcp ?? '').localeCompare(b.rcp ?? '') || a.land.localeCompare(b.land))
const want = Object.keys(CROPS).length * 3 * 2
if (layers.length !== want) throw new Error(`expected ${want} layers, found ${layers.length}: ${layers.map((l) => l.name).join(' ')}`)

/** One identify call returns every locked raster's value at the point, in catalogue order. */
async function identify(lat: number, lon: number): Promise<number[]> {
  const u = new URL(`${SERVICE}/identify`)
  u.search = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    mosaicRule: JSON.stringify({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: layers.map((l) => l.id) }),
    returnCatalogItems: 'true', returnGeometry: 'false', f: 'json',
  }).toString()
  const j = (await (await fetch(u)).json()) as { properties?: { Values?: string[] }; catalogItems?: { features: { attributes: { objectid: number } }[] } }
  const ids = j.catalogItems?.features.map((f) => f.attributes.objectid) ?? []
  const vals = j.properties?.Values ?? []
  const by = new Map(ids.map((id, i) => [id, Number(vals[i])]))
  return layers.map((l) => by.get(l.id) ?? NaN)
}

const presets: Record<string, number[]> = {}
for (const p of PRESETS) {
  const v = await identify(p.field.lat, p.field.lon)
  if (v.some((x) => !Number.isFinite(x))) throw new Error(`GAEZ identify incomplete at ${p.id}`)
  presets[p.id] = v
  console.log(p.id, layers.map((l, i) => (l.land === 'cropland' && l.when === 'now' ? `${l.crop} ${v[i]}` : '')).filter(Boolean).join(' · '))
}

// scripts/perennials-check.py adds how far GAEZ agrees with where farms grow each crop: keep it
const OUT = 'src/data/perennials.json'
const agreement = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as { agreement?: unknown }).agreement : undefined
writeFileSync(
  OUT,
  JSON.stringify({
    source: 'FAO & IIASA (2021), Global Agro-Ecological Zones v4: crop suitability index, rain-fed, high inputs, 5′ grid (res05)',
    service: SERVICE,
    portal: 'https://gaez.fao.org/',
    built: new Date().toISOString().slice(0, 10),
    layers,
    presets,
    ...(agreement ? { agreement } : {}),
  }),
)
console.log(`${layers.length} layers -> src/data/perennials.json`)

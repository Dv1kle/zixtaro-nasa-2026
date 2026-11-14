// src/lib/data/fetch/hls.ts
// The field itself, 30 m at a time: NASA's Harmonized Landsat Sentinel-2 (HLS v2) scenes over the field polygon,
// summarised server-side by the Planetary Computer data API (mean, spread, percentiles) for a dozen vegetation
// indices; Landsat's thermal band for surface temperature; Sentinel-1 radar when clouds hide the field.
import type { Field } from '../../geo'
import { coefficientOfVariation, faparFromNdvi, fvcFromNdvi } from '../derive/vegetation'
import { airTempAt } from './openmeteo'
import { cached, DAY, GATES, getJson, SourceError } from '../net'
import type { Point, Value } from '../types'

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
const DATA = 'https://planetarycomputer.microsoft.com/api/data/v1'

export type Feature = { type: 'Feature'; properties: Record<string, never>; geometry: { type: 'Polygon'; coordinates: number[][][] } }

/** The field ring (closed), a 300 m square around a point field, or the central 1 km of a territory over 5 000 ha. */
export function fieldFeature(field: Field): Feature {
  const square = (half: number) => {
    const dLat = half / 111_320
    const dLon = dLat / Math.cos((field.lat * Math.PI) / 180)
    return [[field.lon - dLon, field.lat - dLat], [field.lon + dLon, field.lat - dLat], [field.lon + dLon, field.lat + dLat], [field.lon - dLon, field.lat + dLat], [field.lon - dLon, field.lat - dLat]]
  }
  const ring = field.kind === 'area' && field.areaHa <= 5000 ? [...field.ring, field.ring[0]] : square(field.kind === 'area' ? 500 : 150)
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

export function featureBbox(f: Feature): [number, number, number, number] {
  const r = f.geometry.coordinates[0]
  const xs = r.map((p) => p[0])
  const ys = r.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

export type IndexId = 'ndvi' | 'evi' | 'ndmi' | 'ndre' | 'cire' | 'mtci' | 'reip' | 'psri' | 'ari' | 'cri'
/**
 * Band maths on reflectance x 10 000; +1 in denominators keeps empty pixels finite. Cloud share: Fmask bits 1-3 (cloud,
 * adjacent to cloud, shadow) read with floor and modulo, because the statistics API rejects bitwise operators.
 */
const FMASK_CLOUD = 'where(floor(Fmask/2)%2+floor(Fmask/4)%2+floor(Fmask/8)%2>0,1,0)'
/** Landsat QA_PIXEL bits 1, 3, 4: dilated cloud, cloud, cloud shadow. */
export const LANDSAT_CLOUD = 'where(floor(qa_pixel/2)%2+floor(qa_pixel/8)%2+floor(qa_pixel/16)%2>0,1,0)'
export const EXPR: { s30: Record<IndexId | 'cloud', string>; l30: Partial<Record<IndexId | 'cloud', string>> } = {
  s30: {
    cloud: FMASK_CLOUD,
    ndvi: '(B8A-B04)/(B8A+B04)',
    evi: '2.5*(B8A-B04)/(B8A+6*B04-7.5*B02+10000)',
    ndmi: '(B8A-B11)/(B8A+B11)',
    ndre: '(B8A-B05)/(B8A+B05)',
    cire: 'B8A/(B05+1)-1',
    mtci: '(B06-B05)/(B05-B04+1)',
    reip: '700+40*(((B04+B07)/2-B05)/(B06-B05+1))',
    psri: '(B04-B02)/(B06+1)',
    ari: '10000/(B03+1)-10000/(B05+1)',
    cri: '10000/(B02+1)-10000/(B03+1)',
  },
  l30: {
    cloud: FMASK_CLOUD,
    ndvi: '(B05-B04)/(B05+B04)',
    evi: '2.5*(B05-B04)/(B05+6*B04-7.5*B02+10000)',
    ndmi: '(B05-B06)/(B05+B06)',
  },
}
const METRIC: Record<IndexId, string> = { ndvi: 'hls_ndvi', evi: 'hls_evi', ndmi: 'hls_ndmi', ndre: 'hls_ndre', cire: 'hls_cire', mtci: 'hls_mtci', reip: 'hls_reip', psri: 'hls_psri', ari: 'hls_ari', cri: 'hls_cri' }

export type Stat = { mean: number; std: number; p2: number; p98: number; count: number }
type RawStat = { mean?: number; std?: number; percentile_2?: number; percentile_98?: number; count?: number }
export function statFrom(s: RawStat | undefined): Stat | null {
  if (!s || !Number.isFinite(s.mean) || !s.count) return null
  return { mean: s.mean!, std: s.std ?? 0, p2: s.percentile_2 ?? s.mean!, p98: s.percentile_98 ?? s.mean!, count: s.count }
}

type Item = { id: string; collection: string; properties: { datetime: string; 'eo:cloud_cover'?: number } }
export async function searchStac(collection: string, f: Feature, fromIso: string, toIso: string, signal?: AbortSignal, maxCloud?: number): Promise<Item[]> {
  const body = {
    collections: [collection],
    intersects: f.geometry,
    datetime: `${fromIso}T00:00:00Z/${toIso}T23:59:59Z`,
    limit: 100,
    sortby: [{ field: 'properties.datetime', direction: 'desc' }],
    ...(maxCloud === undefined ? {} : { query: { 'eo:cloud_cover': { lt: maxCloud } } }),
  }
  const j = await GATES.mpc(() => getJson<{ features?: Item[] }>(STAC, { signal, timeoutMs: 30_000, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } }))
  return j.features ?? []
}

export async function itemStats(collection: string, item: string, f: Feature, exprs: string[], signal?: AbortSignal): Promise<(Stat | null)[]> {
  const url = `${DATA}/item/statistics?collection=${collection}&item=${encodeURIComponent(item)}&expression=${encodeURIComponent(exprs.join(';'))}&asset_as_band=true&max_size=1024`
  const j = await GATES.mpc(() => getJson<{ properties?: { statistics?: Record<string, RawStat> } }>(url, { signal, timeoutMs: 40_000, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) } }))
  const st = j.properties?.statistics ?? {}
  const vals = Object.values(st)
  return exprs.map((e, i) => statFrom(st[e] ?? vals[i]))
}

export function zoneUrl(collection: string, item: string, bbox: [number, number, number, number], expr: string, rescale: [number, number], colormap: string): string {
  return `${DATA}/item/bbox/${bbox.join(',')}.png?collection=${collection}&item=${encodeURIComponent(item)}&expression=${encodeURIComponent(expr)}&asset_as_band=true&rescale=${rescale.join(',')}&colormap_name=${colormap}&max_size=512`
}

export type ZoneImage = { index: 'ndvi' | 'ndmi' | 'ndre'; url: string; date: string; bbox: [number, number, number, number]; rescale: [number, number]; colormap: string }
const ZONES: { index: ZoneImage['index']; rescale: [number, number]; colormap: string }[] = [
  { index: 'ndvi', rescale: [0.1, 0.9], colormap: 'rdylgn' },
  { index: 'ndmi', rescale: [-0.2, 0.5], colormap: 'rdbu' },
  { index: 'ndre', rescale: [0, 0.6], colormap: 'viridis' },
]

const day = (t: number) => new Date(t).toISOString().slice(0, 10)
const r = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d

type Scene = { collection: 'hls2-s30' | 'hls2-l30'; id: string; date: string; stats: Partial<Record<IndexId, Stat>> }

export async function fetchHls(field: Field, signal?: AbortSignal, onPart?: (v: Value[]) => void): Promise<{ values: Value[]; zones: ZoneImage[] }> {
  const f = fieldFeature(field)
  const bbox = featureBbox(f)
  const key = `hls:${bbox.map((x) => x.toFixed(4)).join(',')}`
  const { data: scenes, from } = await cached(key, 3 * DAY, async () => {
    const to = day(Date.now())
    const since = day(Date.now() - 180 * DAY)
    const [s30, l30] = await Promise.all([searchStac('hls2-s30', f, since, to, signal, 40), searchStac('hls2-l30', f, since, to, signal, 40)])
    const items = [...s30, ...l30].sort((a, b) => b.properties.datetime.localeCompare(a.properties.datetime)).slice(0, 40)
    const out: Scene[] = []
    await Promise.all(
      items.map(async (it) => {
        const col = it.collection as Scene['collection']
        const table = col === 'hls2-s30' ? EXPR.s30 : EXPR.l30
        const ids = (Object.keys(table) as (IndexId | 'cloud')[]).filter((k) => k !== 'cloud') as IndexId[]
        try {
          const st = await itemStats(col, it.id, f, [table.cloud!, ...ids.map((k) => table[k]!)], signal)
          if (!st[0] || st[0].mean > 0.1) return // more than 10 % of the field under cloud or shadow
          const stats: Scene['stats'] = {}
          ids.forEach((k, i) => st[i + 1] && (stats[k] = st[i + 1]!))
          out.push({ collection: col, id: it.id, date: it.properties.datetime.slice(0, 10), stats })
        } catch {
          // one failed scene does not stop the rest
        }
      }),
    )
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }, { signal })

  const values: Value[] = []
  const V = (id: string, v: number | null, extra: Partial<Value> = {}): Value => ({ id, v, source: 'hls', from, ...extra })
  for (const k of Object.keys(METRIC) as IndexId[]) {
    const withK = scenes.filter((s) => s.stats[k])
    if (!withK.length) continue
    const s = withK[0].stats[k]!
    const series: Point[] = [...withK].reverse().map((sc) => ({ t: sc.date, v: r(sc.stats[k]!.mean) }))
    values.push(V(METRIC[k], r(s.mean), { lo: r(s.p2), hi: r(s.p98), asOf: withK[0].date, series, note: withK[0].collection === 'hls2-s30' ? 'Sentinel-2 half of HLS' : 'Landsat half of HLS' }))
  }
  const nd = scenes.find((s) => s.stats.ndvi)?.stats.ndvi
  const ndDate = scenes.find((s) => s.stats.ndvi)?.date
  if (nd) {
    values.push(V('hls_cv', r(100 * coefficientOfVariation(nd.mean, nd.std), 1), { asOf: ndDate }))
    values.push(V('hls_fvc', r(100 * fvcFromNdvi(nd.mean), 1), { asOf: ndDate }))
    values.push(V('hls_fapar', r(100 * faparFromNdvi(nd.mean), 1), { asOf: ndDate }))
  }
  onPart?.(values)

  const zones: ZoneImage[] = []
  for (const z of ZONES) {
    const sc = scenes.find((s) => s.stats[z.index] && (z.index !== 'ndre' || s.collection === 'hls2-s30'))
    if (!sc) continue
    const table = sc.collection === 'hls2-s30' ? EXPR.s30 : EXPR.l30
    zones.push({ index: z.index, url: zoneUrl(sc.collection, sc.id, bbox, table[z.index]!, z.rescale, z.colormap), date: sc.date, bbox, rescale: z.rescale, colormap: z.colormap })
  }

  // Landsat surface temperature, and the surface-air difference at the overpass
  try {
    const items = await searchStac('landsat-c2-l2', f, day(Date.now() - 60 * DAY), day(Date.now()), signal, 40)
    for (const it of items.slice(0, 8)) {
      const [cloud, lst] = await itemStats('landsat-c2-l2', it.id, f, [LANDSAT_CLOUD, 'lwir11*0.00341802+149.0-273.15'], signal)
      if (!cloud || cloud.mean > 0.1 || !lst) continue
      const date = it.properties.datetime
      const air = await airTempAt(field.lat, field.lon, date, signal).catch(() => null)
      const lv = V('lst_landsat', r(lst.mean, 1), { lo: r(lst.p2, 1), hi: r(lst.p98, 1), asOf: date.slice(0, 10), source: 'landsat' })
      const dv = V('dt_surface_air', air === null ? null : r(lst.mean - air, 1), { asOf: date.slice(0, 10), source: 'landsat', note: air === null ? undefined : `air ${air.toFixed(1)} °C at ${date.slice(11, 16)} UTC` })
      values.push(lv, dv)
      onPart?.([lv, dv])
      break
    }
  } catch {
    // thermal is optional; the optical indices stand on their own
  }

  // Sentinel-1 radar: sees through the clouds that hide a monsoon field for weeks
  try {
    const items = await searchStac('sentinel-1-rtc', f, day(Date.now() - 24 * DAY), day(Date.now()), signal)
    if (items[0]) {
      const [vv, vh, rvi] = await itemStats('sentinel-1-rtc', items[0].id, f, ['10*log10(vv)', '10*log10(vh)', '4*vh/(vv+vh)'], signal)
      const asOf = items[0].properties.datetime.slice(0, 10)
      const rv = [V('s1_vv', vv ? r(vv.mean, 1) : null, { asOf, source: 's1' }), V('s1_vh', vh ? r(vh.mean, 1) : null, { asOf, source: 's1' }), V('s1_rvi', rvi ? r(rvi.mean, 2) : null, { asOf, source: 's1' })]
      values.push(...rv)
      onPart?.(rv)
    }
  } catch {
    // radar is optional
  }

  if (!values.length) throw new SourceError('failed', 'No clear satellite scene of this field in the last 180 days')
  return { values, zones }
}

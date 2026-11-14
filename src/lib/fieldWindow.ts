/**
 * The crop-map window around a field, read in the browser as the field experiments read it (cropMaps.ts): five seasons,
 * 2019-2023, of every sample point - USDA NASS's Cropland Data Layer (USA) and AAFC's Annual Crop Inventory (Canada) as
 * 30 m rasters on a 6 km window, the parcels declared under the CAP in France (RPG, IGN) and Denmark (Marker,
 * Landbrugsstyrelsen) on a 2 km window. All four services answer a page from any origin (checked). Each
 * point's history feeds the practice of the fields around the field (fieldPractice.ts); nothing of it is stored.
 */
import { aciService, CDL_RASTER, CDL_SERVICE, cropOfClass, dkUrl, inPolygon, MAP_SOURCE, RASTER_HALF_M, RASTER_PX, rasterPoints, rpgBbox, rpgPoints, rpgUrl, type GeoJsonPolygon, type MapSource } from './cropMaps'
import type { CropId } from './crops'

export const WINDOW_YEARS = [2019, 2020, 2021, 2022, 2023]
export type FieldWindow = { source: MapSource; years: number[]; histories: (CropId | null)[][] }

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`)
  return (await r.json()) as T
}

/** one year of a raster window's sample points: the service's class at each (as exportWindow in the experiments) */
async function rasterYear(source: 'cdl' | 'aci', lat: number, lon: number, year: number, signal?: AbortSignal): Promise<number[]> {
  const dLat = RASTER_HALF_M / 111_320
  const dLon = dLat / Math.cos((lat * Math.PI) / 180)
  const u = new URL(`${source === 'cdl' ? CDL_SERVICE : aciService(year)}/exportImage`)
  u.search = new URLSearchParams({
    bbox: [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(6)).join(','), bboxSR: '4326', imageSR: '4326',
    size: `${RASTER_PX},${RASTER_PX}`, format: 'tiff', pixelType: 'U8', interpolation: 'RSP_NearestNeighbor', f: 'json',
    ...(source === 'cdl' ? { mosaicRule: JSON.stringify({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [CDL_RASTER[year]] }) } : {}),
  }).toString()
  const j = await json<{ href?: string }>(u.toString(), signal)
  if (!j.href) throw new Error(`${source} ${year}: no image`)
  const r = await fetch(j.href, { signal })
  if (!r.ok) throw new Error(`${source} ${year}: HTTP ${r.status}`)
  const { fromArrayBuffer } = await import('geotiff')
  const img = await (await fromArrayBuffer(await r.arrayBuffer())).getImage()
  const [band] = (await img.readRasters()) as unknown as ArrayLike<number>[]
  return rasterPoints(img.getWidth(), img.getHeight()).map((k) => Number(band[k]))
}

type Features = { features?: { properties: { code_cultu?: string | null; Afgkode?: number | string | null }; geometry: GeoJsonPolygon | null }[] }
/** one year of a parcel window's sample points: the code of the parcel that holds each (null: no parcel declared) */
async function parcelYear(source: 'rpg' | 'dk', lat: number, lon: number, year: number, signal?: AbortSignal): Promise<(string | null)[]> {
  const j = await json<Features>((source === 'rpg' ? rpgUrl : dkUrl)(year, rpgBbox(lat, lon)), signal)
  const parcels = (j.features ?? []).filter((f) => f.geometry).map((f) => {
    const c = source === 'rpg' ? f.properties.code_cultu : f.properties.Afgkode
    return { code: c === null || c === undefined ? null : String(c), geometry: f.geometry as GeoJsonPolygon }
  })
  return rpgPoints(lat, lon).map((p) => parcels.find((x) => inPolygon(p.lon, p.lat, x.geometry))?.code ?? null)
}

/** the window around a field where its country's crop maps exist, else null */
export async function fieldWindow(iso3: string, lat: number, lon: number, signal?: AbortSignal): Promise<FieldWindow | null> {
  const source = MAP_SOURCE[iso3]
  if (!source) return null
  const byYear = await Promise.all(WINDOW_YEARS.map((y) => (source === 'cdl' || source === 'aci' ? rasterYear(source, lat, lon, y, signal) : parcelYear(source, lat, lon, y, signal))))
  return { source, years: WINDOW_YEARS, histories: windowHistories(source, byYear) }
}

/** each sample point's crops over the years, from each year's classes (the history experiments read) */
export function windowHistories(source: MapSource, byYear: (number | string | null)[][]): (CropId | null)[][] {
  const n = Math.min(...byYear.map((y) => y.length))
  return Array.from({ length: n }, (_, i) => byYear.map((y) => cropOfClass(source, y[i])))
}

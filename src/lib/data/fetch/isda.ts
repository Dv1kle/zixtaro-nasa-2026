// src/lib/data/fetch/isda.ts
// iSDAsoil: 30 m soil maps of Africa, read pixel by pixel from cloud-optimised GeoTIFFs on AWS (HTTP range requests,
// CORS-open), so African fields get extractable P, K and micronutrients that no world map offers.
import { cached, DAY, GATES, SourceError } from '../net'
import type { Value } from '../types'

export const AFRICA_BOX = { w: -18, s: -35, e: 52, n: 37.6 }
export const inAfrica = (lat: number, lon: number) => lat >= AFRICA_BOX.s && lat <= AFRICA_BOX.n && lon >= AFRICA_BOX.w && lon <= AFRICA_BOX.e

const exp10 = (x: number) => Math.expm1(x / 10)
export const ISDA_LAYERS: { id: string; layer: string; back: (x: number) => number }[] = [
  { id: 'isda_ph', layer: 'ph', back: (x) => x / 10 },
  { id: 'isda_n', layer: 'nitrogen_total', back: (x) => Math.expm1(x / 100) },
  { id: 'isda_p', layer: 'phosphorous_extractable', back: exp10 },
  { id: 'isda_k', layer: 'potassium_extractable', back: exp10 },
  { id: 'isda_ca', layer: 'calcium_extractable', back: exp10 },
  { id: 'isda_mg', layer: 'magnesium_extractable', back: exp10 },
  { id: 'isda_s', layer: 'sulphur_extractable', back: exp10 },
  { id: 'isda_zn', layer: 'zinc_extractable', back: exp10 },
  { id: 'isda_fe', layer: 'iron_extractable', back: exp10 },
  { id: 'isda_al', layer: 'aluminium_extractable', back: exp10 },
  { id: 'isda_cec', layer: 'cation_exchange_capacity', back: exp10 },
  { id: 'isda_oc', layer: 'carbon_organic', back: exp10 },
  { id: 'isda_depth', layer: 'bedrock_depth', back: (x) => x },
]

const R = 6378137
/** Pixel of a point in an EPSG:3857 raster with the given origin and resolution. */
export function pixelOf(lat: number, lon: number, origin: [number, number], res: [number, number]): { col: number; row: number } {
  const x = ((lon * Math.PI) / 180) * R
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  return { col: Math.floor((x - origin[0]) / res[0]), row: Math.floor((y - origin[1]) / res[1]) }
}

async function readPixel(layer: string, lat: number, lon: number, signal?: AbortSignal): Promise<number | null> {
  const { fromUrl } = await import('geotiff')
  const tiff = await fromUrl(`https://isdasoil.s3.amazonaws.com/soil_data/${layer}/${layer}.tif`, { allowFullFile: false })
  const img = await tiff.getImage()
  const o = img.getOrigin()
  const rs = img.getResolution()
  const { col, row } = pixelOf(lat, lon, [o[0], o[1]], [rs[0], rs[1]])
  if (col < 0 || row < 0 || col >= img.getWidth() || row >= img.getHeight()) return null
  const bands = (await img.readRasters({ window: [col, row, col + 1, row + 1], samples: [0], signal })) as unknown as ArrayLike<number>[]
  const v = bands[0][0]
  return v === 255 || v === undefined ? null : v
}

export function fetchIsda(lat: number, lon: number, signal?: AbortSignal) {
  if (!inAfrica(lat, lon)) return Promise.reject(new SourceError('out-of-coverage', 'iSDAsoil covers Africa only'))
  return cached(`isda:${lat.toFixed(4)},${lon.toFixed(4)}`, 365 * DAY, async () => {
    const vals = await Promise.all(ISDA_LAYERS.map((l) => GATES.isda(() => readPixel(l.layer, lat, lon, signal).catch(() => null))))
    const out: Record<string, number | null> = {}
    ISDA_LAYERS.forEach((l, i) => (out[l.id] = vals[i] === null ? null : Math.round(l.back(vals[i]!) * 100) / 100))
    if (Object.values(out).every((v) => v === null)) throw new SourceError('out-of-coverage', 'iSDAsoil has no value here (outside Africa’s farmland?)')
    return out
  }, { signal })
}

export function isdaValues(data: Record<string, number | null>, from: Value['from']): Value[] {
  return ISDA_LAYERS.filter((l) => data[l.id] != null).map((l) => ({ id: l.id, v: data[l.id]!, source: 'isda' as const, from }))
}

// Crop history "from space": the MODIS 16-day vegetation index over this field, season by season, read from the
// same NASA GIBS tiles the map shows (MODIS_Terra_L3_NDVI_16Day, ≈ 300 m pixels at zoom 9).
//
// GIBS serves the index as coloured tiles, not numbers, so each pixel is mapped back onto the GIBS colour ramp and
// read as a 0-1 "greenness" - the position on that ramp, a monotone stand-in for NDVI, not NDVI itself. Only the
// shape of each season's curve is used: when the field greens up and browns off tells a winter crop (green in spring,
// harvested by midsummer) from a summer crop (peak in July-August), a perennial ley (green all season) and bare
// ground. Which crop it was - wheat or barley, maize or sugar beet - is beyond a 300 m greenness curve, so the result
// is a crop TYPE the farmer confirms, never a crop filled in on their behalf. Mixed pixels (small fields, hedges,
// neighbours) blur the curve; the tropics' rainy seasons make the timing ambiguous and are not classified.

import { NDVI_LEGEND } from './color'

export const NDVI_LAYER = 'MODIS_Terra_L3_NDVI_16Day'
export const ZOOM = 9
/** MODIS 16-day composites start on these days of the year (Terra: 1, 17, 33 … 353). */
export const COMPOSITE_DOYS = Array.from({ length: 23 }, (_, i) => 1 + 16 * i)

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const RAMP = NDVI_LEGEND.map(hex)

/**
 * A pixel's position on the GIBS NDVI colour ramp, 0 (bare) … 1 (densest green): the nearest point on the polyline
 * through the legend colours. null for a transparent / no-data pixel or one far off the ramp (cloud, water, snow).
 */
export function greenness(r: number, g: number, b: number, a = 255): number | null {
  if (a < 128) return null
  let best = Infinity
  let at = 0
  for (let i = 0; i < RAMP.length - 1; i++) {
    const p = RAMP[i]
    const q = RAMP[i + 1]
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
    const len2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2
    const t = Math.max(0, Math.min(1, ((r - p[0]) * d[0] + (g - p[1]) * d[1] + (b - p[2]) * d[2]) / len2))
    const dist = (r - p[0] - t * d[0]) ** 2 + (g - p[1] - t * d[1]) ** 2 + (b - p[2] - t * d[2]) ** 2
    if (dist < best) {
      best = dist
      at = (i + t) / (RAMP.length - 1)
    }
  }
  return best > 60 ** 2 ? null : at
}

/** Web-Mercator tile and the pixel inside it (256 px tiles) for a point. */
export function tilePixel(lat: number, lon: number, z = ZOOM) {
  const n = 2 ** z * 256
  const x = ((lon + 180) / 360) * n
  const s = Math.sin((lat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n
  return { tx: Math.floor(x / 256), ty: Math.floor(y / 256), px: Math.floor(x) % 256, py: Math.floor(y) % 256 }
}

export const compositeDate = (year: number, doy: number) => new Date(Date.UTC(year, 0, doy)).toISOString().slice(0, 10)

export type Obs = { date: string; doy: number; year: number; g: number }
export type SeasonType = 'winter' | 'summer' | 'double' | 'perennial' | 'bare' | 'unclear'
export type SeasonRead = { season: number; type: SeasonType; peakDoy: number | null; amp: number; n: number; curve: (number | null)[] }

export const TYPE_LABEL: Record<SeasonType, string> = {
  winter: 'winter crop',
  summer: 'summer crop',
  double: 'two crops',
  perennial: 'ley / perennial',
  bare: 'bare or fallow',
  unclear: 'unclear',
}
/** What a farmer most often grew under each type - only a starting point for the confirmation. */
export const TYPE_GUESS: Partial<Record<SeasonType, string>> = { winter: 'wheat', summer: 'maize', perennial: 'clover' }

/**
 * Classify one season from its composites. The season runs October → September in the north (harvest year = `season`),
 * April → March in the south (days shifted by half a year so the same windows apply).
 */
export function classifySeason(obs: Obs[], season: number, south: boolean): SeasonRead {
  // shift to a north-style season day: 0 = 1 October of the year before the harvest
  const sday = (o: Obs) => {
    const t = Date.UTC(o.year, 0, o.doy)
    const start = south ? Date.UTC(season - 1, 3, 1) : Date.UTC(season - 1, 9, 1)
    return Math.round((t - start) / 86_400_000)
  }
  const pts = obs.map((o) => ({ d: sday(o), g: o.g })).filter((p) => p.d >= 0 && p.d < 365).sort((a, b) => a.d - b.d)
  const curve: (number | null)[] = Array.from({ length: 23 }, (_, i) => {
    const near = pts.filter((p) => Math.abs(p.d - (8 + 16 * i)) <= 8)
    return near.length ? near.reduce((s, p) => s + p.g, 0) / near.length : null
  })
  const vals = pts.map((p) => p.g)
  if (pts.length < 12) return { season, type: 'unclear', peakDoy: null, amp: 0, n: pts.length, curve }
  const sorted = [...vals].sort((a, b) => a - b)
  const lo = sorted[Math.floor(sorted.length * 0.1)]
  const hi = sorted[Math.floor(sorted.length * 0.9)]
  const amp = hi - lo
  const peak = pts.reduce((a, b) => (b.g > a.g ? b : a))
  // windows in season days (north calendar): spring = March-May (150-240), summer = July-August (270-330)
  const mean = (a: number, b: number) => {
    const w = pts.filter((p) => p.d >= a && p.d < b)
    return w.length ? w.reduce((s, p) => s + p.g, 0) / w.length : lo
  }
  const spring = mean(150, 240)
  const summer = mean(270, 335)
  const growing = pts.filter((p) => p.d >= 180 && p.d < 330)
  const read = (type: SeasonType): SeasonRead => ({ season, type, peakDoy: peak.d, amp, n: pts.length, curve })
  if (hi < 0.35) return read('bare')
  if (growing.length && Math.min(...growing.map((p) => p.g)) > 0.45 && amp < 0.3) return read('perennial')
  if (amp < 0.15) return read('unclear')
  const mid = lo + amp / 2
  // two separated green spells inside the growing season
  let spells = 0
  let inSpell = false
  for (const p of pts.filter((q) => q.d >= 120)) {
    if (p.g > mid && !inSpell) spells++
    inSpell = p.g > mid
  }
  if (spells >= 2 && spring > mid && summer > mid && mean(240, 270) < mid) return read('double')
  if (spring > mid && summer < spring - amp * 0.3) return read('winter')
  if (summer > mid && spring < summer - amp * 0.3) return read('summer')
  return read('unclear')
}

/** Read the index at a pixel from a decoded tile (RGBA, 256 × 256), as the median of a 3 × 3 window. */
export function sampleTile(rgba: Uint8ClampedArray, px: number, py: number): number | null {
  const got: number[] = []
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.min(255, Math.max(0, px + dx))
      const y = Math.min(255, Math.max(0, py + dy))
      const i = (y * 256 + x) * 4
      const g = greenness(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])
      if (g !== null) got.push(g)
    }
  if (got.length < 5) return null
  got.sort((a, b) => a - b)
  return got[Math.floor(got.length / 2)]
}

/** Fetch the composites for the given seasons (browser only: decodes the PNG tiles on a canvas). */
export async function fetchSeasons(lat: number, lon: number, seasons: number[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<Obs[]> {
  const { tx, ty, px, py } = tilePixel(lat, lon)
  const years = new Set<number>()
  for (const s of seasons) {
    years.add(s - 1)
    years.add(s)
  }
  const jobs = [...years].sort().flatMap((year) => COMPOSITE_DOYS.map((doy) => ({ year, doy })))
  const out: Obs[] = []
  let done = 0
  const canvas = new OffscreenCanvas(256, 256)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const run = async ({ year, doy }: { year: number; doy: number }) => {
    const date = compositeDate(year, doy)
    if (Date.UTC(year, 0, doy) > Date.now() - 20 * 86_400_000) return
    try {
      const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NDVI_LAYER}/default/${date}/GoogleMapsCompatible_Level${ZOOM}/${ZOOM}/${ty}/${tx}.png`
      const res = await fetch(url, { signal })
      if (!res.ok) return
      const bmp = await createImageBitmap(await res.blob())
      ctx.clearRect(0, 0, 256, 256)
      ctx.drawImage(bmp, 0, 0)
      const g = sampleTile(ctx.getImageData(0, 0, 256, 256).data, px, py)
      if (g !== null) out.push({ date, doy, year, g })
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
    } finally {
      onProgress?.(++done, jobs.length)
    }
  }
  // a few requests at a time: GIBS is a shared public service
  const queue = [...jobs]
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let j = queue.shift(); j; j = queue.shift()) await run(j)
  }))
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

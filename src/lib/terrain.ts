// Elevation and slope from AWS Terrain Tiles (terrarium PNGs; SRTM is the main source over land).
// Slope matters for the rotation: row crops that leave soil bare erode on slopes.

import type { Field } from './geo'
import { pointInRing, ringBbox } from './geo'
import { TERRAIN_TILES } from './sources'

export type Terrain = {
  elevation: number // m, at the field centre
  min: number
  max: number
  slopePct: number // mean slope over the field, %
  aspect: string | null // which way the field faces
}

const tileCache = new Map<string, Promise<ImageData>>()

function fetchTile(z: number, x: number, y: number): Promise<ImageData> {
  return new Promise<ImageData>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return reject(new Error('no canvas'))
      ctx.drawImage(img, 0, 0)
      resolve(ctx.getImageData(0, 0, img.width, img.height))
    }
    img.onerror = () => reject(new Error('terrain tile failed'))
    img.src = TERRAIN_TILES.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  })
}

export function loadTile(z: number, x: number, y: number): Promise<ImageData> {
  const key = `${z}/${x}/${y}`
  let p = tileCache.get(key)
  if (!p) {
    // one quiet retry for a flaky connection; a failure is not cached, so the next field tries again
    p = fetchTile(z, x, y)
      .catch(() => new Promise<ImageData>((resolve, reject) => setTimeout(() => fetchTile(z, x, y).then(resolve, reject), 1500)))
      .catch((e) => {
        tileCache.delete(key)
        throw e
      })
    tileCache.set(key, p)
  }
  return p
}

export const worldPx = (lat: number, lon: number, z: number) => {
  const n = 256 * 2 ** z
  const x = ((lon + 180) / 360) * n
  const s = Math.sin((lat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n
  return { x, y }
}

export async function elevationAt(lat: number, lon: number, z: number): Promise<number> {
  const { x, y } = worldPx(lat, lon, z)
  const tile = await loadTile(z, Math.floor(x / 256), Math.floor(y / 256))
  const px = Math.min(255, Math.floor(x % 256))
  const py = Math.min(255, Math.floor(y % 256))
  const i = (py * 256 + px) * 4
  const d = tile.data
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

/** Slope and downhill direction from central differences ~2 pixels apart. */
async function slopeAt(lat: number, lon: number, z: number): Promise<{ slope: number; aspectDeg: number }> {
  const mPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z
  const dDeg = (2 * mPerPx) / 111320
  const dLon = dDeg / Math.cos((lat * Math.PI) / 180)
  const [n, s, e, w] = await Promise.all([
    elevationAt(lat + dDeg, lon, z), elevationAt(lat - dDeg, lon, z),
    elevationAt(lat, lon + dLon, z), elevationAt(lat, lon - dLon, z),
  ])
  const dzdx = (e - w) / (4 * mPerPx)
  const dzdy = (n - s) / (4 * mPerPx)
  const slope = Math.hypot(dzdx, dzdy) * 100
  const aspectDeg = ((Math.atan2(-dzdx, -dzdy) * 180) / Math.PI + 360) % 360 // direction the slope faces (downhill)
  return { slope, aspectDeg }
}

export async function terrainFor(field: Field): Promise<Terrain> {
  const z = 13 // ~12-19 m pixels; the source DEM is ~30 m
  if (field.kind === 'point') {
    const [elevation, sl] = await Promise.all([elevationAt(field.lat, field.lon, z), slopeAt(field.lat, field.lon, z)])
    return { elevation, min: elevation, max: elevation, slopePct: sl.slope, aspect: sl.slope > 1 ? COMPASS[Math.round(sl.aspectDeg / 45) % 8] : null }
  }
  const [w, s, e, n] = ringBbox(field.ring)
  const pts: { lat: number; lon: number }[] = []
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const lat = s + ((n - s) * i) / 8
    const lon = w + ((e - w) * j) / 8
    if (pointInRing(lat, lon, field.ring)) pts.push({ lat, lon })
  }
  if (pts.length === 0) pts.push({ lat: field.lat, lon: field.lon })
  const zz = field.areaHa > 50_000 ? 10 : field.areaHa > 2_000 ? 12 : z
  const elevs = await Promise.all(pts.map((p) => elevationAt(p.lat, p.lon, zz)))
  const slopes = await Promise.all(pts.slice(0, 25).map((p) => slopeAt(p.lat, p.lon, zz)))
  const centre = await elevationAt(field.lat, field.lon, zz)
  const meanSlope = slopes.reduce((a, b) => a + b.slope, 0) / slopes.length
  // average aspect as a vector mean
  const vx = slopes.reduce((a, b) => a + Math.sin((b.aspectDeg * Math.PI) / 180) * b.slope, 0)
  const vy = slopes.reduce((a, b) => a + Math.cos((b.aspectDeg * Math.PI) / 180) * b.slope, 0)
  const aspDeg = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360
  return {
    elevation: centre,
    min: Math.min(...elevs),
    max: Math.max(...elevs),
    slopePct: meanSlope,
    aspect: meanSlope > 1 ? COMPASS[Math.round(aspDeg / 45) % 8] : null,
  }
}

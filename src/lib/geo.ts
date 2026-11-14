// Field geometry: a field is either a point or a drawn/looked-up area (a polygon ring).

export type LonLat = [number, number]

export type Field =
  | { kind: 'point'; lat: number; lon: number; label?: string }
  | { kind: 'area'; ring: LonLat[]; lat: number; lon: number; areaHa: number; label?: string }

const R = 6378137 // WGS84 equatorial radius, m
const rad = (d: number) => (d * Math.PI) / 180

/** Geodesic area of a ring in hectares (spherical excess, as in Mapbox geojson-area). */
export function ringAreaHa(ring: LonLat[]): number {
  if (ring.length < 3) return 0
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i]
    const [lon2, lat2] = ring[(i + 1) % ring.length]
    sum += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)))
  }
  return Math.abs((sum * R * R) / 2) / 10_000
}

/** Area-weighted centroid (planar in lon/lat - fine at field and district scale). */
export function ringCentroid(ring: LonLat[]): { lat: number; lon: number } {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    const f = x1 * y2 - x2 * y1
    a += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  if (Math.abs(a) < 1e-12) {
    const n = ring.length
    return { lon: ring.reduce((s, p) => s + p[0], 0) / n, lat: ring.reduce((s, p) => s + p[1], 0) / n }
  }
  return { lon: cx / (3 * a), lat: cy / (3 * a) }
}

export function pointInRing(lat: number, lon: number, ring: LonLat[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function ringBbox(ring: LonLat[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [x, y] of ring) {
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y)
  }
  return [w, s, e, n]
}

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h))
}

/** Initial compass bearing from a to b, degrees 0..360. */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Points to sample inside an area, spread out: the centroid first, then farthest-point picks
 * from a grid of interior candidates. One sample per ~SoilGrids pixel is pointless, so small
 * fields get one point.
 */
export function samplePoints(ring: LonLat[], areaHa: number): { lat: number; lon: number }[] {
  const n = areaHa < 8 ? 1 : areaHa < 60 ? 3 : 5
  const c = ringCentroid(ring)
  const first = pointInRing(c.lat, c.lon, ring) ? c : interiorPoint(ring)
  if (n === 1) return [first]
  const [w, s, e, nn] = ringBbox(ring)
  const cands: { lat: number; lon: number }[] = []
  const steps = 14
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const lon = w + ((e - w) * i) / steps
      const lat = s + ((nn - s) * j) / steps
      if (pointInRing(lat, lon, ring)) cands.push({ lat, lon })
    }
  }
  const out = [first]
  while (out.length < n && cands.length) {
    let best = 0
    let bestD = -1
    cands.forEach((p, i) => {
      const d = Math.min(...out.map((q) => distanceM(p, q)))
      if (d > bestD) {
        bestD = d
        best = i
      }
    })
    out.push(cands.splice(best, 1)[0])
  }
  // Edge pixels mix in the neighbours' soil - pull the outer samples toward the centre.
  return out.map((p, i) => {
    if (i === 0) return p
    const q = { lat: p.lat + (first.lat - p.lat) * 0.35, lon: p.lon + (first.lon - p.lon) * 0.35 }
    return pointInRing(q.lat, q.lon, ring) ? q : p
  })
}

function interiorPoint(ring: LonLat[]): { lat: number; lon: number } {
  const [w, s, e, n] = ringBbox(ring)
  for (let k = 1; k < 40; k++) {
    const lat = s + ((n - s) * ((k * 0.618) % 1))
    const lon = w + ((e - w) * ((k * 0.382) % 1))
    if (pointInRing(lat, lon, ring)) return { lat, lon }
  }
  return ringCentroid(ring)
}

/** NASA POWER cells are ~0.5° × 0.625°: territories wider than one cell get several climate samples. */
export function powerPoints(field: Field): { lat: number; lon: number }[] {
  if (field.kind === 'point') return [{ lat: field.lat, lon: field.lon }]
  const [w, s, e, n] = ringBbox(field.ring)
  if (n - s < 0.45 && e - w < 0.55) return [{ lat: field.lat, lon: field.lon }]
  return samplePoints(field.ring, Math.max(field.areaHa, 1000))
}

/** Stable key for caches and effects. */
export function fieldKey(field: Field): string {
  return field.kind === 'point' ? `p:${field.lat.toFixed(5)},${field.lon.toFixed(5)}` : `a:${encodeRing(field.ring)}`
}

export function makeArea(ring: LonLat[], label?: string): Field {
  const clean = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  const c = ringCentroid(clean)
  return { kind: 'area', ring: clean, lat: c.lat, lon: c.lon, areaHa: ringAreaHa(clean), label }
}

/** Keep URLs and maps light: thin a ring to at most `max` vertices. */
export function thinRing(ring: LonLat[], max = 160): LonLat[] {
  if (ring.length <= max) return ring
  const step = ring.length / max
  return Array.from({ length: max }, (_, i) => ring[Math.floor(i * step)])
}

// ---------- Google encoded polyline (precision 5) for compact URLs ----------

export function encodeRing(ring: LonLat[]): string {
  let out = ''
  let pLat = 0
  let pLon = 0
  const enc = (v: number) => {
    let x = v < 0 ? ~(v << 1) : v << 1
    let s = ''
    while (x >= 0x20) {
      s += String.fromCharCode((0x20 | (x & 0x1f)) + 63)
      x >>= 5
    }
    return s + String.fromCharCode(x + 63)
  }
  for (const [lon, lat] of ring) {
    const la = Math.round(lat * 1e5)
    const lo = Math.round(lon * 1e5)
    out += enc(la - pLat) + enc(lo - pLon)
    pLat = la
    pLon = lo
  }
  return out
}

export function decodeRing(s: string): LonLat[] {
  const out: LonLat[] = []
  let i = 0
  let lat = 0
  let lon = 0
  const next = () => {
    let result = 0
    let shift = 0
    let b: number
    do {
      b = s.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20 && i < s.length + 1)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < s.length) {
    lat += next()
    lon += next()
    out.push([lon / 1e5, lat / 1e5])
  }
  return out
}

export function formatArea(ha: number): string {
  if (ha >= 10_000) return `${Math.round(ha / 100).toLocaleString('en-US')} km²`
  if (ha >= 100) return `${Math.round(ha).toLocaleString('en-US')} ha`
  return `${ha.toFixed(1)} ha`
}

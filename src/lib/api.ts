// Network layer: NASA POWER (monthly + daily), ISRIC SoilGrids, Open-Meteo, OSM Nominatim.
// Responses are cached in localStorage, and the demo fields ship pre-baked JSON
// so a hackathon demo survives bad Wi-Fi or an API outage.

import type { RawPower } from './climate'
import { compactDaily, type Daily } from './dailyFormat'
import { makeArea, powerPoints, samplePoints, thinRing, type Field, type LonLat } from './geo'
import { presetFor } from './presets'
import type { SoilGridsResponse } from './soil'
import { forecastUrl, powerDailyUrl, powerUrl, soilUrl } from './sources'
import { imergUrl, type RawImerg } from './rainTwo'
import { GATES } from './data/net'
import { dailyAtHeight, powerAtHeight, type Height } from './height'
import { elevationAt } from './terrain'

export type Provenance = 'live' | 'cache' | 'bundled'
export type Fetched<T> = { data: T; from: Provenance; url: string }

const CACHE_VERSION = 'v2'
const HOUR = 3_600_000
const DAY = 24 * HOUR

function readCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(`zixtaro:${CACHE_VERSION}:${key}`)
    if (!raw) return null
    const { t, v } = JSON.parse(raw) as { t: number; v: T }
    return Date.now() - t < maxAgeMs ? v : null
  } catch {
    return null
  }
}

function writeCache<T>(key: string, v: T) {
  try {
    localStorage.setItem(`zixtaro:${CACHE_VERSION}:${key}`, JSON.stringify({ t: Date.now(), v }))
  } catch {
    // Storage full or blocked - caching is a convenience only.
  }
}

// The NASA POWER series cached before the height change carry no cell height (keys power: and daily:, now powerz: and dailyz:):
// dropped once, so they do not fill the storage the new ones need.
try {
  for (const k of Object.keys(localStorage)) if (/^zixtaro:v2:(power|daily):/.test(k)) localStorage.removeItem(k)
} catch {
  // storage blocked or absent
}

async function getJson<T>(url: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!res.ok) {
    const err = new Error(`${new URL(url).hostname} responded ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return (await res.json()) as T
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

// ---------- Pre-baked demo bundles ----------

type Bundle = { power: RawPower; soil: SoilGridsResponse[]; samples: { lat: number; lon: number }[]; daily: Daily; fetchedAt: string }
const bundles = new Map<string, Promise<Bundle | null>>()

function bundleFor(field: Field): Promise<Bundle | null> {
  const preset = presetFor(field)
  if (!preset) return Promise.resolve(null)
  const id = preset.bundle ?? preset.id
  let p = bundles.get(id)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/presets/${id}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Bundle>) : null))
      .catch(() => null)
    bundles.set(id, p)
  }
  return p
}

// ---------- NASA POWER monthly ----------

const endYears = () => [new Date().getFullYear() - 1, new Date().getFullYear() - 2]

/** Moving POWER to the field's height (height.ts): off after held-out check S (as registered, not confirmed),
 *  on again since check T, which confirmed it at 5.0 °C per km on fresh stations. */
const MOVE = true
/** The ground's height at a point from the terrain tiles (the DEM behind terrain.ts), null when they fail. */
const groundAt = (lat: number, lon: number) => elevationAt(lat, lon, 13).catch(() => null)
type Geo = { geometry?: { coordinates?: number[] } }
/** the mean height of the land under POWER's grid cell, which the API gives as the point's third coordinate */
const cellZ = (json: Geo) => json.geometry?.coordinates?.[2] ?? null

async function powerAt(lat: number, lon: number, signal?: AbortSignal): Promise<{ data: RawPower; z: number | null; from: Provenance; url: string }> {
  const key = `powerz:${lat.toFixed(3)},${lon.toFixed(3)}`
  const cached = readCache<{ data: RawPower; z: number | null }>(key, 30 * DAY)
  if (cached) return { ...cached, from: 'cache', url: powerUrl(lat, lon, endYears()[0]) }
  let lastError: unknown
  // Early in a year POWER may not have published the previous year yet.
  for (const end of endYears()) {
    const url = powerUrl(lat, lon, end)
    try {
      const json = await getJson<Geo & { properties?: { parameter?: RawPower } }>(url, 45_000, signal)
      const data = json.properties?.parameter
      if (!data) throw new Error('NASA POWER returned no parameters')
      const z = cellZ(json)
      writeCache(key, { data, z })
      return { data, z, from: 'live', url }
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('NASA POWER request failed')
}

/**
 * GPM IMERG rain for the point, month by month since 2001, through NASA POWER (rainTwo.ts): the satellite record set
 * beside the reanalysis the model runs on. A cross-check only - nothing waits for it and nothing is scored with it,
 * so it is asked for when its panel is opened and not baked into the demo bundles.
 */
export async function fetchImerg(lat: number, lon: number, signal?: AbortSignal): Promise<Fetched<RawImerg>> {
  const key = `imerg:${lat.toFixed(3)},${lon.toFixed(3)}`
  const cached = readCache<RawImerg>(key, 30 * DAY)
  if (cached) return { data: cached, from: 'cache', url: imergUrl(lat, lon, endYears()[0]) }
  let lastError: unknown
  for (const end of endYears()) {
    const url = imergUrl(lat, lon, end)
    try {
      const data = await GATES.power(() => getJson<RawImerg>(url, 45_000, signal))
      if (!data.properties?.parameter?.IMERG_PRECTOT) throw new Error('NASA POWER returned no IMERG rain')
      // (only the series is kept: the answer's header and geometry are of no use later)
      const slim: RawImerg = { properties: { parameter: { IMERG_PRECTOT: data.properties.parameter.IMERG_PRECTOT } } }
      writeCache(key, slim)
      return { data: slim, from: 'live', url }
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('NASA POWER request failed')
}

/** Mean of several POWER series, value by value (for territories wider than one grid cell). */
export function averagePower(raws: RawPower[]): RawPower {
  if (raws.length === 1) return raws[0]
  const out: RawPower = {}
  for (const param of Object.keys(raws[0]) as (keyof RawPower)[]) {
    const acc: Record<string, number> = {}
    for (const key of Object.keys(raws[0][param] ?? {})) {
      const vals = raws.map((r) => r[param]?.[key]).filter((v): v is number => typeof v === 'number' && v > -900)
      acc[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : -999
    }
    out[param] = acc
  }
  return out
}

/** Monthly NASA POWER series for a field (averaged over several cells for large territories), each moved from its
 *  cell's mean height to the ground's under its point (height.ts); the demo bundles keep the cell's, as calibrated. */
export async function fetchPower(field: Field, signal?: AbortSignal): Promise<Fetched<RawPower> & { points: number; height: Height | null }> {
  const bundled = await bundleFor(field)
  if (bundled) return { data: bundled.power, from: 'bundled', url: powerUrl(field.lat, field.lon, endYears()[0]), points: 1, height: null }
  const pts = powerPoints(field)
  const results = await Promise.all(pts.map(async (p) => ({ ...(await powerAt(p.lat, p.lon, signal)), ground: await groundAt(p.lat, p.lon) })))
  const from: Provenance = results.every((r) => r.from === 'cache') ? 'cache' : 'live'
  const moved = MOVE ? results.filter((r) => r.z != null && r.ground != null) : []
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return {
    data: averagePower(results.map((r) => (moved.includes(r) ? powerAtHeight(r.data, r.z!, r.ground!) : r.data))),
    from, url: results[0].url, points: pts.length,
    height: moved.length && moved.length === results.length ? { cell: mean(moved.map((r) => r.z!)), field: mean(moved.map((r) => r.ground!)) } : null,
  }
}

// ---------- NASA POWER daily ----------

export async function fetchDaily(field: Field, signal?: AbortSignal): Promise<Fetched<Daily>> {
  const bundled = await bundleFor(field)
  if (bundled?.daily) return { data: bundled.daily, from: 'bundled', url: powerDailyUrl(field.lat, field.lon, endYears()[0]) }
  const key = `dailyz:${field.lat.toFixed(3)},${field.lon.toFixed(3)}`
  const ground = groundAt(field.lat, field.lon)
  const atField = async (d: { data: Daily; z: number | null }) => {
    const g = await ground
    return MOVE && d.z != null && g != null ? dailyAtHeight(d.data, d.z, g) : d.data
  }
  const cached = readCache<{ data: Daily; z: number | null }>(key, 30 * DAY)
  if (cached) return { data: await atField(cached), from: 'cache', url: powerDailyUrl(field.lat, field.lon, endYears()[0]) }
  let lastError: unknown
  for (const end of endYears()) {
    const url = powerDailyUrl(field.lat, field.lon, end)
    try {
      const json = await getJson<Geo & { properties?: { parameter?: Parameters<typeof compactDaily>[0] } }>(url, 60_000, signal)
      if (!json.properties?.parameter) throw new Error('NASA POWER returned no daily data')
      const d = { data: compactDaily(json.properties.parameter), z: cellZ(json) }
      writeCache(key, d)
      return { data: await atField(d), from: 'live', url }
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('NASA POWER daily request failed')
}

// ---------- SoilGrids, one or several samples ----------

// SoilGrids fair use (≤ 5 requests a minute) is kept by one gate shared with the field dossier (data/net.ts)

async function soilAt(lat: number, lon: number, signal?: AbortSignal): Promise<{ data: SoilGridsResponse; from: Provenance }> {
  const key = `soil:${lat.toFixed(4)},${lon.toFixed(4)}`
  const cached = readCache<SoilGridsResponse>(key, 90 * DAY)
  if (cached) return { data: cached, from: 'cache' }
  for (let attempt = 0; ; attempt++) {
    try {
      const data = await GATES.soilgrids(() => getJson<SoilGridsResponse>(soilUrl(lat, lon), 40_000, signal))
      writeCache(key, data)
      return { data, from: 'live' }
    } catch (e) {
      if (signal?.aborted || attempt >= 1 || (e as { status?: number }).status !== 429) throw e
      await sleep(15_000, signal) // rate-limited: back off once
    }
  }
}

export type SoilSamples = { responses: (SoilGridsResponse | null)[]; points: { lat: number; lon: number }[] }

/**
 * SoilGrids at the field point, or at 1-5 spread-out points inside an area.
 * `onSample` fires as each sample lands, so the UI can refine progressively.
 */
export async function fetchSoil(
  field: Field,
  signal: AbortSignal | undefined,
  onSample?: (s: SoilSamples, done: number) => void,
): Promise<Fetched<SoilSamples>> {
  const bundled = await bundleFor(field)
  if (bundled) {
    const s = { responses: bundled.soil, points: bundled.samples }
    onSample?.(s, s.points.length)
    return { data: s, from: 'bundled', url: soilUrl(field.lat, field.lon) }
  }
  const points = field.kind === 'point' ? [{ lat: field.lat, lon: field.lon }] : samplePoints(field.ring, field.areaHa)
  const responses: (SoilGridsResponse | null)[] = points.map(() => null)
  let anyLive = false
  let firstError: unknown = null
  for (let i = 0; i < points.length; i++) {
    try {
      const r = await soilAt(points[i].lat, points[i].lon, signal)
      responses[i] = r.data
      anyLive ||= r.from === 'live'
    } catch (e) {
      if (signal?.aborted) throw e
      firstError ??= e
    }
    onSample?.({ responses: [...responses], points }, i + 1)
  }
  if (responses.every((r) => r === null)) throw firstError instanceof Error ? firstError : new Error('SoilGrids request failed')
  return { data: { responses, points }, from: anyLive ? 'live' : 'cache', url: soilUrl(field.lat, field.lon) }
}

// ---------- Open-Meteo 16-day outlook ----------

export async function fetchForecastRaw(field: Field, signal?: AbortSignal): Promise<Fetched<unknown>> {
  const url = forecastUrl(field.lat, field.lon)
  const key = `forecast:${field.lat.toFixed(2)},${field.lon.toFixed(2)}`
  const fresh = readCache<unknown>(key, 2 * HOUR)
  if (fresh) return { data: fresh, from: 'cache', url }
  try {
    const data = await getJson<unknown>(url, 20_000, signal)
    writeCache(key, data)
    return { data, from: 'live', url }
  } catch (e) {
    const stale = readCache<unknown>(key, 30 * DAY)
    if (stale && !signal?.aborted) return { data: stale, from: 'cache', url }
    throw e
  }
}

// ---------- Places & territories (OSM Nominatim) ----------

export type Place = { label: string; lat: number; lon: number; area?: Field; kind: string }

type NominatimHit = {
  display_name: string
  lat: string
  lon: string
  name?: string
  type?: string
  addresstype?: string
  address?: Record<string, string>
  geojson?: { type: string; coordinates: unknown }
}

function shortLabel(hit: NominatimHit): string {
  const a = hit.address
  if (!a) return hit.display_name.split(',').slice(0, 3).join(',')
  const local = hit.name || a.village || a.town || a.city || a.municipality || a.hamlet || a.county
  return [local, a.state ?? a.region, a.country].filter(Boolean).join(', ')
}

/** Largest outer ring of a (Multi)Polygon, thinned for the map and the URL. */
function outerRing(g: NominatimHit['geojson']): LonLat[] | null {
  if (!g) return null
  const polys = g.type === 'Polygon' ? [g.coordinates as LonLat[][]] : g.type === 'MultiPolygon' ? (g.coordinates as LonLat[][][]) : []
  let best: LonLat[] | null = null
  for (const p of polys) if (p[0] && (!best || p[0].length > best.length)) best = p[0]
  return best && best.length >= 4 ? thinRing(best, 400) : null
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&polygon_geojson=1&polygon_threshold=0.0005&accept-language=en' +
    `&q=${encodeURIComponent(q)}`
  const hits = await getJson<NominatimHit[]>(url, 12_000, signal)
  return hits.map((h) => {
    const ring = outerRing(h.geojson)
    const label = shortLabel(h)
    return {
      label,
      lat: Number(h.lat),
      lon: Number(h.lon),
      area: ring ? makeArea(ring, label) : undefined,
      kind: h.addresstype ?? h.type ?? 'place',
    }
  })
}

export async function reversePlace(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const key = `place-en:${lat.toFixed(3)},${lon.toFixed(3)}`
  const cached = readCache<string>(key, 365 * DAY)
  if (cached) return cached
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=en&zoom=12&lat=${lat}&lon=${lon}`
    const hit = await getJson<NominatimHit>(url, 10_000, signal)
    const label = shortLabel({ ...hit, name: undefined })
    if (label) writeCache(key, label)
    return label || null
  } catch {
    return null
  }
}

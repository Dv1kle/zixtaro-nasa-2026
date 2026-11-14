// Markets from open records, baked by scripts/markets.mjs into src/data/markets.json: FAOSTAT producer prices and
// trade by country, World Bank price levels and applied tariffs, Natural Earth countries and capitals.
// Named imports keep only these small keys of the bake in the main chunk. The price, trade and yield records (~440 kB
// of its ~500 kB) are fetched by the page in parallel with the field's NASA data (loadMarketRecords).
import { countries, eurPerUsd, fetched, shelf, sources, subRatio, world, years } from '../data/markets.json'
import { CROPS, type CropId } from './crops'
import type { GhCropId } from './greenhouse'

export type CropKey = CropId | GhCropId
export type Country = { iso3: string; a2: string; name: string; names?: Partial<Record<'ru' | 'uk' | 'de', string>>; hub: [number, number]; sub: string; union: string | null; land: number; island: boolean; plr: number | null; tariff: number | null }
export type Shape = { iso3: string; bbox: [number, number, number, number]; rings: [number, number][][] }
export type Data = {
  fetched: string
  years: number[]
  countries: Country[]
  prices: Record<string, Partial<Record<CropKey, (number | null)[]>>>
  world: Partial<Record<CropKey, number>>
  subRatio: Record<string, number>
  trade: Record<string, Partial<Record<CropKey, [number, number, number]>>>
  /** observed yield, t/ha (FAOSTAT, mean 2019-2023), where the country harvests at least 1 000 ha */
  yields: Record<string, Partial<Record<CropKey, number>>>
  shelf: Partial<Record<CropKey, number>>
  sources: Record<string, { url: string; note: string }>
}
/** A producer price, € per tonne: the bad-year (P25) price used for scoring, the median, and the spread. */
export type PriceQuote = { p25: number; median: number; p10: number; p90: number; source: 'faostat' | 'estimate' }

/** prices, trade and yields are missing until loadMarketRecords() resolves: reading them earlier throws, never
 *  silently falls back to estimates */
export const MARKETS = { fetched, years, eurPerUsd, countries, world, subRatio, shelf, sources } as unknown as Data
export const COUNTRY: Record<string, Country> = Object.fromEntries(MARKETS.countries.map((c) => [c.iso3, c]))

// the bake itself, emitted by the build as a separate asset
const BAKE = new URL('../data/markets.json', import.meta.url)
const fill = (d: Data) => void Object.assign(MARKETS, { prices: d.prices, trade: d.trade, yields: d.yields })
let records: Promise<void> | null = null
export const marketRecordsLoaded = () => 'prices' in MARKETS
/** Fetches the price, trade and yield records once; a failed fetch is retried on the next call. */
export function loadMarketRecords(): Promise<void> {
  if (marketRecordsLoaded()) return Promise.resolve()
  records ??= fetch(BAKE)
    .then((r) => (r.ok ? (r.json() as Promise<Data>) : Promise.reject(new Error(`markets ${r.status}`))))
    .then(fill, (e) => {
      records = null
      throw e
    })
  return records
}
// Node (tests, eval scripts) reads them from disk at once, so nothing there runs on a half-filled table
const nodeFs = typeof process !== 'undefined' ? process.getBuiltinModule?.('fs') : undefined
if (nodeFs) fill(JSON.parse(nodeFs.readFileSync(BAKE, 'utf8')))

export function gcKm([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const r = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}

function inRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
/** The country a point lies in (even-odd over all rings, so holes and islands work), or null at sea. */
export function countryAt(lon: number, lat: number, shapes: Shape[]): string | null {
  for (const s of shapes) {
    const [w, so, e, n] = s.bbox
    if (lon < w || lon > e || lat < so || lat > n) continue
    let inside = false
    for (const ring of s.rings) if (inRing(lon, lat, ring)) inside = !inside
    if (inside) return s.iso3
  }
  return null
}
/** Outside every polygon (coast, sea, Antarctica): the country whose capital is nearest. */
export function nearestCountry(lon: number, lat: number): string {
  let best = MARKETS.countries[0]
  let bd = Infinity
  for (const c of MARKETS.countries) {
    const dk = gcKm([lon, lat], c.hub)
    if (dk < bd) {
      bd = dk
      best = c
    }
  }
  return best.iso3
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b)
  const i = (s.length - 1) * q
  const lo = Math.floor(i)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo)
}
/** Producer price in a country, €/t: the 10-year record, or an estimate from the world price × the sub-region ratio. */
export function priceQuote(iso3: string, crop: CropKey, d: Data = MARKETS): PriceQuote | null {
  const ys = (d.prices[iso3]?.[crop] ?? []).filter((v): v is number => v !== null && v > 0)
  if (ys.length >= 3) return { p25: quantile(ys, 0.25), median: quantile(ys, 0.5), p10: quantile(ys, 0.1), p90: quantile(ys, 0.9), source: 'faostat' }
  const w = d.world[crop]
  if (!w) return null
  const c = d.countries.find((x) => x.iso3 === iso3)
  const m = w * (d.subRatio[c?.sub ?? ''] ?? 1)
  // no record of how prices swing here: assume a typical ±20 % around the estimate
  return { p25: m * 0.9, median: m, p10: m * 0.8, p90: m * 1.2, source: 'estimate' }
}

/** Import dependence of a market for a crop, scaled to ±10 % of the profit sub-score. */
export function demandAdj(iso3: string, crop: CropKey, d: Data = MARKETS): number {
  const t = d.trade[iso3]?.[crop]
  if (!t) return 0
  const [prod, imp, exp] = t
  const denom = prod + imp
  if (denom <= 0) return 0
  return 0.1 * Math.max(-1, Math.min(1, (imp - exp) / denom))
}

/** Share of a crop's variable costs that follows the local price level: hired labour, custom work and repairs.
 *  Seed, fertiliser, sprays and fuel (≈85 % of operating costs, USDA ERS Commodity Costs and Returns) trade at
 *  world prices. */
export const LOCAL_COST_SHARE = 0.15
/** Variable costs here vs the EU median: the local share scales with the country's price level (World Bank ICP). */
export function costIndex(iso3: string): number {
  const plr = COUNTRY[iso3]?.plr ?? 1
  return 1 - LOCAL_COST_SHARE + LOCAL_COST_SHARE * Math.max(0.3, Math.min(1.6, plr))
}

/** The markets next door: the customs union, or else the same UN sub-region. */
export function regionOf(iso3: string): string[] {
  const c = COUNTRY[iso3]
  if (!c) return []
  return MARKETS.countries.filter((x) => x.iso3 !== iso3 && (c.union ? x.union === c.union : x.sub === c.sub)).map((x) => x.iso3)
}

/** Apparent consumption of a crop in a country, t per year (production + imports − exports; 0 when unknown). */
export function consumption(iso3: string, crop: CropKey, d: Data = MARKETS): number {
  const t = d.trade[iso3]?.[crop]
  return t ? Math.max(0, t[0] + t[1] - t[2]) : 0
}

const medianOf = (xs: number[]) => (xs.length ? quantile(xs, 0.5) : null)
const yieldCache = new Map<string, { t: number; source: 'country' | 'region' | 'world' } | null>()
/**
 * What farms really harvest, t/ha: the country's own record; where it does not grow the crop, the median of its
 * sub-region, else of the world - a crop nobody nearby grows has no local proof of a high yield.
 */
export function observedYield(iso3: string, crop: CropKey, d: Data = MARKETS): { t: number; source: 'country' | 'region' | 'world' } | null {
  const key = `${iso3}|${crop}`
  if (yieldCache.has(key) && d === MARKETS) return yieldCache.get(key)!
  const own = d.yields[iso3]?.[crop]
  let out: { t: number; source: 'country' | 'region' | 'world' } | null = own ? { t: own, source: 'country' } : null
  if (!out) {
    const sub = COUNTRY[iso3]?.sub
    const region = medianOf(d.countries.filter((c) => c.sub === sub && c.iso3 !== iso3).map((c) => d.yields[c.iso3]?.[crop]).filter((v): v is number => !!v))
    const world = medianOf(Object.values(d.yields).map((y) => y[crop]).filter((v): v is number => !!v))
    out = region ? { t: region, source: 'region' } : world ? { t: world, source: 'world' } : null
  }
  if (d === MARKETS) yieldCache.set(key, out)
  return out
}

/**
 * Below this share of a country's harvested area (of the crops Zixtaro models) a crop is grown in niches - irrigated
 * valleys, peri-urban gardens - and its national yield says little about an ordinary field: Senegal harvests 43 t/ha of
 * sweet potatoes on 2 000 ha, Niger 29 t/ha of cassava in its river valleys. An assumption: 1 % separated the niches
 * (0.03-0.9 %) from the crops grown at scale (1.7 % and up) among the development cells' false picks.
 */
export const NICHE_SHARE = 0.01

/** The observed yield of every field crop a country (or, failing that, its region or the world) reports - the engine's yieldRef. */
export function observedYields(iso3: string): Partial<Record<CropId, { t: number; source: 'country' | 'region' | 'world'; niche?: boolean }>> {
  const area = (id: CropId) => {
    const prod = MARKETS.trade[iso3]?.[id]?.[0] ?? 0
    const y = MARKETS.yields[iso3]?.[id] ?? 0
    return prod > 0 && y > 0 ? prod / y : 0
  }
  const total = CROPS.reduce((a, c) => a + area(c.id), 0)
  return Object.fromEntries(CROPS.flatMap((c) => {
    const y = observedYield(iso3, c.id)
    if (!y) return []
    return [[c.id, y.source === 'country' && total > 0 && area(c.id) / total < NICHE_SHARE ? { ...y, niche: true } : y] as const]
  }))
}

/** A country's name in the reader's language where Natural Earth has it (ru, uk, de), else English. */
export function countryLabel(iso3: string, lang = 'en'): string {
  const c = COUNTRY[iso3]
  if (!c) return iso3
  return (c.names as Record<string, string | undefined> | undefined)?.[lang.split('-')[0]] ?? c.name
}

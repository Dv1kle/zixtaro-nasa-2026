// Market access. Fresh produce that keeps for days, not months, has to reach a market while it is fresh: travel time
// from the field to the nearest city of 50 000 people or more (Nelson et al. 2019, roads and terrain of 2015), and how
// far from such cities the world actually grows each perishable crop (CROPGRIDS 2020) - scripts/access.py.
import data from '../data/access.json'
import type { CropId } from './crops'
import { MARKETS } from './markets'

export const ACCESS_SOURCE = data.source

/** Produce that keeps under this many days (src/data/markets.json shelf lives) needs a market within reach. */
export const PERISHABLE_DAYS = 30

/**
 * The reach of a perishable crop, hours: the travel time to a city of 50 000+ inside which 95 % of its world harvested
 * area lies. Beyond it a field is farther out than nearly all of the world's growers. Null for produce that stores.
 */
export function marketReach(id: CropId): number | null {
  const shelf = MARKETS.shelf[id]
  if (shelf === undefined || shelf >= PERISHABLE_DAYS) return null
  return (data.hours as Record<string, { p95: number } | undefined>)[id]?.p95 ?? null
}

/**
 * What a perishable crop keeps of its standing beyond its reach: a judgement on LOCAL_PROOF's scale (0.5 = only the
 * world grows it), not a fitted value - without a buyer under contract a fresh harvest has nowhere to go.
 */
export const MARKET_REACH_GATE = 0.5

/** public/data/access/cities50k.bin: 720 × 1440 u8, 0.25°, rows from 90° N; 10-minute steps; 255 = no data. */
export const parseAccess = (buf: ArrayBuffer) => new Uint8Array(buf)

export function hoursAt(grid: Uint8Array, lat: number, lon: number): number | null {
  const r = Math.min(719, Math.max(0, Math.floor((90 - lat) / 0.25)))
  const c = Math.min(1439, Math.max(0, Math.floor((((lon + 180) % 360) + 360) % 360 / 0.25)))
  const v = grid[r * 1440 + c]
  return v === undefined || v === 255 ? null : (v * 10) / 60
}

let loaded: Promise<Uint8Array | null> | null = null
/**
 * Travel time from the field to the nearest city of 50 000+, hours; null when the grid has none there or could not be
 * loaded (a failed download is tried again on the next call).
 */
export async function cityHours(lat: number, lon: number): Promise<number | null> {
  loaded ??= fetch(`${import.meta.env.BASE_URL}data/access/cities50k.bin`)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b ? parseAccess(b) : null))
    .catch(() => null)
  const g = await loaded
  if (!g) loaded = null
  return g ? hoursAt(g, lat, lon) : null
}

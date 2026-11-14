// What farms around sow after the last two crops: observed rotations from field-level records (USDA CDL, AAFC ACI,
// French RPG, 2019-2024). Observed practice - never part of the scientific score (mode A); it
// joins the practice-informed view, where it stands in for the region's crop shares when the field's history is known.
// Experiment H: "the crop of two seasons before" alone named the crop sown on 60 % of fields, while the
// engine's own rotation rules named 33 %.
import type { CropId } from './crops'

export type RotationWindow = { id: string; iso3: string; source: 'cdl' | 'aci' | 'rpg'; lat: number; lon: number; points: number; triples: number; counts: Record<string, number> }
export type RotationWindows = { years: number[]; windows: RotationWindow[]; built?: string; source?: string; method?: string }
export type RotationPrior = {
  /** share of fields sowing each crop next, 0-1; crops the engine does not rank keep their share of the total */
  probs: Partial<Record<CropId, number>>
  /** the evidence used: the last two crops, the last one, or the region's sowings regardless of history */
  level: 'two' | 'one' | 'region'
  /** weighted number of observed sowings behind it */
  n: number
  windows: number
  nearestKm: number
  /** the records behind it: USDA CDL, AAFC ACI, French RPG */
  sources: RotationWindow['source'][]
}

/** how far observed rotations travel: windows within REACH_KM count, weighted by a Gaussian of SIGMA_KM */
export const REACH_KM = 250
export const SIGMA_KM = 100
/** the fewest weighted observations a level needs before the prior uses it */
export const MIN_N = 30
/** Leave-one-window-out check (evidence 'rotationprior'): on fields whose
 *  last two seasons were not both grass, the share of sample points whose next crop it named first - and the share
 *  "the crop of two seasons before" named. */
export const PRIOR_CHECK = { top1: 0.617, twoBack: 0.545 }

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function rotationPrior(data: RotationWindows, lat: number, lon: number, history: (CropId | null)[]): RotationPrior | null {
  const near = data.windows.map((w) => ({ w, d: km(lat, lon, w.lat, w.lon) })).filter((x) => x.d <= REACH_KM)
  if (!near.length) return null
  const a = history.length >= 2 ? history[history.length - 2] : null
  const b = history.length >= 1 ? history[history.length - 1] : null
  const tally = (match: (x: string, y: string) => boolean) => {
    const mass: Record<string, number> = {}
    let n = 0
    for (const { w, d } of near) {
      const wt = Math.exp(-0.5 * (d / SIGMA_KM) ** 2)
      for (const [k, c] of Object.entries(w.counts)) {
        const [x, y, z] = k.split('>')
        if (!match(x, y)) continue
        mass[z] = (mass[z] ?? 0) + wt * c
        n += wt * c
      }
    }
    return { mass, n }
  }
  const levels: [RotationPrior['level'], (x: string, y: string) => boolean, boolean][] = [
    ['two', (x, y) => x === a && y === b, !!a && !!b],
    ['one', (_x, y) => y === b, !!b],
    ['region', () => true, true],
  ]
  for (const [level, match, possible] of levels) {
    if (!possible) continue
    const { mass, n } = tally(match)
    if (n < MIN_N && level !== 'region') continue
    if (!n) return null
    const probs: Partial<Record<CropId, number>> = {}
    for (const [crop, m] of Object.entries(mass)) if (crop !== '_') probs[crop as CropId] = m / n
    return { probs, level, n, windows: near.length, nearestKm: Math.min(...near.map((x) => x.d)), sources: [...new Set(near.map((x) => x.w.source))] }
  }
  return null
}

/**
 * The field's own cycle: the prior above reads a field only through its last two crops, so a three- or
 * four-year rotation, or a crop the field grows more often than its neighbours do, is lost. For each period p = 1..4,
 * the share of the field's recorded seasons that repeat the season p before (both known); the best period (ties to the
 * shorter) points to the crop p seasons back with that share as its weight, the rest spread over the field's own crop
 * frequencies. Null under two known seasons.
 */
export function ownCycle(history: (CropId | null)[]): Partial<Record<CropId, number>> | null {
  const known = history.filter((h): h is CropId => !!h)
  if (known.length < 2) return null
  const out: Partial<Record<CropId, number>> = {}
  for (const c of known) out[c] = (out[c] ?? 0) + 1 / known.length
  let best: { crop: CropId; share: number } | null = null
  for (const p of [1, 2, 3, 4]) {
    let pairs = 0
    let same = 0
    for (let i = p; i < history.length; i++) {
      const x = history[i]
      const y = history[i - p]
      if (!x || !y) continue
      pairs++
      if (x === y) same++
    }
    const next = history[history.length - p]
    if (!pairs || !next) continue
    if (!best || same / pairs > best.share) best = { crop: next, share: same / pairs }
  }
  if (!best) return out
  for (const c of Object.keys(out) as CropId[]) out[c] = (1 - best.share) * out[c]!
  out[best.crop] = (out[best.crop] ?? 0) + best.share
  return out
}

/** Weight of the field's own cycle against what farms around sow after its last two crops: chosen on the 227
 *  development field windows (H3-B's, H4's, H4b's) - C-field mean rank 1.925
 *  -> 1.838 (d -0.087 [-0.123, -0.057]; every window set and country better), flat between 0.2 and 0.4. */
export const OWN_CYCLE_WEIGHT = 0.3

/** The neighbours' shares blended with the field's own cycle; unchanged where the field has under two known seasons. */
export function withOwnCycle(probs: Partial<Record<CropId, number>>, history: (CropId | null)[], weight = OWN_CYCLE_WEIGHT): Partial<Record<CropId, number>> {
  const own = ownCycle(history)
  if (!own) return probs
  const out: Partial<Record<CropId, number>> = {}
  for (const c of new Set([...Object.keys(probs), ...Object.keys(own)]) as Set<CropId>) out[c] = (1 - weight) * (probs[c] ?? 0) + weight * (own[c] ?? 0)
  return out
}

/** The fewest transitions of the fields around before their table is used */
export const WINDOW_MIN_N = 10

/**
 * What the fields right around this one sowed after the same crops in the seasons on record: every other
 * field's consecutive triples (two crops, then the next), at the last two crops of this field, else at its last crop;
 * null under WINDOW_MIN_N transitions. `others` are the other fields' histories over the same seasons - never the season
 * being predicted.
 */
export function windowPrior(others: (CropId | null)[][], history: (CropId | null)[]): Partial<Record<CropId, number>> | null {
  const a = history.length >= 2 ? history[history.length - 2] : null
  const b = history.length >= 1 ? history[history.length - 1] : null
  for (const level of ['two', 'one'] as const) {
    if (!b || (level === 'two' && !a)) continue
    const mass: Record<string, number> = {}
    let n = 0
    for (const h of others)
      for (let i = 2; i < h.length; i++) {
        const [x, y, z] = [h[i - 2], h[i - 1], h[i]]
        if (!x || !y || !z || y !== b || (level === 'two' && x !== a)) continue
        mass[z] = (mass[z] ?? 0) + 1
        n++
      }
    if (n >= WINDOW_MIN_N) return Object.fromEntries(Object.entries(mass).map(([z, m]) => [z, m / n])) as Partial<Record<CropId, number>>
  }
  return null
}

/** O2's weights: the field's own cycle and the fields around it beside the neighbours' table - chosen on
 *  the 227 development windows: 1.838 -> 1.753; a part that is missing gives its weight
 *  back to the neighbours' table */
export const O2_WEIGHTS = { own: 0.2, window: 0.4 }

/** The neighbours' shares with the field's own cycle and the window's transitions (O2) */
export function withOwnAndWindow(probs: Partial<Record<CropId, number>>, history: (CropId | null)[], others: (CropId | null)[][], w = O2_WEIGHTS): Partial<Record<CropId, number>> {
  const own = ownCycle(history)
  const win = windowPrior(others, history)
  if (!own && !win) return probs
  const wo = own ? w.own : 0
  const ww = win ? w.window : 0
  const out: Partial<Record<CropId, number>> = {}
  for (const c of new Set([...Object.keys(probs), ...Object.keys(own ?? {}), ...Object.keys(win ?? {})]) as Set<CropId>)
    out[c] = (1 - wo - ww) * (probs[c] ?? 0) + wo * (own?.[c] ?? 0) + ww * (win?.[c] ?? 0)
  return out
}

/** The prior as crop shares for the practice-informed view (practice.ts) - only where the field's own history backs it;
 *  the region's sowings regardless of history are what CROPGRIDS already says. */
export const rotationShares = (p: RotationPrior | null): Partial<Record<CropId, number>> | null => (p && p.level !== 'region' ? p.probs : null)

let loaded: Promise<RotationWindows | null> | null = null
/** The observed rotations, fetched once; a failed download is tried again on the next call. */
export async function loadRotations(): Promise<RotationWindows | null> {
  loaded ??= fetch(`${import.meta.env.BASE_URL}data/rotations/windows.json`)
    .then((r) => (r.ok ? (r.json() as Promise<RotationWindows>) : null))
    .catch(() => null)
  const d = await loaded
  if (!d) loaded = null
  return d
}

/**
 * The practice of the field and the fields around it - the layer experiment H8 judged on 85 new field windows
 * (mean rank 1.845, top-3 90.4 %, catastrophic 0.57 %, H6's three targets met).
 * What farms around sow after the field's last two crops (the neighbours' prior, rotationPrior.ts) blended with the
 * field's own cycle (ownCycle, weight 0.15) and with what the other fields of its crop-map window sowed after the same
 * crops in 2019-2023 (weight 0.6, where at least MIN_LOCAL such transitions are on record), at every level of the
 * neighbours' prior; the push of each crop as practice.ts's posterior, with the plausibility gate at 0.3 of the best
 * scientific score.
 */
import type { CropId } from './crops'
import { COUNTRY_CAP, COUNTRY_LAMBDA } from './prior'
import type { MapSource } from './cropMaps'
import { ownCycle, rotationPrior, type RotationPrior, type RotationWindows } from './rotationPrior'

export type Shares = Partial<Record<CropId, number>>
/** a setting of the layer: own-cycle weight a, window weight b, lambda, cap, gate, and whether the own cycle and window
 *  blend where the neighbours' prior is not field-level (region level or none) */
export type Setting = { a: number; b: number; lambda: number; cap: number; gate: number; all: boolean }
/** the layer's settings since H8 */
export const PRACTICE_LAYER: Setting = { a: 0.15, b: 0.6, lambda: 1, cap: 16, gate: 0.3, all: true }
const PRIOR_FLOOR = 0.002
/** the fewest transitions of the window's other fields that make a local table */
export const MIN_LOCAL = 10

/** each crop's push, in the order given (h4/analysis.ts posteriorOrder with the gate as a parameter) */
export function fieldPushes(ranking: { id: CropId; science: number }[], shares: Shares, lambda: number, capFactor: number, gate: number): number[] {
  const n = ranking.length
  const total = ranking.reduce((s, e) => s + (shares[e.id] ?? 0), 0)
  const best = Math.max(0, ...ranking.map((e) => e.science))
  const cap = Math.log(capFactor)
  const pushes = ranking.map((e) => (total > 0 ? Math.max(-cap, Math.min(cap, lambda * Math.log((((shares[e.id] ?? 0) + PRIOR_FLOOR) / (total + PRIOR_FLOOR * n)) * n))) : 0))
  const ok = ranking.map((e) => e.science >= gate * best)
  const floor = Math.min(0, ...pushes.filter((_, i) => ok[i]))
  return pushes.map((p, i) => (ok[i] ? p : Math.min(p, floor)))
}
/** the crops in the order of science x e^push; ties keep the scientific order */
export function fieldOrder(ranking: { id: CropId; science: number }[], shares: Shares, lambda: number, capFactor: number, gate: number): CropId[] {
  const pushes = fieldPushes(ranking, shares, lambda, capFactor, gate)
  return ranking.map((e, i) => ({ id: e.id, s: e.science * Math.exp(pushes[i]), i })).sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.id)
}

type Count = Map<string, Map<string, number>>
/** the transitions of a window's fields: what followed each pair of crops (and each crop) in 2019-2023 */
export type Transitions = { two: Count; one: Count }
const triples = (h: (string | null)[]) => {
  const out: [string, string, string][] = []
  for (let i = 2; i < h.length; i++) if (h[i - 2] && h[i - 1] && h[i]) out.push([h[i - 2]!, h[i - 1]!, h[i]!])
  return out
}
export function transitions(histories: (string | null)[][]): Transitions {
  const two: Count = new Map()
  const one: Count = new Map()
  const add = (m: Count, k: string, z: string) => {
    const x = m.get(k) ?? new Map<string, number>()
    x.set(z, (x.get(z) ?? 0) + 1)
    m.set(k, x)
  }
  for (const h of histories) for (const [x, y, z] of triples(h)) (add(two, `${x}>${y}`, z), add(one, y, z))
  return { two, one }
}
/** what the window's fields sowed after the field's last two crops (else its last one), as shares - null under
 *  MIN_LOCAL transitions; `self`: the field is one of the window's points, and its own transitions are left out */
export function windowShares(t: Transitions, history: (string | null)[], self = false): Shares | null {
  const n = history.length
  const [a, b] = [history[n - 2], history[n - 1]]
  const mine = self ? triples(history) : []
  for (const [m, k] of [[t.two, a && b ? `${a}>${b}` : null], [t.one, b]] as [Count, string | null][]) {
    if (!k) continue
    const c = new Map(m.get(k) ?? [])
    for (const [x, y, z] of mine) if ((m === t.two ? `${x}>${y}` : y) === k) c.set(z, (c.get(z) ?? 0) - 1)
    const total = [...c.values()].reduce((s, v) => s + v, 0)
    if (total >= MIN_LOCAL) return Object.fromEntries([...c.entries()].filter(([z, v]) => z !== '_' && v > 0).map(([z, v]) => [z, v / total])) as Shares
  }
  return null
}

/** the prior one history meets under a setting: shares, lambda, cap and gate */
export function fieldPrior(history: (CropId | null)[], neighbours: Pick<RotationPrior, 'level' | 'probs'> | null, national: Shares, local: Shares | null, s: Setting = PRACTICE_LAYER): { shares: Shares; lambda: number; cap: number; gate: number } {
  const fieldLevel = !!neighbours && neighbours.level !== 'region'
  const base = neighbours ? neighbours.probs : national
  // where the neighbours' prior is not field-level the push is the country's (prior.ts)
  if (!fieldLevel && !s.all) return { shares: base, lambda: COUNTRY_LAMBDA, cap: COUNTRY_CAP, gate: s.gate }
  const own = ownCycle(history)
  const wn = 1 - (own ? s.a : 0) - (local ? s.b : 0)
  const shares: Shares = {}
  for (const c of new Set([...Object.keys(base), ...Object.keys(own ?? {}), ...Object.keys(local ?? {})]) as Set<CropId>)
    shares[c] = wn * (base[c] ?? 0) + (own ? s.a * (own[c] ?? 0) : 0) + (local ? s.b * (local[c] ?? 0) : 0)
  return fieldLevel ? { shares, lambda: s.lambda, cap: s.cap, gate: s.gate } : { shares, lambda: COUNTRY_LAMBDA, cap: COUNTRY_CAP, gate: s.gate }
}

/** the page's practice of one field: the crop map it read (fieldWindow.ts), the neighbours' rotations, the country's
 *  mix where they say nothing, and the window's transitions */
export type FieldPractice = { map: MapSource; rot: RotationWindows; lat: number; lon: number; national: Shares; t: Transitions }
/** the prior the field's history meets: what farms around sow after its last crops, its own cycle, its window */
export const fieldPriorAt = (f: FieldPractice, history: (CropId | null)[]) =>
  fieldPrior(history, rotationPrior(f.rot, f.lat, f.lon, history), f.national, windowShares(f.t, history))
/** the prior as a factor per crop, at most 1 (prior.ts practiceFactors): scores times these order the crops as science x
 *  e^push */
export function fieldFactors(ranking: { crop: { id: CropId }; science: number }[], f: FieldPractice, history: (CropId | null)[]): Map<CropId, number> {
  const p = fieldPriorAt(f, history)
  const pushes = fieldPushes(ranking.map((e) => ({ id: e.crop.id, science: e.science })), p.shares, p.lambda, p.cap, p.gate)
  const top = Math.max(...pushes)
  return new Map(ranking.map((e, i) => [e.crop.id, Math.exp(pushes[i] - top)]))
}

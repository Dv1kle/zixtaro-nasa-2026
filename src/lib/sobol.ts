// Global sensitivity: which uncertain input does the pick's lead over the runner-up depend on?
//
// One-at-a-time flips miss interactions; Sobol indices do not. Saltelli's scheme (Saltelli et al. 2010) samples two
// independent matrices A and B and, for each factor i, A with column i taken from B. First-order index S1 (the share
// of the variance explained by the factor alone) by Saltelli 2010, total-order ST (alone and in every interaction) by
// Jansen (1999). The estimator is checked in the tests against the Ishigami function's exact indices.
import type { ClimateAnalysis } from './climate'
import { CROP_BY_ID, type CropId } from './crops'
import { contextFor, rng, SEED, simulateAll, type Draw } from './robust'
import { evaluate, rankNext, type FieldContext, type Priorities } from './rotation'
import { clamp } from './stats'

/** S1 and ST of f over k factors uniform on [0, 1], from n base samples (n·(k+2) evaluations). */
export function sobolIndices(f: (x: number[]) => number, k: number, n: number, seed = SEED): { S1: number[]; ST: number[]; variance: number } {
  const r = rng(seed)
  const A = Array.from({ length: n }, () => Array.from({ length: k }, () => r()))
  const B = Array.from({ length: n }, () => Array.from({ length: k }, () => r()))
  const fA = A.map(f)
  const fB = B.map(f)
  const all = [...fA, ...fB]
  const mean = all.reduce((a, b) => a + b, 0) / all.length
  const variance = all.reduce((a, b) => a + (b - mean) ** 2, 0) / all.length
  const S1: number[] = []
  const ST: number[] = []
  for (let i = 0; i < k; i++) {
    let s1 = 0
    let st = 0
    for (let j = 0; j < n; j++) {
      const x = A[j].slice()
      x[i] = B[j][i]
      const fAB = f(x)
      s1 += fB[j] * (fAB - fA[j])
      st += (fA[j] - fAB) ** 2
    }
    S1.push(variance > 1e-12 ? s1 / n / variance : 0)
    ST.push(variance > 1e-12 ? st / (2 * n) / variance : 0)
  }
  return { S1, ST, variance }
}

export type SobolFactor = { key: string; label: string; source: string; S1: number; ST: number }
export type SobolGap = { pick: CropId; rival: CropId; gap: number; sd: number; factors: SobolFactor[]; n: number }

const FACTORS = [
  { key: 'soil', label: 'soil water holding ±20 %', source: 'SoilGrids' },
  { key: 'ky', label: 'drought response (Ky) ±15 %', source: 'FAO-33' },
  { key: 'pricePick', label: 'price of the pick ±20 %', source: 'prices' },
  { key: 'priceRival', label: 'price of the runner-up ±20 %', source: 'prices' },
  { key: 'wSoil', label: 'your soil weight ±15', source: 'your priorities' },
  { key: 'wWater', label: 'your water weight ±15', source: 'your priorities' },
  { key: 'wProfit', label: 'your profit weight ±15', source: 'your priorities' },
]

/** Sobol indices of score(pick) − score(runner-up) over the model's uncertain inputs. */
export function sobolGap(history: (CropId | null)[], ctx: FieldContext, w: Priorities, exclude: Set<CropId>, climate: ClimateAnalysis, n = 192): SobolGap | null {
  const ranked = rankNext(history, ctx, w, exclude)
  if (ranked.length < 2 || ctx.stressYear) return null
  const pick = ranked[0].crop.id
  const rival = ranked[1].crop.id
  const ids = [pick, rival]
  const sim = simulateAll(ctx, climate, ids, history[history.length - 1] === 'fallow')
  const gapOf = (x: number[]) => {
    const ky = 0.85 + 0.3 * x[1]
    const d: Draw = { soil: Math.min(4, Math.floor(x[0] * 5)), seasons: sim.recentYears, ky: { [pick]: ky, [rival]: ky }, price: { [pick]: 0.8 + 0.4 * x[2], [rival]: 0.8 + 0.4 * x[3] }, w }
    const ww = { soil: clamp(w.soil - 15 + 30 * x[4], 0, 100), water: clamp(w.water - 15 + 30 * x[5], 0, 100), profit: clamp(w.profit - 15 + 30 * x[6], 0, 100) }
    const c = contextFor(ctx, ids, sim, d)
    return evaluate(CROP_BY_ID[pick], history, c, ww).score - evaluate(CROP_BY_ID[rival], history, c, ww).score
  }
  const { S1, ST, variance } = sobolIndices(gapOf, FACTORS.length, n)
  return {
    pick, rival, gap: ranked[0].score - ranked[1].score, sd: Math.sqrt(variance), n,
    factors: FACTORS.map((f, i) => ({ ...f, S1: clamp(S1[i], 0, 1), ST: clamp(ST[i], 0, 1) })).sort((a, b) => b.ST - a.ST),
  }
}

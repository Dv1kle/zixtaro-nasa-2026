// Small, dependency-free statistics used for trend detection.
// Mann-Kendall + Sen's slope is the standard non-parametric pair for climate trends:
// robust to outliers and makes no normality assumption.

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

export function median(xs: number[]): number {
  return quantile(xs, 0.5)
}

/** Sen's slope: the median of all pairwise slopes (units of y per unit of x). */
export function senSlope(ys: number[], xs?: number[]): number {
  const x = xs ?? ys.map((_, i) => i)
  const slopes: number[] = []
  for (let i = 0; i < ys.length; i++) {
    for (let j = i + 1; j < ys.length; j++) {
      if (x[j] !== x[i]) slopes.push((ys[j] - ys[i]) / (x[j] - x[i]))
    }
  }
  return median(slopes)
}

// Complementary error function (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7).
export function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * z)
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const r = poly * Math.exp(-z * z)
  return x >= 0 ? r : 2 - r
}

export type MannKendall = {
  /** Kendall S statistic */
  s: number
  /** Standardised test statistic */
  z: number
  /** Two-sided p-value */
  p: number
  /** Kendall's tau */
  tau: number
}

/** Mann-Kendall trend test with tie correction (two-sided). */
export function mannKendall(ys: number[]): MannKendall {
  const n = ys.length
  if (n < 4) return { s: 0, z: 0, p: 1, tau: 0 }
  let s = 0
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) s += Math.sign(ys[j] - ys[i])
  }
  // Tie correction: groups of identical values reduce the variance of S.
  const counts = new Map<number, number>()
  for (const y of ys) counts.set(y, (counts.get(y) ?? 0) + 1)
  let tieTerm = 0
  for (const t of counts.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5)
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18
  let z = 0
  if (s > 0) z = (s - 1) / Math.sqrt(variance)
  else if (s < 0) z = (s + 1) / Math.sqrt(variance)
  const p = s === 0 ? 1 : Math.min(1, erfc(Math.abs(z) / Math.SQRT2))
  return { s, z, p, tau: s / ((n * (n - 1)) / 2) }
}

export type Trend = {
  /** Sen's slope per decade */
  perDecade: number
  p: number
  significant: boolean
  direction: 'up' | 'down' | 'flat'
}

/** Trend of an annual series: Sen's slope (per decade) + Mann-Kendall significance at α = 0.05. */
export function trend(ys: number[], years: number[]): Trend {
  const perDecade = senSlope(ys, years) * 10
  const { p } = mannKendall(ys)
  const significant = p < 0.05
  const direction = !significant ? 'flat' : perDecade > 0 ? 'up' : 'down'
  return { perDecade, p, significant, direction }
}

export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))

/** Ranks 1…n, ties get their average rank. */
export function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const r = new Array<number>(xs.length)
  for (let k = 0; k < order.length; ) {
    let j = k
    while (j + 1 < order.length && order[j + 1][0] === order[k][0]) j++
    for (let m = k; m <= j; m++) r[order[m][1]] = (k + j) / 2 + 1
    k = j + 1
  }
  return r
}

export function pearson(a: number[], b: number[]): number {
  const ma = mean(a)
  const mb = mean(b)
  let n = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    n += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? n / Math.sqrt(da * db) : 0
}

/** Spearman rank correlation with its two-sided p-value (large-sample normal approximation). */
export function spearman(a: number[], b: number[]): { rho: number; p: number } {
  const rho = pearson(ranks(a), ranks(b))
  const z = rho * Math.sqrt(Math.max(0, a.length - 1))
  return { rho, p: Math.min(1, erfc(Math.abs(z) / Math.SQRT2)) }
}

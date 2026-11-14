// src/lib/data/derive/soilwater.ts
// Soil water physics for the dossier: how tightly the soil holds its water (van Genuchten through SoilGrids'
// retention points), how fast it drains (Saxton and Rawls 2006) and how much rain runs off (SCS curve number).
import type { Daily } from '../../dailyFormat'
import { saxtonRawls } from '../../soil'
import { dateAt } from './thermal'

/** Saxton & Rawls (2006): wilting point, field capacity, saturation (m³/m³) and saturated conductivity (mm/h). */
export function saxtonRawlsFull(sandPct: number, clayPct: number, omPct: number): { wp: number; fc: number; sat: number; ksat: number } {
  const { wp, fc } = saxtonRawls(sandPct, clayPct, omPct)
  const S = sandPct / 100
  const C = clayPct / 100
  const OM = Math.max(0, Math.min(8, omPct))
  const ts33t = 0.278 * S + 0.034 * C + 0.022 * OM - 0.018 * S * OM - 0.027 * C * OM - 0.584 * S * C + 0.078
  const ts33 = ts33t + (0.636 * ts33t - 0.107)
  const sat = fc + ts33 - 0.097 * S + 0.043
  const lambda = (Math.log(fc) - Math.log(wp)) / (Math.log(1500) - Math.log(33))
  const ksat = 1930 * Math.max(0, sat - fc) ** (3 - lambda)
  return { wp, fc, sat, ksat }
}

export type VG = { thetaR: number; thetaS: number; alpha: number; n: number } // alpha in 1/cm
export const KPA_TO_CM = 10.197

export function vgTheta(p: VG, hCm: number): number {
  const m = 1 - 1 / p.n
  return p.thetaR + (p.thetaS - p.thetaR) / (1 + (p.alpha * Math.max(0, hCm)) ** p.n) ** m
}

/** Suction in cm of water at which the soil holds `theta`: 0 at saturation, Infinity at or below θr. */
export function vgSuction(p: VG, theta: number): number {
  const m = 1 - 1 / p.n
  const se = (theta - p.thetaR) / (p.thetaS - p.thetaR)
  if (se >= 1) return 0
  if (se <= 0) return Infinity
  return (se ** (-1 / m) - 1) ** (1 / p.n) / p.alpha
}

/**
 * Suction in kPa at water content `theta`: exact at the retention points and log-linear between them (the data),
 * the fitted van Genuchten curve only beyond them (wetter than the wettest point, drier than the driest).
 */
export function suctionFromPoints(points: { kPa: number; theta: number }[], vg: VG, theta: number): number {
  const pts = [...points].sort((a, b) => b.theta - a.theta) // wet → dry
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (theta <= a.theta && theta >= b.theta) {
      const f = a.theta === b.theta ? 0 : (a.theta - theta) / (a.theta - b.theta)
      return 10 ** (Math.log10(a.kPa) + f * (Math.log10(b.kPa) - Math.log10(a.kPa)))
    }
  }
  return vgSuction(vg, theta) / KPA_TO_CM
}

/** Least-squares fit of α, n and θr (grid search) through retention points; θs is given. */
export function fitVG(points: { kPa: number; theta: number }[], thetaS: number): VG {
  const minTheta = Math.min(...points.map((q) => q.theta))
  let best: VG = { thetaR: 0, thetaS, alpha: 0.02, n: 1.5 }
  let bestErr = Infinity
  for (let r = 0; r <= 8; r++) {
    const thetaR = (minTheta * 0.8 * r) / 8
    for (let la = -4; la <= 0.0001; la += 0.05) {
      const alpha = 10 ** la
      for (let n = 1.05; n <= 3.5; n += 0.025) {
        const p = { thetaR, thetaS, alpha, n }
        let err = 0
        for (const q of points) err += (vgTheta(p, q.kPa * KPA_TO_CM) - q.theta) ** 2
        if (err < bestErr) {
          bestErr = err
          best = p
        }
      }
    }
  }
  return best
}

/** pF: log10 of the suction in cm of water. */
export const pF = (hCm: number) => Math.log10(Math.max(1, hCm))

/** NRCS hydrologic soil group from saturated conductivity (NEH 630 Ch. 7, deep soils). */
export const hydrologicGroup = (ksatMmH: number): 'A' | 'B' | 'C' | 'D' => (ksatMmH > 144 ? 'A' : ksatMmH > 36 ? 'B' : ksatMmH > 3.6 ? 'C' : 'D')

/** TR-55 Table 2-2b: row crops, straight rows, good condition. */
export const CN_ROW_CROPS = { A: 67, B: 78, C: 85, D: 89 } as const

/** Antecedent moisture: dry below 35.6 mm of rain in the 5 days before, wet above 53.3 mm (growing season; Hawkins). */
export function cnForRain5(cn2: number, rain5d: number): number {
  if (rain5d < 35.6) return cn2 / (2.281 - 0.01281 * cn2)
  if (rain5d > 53.3) return cn2 / (0.427 + 0.00573 * cn2)
  return cn2
}

/** SCS runoff of one storm, mm (Ia = 0.2 S). */
export function scsRunoff(pMm: number, cn: number): number {
  const s = 25400 / cn - 254
  const ia = 0.2 * s
  return pMm > ia ? (pMm - ia) ** 2 / (pMm + 0.8 * s) : 0
}

/** Share of rain that runs off over `years`, each day's CN set by the rain of the 5 days before. */
export function runoffShare(d: Daily, cn2: number, years: [number, number]): number | null {
  let rain = 0
  let off = 0
  for (let i = 0; i < d.prcp.length; i++) {
    const p = d.prcp[i]
    const y = dateAt(d, i).getUTCFullYear()
    if (p == null || y < years[0] || y > years[1]) continue
    let r5 = 0
    for (let k = Math.max(0, i - 5); k < i; k++) r5 += d.prcp[k] ?? 0
    rain += p
    off += scsRunoff(p, cnForRain5(cn2, r5))
  }
  return rain > 0 ? off / rain : null
}

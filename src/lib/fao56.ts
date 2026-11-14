// FAO-56 crop coefficient curves (Allen et al. 1998, Irrigation and Drainage Paper 56).
// Table 11 gives the length of the four growth stages, Table 12 the single Kc for the initial, mid-season and
// end-of-season stages; between them Kc runs linearly (Fig. 25). Zixtaro's water model steps through months,
// so the daily curve is averaged per calendar month - days before sowing and after harvest count as zero.

export type Fao56Stages = {
  /** sowing date, Northern Hemisphere: [month 1-12, day] */
  sow: [number, number]
  /** Table 11: initial, development, mid-season, late-season length in days */
  days: [number, number, number, number]
  /** Table 12: Kc ini, Kc mid, Kc end */
  kc: [number, number, number]
}

const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Kc on day d after sowing (0-based), or 0 once the crop is harvested. */
export function kcOnDay(s: Fao56Stages, d: number): number {
  const [ini, dev, mid, late] = s.days
  const [kIni, kMid, kEnd] = s.kc
  if (d < 0 || d >= ini + dev + mid + late) return 0
  if (d < ini) return kIni
  if (d < ini + dev) return kIni + ((kMid - kIni) * (d - ini + 0.5)) / dev
  if (d < ini + dev + mid) return kMid
  return kMid + ((kEnd - kMid) * (d - ini - dev - mid + 0.5)) / late
}

/** Monthly mean Kc, Jan..Dec (Northern Hemisphere), for a season that may run past December. */
export function monthlyKc(s: Fao56Stages): number[] {
  const out = Array(12).fill(0)
  const total = s.days.reduce((a, b) => a + b, 0)
  // walk calendar days from the sowing date through the whole season
  let month = s.sow[0] - 1
  let day = s.sow[1] - 1
  for (let d = 0; d < total; d++) {
    out[month] += kcOnDay(s, d)
    day++
    if (day >= DAYS_IN[month]) {
      day = 0
      month = (month + 1) % 12
    }
  }
  return out.map((sum, m) => Math.round((sum / DAYS_IN[m]) * 100) / 100)
}

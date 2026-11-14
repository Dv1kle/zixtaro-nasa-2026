// Extraterrestrial radiation and Hargreaves reference evapotranspiration (FAO-56).
// Ra depends only on latitude and day of year, so we compute it astronomically instead of
// relying on POWER's TOA_SW_DWN (which is missing before 1984).

const GSC = 0.082 // solar constant, MJ m-2 min-1
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function daysInMonth(month: number, year?: number): number {
  if (month === 2 && year !== undefined && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) return 29
  return DAYS_IN_MONTH[month - 1]
}

/** Daily extraterrestrial radiation Ra (MJ m-2 day-1), FAO-56 eq. 21. */
export function extraterrestrialRadiation(latDeg: number, dayOfYear: number): number {
  const phi = (latDeg * Math.PI) / 180
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * dayOfYear)
  const delta = 0.409 * Math.sin(((2 * Math.PI) / 365) * dayOfYear - 1.39)
  const x = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta)))
  const ws = Math.acos(x)
  const ra =
    ((24 * 60) / Math.PI) *
    GSC *
    dr *
    (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws))
  return Math.max(0, ra)
}

const monthRaCache = new Map<string, number[]>()

/** Mean daily Ra for each calendar month (index 0 = January). */
export function monthlyRa(latDeg: number): number[] {
  const key = latDeg.toFixed(2)
  const hit = monthRaCache.get(key)
  if (hit) return hit
  const out: number[] = []
  let doy = 1
  for (let m = 1; m <= 12; m++) {
    const n = DAYS_IN_MONTH[m - 1]
    let sum = 0
    for (let d = 0; d < n; d++) sum += extraterrestrialRadiation(latDeg, doy + d)
    out.push(sum / n)
    doy += n
  }
  monthRaCache.set(key, out)
  return out
}

/**
 * Hargreaves-Samani reference ET (FAO-56 eq. 52) for a month, in mm/month.
 * Used only when Penman-Monteith inputs are missing.
 * @param tMean mean air temperature (°C)
 * @param tRange mean daily temperature range Tmax − Tmin (°C)
 */
export function hargreavesPET(latDeg: number, month: number, year: number, tMean: number, tRange: number): number {
  const ra = monthlyRa(latDeg)[month - 1] * 0.408 // MJ m-2 day-1 → mm day-1
  const daily = 0.0023 * (tMean + 17.8) * Math.sqrt(Math.max(0, tRange)) * ra
  return Math.max(0, daily) * daysInMonth(month, year)
}

/** Saturation vapour pressure (kPa), FAO-56 eq. 11. */
const e0 = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3))

export type PMInputs = {
  lat: number
  month: number
  year: number
  t: number // mean air temperature, °C
  tRange: number // mean daily range, °C
  tDew: number // dew point, °C
  wind: number // wind speed at 2 m, m/s
  ps: number // surface pressure, kPa
  rs: number // incoming shortwave, MJ m-2 day-1 (NaN → estimated from temperature range)
  tPrev: number // previous month's mean temperature, °C (NaN → no soil heat flux)
}

/** FAO-56 Penman-Monteith grass reference ET for a month (mm/month), using monthly-mean inputs. */
export function penmanMonteithPET(x: PMInputs): number {
  const tMax = x.t + x.tRange / 2
  const tMin = x.t - x.tRange / 2
  const es = (e0(tMax) + e0(tMin)) / 2
  const ea = Math.min(e0(x.tDew), es)
  const delta = (4098 * e0(x.t)) / (x.t + 237.3) ** 2
  const gamma = 0.000665 * x.ps
  const ra = monthlyRa(x.lat)[x.month - 1]
  const rs = Number.isFinite(x.rs) ? x.rs : 0.16 * Math.sqrt(Math.max(0, x.tRange)) * ra // eq. 50
  const z = Math.max(0, 44331.5 * (1 - (x.ps / 101.325) ** 0.190263)) // elevation from pressure
  const rso = (0.75 + 2e-5 * z) * ra
  const ratio = rso > 0 ? Math.min(1, rs / rso) : 0.5
  const sigma = 4.903e-9
  const rnl = sigma * (((tMax + 273.16) ** 4 + (tMin + 273.16) ** 4) / 2) * (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * ratio - 0.35)
  const rn = 0.77 * rs - rnl
  const g = Number.isFinite(x.tPrev) ? 0.14 * (x.t - x.tPrev) : 0 // eq. 44, monthly soil heat flux
  const et0 =
    (0.408 * delta * (rn - g) + gamma * (900 / (x.t + 273)) * x.wind * (es - ea)) / (delta + gamma * (1 + 0.34 * x.wind))
  return Math.max(0, et0) * daysInMonth(x.month, x.year)
}

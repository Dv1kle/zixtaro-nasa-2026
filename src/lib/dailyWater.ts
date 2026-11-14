// A daily re-run of the soil-water model - does the monthly model's smoothing change which crops suffer most?
//
// FAO-56 single crop coefficient, day by day: the crop's own Kc curve (Table 11/12 stages), reference ET by
// Hargreaves (FAO-56 eq. 52) from NASA POWER daily Tmax/Tmin and extraterrestrial radiation (eq. 21), rain less 10 %
// interception, the same root-zone bucket and stress (Ks, eq. 84) and FAO-33 Ky. Absolute losses differ from the
// monthly model (Hargreaves vs Penman-Monteith, daily vs monthly rain); the check is whether the crops keep their order.
import type { ClimateAnalysis } from './climate'
import { calendarShift, CROPS, type Crop, type CropId } from './crops'
import type { Daily } from './dailyFormat'
import { kcOnDay } from './fao56'
import { rootZoneWater, type SoilProfile } from './soil'
import { clamp } from './stats'
import type { CropRisk } from './water'

const DAY = 86_400_000

/** Extraterrestrial radiation, MJ m⁻² day⁻¹ (FAO-56 eq. 21). */
export function extraterrestrial(latDeg: number, doy: number): number {
  const phi = (latDeg * Math.PI) / 180
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365)
  const dec = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39)
  const ws = Math.acos(clamp(-Math.tan(phi) * Math.tan(dec), -1, 1))
  return ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(ws))
}

/** Hargreaves reference evapotranspiration, mm/day (FAO-56 eq. 52; 0.408 converts MJ to mm). */
export const hargreaves = (tmax: number, tmin: number, ra: number) => 0.0023 * ((tmax + tmin) / 2 + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * 0.408 * ra

/** One season, day by day. Null when the daily record does not cover it. */
export function dailySeason(crop: Crop, d: Daily, lat: number, taw: number, harvestYear: number, shiftMonths: number): { stress: number; loss: number } | null {
  if (!crop.fao) return null
  const total = crop.fao.days.reduce((a, b) => a + b, 0)
  const m = (crop.fao.sow[0] - 1 + shiftMonths) % 12
  let sow = Date.UTC(harvestYear, m, crop.fao.sow[1])
  if (new Date(sow + (total - 1) * DAY).getUTCFullYear() > harvestYear) sow = Date.UTC(harvestYear - 1, m, crop.fao.sow[1])
  const t0 = Date.parse(`${d.start}T00:00:00Z`)
  const i0 = Math.round((sow - t0) / DAY) - 60 // two months to spin the bucket up
  if (i0 < 0 || i0 + 60 + total > d.tmax.length) return null
  let storage = 0.5 * taw
  let etc = 0
  let eta = 0
  let missing = 0
  for (let k = 0; k < 60 + total; k++) {
    const i = i0 + k
    const tx = d.tmax[i]
    const tn = d.tmin[i]
    const p = d.prcp[i] ?? 0
    storage = Math.min(taw, storage + 0.9 * p)
    if (tx == null || tn == null) {
      missing++
      continue
    }
    const doy = Math.floor((t0 + i * DAY - Date.UTC(new Date(t0 + i * DAY).getUTCFullYear(), 0, 0)) / DAY)
    const et0 = hargreaves(tx, tn, extraterrestrial(lat, doy))
    const inSeason = k >= 60
    const kc = inSeason ? kcOnDay(crop.fao, k - 60) : 0.6
    const demand = kc * et0
    const pAdj = clamp(crop.p + 0.04 * (5 - demand), 0.1, 0.8)
    const raw = pAdj * taw
    const dep = taw - storage
    const ks = dep <= raw ? 1 : Math.max(0, (taw - dep) / ((1 - pAdj) * taw))
    const used = Math.min(ks * demand, storage)
    storage -= used
    if (inSeason) {
      etc += demand
      eta += used
    }
  }
  if (missing > 0.1 * (60 + total)) return null
  const stress = etc > 0 ? clamp(1 - eta / etc) : 0
  return { stress, loss: clamp(crop.ky * stress) }
}

const rank = (xs: number[]) => {
  const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const r = new Array<number>(xs.length)
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2
    i = j + 1
  }
  return r
}
export function spearman(a: number[], b: number[]): number {
  const ra = rank(a)
  const rb = rank(b)
  const n = a.length
  const ma = ra.reduce((x, y) => x + y, 0) / n
  const mb = rb.reduce((x, y) => x + y, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb)
    da += (ra[i] - ma) ** 2
    db += (rb[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : NaN
}

export type DailyCheck = { rho: number; n: number; crops: { id: CropId; monthly: number; daily: number }[] }

/** Recent-decade water-stress loss of every rainfed crop, monthly model vs daily re-run, and their rank agreement. */
export function dailyCheck(climate: ClimateAnalysis, soil: SoilProfile, d: Daily, risks: Record<CropId, CropRisk>): DailyCheck | null {
  const crops: DailyCheck['crops'] = []
  for (const base of CROPS) {
    // the form the field grows: spring wheat on the prairies, silage maize in Denmark - as the monthly model scored it
    const crop = risks[base.id]?.crop ?? base
    if (!crop.fao || crop.ky <= 0 || !risks[crop.id]) continue
    const taw = rootZoneWater(soil, crop.rootDepth)
    const shift = calendarShift(crop, climate.season.hemisphere, climate.monthly.recent)
    const losses: number[] = []
    for (let y = climate.recent.from; y <= climate.recent.to; y++) {
      const s = dailySeason(crop, d, climate.lat, taw, y, shift)
      if (s) losses.push(s.loss)
    }
    if (losses.length < 5) continue
    crops.push({ id: crop.id, monthly: risks[crop.id].recent.loss, daily: losses.reduce((a, b) => a + b, 0) / losses.length })
  }
  if (crops.length < 6) return null
  return { rho: spearman(crops.map((c) => c.monthly), crops.map((c) => c.daily)), n: crops.length, crops }
}

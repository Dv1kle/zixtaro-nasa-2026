// src/lib/data/fetch/openmeteo.ts
// Open-Meteo, five services, all CORS-open and keyless: the 16-day hourly forecast for work windows and "now"
// values, ERA5-Land soil layers for the last year, the ECMWF seasonal ensemble, GloFAS river discharge and CAMS dust.
import type { MonthNormal } from '../../climate'
import { absoluteHumidity, deltaT, humidityDeficit } from '../derive/humidity'
import type { Hourly } from '../derive/windows'
import { cached, DAY, GATES, getJson, HOUR } from '../net'
import type { Point, Value } from '../types'

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const r = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d
const loc = (lat: number, lon: number) => `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`

// ---------- forecast ----------
const HOURLY = [
  'temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'vapour_pressure_deficit', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m',
  'soil_temperature_6cm', 'soil_temperature_18cm', 'soil_temperature_54cm', 'cape', 'lifted_index', 'leaf_wetness_probability', 'pressure_msl',
] as const
export const forecastAgroUrl = (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?${loc(lat, lon)}&current=temperature_2m&hourly=${HOURLY.join(',')}&forecast_days=16&timezone=auto`

export type AgroForecast = {
  hourly: Hourly & { dew: (number | null)[]; vpd: (number | null)[]; st18: (number | null)[]; st54: (number | null)[]; pressure: (number | null)[] }
  nowIdx: number
  daily: { date: string; tmax: number; tmin: number }[]
}

type ForecastRaw = { current?: { time: string }; hourly: Record<string, (number | null)[] | string[]> }

export function parseForecastAgro(json: ForecastRaw): AgroForecast {
  const h = json.hourly
  const col = (k: string) => ((h[k] as (number | null)[] | undefined) ?? []).map((x) => (num(x) ? x : null))
  const time = h.time as string[]
  const hourly = {
    time, t: col('temperature_2m'), rh: col('relative_humidity_2m'), precip: col('precipitation'), wind: col('wind_speed_10m'),
    gust: col('wind_gusts_10m'), st6: col('soil_temperature_6cm'), cape: col('cape'), li: col('lifted_index'),
    leafWet: col('leaf_wetness_probability'), dew: col('dew_point_2m'), vpd: col('vapour_pressure_deficit'),
    st18: col('soil_temperature_18cm'), st54: col('soil_temperature_54cm'), pressure: col('pressure_msl'),
  }
  const cur = json.current?.time?.slice(0, 13)
  const nowIdx = Math.max(0, time.findIndex((t) => t.slice(0, 13) === cur))
  const days = new Map<string, number[]>()
  time.forEach((t, i) => {
    const v = hourly.t[i]
    if (v === null) return
    const d = t.slice(0, 10)
    days.set(d, [...(days.get(d) ?? []), v])
  })
  const daily = [...days].map(([date, v]) => ({ date, tmax: Math.max(...v), tmin: Math.min(...v) }))
  return { hourly, nowIdx, daily }
}

export function forecastValues(f: AgroForecast, from: Value['from']): Value[] {
  const h = f.hourly
  const i = f.nowIdx
  const asOf = h.time[i]
  const V = (id: string, v: number | null, extra: Partial<Value> = {}): Value => ({ id, v, source: 'om-forecast', from, asOf, ...extra })
  const t = h.t[i]
  const rh = h.rh[i]
  const p0 = h.pressure[i]
  const p3 = i >= 3 ? h.pressure[i - 3] : null
  const dp = num(p0) && num(p3) ? Math.round(p0 - p3) : null
  const temps = h.t.filter(num)
  const gusts = h.gust.filter(num)
  return [
    V('rh_now', rh),
    V('vpd_now', h.vpd[i]),
    V('dew_now', h.dew[i]),
    V('ah_now', num(t) && num(rh) ? r(absoluteHumidity(t, rh), 1) : null),
    V('hd_now', num(t) && num(rh) ? r(humidityDeficit(t, rh), 1) : null),
    V('deltat_now', num(t) && num(rh) ? r(deltaT(t, rh), 1) : null),
    V('st_6', h.st6[i]),
    V('st_18', h.st18[i]),
    V('st_54', h.st54[i]),
    V('pressure_now', p0, dp === null ? {} : { note: `${dp >= 0 ? '+' : ''}${dp} hPa in 3 h` }),
    V('gust_max', gusts.length ? Math.max(...gusts) : null),
    V('t_max16', temps.length ? Math.max(...temps) : null),
    V('t_min16', temps.length ? Math.min(...temps) : null),
  ]
}

export function fetchForecastAgro(lat: number, lon: number, signal?: AbortSignal) {
  return cached(`om-agro:${lat.toFixed(2)},${lon.toFixed(2)}`, HOUR, () =>
    GATES.openmeteo(async () => parseForecastAgro(await getJson<ForecastRaw>(forecastAgroUrl(lat, lon), { signal }))), { signal, staleMs: 2 * DAY })
}

/** Air temperature at a moment in the last ~3 months (for Landsat's overpass), °C, or null. */
export async function airTempAt(lat: number, lon: number, isoUtc: string, signal?: AbortSignal): Promise<number | null> {
  const url = `https://api.open-meteo.com/v1/forecast?${loc(lat, lon)}&hourly=temperature_2m&past_days=92&forecast_days=1&timezone=GMT`
  const { data } = await cached(`om-t92:${lat.toFixed(2)},${lon.toFixed(2)}`, 6 * HOUR, () => GATES.openmeteo(() => getJson<ForecastRaw>(url, { signal })), { signal })
  const time = data.hourly.time as string[]
  const k = time.indexOf(`${isoUtc.slice(0, 13)}:00`)
  const v = k >= 0 ? (data.hourly.temperature_2m as (number | null)[])[k] : null
  return num(v) ? v : null
}

// ---------- ERA5-Land archive ----------
export type Archive = { date: string[]; sm: [(number | null)[], (number | null)[], (number | null)[], (number | null)[]]; windDir: (number | null)[]; windSpeed: (number | null)[] }
const SM = ['soil_moisture_0_to_7cm_mean', 'soil_moisture_7_to_28cm_mean', 'soil_moisture_28_to_100cm_mean', 'soil_moisture_100_to_255cm_mean'] as const

export const archiveUrl = (lat: number, lon: number, start: string, end: string) =>
  `https://archive-api.open-meteo.com/v1/archive?${loc(lat, lon)}&start_date=${start}&end_date=${end}&daily=${[...SM, 'wind_direction_10m_dominant', 'wind_speed_10m_mean'].join(',')}&timezone=auto`

type ArchiveRaw = { daily: Record<string, (number | null)[] | string[]> }
export function parseArchive(json: ArchiveRaw): Archive {
  const d = json.daily
  const col = (k: string) => ((d[k] as (number | null)[] | undefined) ?? []).map((x) => (num(x) ? x : null))
  return { date: d.time as string[], sm: [col(SM[0]), col(SM[1]), col(SM[2]), col(SM[3])], windDir: col('wind_direction_10m_dominant'), windSpeed: col('wind_speed_10m_mean') }
}

const SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export function archiveValues(a: Archive, from: Value['from']): Value[] {
  const ids = ['sm_0_7', 'sm_7_28', 'sm_28_100', 'sm_100_255']
  const out: Value[] = ids.map((id, L) => {
    let k = a.date.length - 1
    while (k >= 0 && a.sm[L][k] === null) k--
    const series: Point[] = []
    for (let i = 0; i < a.date.length; i += 7) series.push({ t: a.date[i], v: a.sm[L][i] })
    return { id, v: k >= 0 ? a.sm[L][k] : null, asOf: k >= 0 ? a.date[k] : undefined, series, source: 'om-archive', from }
  })
  const counts = Array(8).fill(0)
  let n = 0
  a.windDir.forEach((d) => {
    if (d === null) return
    counts[Math.round(d / 45) % 8]++
    n++
  })
  out.push({ id: 'wind_rose', v: null, series: SECTORS.map((t, i) => ({ t, v: n ? Math.round((1000 * counts[i]) / n) / 10 : null })), source: 'om-archive', from, asOf: a.date[a.date.length - 1] })
  return out
}

export function fetchArchive(lat: number, lon: number, signal?: AbortSignal) {
  const end = new Date(Date.now() - 6 * DAY).toISOString().slice(0, 10)
  const start = new Date(Date.now() - 370 * DAY).toISOString().slice(0, 10)
  return cached(`om-era5:${lat.toFixed(2)},${lon.toFixed(2)}`, 3 * DAY, () =>
    GATES.openmeteo(async () => parseArchive(await getJson<ArchiveRaw>(archiveUrl(lat, lon, start, end), { signal, timeoutMs: 45_000 }))), { signal })
}

// ---------- ECMWF seasonal ----------
export type Seasonal = { date: string[]; t: (number | null)[][]; p: (number | null)[][] } // [member][day]
export const seasonalUrl = (lat: number, lon: number) => `https://seasonal-api.open-meteo.com/v1/seasonal?${loc(lat, lon)}&daily=temperature_2m_mean,precipitation_sum&forecast_days=183`

export function parseSeasonal(json: ArchiveRaw): Seasonal {
  const d = json.daily
  const members = (base: string) =>
    Object.keys(d)
      .filter((k) => k === base || k.startsWith(`${base}_member`))
      .sort()
      .map((k) => (d[k] as (number | null)[]).map((x) => (num(x) ? x : null)))
  return { date: d.time as string[], t: members('temperature_2m_mean'), p: members('precipitation_sum') }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The next three full calendar months after `today`: ensemble mean vs the NASA POWER recent normal. */
export function seasonalValues(s: Seasonal, normals: MonthNormal[], today: string, from: Value['from']): Value[] {
  const m0 = (Number(today.slice(5, 7)) % 12) + 1 // next month, 1-12
  const want = [m0, (m0 % 12) + 1, ((m0 + 1) % 12) + 1]
  const inWin = s.date.map((d) => want.includes(Number(d.slice(5, 7))))
  const tNorm = want.reduce((a, m) => a + normals[m - 1].t, 0) / 3
  const pNorm = want.reduce((a, m) => a + normals[m - 1].p, 0)
  const memT = s.t.map((ser) => {
    const v = ser.filter((x, i) => inWin[i] && x !== null) as number[]
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  })
  const memP = s.p.map((ser) => ser.reduce<number>((a, x, i) => (inWin[i] && x !== null ? a + x : a), 0))
  const t = memT.filter(num)
  const label = `${MONTHS[want[0] - 1]}-${MONTHS[want[2] - 1]}`
  const V = (id: string, v: number | null): Value => ({ id, v, text: label, source: 'om-seasonal', from, asOf: today })
  const pMean = memP.reduce((a, b) => a + b, 0) / Math.max(1, memP.length)
  return [
    V('seas_t', t.length ? r(t.reduce((a, b) => a + b, 0) / t.length - tNorm, 2) : null),
    V('seas_p', pNorm > 0 ? r((100 * pMean) / pNorm, 1) : null),
    V('seas_p_dry', memP.length ? (100 * memP.filter((x) => x < pNorm).length) / memP.length : null),
  ]
}

export function fetchSeasonal(lat: number, lon: number, signal?: AbortSignal) {
  return cached(`om-seas:${lat.toFixed(1)},${lon.toFixed(1)}`, 12 * HOUR, () =>
    GATES.openmeteo(async () => parseSeasonal(await getJson<ArchiveRaw>(seasonalUrl(lat, lon), { signal, timeoutMs: 45_000 }))), { signal })
}

// ---------- GloFAS ----------
export type Flood = { date: string[]; q: (number | null)[] }
export const floodUrl = (lat: number, lon: number, end: string) => `https://flood-api.open-meteo.com/v1/flood?${loc(lat, lon)}&daily=river_discharge&start_date=1984-01-01&end_date=${end}`
export function parseFlood(json: ArchiveRaw): Flood {
  return { date: json.daily.time as string[], q: (json.daily.river_discharge as (number | null)[]).map((x) => (num(x) ? x : null)) }
}

/** Peak of the next 30 days as a percentile of the record before today; P95 days per year over the last 10 years. */
export function floodValues(f: Flood, today: string, from: Value['from']): { values: Value[]; floodDays: Set<string> } {
  const past: number[] = []
  let peak: number | null = null
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * DAY).toISOString().slice(0, 10)
  f.date.forEach((d, i) => {
    const q = f.q[i]
    if (q === null) return
    if (d < today) past.push(q)
    else if (d <= limit) peak = Math.max(peak ?? -Infinity, q)
  })
  const floodDays = new Set<string>()
  if (past.length < 3650) return { values: [], floodDays }
  const sorted = [...past].sort((a, b) => a - b)
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))]
  const tenAgo = `${Number(today.slice(0, 4)) - 10}${today.slice(4)}`
  let recent = 0
  f.date.forEach((d, i) => {
    const q = f.q[i]
    if (q === null || q <= p95) return
    if (d >= tenAgo && d < today) recent++
    if (d >= today) floodDays.add(d)
  })
  const rank = peak === null ? null : (100 * sorted.filter((x) => x <= peak!).length) / sorted.length
  const V = (id: string, v: number | null, note?: string): Value => ({ id, v, source: 'om-flood', from, asOf: today, ...(note ? { note } : {}) })
  return {
    values: [V('flood_now', rank === null ? null : Math.round(rank), peak === null ? undefined : `peak ${r(peak, 1)} m³/s, 1-in-20 flow ${r(p95, 1)} m³/s`), V('flood_days', recent / 10)],
    floodDays,
  }
}

export function fetchFlood(lat: number, lon: number, signal?: AbortSignal) {
  const end = new Date(Date.now() + 31 * DAY).toISOString().slice(0, 10)
  return cached(`om-flood:${lat.toFixed(2)},${lon.toFixed(2)}`, 12 * HOUR, () =>
    GATES.openmeteo(async () => parseFlood(await getJson<ArchiveRaw>(floodUrl(lat, lon, end), { signal, timeoutMs: 45_000 }))), { signal })
}

// ---------- CAMS ----------
export const airUrl = (lat: number, lon: number) => `https://air-quality-api.open-meteo.com/v1/air-quality?${loc(lat, lon)}&current=dust&timezone=auto`
export function airValues(json: { current?: { time: string; dust?: number | null } }, from: Value['from']): Value[] {
  const v = json.current?.dust
  return [{ id: 'dust_now', v: num(v) ? v : null, source: 'om-air', from, asOf: json.current?.time }]
}
export function fetchAir(lat: number, lon: number, signal?: AbortSignal) {
  return cached(`om-air:${lat.toFixed(2)},${lon.toFixed(2)}`, HOUR, () => GATES.openmeteo(() => getJson<{ current?: { time: string; dust?: number | null } }>(airUrl(lat, lon), { signal })), { signal })
}

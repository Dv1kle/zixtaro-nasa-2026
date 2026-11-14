// src/lib/data/fetch/modis.ts
// NASA MODIS at the field centre from the ORNL DAAC subset web service (no login, CORS-open): vegetation indices,
// leaf area, absorbed light, evapotranspiration, surface temperature, photosynthesis, phenology dates, land cover in
// a 4 x 4 km window, burned area and vegetation cover. The service answers at most 10 dates per request.
import { cached, DAY, GATES, getJson, SourceError } from '../net'
import type { Point, Value } from '../types'

const API = 'https://modis.ornl.gov/rst/api/v1'
export type BandKey = 'ndvi' | 'evi' | 'lai' | 'fpar' | 'et' | 'pet' | 'le' | 'lstDay' | 'lstNight' | 'gpp' | 'vcf'

const inRange = (x: number, lo: number, hi: number) => x >= lo && x <= hi
export const CONVERT: Record<BandKey, (raw: number) => number | null> = {
  ndvi: (x) => (inRange(x, -2000, 10000) ? x / 10000 : null),
  evi: (x) => (inRange(x, -2000, 10000) ? x / 10000 : null),
  lai: (x) => (inRange(x, 0, 100) ? x / 10 : null),
  fpar: (x) => (inRange(x, 0, 100) ? x : null),
  et: (x) => (inRange(x, 0, 32700) ? (x * 0.1) / 8 : null),
  pet: (x) => (inRange(x, 0, 32700) ? (x * 0.1) / 8 : null),
  le: (x) => (inRange(x, 0, 32700) ? (x * 10000) / 86400 : null),
  lstDay: (x) => (x >= 7500 ? x * 0.02 - 273.15 : null),
  lstNight: (x) => (x >= 7500 ? x * 0.02 - 273.15 : null),
  gpp: (x) => (inRange(x, 0, 30000) ? (x * 0.0001 * 1000) / 8 : null),
  vcf: (x) => (inRange(x, 0, 100) ? x : null),
}

export const BANDS: Record<BandKey, { product: string; band: string; days: number }> = {
  ndvi: { product: 'MOD13Q1', band: '250m_16_days_NDVI', days: 730 },
  evi: { product: 'MOD13Q1', band: '250m_16_days_EVI', days: 730 },
  lai: { product: 'MCD15A2H', band: 'Lai_500m', days: 365 },
  fpar: { product: 'MCD15A2H', band: 'Fpar_500m', days: 365 },
  // near-real-time versions: the gap-filled MOD16A2GF / MOD17A2HGF are published a year later
  et: { product: 'MOD16A2', band: 'ET_500m', days: 365 },
  pet: { product: 'MOD16A2', band: 'PET_500m', days: 365 },
  le: { product: 'MOD16A2', band: 'LE_500m', days: 365 },
  lstDay: { product: 'MOD11A2', band: 'LST_Day_1km', days: 365 },
  lstNight: { product: 'MOD11A2', band: 'LST_Night_1km', days: 365 },
  gpp: { product: 'MOD17A2H', band: 'Gpp_500m', days: 365 },
  vcf: { product: 'MOD44B', band: 'Percent_NonTree_Vegetation', days: 800 },
}
const METRIC: Record<BandKey, string> = { ndvi: 'ndvi', evi: 'evi', lai: 'lai', fpar: 'fpar', et: 'et', pet: 'pet', le: 'le', lstDay: 'lst_day', lstNight: 'lst_night', gpp: 'gpp', vcf: 'veg_nontree' }

type DateRec = { modis_date: string; calendar_date: string }
const q = (lat: number, lon: number) => `latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}`

export async function ornlDates(product: string, lat: number, lon: number, signal?: AbortSignal): Promise<DateRec[]> {
  const { data } = await cached(`ornl-dates:${product}:${lat.toFixed(3)},${lon.toFixed(3)}`, 2 * DAY, () =>
    GATES.ornl(async () => {
      const j = await getJson<{ dates?: DateRec[] } | string>(`${API}/${product}/dates?${q(lat, lon)}`, { signal, timeoutMs: 60_000 })
      if (typeof j === 'string' || !j.dates) throw new SourceError('out-of-coverage', `MODIS ${product} has no data here`)
      return j.dates
    }), { signal })
  return data
}

export async function ornlSeries(product: string, band: string, lat: number, lon: number, dates: DateRec[], signal?: AbortSignal, km = 0): Promise<{ t: string; data: number[] }[]> {
  const chunks: DateRec[][] = []
  for (let i = 0; i < dates.length; i += 10) chunks.push(dates.slice(i, i + 10))
  const parts = await Promise.all(
    chunks.map((c) =>
      cached(`ornl:${product}:${band}:${km}:${lat.toFixed(3)},${lon.toFixed(3)}:${c[0].modis_date}-${c[c.length - 1].modis_date}`, 30 * DAY, () =>
        GATES.ornl(async () => {
          const url = `${API}/${product}/subset?${q(lat, lon)}&band=${band}&startDate=${c[0].modis_date}&endDate=${c[c.length - 1].modis_date}&kmAboveBelow=${km}&kmLeftRight=${km}`
          const j = await getJson<{ subset: { calendar_date: string; data: number[] }[] }>(url, { signal, timeoutMs: 90_000 })
          return j.subset.map((s) => ({ t: s.calendar_date, data: s.data }))
        }), { signal }).then((r) => r.data),
    ),
  )
  return parts.flat()
}

/** MCD12Q2 stores dates as days since 1 January 1970. */
export const phenologyDate = (raw: number) => (raw > 0 && raw < 32767 ? new Date(raw * 86_400_000).toISOString().slice(0, 10) : null)

/** IGBP classes: 1-11 natural (forest, shrub, savanna, grassland, wetland), 12 cropland, 14 mosaic (half each), 17 water. */
export function landShares(classes: number[]): { habitat: number; cropland: number } | null {
  const land = classes.filter((c) => c !== 17 && c > 0 && c < 255)
  if (!land.length) return null
  const habitat = land.filter((c) => c <= 11).length + 0.5 * land.filter((c) => c === 14).length
  const cropland = land.filter((c) => c === 12).length + 0.5 * land.filter((c) => c === 14).length
  return { habitat: habitat / land.length, cropland: cropland / land.length }
}

/**
 * The composites with the same days of year as `recent` in each of the `years` years before, one group per year
 * (so each group is a short consecutive run the service answers in one request). Matched on the day of year in
 * the MODIS date, not the calendar date, which moves by a day in leap years.
 */
export function pastComposites(all: DateRec[], recent: string[], years: number): DateRec[][] {
  const recentRecs = all.filter((d) => recent.includes(d.calendar_date))
  if (!recentRecs.length) return []
  const doys = new Set(recentRecs.map((d) => d.modis_date.slice(5)))
  const y0 = Number(recentRecs[0].modis_date.slice(1, 5))
  const out: DateRec[][] = []
  for (let y = y0 - years; y < y0; y++) {
    const g = all.filter((d) => Number(d.modis_date.slice(1, 5)) === y && doys.has(d.modis_date.slice(5)))
    if (g.length) out.push(g)
  }
  return out
}

const within = (dates: DateRec[], days: number) => {
  const cut = new Date(Date.now() - days * DAY).toISOString().slice(0, 10)
  return dates.filter((d) => d.calendar_date >= cut)
}

export async function fetchModis(lat: number, lon: number, signal?: AbortSignal, onPart?: (v: Value[]) => void): Promise<Value[]> {
  const out: Value[] = []
  const push = (v: Value[]) => {
    out.push(...v)
    onPart?.(v)
  }
  const series = async (k: BandKey): Promise<Point[]> => {
    const b = BANDS[k]
    const dates = within(await ornlDates(b.product, lat, lon, signal), b.days)
    const raw = await ornlSeries(b.product, b.band, lat, lon, dates, signal)
    return raw.map((s) => ({ t: s.t, v: CONVERT[k](s.data[0]) }))
  }
  const latest = (ps: Point[]) => [...ps].reverse().find((p) => p.v !== null) ?? null
  const bandValue = (k: BandKey, ps: Point[]): Value => {
    const l = latest(ps)
    return { id: METRIC[k], v: l?.v ?? null, asOf: l?.t, series: ps, source: 'modis', from: 'live' }
  }
  const tasks: Promise<void>[] = []
  for (const k of ['ndvi', 'evi', 'lai', 'fpar', 'gpp', 'vcf'] as BandKey[])
    tasks.push(series(k).then((ps) => push([bandValue(k, ps)])))
  tasks.push(
    Promise.all([series('et'), series('pet'), series('le')]).then(([et, pet, le]) => {
      const last = (ps: Point[]) => ps.filter((p) => p.v !== null).slice(-4).map((p) => p.v!)
      const a = last(et)
      const b = last(pet)
      const ratio = a.length && b.length ? a.reduce((x, y) => x + y, 0) / Math.max(1e-6, b.reduce((x, y) => x + y, 0)) : null
      push([bandValue('et', et), bandValue('pet', pet), bandValue('le', le), { id: 'et_ratio', v: ratio === null ? null : Math.min(1.5, ratio), source: 'modis', from: 'live', asOf: latest(et)?.t }])
    }),
  )
  tasks.push(
    (async () => {
      const b = BANDS.lstDay
      const [day, night] = await Promise.all([series('lstDay'), series('lstNight')])
      push([bandValue('lstDay', day), bandValue('lstNight', night)])
      const recent = day.filter((p) => p.v !== null).slice(-4)
      let anom: number | null = null
      try {
        const groups = recent.length === 4 ? pastComposites(await ornlDates(b.product, lat, lon, signal), recent.map((p) => p.t), 5) : []
        const pv: number[] = []
        for (const g of groups)
          for (const r of await ornlSeries(b.product, b.band, lat, lon, g, signal)) {
            const v = g.some((d) => d.calendar_date === r.t) ? CONVERT.lstDay(r.data[0]) : null
            if (v !== null) pv.push(v)
          }
        if (pv.length >= 8) anom = recent.reduce((x, p) => x + p.v!, 0) / 4 - pv.reduce((x, y) => x + y, 0) / pv.length
      } catch {
        // the anomaly is optional; day and night LST stand on their own
      }
      push([{ id: 'lst_anom', v: anom, source: 'modis', from: 'live', asOf: recent[recent.length - 1]?.t }])
    })(),
  )
  tasks.push(
    (async () => {
      const dates = await ornlDates('MCD12Q2', lat, lon, signal)
      const last = dates.slice(-1)
      const get = async (band: string) => (await ornlSeries('MCD12Q2', band, lat, lon, last, signal))[0]?.data[0] ?? 32767
      const [g, m, s] = await Promise.all([get('Greenup.Num_Modes_01'), get('Maturity.Num_Modes_01'), get('MidGreendown.Num_Modes_01')])
      const asOf = last[0]?.calendar_date
      push([
        { id: 'greenup', v: null, text: phenologyDate(g) ?? undefined, source: 'modis', from: 'live', asOf },
        { id: 'maturity', v: null, text: phenologyDate(m) ?? undefined, source: 'modis', from: 'live', asOf },
        { id: 'senescence', v: null, text: phenologyDate(s) ?? undefined, source: 'modis', from: 'live', asOf },
      ])
    })(),
  )
  tasks.push(
    (async () => {
      const dates = (await ornlDates('MCD12Q1', lat, lon, signal)).slice(-1)
      const raw = await ornlSeries('MCD12Q1', 'LC_Type1', lat, lon, dates, signal, 2)
      const sh = raw[0] ? landShares(raw[0].data) : null
      const asOf = dates[0]?.calendar_date
      push([
        { id: 'habitat_2km', v: sh ? Math.round(sh.habitat * 100) : null, source: 'modis', from: 'live', asOf },
        { id: 'cropland_2km', v: sh ? Math.round(sh.cropland * 100) : null, source: 'modis', from: 'live', asOf },
      ])
    })(),
  )
  tasks.push(
    (async () => {
      const dates = within(await ornlDates('MCD64A1', lat, lon, signal), 3650)
      const raw = await ornlSeries('MCD64A1', 'Burn_Date', lat, lon, dates, signal)
      const years = new Set(raw.filter((s) => s.data[0] > 0 && s.data[0] <= 366).map((s) => s.t.slice(0, 4)))
      push([{ id: 'burned', v: raw.length ? years.size : null, text: [...years].sort().join(', ') || undefined, source: 'modis', from: 'live', asOf: raw[raw.length - 1]?.t }])
    })(),
  )
  const settled = await Promise.allSettled(tasks)
  if (!out.length) {
    const e = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected')
    throw e?.reason instanceof Error ? e.reason : new SourceError('failed', 'MODIS gave nothing for this point')
  }
  return out
}

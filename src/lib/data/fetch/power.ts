// src/lib/data/fetch/power.ts
// NASA POWER daily beyond temperature and rain: humidity, dew point, PAR, UV-B, diffuse light, aerosols, soil wetness
// in three layers, skin temperature and wind, for the last three years. One request, one gate, cached for a week.
import { growingSeason } from '../../climate'
import { dliFromPar } from '../derive/light'
import { vpdFromDew } from '../derive/humidity'
import { cached, DAY, GATES, getJson } from '../net'
import type { Point, Value } from '../types'

export const POWER_EXTRA = [
  'RH2M', 'T2MDEW', 'T2M_MAX', 'PRECTOTCORR', 'ALLSKY_SFC_PAR_TOT', 'ALLSKY_SFC_UVB', 'ALLSKY_SFC_SW_DWN', 'ALLSKY_SFC_SW_DIFF',
  'ALLSKY_KT', 'AOD_55', 'GWETTOP', 'GWETROOT', 'GWETPROF', 'TS', 'WS2M',
] as const
type Param = (typeof POWER_EXTRA)[number]
export type PowerExtra = { start: string; v: Record<Param, (number | null)[]> }

export const powerExtraUrl = (lat: number, lon: number, start: string, end: string) =>
  'https://power.larc.nasa.gov/api/temporal/daily/point' +
  `?parameters=${POWER_EXTRA.join(',')}&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${start}&end=${end}&format=JSON`

const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > -900

export function parsePowerExtra(json: { properties?: { parameter?: Partial<Record<Param, Record<string, number>>> } }): PowerExtra {
  const par = json.properties?.parameter
  if (!par?.RH2M) throw new Error('NASA POWER returned no daily parameters')
  const keys = Object.keys(par.RH2M).sort()
  const v = {} as PowerExtra['v']
  for (const p of POWER_EXTRA) v[p] = keys.map((k) => (ok(par[p]?.[k]) ? Math.round(par[p]![k] * 1000) / 1000 : null))
  const k0 = keys[0]
  return { start: `${k0.slice(0, 4)}-${k0.slice(4, 6)}-${k0.slice(6, 8)}`, v }
}

const iso = (start: string, i: number) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)

/** Index of the last day with data in every key series, and the 365 days that end there. */
function lastYear(p: PowerExtra): { from: number; to: number } | null {
  let to = p.v.RH2M.length - 1
  while (to >= 0 && p.v.RH2M[to] === null) to--
  return to < 0 ? null : { from: Math.max(0, to - 364), to }
}

export function powerValues(p: PowerExtra, lat: number, from: Value['from']): Value[] {
  const yr = lastYear(p)
  if (!yr) return []
  const asOf = iso(p.start, yr.to)
  const range = (k: Param) => p.v[k].slice(yr.from, yr.to + 1)
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter(ok)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const sum = (xs: (number | null)[]) => xs.filter(ok).reduce((a, b) => a + b, 0)
  const months = new Set(growingSeason(lat).months.map((m) => m.month))
  const inSeason = (i: number) => months.has(Number(iso(p.start, i).slice(5, 7)))
  const weekly = (k: Param): Point[] => {
    const out: Point[] = []
    for (let i = yr.from; i <= yr.to; i += 7) out.push({ t: iso(p.start, i), v: mean(p.v[k].slice(i, Math.min(yr.to + 1, i + 7))) })
    return out
  }
  const V = (id: string, v: number | null, extra: Partial<Value> = {}): Value => ({ id, v, source: 'power', from, asOf, ...extra })
  const parSeason: number[] = []
  for (let i = yr.from; i <= yr.to; i++) if (inSeason(i) && ok(p.v.ALLSKY_SFC_PAR_TOT[i])) parSeason.push(p.v.ALLSKY_SFC_PAR_TOT[i]!)
  const vpds: number[] = []
  for (let i = Math.max(0, yr.to - 3 * 365); i <= yr.to; i++) {
    const t = p.v.T2M_MAX[i]
    const td = p.v.T2MDEW[i]
    if (inSeason(i) && ok(t) && ok(td)) vpds.push(vpdFromDew(t, td))
  }
  const sw = sum(range('ALLSKY_SFC_SW_DWN'))
  const lastOf = (k: Param) => {
    for (let i = yr.to; i >= yr.from; i--) if (ok(p.v[k][i])) return p.v[k][i]
    return null
  }
  return [
    V('rh', mean(range('RH2M'))),
    V('rain_365', sum(range('PRECTOTCORR'))),
    V('sw', mean(range('ALLSKY_SFC_SW_DWN'))),
    V('par', mean(range('ALLSKY_SFC_PAR_TOT'))),
    V('clearness', mean(range('ALLSKY_KT'))),
    V('aod', mean(range('AOD_55'))),
    V('uvb', mean(range('ALLSKY_SFC_UVB'))),
    V('ts_skin', mean(range('TS'))),
    V('wind_mean', mean(range('WS2M'))),
    V('diffuse', sw > 0 ? (100 * sum(range('ALLSKY_SFC_SW_DIFF'))) / sw : null),
    V('dli', parSeason.length ? dliFromPar(parSeason.reduce((a, b) => a + b, 0) / parSeason.length) : null),
    V('vpd_day', vpds.length ? vpds.reduce((a, b) => a + b, 0) / vpds.length : null),
    V('gwet_top', lastOf('GWETTOP'), { series: weekly('GWETTOP') }),
    V('gwet_root', lastOf('GWETROOT'), { series: weekly('GWETROOT') }),
    V('gwet_prof', lastOf('GWETPROF'), { series: weekly('GWETPROF') }),
  ]
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replaceAll('-', '')

export function fetchPowerExtra(lat: number, lon: number, signal?: AbortSignal) {
  const now = Date.now()
  const start = ymd(Date.UTC(new Date(now).getUTCFullYear() - 3, 0, 1))
  return cached(`power-extra:${lat.toFixed(3)},${lon.toFixed(3)}`, 7 * DAY, () =>
    GATES.power(async () => parsePowerExtra(await getJson(powerExtraUrl(lat, lon, start, ymd(now)), { timeoutMs: 60_000, signal }))), { signal })
}

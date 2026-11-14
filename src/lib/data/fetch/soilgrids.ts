// src/lib/data/fetch/soilgrids.ts
// SoilGrids beyond texture: CEC, total nitrogen, the 5-95 % range of pH, and the water-retention layers that let the
// dossier say how tightly the soil holds its water. One request per field (centre point), through the shared gate.
import { omFromSoc } from '../../soil'
import { fitVG, hydrologicGroup, KPA_TO_CM, pF, saxtonRawlsFull, suctionFromPoints, type VG } from '../derive/soilwater'
import { cached, DAY, GATES, getJson, SourceError } from '../net'
import type { Value } from '../types'

const PROPS = ['sand', 'clay', 'soc', 'nitrogen', 'cec', 'phh2o', 'bdod', 'wv0010', 'wv0033', 'wv1500'] as const
const DEPTHS = ['0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm'] as const
const THICK: Record<(typeof DEPTHS)[number], number> = { '0-5cm': 5, '5-15cm': 10, '15-30cm': 15, '30-60cm': 30, '60-100cm': 40 }
const TOP = ['0-5cm', '5-15cm', '15-30cm'] as const
const SUB = ['30-60cm', '60-100cm'] as const

export const sgExtraUrl = (lat: number, lon: number) =>
  `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&` +
  PROPS.map((p) => `property=${p}`).join('&') + '&' + DEPTHS.map((d) => `depth=${d}`).join('&') + '&value=mean&value=Q0.05&value=Q0.95'

export type Range = { mean: number; lo: number; hi: number }
export type Zone = { sand: number; clay: number; soc: number; n: number; cec: number; ph: Range; bd: number; th10: number; th33: number; th1500: number }
export type SgExtra = { top: Zone; sub: Zone }
type Raw = { properties: { layers: { name: string; unit_measure: { d_factor: number }; depths: { label: string; values: Record<string, number | null> }[] }[] } }

export function parseSgExtra(json: Raw): SgExtra {
  const get = (prop: string, depths: readonly string[], q: string): number => {
    const L = json.properties.layers.find((l) => l.name === prop)
    if (!L) return NaN
    let s = 0
    let w = 0
    for (const d of L.depths) {
      if (!depths.includes(d.label)) continue
      const v = d.values[q]
      if (typeof v !== 'number') continue
      const t = THICK[d.label as (typeof DEPTHS)[number]]
      s += (v / L.unit_measure.d_factor) * t
      w += t
    }
    return w ? s / w : NaN
  }
  const zone = (depths: readonly string[]): Zone => ({
    sand: get('sand', depths, 'mean'), clay: get('clay', depths, 'mean'), soc: get('soc', depths, 'mean'), n: get('nitrogen', depths, 'mean'),
    cec: get('cec', depths, 'mean'), bd: get('bdod', depths, 'mean'),
    ph: { mean: get('phh2o', depths, 'mean'), lo: get('phh2o', depths, 'Q0.05'), hi: get('phh2o', depths, 'Q0.95') },
    th10: get('wv0010', depths, 'mean') / 100, th33: get('wv0033', depths, 'mean') / 100, th1500: get('wv1500', depths, 'mean') / 100,
  })
  const top = zone(TOP)
  if (!Number.isFinite(top.sand) && !Number.isFinite(top.ph.mean)) throw new SourceError('failed', 'SoilGrids has no data at this point (water, city or bare rock?)')
  return { top, sub: zone(SUB) }
}

export type Curve = VG & { sat: number; pts: { kPa: number; theta: number }[] }
/** van Genuchten curves for topsoil and subsoil through the retention points and Saxton-Rawls saturation. */
export function curves(s: SgExtra): { top: Curve | null; sub: Curve | null } {
  const fit = (z: Zone): Curve | null => {
    if (![z.th10, z.th33, z.th1500, z.sand, z.clay].every(Number.isFinite)) return null
    const sat = Math.max(z.th10 + 0.02, saxtonRawlsFull(z.sand, z.clay, omFromSoc(z.soc)).sat)
    const pts = [{ kPa: 10, theta: z.th10 }, { kPa: 33, theta: z.th33 }, { kPa: 1500, theta: z.th1500 }]
    return { ...fitVG(pts, sat), sat, pts }
  }
  return { top: fit(s.top), sub: fit(s.sub) }
}

const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d

export function soilValues(s: SgExtra, sm: { d0_7: number | null; d7_28: number | null; d28_100: number | null } | null, from: Value['from'], asOf?: string): Value[] {
  const V = (id: string, v: number | null, extra: Partial<Value> = {}): Value => ({ id, v: v !== null && Number.isFinite(v) ? v : null, source: 'soilgrids', from, ...extra })
  const t = s.top
  const sr = saxtonRawlsFull(t.sand, t.clay, omFromSoc(t.soc))
  const c = curves(s)
  const kPa = (curve: Curve | null, theta: number | null) => {
    if (!curve || theta === null) return null
    const k = suctionFromPoints(curve.pts, curve, Math.min(theta, curve.sat - 0.001))
    return Number.isFinite(k) ? r(k, 0) : null
  }
  const psi7_28 = kPa(c.top, sm?.d7_28 ?? null)
  const al = Math.min(1, Math.max(0, (5.5 - t.ph.mean) / 1))
  return [
    V('ph', r(t.ph.mean, 1), { lo: r(t.ph.lo, 1), hi: r(t.ph.hi, 1) }),
    V('cec', t.cec), V('n_total', t.n), V('soc', t.soc), V('bd', t.bd),
    V('cn', t.n > 0 ? t.soc / t.n : null),
    V('theta_10', t.th10), V('theta_fc', t.th33), V('theta_wp', t.th1500),
    V('paw_sg', (t.th33 - t.th1500) * 300),
    V('ksat', sr.ksat), V('hsg', null, { text: hydrologicGroup(sr.ksat) }),
    V('al_risk', r(al, 2)),
    V('psi_0_7', kPa(c.top, sm?.d0_7 ?? null), { asOf }),
    V('psi_7_28', psi7_28, { asOf }),
    V('psi_28_100', kPa(c.sub, sm?.d28_100 ?? null), { asOf }),
    V('pf_7_28', psi7_28 === null ? null : r(pF(psi7_28 * KPA_TO_CM), 1), { asOf }),
  ]
}

export function fetchSgExtra(lat: number, lon: number, signal?: AbortSignal) {
  return cached(`sg-extra:${lat.toFixed(4)},${lon.toFixed(4)}`, 365 * DAY, () =>
    GATES.soilgrids(async () => parseSgExtra(await getJson<Raw>(sgExtraUrl(lat, lon), { signal, timeoutMs: 120_000 }))), { signal, staleMs: 3650 * DAY })
}

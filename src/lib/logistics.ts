// What it costs to get a tonne from the field to a market: road to the buyer, or road-port-sea-port-road, or air for
// what would spoil at sea. Rates are round figures for 2023-2025 (sources in RATE_SOURCES); every one can be changed
// in the Assumptions drawer. Stated simplifications: no quotas, no free-trade deals beyond the customs unions, no SPS bans.
import { COUNTRY, gcKm } from './markets'

export type Rates = {
  /** € per t·km by truck: bulk and refrigerated */
  roadBulk: number
  roadReefer: number
  /** dry bulk by sea: € per t per voyage and € per t·km */
  seaBulkFix: number
  seaBulkKm: number
  /** refrigerated container: € per 40-ft box, € per box·km, tonnes it carries */
  reeferFeu: number
  reeferFeuKm: number
  feuTonnes: number
  /** € per kg by air */
  airKg: number
  /** € per t handling at each port (bulk) */
  port: number
  roadKmDay: number
  seaKmDay: number
  portDays: number
  airDays: number
}
export const RATES: Rates = {
  roadBulk: 0.07, roadReefer: 0.12,
  seaBulkFix: 10, seaBulkKm: 0.0025,
  reeferFeu: 2500, reeferFeuKm: 0.25, feuTonnes: 20,
  airKg: 2.5,
  port: 12,
  roadKmDay: 600, seaKmDay: 650, portDays: 3, airDays: 2,
}
export const RATE_SOURCES = {
  road: 'EU road haulage cost ≈ €1.5-1.9 per km for a 24 t truck (CNR European road freight benchmarks)',
  sea: 'Dry bulk handysize rates, World Bank Pink Sheet / Baltic indices 2023-2025',
  reefer: 'Reefer container rates, Drewry World Container Index public summaries',
  air: 'Air cargo general rates, TAC / Baltic Air Freight Index public summaries',
}

/** Sea km from each country's best port to the buyer's city (scripts/markets.mjs), and every country's ports. */
export type SeaMatrix = { order: string[]; km: (number | null)[]; snap: number[]; ports?: [number, number][][] }
export type Mode = 'local' | 'road' | 'sea' | 'air'
export type Route = { mode: Mode; km: number; days: number; freight: number; tariff: number; loss: number; reachable: boolean }

/** Food import bans in force: importer → exporters it refuses. Russia's counter-sanctions on farm produce (Government
 *  Decree 778 of 2014, extended every year since) and Ukraine's ban on Russian and Belarusian goods (2022). */
const EU = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE']
export const EMBARGO: Record<string, string[]> = {
  RUS: [...EU, 'USA', 'CAN', 'AUS', 'NOR', 'UKR', 'GBR', 'ALB', 'MNE', 'ISL', 'LIE'],
  UKR: ['RUS', 'BLR'],
}
export const embargoed = (from: string, to: string) => !!EMBARGO[to]?.includes(from)

/** Road distance = great-circle × 1.3 */
const ROAD = 1.3
/** Longest haul still sent by road rather than by sea */
const MAX_ROAD = 2500

export function seaKm(sea: SeaMatrix | null, a: string, b: string): number | null {
  if (!sea) return null
  const i = sea.order.indexOf(a)
  const j = sea.order.indexOf(b)
  if (i < 0 || j < 0) return null
  return sea.km[i * sea.order.length + j] ?? null
}
/** Share of a perishable load lost on a trip of `days` (none for dry goods; rising towards half at the shelf life). */
const lossFor = (days: number, shelf: number) => (shelf >= 60 ? 0 : Math.min(0.5, 0.5 * (days / shelf) ** 2))
const tariffFor = (home: string, dest: string) => {
  if (home === dest) return 0
  const h = COUNTRY[home]
  const d = COUNTRY[dest]
  if (h?.union && h.union === d?.union) return 0
  return d?.tariff ?? 0
}

export function routeCost(o: { origin: [number, number]; home: string; dest: string; shelfDays: number; sea: SeaMatrix | null; rates?: Rates }): Route {
  const r = o.rates ?? RATES
  const perishable = o.shelfDays < 60
  const dest = COUNTRY[o.dest]
  const home = COUNTRY[o.home]
  const unreachable: Route = { mode: 'sea', km: 0, days: Infinity, freight: 0, tariff: 0, loss: 0, reachable: false }
  if (!dest || !home || embargoed(o.home, o.dest)) return unreachable
  const roadRate = perishable ? r.roadReefer : r.roadBulk
  const tariff = tariffFor(o.home, o.dest)
  const road = gcKm(o.origin, dest.hub) * ROAD
  const make = (mode: Mode, km: number, days: number, freight: number): Route => ({
    mode, km, days, freight, tariff, loss: lossFor(days, o.shelfDays), reachable: days <= o.shelfDays,
  })
  // FAOSTAT producer prices are farm-gate prices: selling at home costs no freight
  if (o.home === o.dest) return { mode: 'local', km: 0, days: 0, freight: 0, tariff: 0, loss: 0, reachable: true }
  const options: Route[] = []
  if (!home.island && !dest.island && home.land === dest.land && road <= MAX_ROAD) options.push(make('road', road, road / r.roadKmDay, road * roadRate))
  const seaLeg = seaKm(o.sea, o.home, o.dest)
  // by road to the nearest home port (the capital when the ports are not loaded); the sea leg starts there
  const myPorts = o.sea?.ports?.[o.sea.order.indexOf(o.home)] ?? [home.hub]
  const toHub = Math.min(...myPorts.map((p) => gcKm(o.origin, p))) * ROAD
  if (seaLeg !== null) {
    const days = toHub / r.roadKmDay + seaLeg / r.seaKmDay + 2 * r.portDays
    const freight = perishable
      ? toHub * roadRate + (r.reeferFeu + r.reeferFeuKm * seaLeg) / r.feuTonnes
      : toHub * roadRate + r.seaBulkFix + r.seaBulkKm * seaLeg + 2 * r.port
    options.push(make('sea', toHub + seaLeg, days, freight))
  }
  const ok = options.filter((x) => x.reachable)
  if (ok.length) return ok.reduce((a, b) => (a.freight * (1 + a.loss) <= b.freight * (1 + b.loss) ? a : b))
  if (perishable && (seaLeg !== null || options.length)) {
    return make('air', gcKm(home.hub, dest.hub), r.airDays + toHub / r.roadKmDay, r.airKg * 1000 + toHub * roadRate)
  }
  return options[0] ? { ...options[0], reachable: false } : unreachable
}

// Where each crop is worth most once it has travelled: the price there (a bad-year price, the 25th percentile), less
// freight, duty and spoilage - at home, in the region next door, or wherever the grower chooses to ship.
import { COUNTRY, MARKETS, consumption, costIndex, demandAdj, priceQuote, regionOf, type CropKey } from './markets'
import { routeCost, type Rates, type Route, type SeaMatrix } from './logistics'

export type MarketMode = { kind: 'auto' } | { kind: 'home' } | { kind: 'region' } | { kind: 'to'; iso3: string }
export type CropQuote = {
  /** iso3 of the market the crop is sold in */
  market: string
  /** € per tonne used for scoring: the P25 producer price there, or the grower's own */
  price: number
  median: number
  p10: number
  p90: number
  /** faostat: the country's record · import: world price, the country grows almost none (import parity) · estimate: sub-region ratio · yours */
  source: 'faostat' | 'import' | 'estimate' | 'yours'
  route: Route
  /** what a tonne leaves after duty, spoilage and freight, €; a load that cannot arrive fresh is all lost */
  netPerT: number
  /** the same, selling at home - for "+€X vs home" */
  homeNetPerT: number
  /** import demand of that market, −0.1…+0.1 of the profit sub-score */
  demand: number
  /** a market too small to take a farm's harvest at its own price (< 20 000 t a year): priced at most at the world median */
  niche: boolean
}
export type MarketContext = {
  home: string
  homeName: string
  costIndex: number
  mode: MarketMode
  quotes: Partial<Record<CropKey, CropQuote>>
  routes: 'ready' | 'loading' | 'unavailable'
}

/** A grower-typed price: a positive finite number, else nothing (the market price stays). */
export function parseOwnPrice(x: unknown): number | null {
  const v = typeof x === 'string' ? Number(x.trim() || NaN) : typeof x === 'number' ? x : NaN
  return Number.isFinite(v) && v > 0 ? v : null
}

/** A market auto may chase: priced from records (not an estimate) and big enough to take a harvest - the dearest of
 *  26 small noisy prices is nearly always an outlier (Luxembourg strawberries, Maltese wheat). */
const MIN_MARKET_T = 20_000
const MIN_MARKET_SHARE = 0.02
function bigMarkets(home: string, crop: CropKey): string[] {
  const near = regionOf(home)
  const total = [home, ...near].reduce((s, c) => s + consumption(c, crop), 0)
  const floor = Math.max(MIN_MARKET_T, MIN_MARKET_SHARE * total)
  // priced from records, or an importer paying the world price; never a sub-region estimate
  return near.filter((c) => consumption(c, crop) >= floor && priceQuote(c, crop)?.source === 'faostat')
}

/**
 * Share of its production a country exports (FAOSTAT trade), from which auto looks abroad for a crop at all: farmers
 * sell abroad what their country ships. A country that imports its staple (Guinea's rice) sells it at home - a
 * neighbour's farm-gate price is no offer to it (the first blind validation had Guinean rice sold in Niger at 2.6x).
 */
const EXPORT_SHARE = 0.05
export function exportsCrop(iso3: string, crop: CropKey): boolean {
  const t = MARKETS.trade[iso3]?.[crop]
  return !!t && t[0] > 0 && t[2] >= EXPORT_SHARE * t[0]
}

/**
 * A buyer abroad who nets more than this multiple of the home price is out of reach of trade: between trading neighbours
 * prices differ by about the cost of trade (the law of one price), so a wider gap means the two prices are not the same
 * good (paddy against milled rice, seed cotton against lint), a protected market or a thin record - a farmer cannot
 * capture it. An assumption: ~30 % for freight, handling and transaction costs between neighbours. The first blind
 * validation found auto "selling" Kazakh rice in Kyrgyzstan at 4.9x and French peas in Romania at 6.3x.
 */
const MAX_UPLIFT = 1.3

type Base = { origin: [number, number]; home: string; sea: SeaMatrix | null; rates?: Rates; own: number | null }

const p90Cache = new Map<CropKey, number | null>()
/** The 90th percentile of countries' median farm-gate prices for a crop, €/t: the dearest believable buyer abroad. */
export function worldP90(crop: CropKey): number | null {
  if (!p90Cache.has(crop)) {
    const meds = Object.values(MARKETS.prices)
      .map((p) => p[crop]?.filter((v): v is number => v !== null).sort((a, b) => a - b))
      .filter((s): s is number[] => !!s && s.length > 0)
      .map((s) => s[Math.floor(s.length / 2)])
      .sort((a, b) => a - b)
    p90Cache.set(crop, meds.length >= 5 ? meds[Math.floor(0.9 * (meds.length - 1))] : null)
  }
  return p90Cache.get(crop)!
}

/** Below this share of its own consumption grown at home, a country's farm-gate price says little about what it pays importers. */
const IMPORT_PARITY_SHARE = 0.1

function quoteAt(b: Base, crop: CropKey, iso3: string): Omit<CropQuote, 'homeNetPerT'> | null {
  let p: { p25: number; median: number; p10: number; p90: number; source: CropQuote['source'] } | null = priceQuote(iso3, crop)
  // a buyer abroad that grows almost none of the crop pays roughly the world price (import parity), not the price of
  // its few local growers (Indonesian wheat)
  const t = MARKETS.trade[iso3]?.[crop]
  const wp = MARKETS.world[crop]
  if (iso3 !== b.home && wp && t && t[0] + t[1] - t[2] > 0 && t[0] / (t[0] + t[1] - t[2]) < IMPORT_PARITY_SHARE) {
    p = { p25: wp * 0.9, median: wp, p10: wp * 0.8, p90: wp * 1.2, source: 'import' }
  }
  const own = iso3 === b.home ? b.own : null
  // abroad, a price above the world's 90th percentile is more likely a thin or mis-recorded market than a buyer
  // who pays it for a whole harvest: capped there (home keeps its own record)
  const cap = iso3 !== b.home ? worldP90(crop) : null
  if (p && cap && p.p25 > cap) p = { ...p, p25: cap, median: Math.min(p.median, cap), p10: Math.min(p.p10, cap), p90: Math.min(p.p90, cap) }
  if (!p && !own) return null
  const route = routeCost({ origin: b.origin, home: b.home, dest: iso3, shelfDays: MARKETS.shelf[crop] ?? 365, sea: b.sea, rates: b.rates })
  // a small market's price holds only for small volumes: a farm selling into it is priced at most at the world median
  const niche = !own && consumption(iso3, crop) < MIN_MARKET_T
  const world = MARKETS.world[crop]
  const price = own ?? (niche && world ? Math.min(p!.p25, world) : p!.p25)
  const sold = route.reachable ? 1 - route.tariff - route.loss : 0
  return {
    market: iso3, price, median: own ?? p!.median, p10: own ?? p!.p10, p90: own ?? p!.p90,
    source: own ? 'yours' : p!.source, route,
    netPerT: price * sold - route.freight,
    demand: demandAdj(iso3, crop),
    niche,
  }
}

export function buildMarket(o: {
  origin: [number, number]; home: string; mode: MarketMode; crops: CropKey[]; sea: SeaMatrix | null
  own?: Partial<Record<CropKey, number>>; rates?: Rates; routes?: MarketContext['routes']
}): MarketContext {
  const quotes: MarketContext['quotes'] = {}
  const target = o.mode.kind === 'to' && COUNTRY[o.mode.iso3] && o.mode.iso3 !== o.home ? o.mode.iso3 : null
  for (const crop of o.crops) {
    const b: Base = { origin: o.origin, home: o.home, sea: o.sea, rates: o.rates, own: parseOwnPrice(o.own?.[crop]) }
    const home = quoteAt(b, crop, o.home)
    let pick = home
    if (o.sea && target) {
      // the chosen market, even when nothing gets there fresh: the grower sees why
      pick = quoteAt(b, crop, target) ?? home
    } else if (o.sea && (o.mode.kind === 'region' || (o.mode.kind === 'auto' && exportsCrop(o.home, crop)))) {
      const away = bigMarkets(o.home, crop)
        .map((c) => quoteAt(b, crop, c))
        .filter((q): q is NonNullable<typeof q> => !!q && q.route.reachable && (o.mode.kind !== 'auto' || !home || q.netPerT <= home.netPerT * MAX_UPLIFT))
      const best = away.length ? away.reduce((x, y) => (x.netPerT >= y.netPerT ? x : y)) : null
      if (best && (o.mode.kind === 'region' || !home || best.netPerT > home.netPerT)) pick = best
    }
    if (!pick) continue
    quotes[crop] = { ...pick, homeNetPerT: home?.netPerT ?? pick.netPerT }
  }
  return {
    home: o.home, homeName: COUNTRY[o.home]?.name ?? o.home, costIndex: costIndex(o.home), mode: o.mode, quotes,
    routes: o.routes ?? (o.sea ? 'ready' : 'loading'),
  }
}

/** The EU glasshouse market the DG AGRI curves describe: north-west (Dutch/Belgian) or Mediterranean (Spanish/Italian). */
const GH_REFERENCE = { north: ['NLD', 'BEL'], south: ['ESP', 'ITA'] }
const GH_IDS = ['tomato', 'cherry', 'cucumber', 'pepper', 'eggplant', 'courgette', 'lettuce', 'strawberry', 'basil'] as const
type GhKey = (typeof GH_IDS)[number]

/**
 * Greenhouse prices at the chosen market: inside the EU the DG AGRI monthly record already is the market (level 1);
 * elsewhere it is scaled by that country's FAOSTAT price against the EU reference. Delivery, duty and spoilage come
 * off every kg.
 */
export function ghMarketPrices(m: MarketContext, lat: number): { level: Partial<Record<GhKey, number>>; perKg: Partial<Record<GhKey, number>>; label: string } {
  const level: Partial<Record<GhKey, number>> = {}
  const perKg: Partial<Record<GhKey, number>> = {}
  const refs = GH_REFERENCE[Math.abs(lat) >= 45 ? 'north' : 'south']
  let label = m.home
  for (const id of GH_IDS) {
    const q = m.quotes[id]
    if (!q) continue
    label = q.market
    const inEu = COUNTRY[q.market]?.union === 'EU'
    const ref = refs.map((c) => priceQuote(c, id)?.median).filter((v): v is number => !!v)
    const refMedian = ref.length ? ref.reduce((a, b) => a + b, 0) / ref.length : null
    level[id] = inEu || !refMedian ? 1 : q.median / refMedian
    // what does not arrive fresh is lost; the rest pays freight and duty on its value
    perKg[id] = q.route.mode === 'local' ? 0 : !q.route.reachable ? (q.route.freight + q.price) / 1000 : (q.route.freight + (q.route.tariff + q.route.loss) * q.price) / 1000
  }
  return { level, perKg, label }
}

/** The world's largest importers of a crop (5-year mean tonnes), largest first. */
function topImporters(crop: CropKey, n: number): string[] {
  return Object.entries(MARKETS.trade)
    .map(([iso3, t]) => [iso3, t[crop]?.[1] ?? 0] as const)
    .filter(([, imp]) => imp > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([iso3]) => iso3)
}

/**
 * Where one crop nets most: home, the big markets next door and the world's eight largest importers of it -
 * reachable ones only, best net per tonne first (home is always listed, even when it is not the best).
 */
export function shipOptions(o: { origin: [number, number]; home: string; crop: CropKey; sea: SeaMatrix | null; own?: number | null; rates?: Rates }): CropQuote[] {
  const b: Base = { origin: o.origin, home: o.home, sea: o.sea, rates: o.rates, own: parseOwnPrice(o.own) }
  const home = quoteAt(b, o.crop, o.home)
  const homeNet = home?.netPerT ?? 0
  const places = [...new Set([...bigMarkets(o.home, o.crop), ...topImporters(o.crop, 8)])].filter((c) => c !== o.home)
  const away = o.sea ? places.map((c) => quoteAt(b, o.crop, c)).filter((q): q is NonNullable<typeof q> => !!q && q.route.reachable) : []
  return [...(home ? [home] : []), ...away]
    .map((q) => ({ ...q, homeNetPerT: homeNet }))
    .sort((a, c) => c.netPerT - a.netPerT)
}

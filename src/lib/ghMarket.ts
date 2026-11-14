// What greenhouse crops sell for, what energy costs and what glasshouses really harvest - from open EU records
// baked by scripts/ghdata.mjs into src/data/greenhouse.json:
//  • crop prices: DG AGRI supply-chain prices 2015-2025, month by month, turned into farm-gate money with one factor
//    (the median farm-gate / packing-station ratio where a country reports both). Two markets: the Mediterranean
//    one (Spain & Italy) and the north-west European one (Dutch & Belgian tomatoes and strawberries; other crops at
//    Mediterranean prices × the northern tomato premium of the same month).
//  • energy: Eurostat business gas (band I3) and electricity (band IC) prices, excl. VAT, per country and year.
//  • harvests: Eurostat production and area "under glass or high accessible cover", per country, crop and year.

import data from '../data/greenhouse.json'

export type PriceCropId = 'tomato' | 'cherry' | 'cucumber' | 'pepper' | 'eggplant' | 'courgette' | 'lettuce' | 'strawberry'
export type MarketId = 'north' | 'south'

type MarketData = { label: string; crops: Record<string, { series: string[]; years: Record<string, (number | null)[]> }> }
type Data = {
  fetched: string
  sources: Record<'prices' | 'harvests' | 'gas' | 'power', { url: string; note: string }>
  farmgate: { north: number; south: number; pairs: { north: number; south: number } }
  markets: Record<MarketId, MarketData>
  harvests: Record<string, Record<string, [number, number, number][]>> // country → crop → [year, ha, kg/m²]
  gas: Record<string, Record<string, number>> // country → year → € per kWh
  power: Record<string, Record<string, number>>
}
export const GH_DATA = data as unknown as Data

/** The complete years every price series covers - the "typical" curve and the backtest use these. */
export const PRICE_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]
/** The recent five years: prices move, so the typical curve is today's, not 2015's. */
const TYPICAL_YEARS = [2020, 2021, 2022, 2023, 2024]

/** North of 45° sells into the north-west European market, the rest into the Mediterranean one; south of the
 * equator the seasons (and so the scarce months) flip. */
export function marketFor(lat: number): { market: MarketId; shift: number } {
  return { market: Math.abs(lat) >= 45 ? 'north' : 'south', shift: lat < 0 ? 6 : 0 }
}

const shifted = <T,>(xs: T[], shift: number) => (shift ? xs.map((_, i) => xs[(i + 12 - shift) % 12]) : xs)
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** One year's farm-gate prices, € per kg by calendar month (null: no market reported that month). */
export function yearPrices(crop: PriceCropId, lat: number, year: number): (number | null)[] | null {
  const { market, shift } = marketFor(lat)
  const ys = GH_DATA.markets[market].crops[crop]?.years[String(year)]
  return ys ? shifted(ys, shift) : null
}

const typicalCache = new Map<string, (number | null)[]>()
/** The typical price curve: mean of each calendar month over 2020-2024 (null where fewer than two years report). */
export function typicalPrices(crop: PriceCropId, lat: number): (number | null)[] {
  const { market, shift } = marketFor(lat)
  const key = `${market}|${crop}|${shift}`
  let out = typicalCache.get(key)
  if (!out) {
    const ys = TYPICAL_YEARS.map((y) => GH_DATA.markets[market].crops[crop]?.years[String(y)]).filter((x): x is (number | null)[] => !!x)
    out = shifted(
      Array.from({ length: 12 }, (_, m) => {
        const v = ys.map((y) => y[m]).filter((x): x is number => x !== null)
        return v.length >= 2 ? avg(v) : null
      }),
      shift,
    )
    typicalCache.set(key, out)
  }
  return out
}

/** Where the prices come from, in words, for the site at `lat`. */
export function marketLabel(lat: number): string {
  const { market, shift } = marketFor(lat)
  return `${GH_DATA.markets[market].label}${shift ? ', seasons shifted six months for the southern hemisphere' : ''}`
}

// ---------- the site's country ----------

const COUNTRIES: Record<string, string> = {
  austria: 'AT', belgium: 'BE', bulgaria: 'BG', croatia: 'HR', cyprus: 'CY', czechia: 'CZ', 'czech republic': 'CZ', denmark: 'DK',
  estonia: 'EE', finland: 'FI', france: 'FR', germany: 'DE', greece: 'EL', hungary: 'HU', ireland: 'IE', italy: 'IT', latvia: 'LV',
  lithuania: 'LT', luxembourg: 'LU', malta: 'MT', netherlands: 'NL', 'the netherlands': 'NL', poland: 'PL', portugal: 'PT', romania: 'RO',
  slovakia: 'SK', slovenia: 'SI', spain: 'ES', sweden: 'SE', norway: 'NO', iceland: 'IS', switzerland: 'CH', 'united kingdom': 'UK',
  ukraine: 'UA', moldova: 'MD', georgia: 'GE', serbia: 'RS', 'north macedonia': 'MK', albania: 'AL', montenegro: 'ME',
  'bosnia and herzegovina': 'BA', türkiye: 'TR', turkey: 'TR', kosovo: 'XK',
}
const COUNTRY_NAME: Record<string, string> = Object.fromEntries(Object.entries(COUNTRIES).map(([n, c]) => [c, n.replace(/\b\w/g, (x) => x.toUpperCase())]))
COUNTRY_NAME.NL = 'Netherlands'
COUNTRY_NAME.CZ = 'Czechia'
COUNTRY_NAME.TR = 'Türkiye'

/** Eurostat country code from a place label such as "Torgau, Saxony, Germany" (its last part), or null. */
export function countryOf(place: string | null | undefined): string | null {
  const last = place?.split(',').at(-1)?.trim().toLowerCase()
  return last ? (COUNTRIES[last] ?? null) : null
}
export const countryName = (code: string) => COUNTRY_NAME[code] ?? code

// ---------- energy ----------

export type EnergyPrices = { heat: number; power: number; year: number; country: string | null }

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}
/** The European median across countries for a year - the fallback outside the EU statistics. */
function euMedian(kind: 'gas' | 'power', year: number): number | null {
  const v = Object.values(GH_DATA[kind]).map((y) => y[String(year)]).filter((x): x is number => x > 0)
  return v.length >= 5 ? median(v) : null
}

/** Business gas and electricity prices (€ per kWh, excl. VAT) for a country and year, else the European median; Dutch
 *  boiler gas at the glasshouse tariff (growerGas). */
export function energyFor(country: string | null, year: number): EnergyPrices | null {
  const gas = (country && (growerGas(country, year) ?? GH_DATA.gas[country]?.[String(year)])) || null
  const power = (country && GH_DATA.power[country]?.[String(year)]) || null
  const heat = gas ?? euMedian('gas', year)
  const pw = power ?? euMedian('power', year)
  if (heat === null || pw === null) return null
  return { heat, power: pw, year, country: gas && power ? country : null }
}

/** The latest year with both prices for the country - else the latest European median. */
export function latestEnergy(country: string | null): EnergyPrices {
  const years = [2025, 2024, 2023]
  if (country) {
    for (const y of years) {
      const gas = growerGas(country, y) ?? GH_DATA.gas[country]?.[String(y)]
      const power = GH_DATA.power[country]?.[String(y)]
      if (gas && power) return { heat: gas, power, year: y, country }
    }
  }
  for (const y of years) {
    const e = energyFor(null, y)
    if (e) return e
  }
  return { heat: 0.05, power: 0.18, year: 2024, country: null }
}

/** Year → { heat, power } for the backtest (country if reported, else the European median). */
export function energyHistory(country: string | null): Map<number, { heat: number; power: number }> {
  const out = new Map<number, { heat: number; power: number }>()
  for (const y of PRICE_YEARS) {
    const e = energyFor(country, y)
    if (e) out.set(y, { heat: e.heat, power: e.power })
  }
  return out
}

// ---------- what Dutch growers pay for boiler gas, and what a combined heat and power engine trades at ----------

/** Natural gas before taxes and levies, € per kWh (gross calorific value), half-years S1/S2: Eurostat nrg_pc_203, band
 *  I3 (10 000-99 999 GJ), tax=X_TAX. Gas burnt in combined heat and power (an electrical efficiency
 *  of at least 30 %) was exempt from the Dutch energy tax until 2024, so the engine pays this price. */
const GAS_BEFORE_TAX: Record<string, Record<number, [number, number]>> = {
  NL: { 2015: [0.0273, 0.0254], 2016: [0.0226, 0.0225], 2017: [0.0211, 0.0214], 2018: [0.0219, 0.0235], 2019: [0.0223, 0.0215], 2020: [0.0191, 0.0194], 2021: [0.021, 0.036], 2022: [0.055, 0.0591], 2023: [0.0659, 0.0558], 2024: [0.0415, 0.0427], 2025: [0.045, 0.0386] },
  BE: { 2015: [0.0276, 0.0264], 2016: [0.0239, 0.0233], 2017: [0.0219, 0.0215], 2018: [0.0213, 0.0231], 2019: [0.0225, 0.0213], 2020: [0.0193, 0.0191], 2021: [0.0203, 0.0325], 2022: [0.0472, 0.0625], 2023: [0.0614, 0.0522], 2024: [0.0449, 0.0495], 2025: [0.0488, 0.0463] },
  DE: { 2015: [0.0355, 0.0337], 2016: [0.0299, 0.0291], 2017: [0.0277, 0.0266], 2018: [0.0277, 0.0275], 2019: [0.0278, 0.0253], 2020: [0.0245, 0.0244], 2021: [0.0238, 0.0297], 2022: [0.0445, 0.052], 2023: [0.0668, 0.0622], 2024: [0.0556, 0.058], 2025: [0.0563, 0.0552] },
}
/** Dutch energy tax plus the ODE surcharge on gas at the reduced rate for glasshouse horticulture, € per m³, in the band
 *  170 001-1 000 000 m³ a year - 0.6-3 ha of heated glass at 30 m³/m², where most of a holding's gas falls (an
 *  assumption: the first 170 000 m³ pay more, gas past a million m³ the normal rate). Belastingdienst rates as tabled by
 *  Aenergie (2015-2024; the ODE folded into the tax from 2023) and Engie (2025). */
const NL_GLASS_GAS_TAX: Record<number, number> = { 2015: 0.02418, 2016: 0.02549, 2017: 0.02596, 2018: 0.0284, 2019: 0.03079, 2020: 0.03242, 2021: 0.03361, 2022: 0.03403, 2023: 0.03629, 2024: 0.08444, 2025: 0.13576 }
/** kWh (gross calorific value) in a m³ of Dutch reference gas, 35.17 MJ */
const M3_GROSS_KWH = 35.17 / 3.6

/**
 * Boiler gas as a Dutch glasshouse pays it: the price before taxes plus the reduced glasshouse energy tax - not
 * Eurostat's band I3 price, which carries the general tax (2019: €0.025 against €0.034 a kWh). Null outside the
 * Netherlands or in years without both parts.
 */
export function growerGas(country: string | null, year: number): number | null {
  const b = country === 'NL' ? GAS_BEFORE_TAX.NL[year] : undefined
  const t = NL_GLASS_GAS_TAX[year]
  return b && t !== undefined ? (b[0] + b[1]) / 2 + t / M3_GROSS_KWH : null
}

/** Monthly day-ahead wholesale electricity, € per MWh, January-December: Ember, European wholesale electricity price data
 *  (ENTSO-E day-ahead, monthly means), CC-BY-4.0 - what a glasshouse engine sells its power for, in
 *  the three countries whose glasshouses run them. */
const WHOLESALE: Record<string, Record<number, number[]>> = {
  NL: {
    2015: [40.51, 46.37, 42.18, 41.4, 37.34, 38.73, 42.19, 38.87, 39.65, 41.45, 38.44, 33.71],
    2016: [31.56, 25.2, 26.14, 25.32, 27.2, 32.6, 33.07, 28.35, 32.87, 38.01, 42.85, 43.5],
    2017: [50.76, 43.06, 34.53, 35.35, 35.06, 33.3, 34.46, 33.06, 38.75, 39.88, 47.27, 46.47],
    2018: [38.8, 44.57, 51.82, 39.72, 47.08, 51.36, 53.3, 58.02, 63.32, 59.93, 62.29, 59.66],
    2019: [58.3, 46.85, 40.5, 40.84, 40.19, 36.23, 39.62, 37.41, 36.58, 37.96, 42.71, 37.4],
    2020: [37.07, 29.55, 24.75, 18.97, 17.67, 26.26, 29.35, 34.07, 42.6, 37.11, 41.05, 48.28],
    2021: [53.62, 49.23, 48.89, 53.87, 56.12, 76.51, 82.58, 86.66, 136.39, 163.81, 186.3, 237.8],
    2022: [189.24, 168.29, 261.03, 195.31, 181.4, 210.7, 306.86, 447.25, 340.89, 155.51, 179.48, 258.49],
    2023: [126.13, 134.91, 104.44, 98.71, 77.88, 92.04, 71.69, 91.42, 98.7, 90.19, 94.46, 73.04],
    2024: [78.43, 63.91, 63.38, 58.42, 65.7, 68.06, 65.04, 77.1, 77.62, 87.8, 113.47, 107.94],
  },
  BE: {
    2015: [42.33, 50.54, 47.05, 47.69, 37.58, 39.12, 42.58, 42.44, 52.49, 55.43, 43.11, 35.94],
    2016: [32.6, 25.4, 27.12, 25.43, 25.38, 30.7, 31.32, 28.91, 37.73, 57.19, 62.32, 54.92],
    2017: [72.66, 47.55, 34.47, 37.32, 37.2, 32.72, 33.55, 31.79, 37.2, 49.01, 66.63, 55.02],
    2018: [36.81, 47.39, 50.7, 37.74, 44.56, 49.93, 52.96, 60.74, 68.72, 76.05, 77.73, 59.66],
    2019: [60.48, 47.57, 37.61, 37.92, 38.0, 27.49, 37.76, 33.69, 33.58, 37.62, 44.41, 36.36],
    2020: [37.85, 28.36, 24.02, 14.68, 15.41, 25.59, 29.87, 35.55, 44.23, 39.38, 39.93, 47.4],
    2021: [57.44, 48.57, 46.63, 57.04, 55.61, 74.49, 77.37, 79.55, 136.15, 165.37, 202.17, 245.43],
    2022: [191.56, 162.64, 265.51, 186.72, 176.67, 219.29, 321.55, 448.12, 345.73, 157.51, 180.7, 268.88],
    2023: [130.87, 143.51, 109.48, 105.62, 80.11, 93.17, 75.29, 92.05, 94.35, 86.34, 91.53, 69.26],
    2024: [78.63, 61.53, 61.13, 48.04, 54.45, 60.92, 54.59, 65.53, 66.41, 78.13, 108.95, 105.1],
  },
  DE: {
    2015: [29.94, 36.69, 31.3, 29.78, 25.33, 30.11, 34.98, 31.61, 31.89, 39.37, 32.38, 27.79],
    2016: [29.03, 22.0, 24.3, 24.21, 22.55, 27.7, 27.18, 27.18, 30.51, 37.14, 38.21, 37.47],
    2017: [52.41, 39.68, 31.69, 28.72, 30.61, 30.0, 33.01, 30.86, 34.3, 28.29, 40.38, 35.71],
    2018: [29.5, 40.12, 37.36, 36.33, 37.18, 41.55, 45.14, 48.46, 47.76, 53.22, 56.86, 48.08],
    2019: [49.95, 43.01, 30.7, 37.54, 38.09, 32.87, 39.49, 36.65, 35.36, 37.22, 40.96, 31.93],
    2020: [34.61, 21.69, 22.47, 17.51, 17.75, 26.0, 30.37, 34.4, 43.65, 34.05, 38.22, 43.75],
    2021: [53.31, 48.98, 46.68, 54.73, 53.49, 73.87, 81.5, 82.18, 128.98, 142.22, 176.28, 225.08],
    2022: [167.81, 129.86, 252.07, 168.78, 177.04, 218.17, 317.03, 463.59, 352.81, 155.3, 173.2, 250.71],
    2023: [117.22, 127.81, 101.23, 102.14, 82.03, 93.9, 78.12, 94.35, 100.81, 87.1, 90.9, 69.08],
    2024: [76.23, 61.23, 63.18, 61.96, 67.53, 72.88, 68.4, 81.76, 78.55, 83.98, 111.61, 105.65],
  },
}

/** What a glasshouse CHP buys gas and sells power at: gas before taxes (€/kWh gross), power by calendar month (€/kWh). */
export type ChpPrices = { gas: number; power: number[]; year: number }

/** CHP prices for a country and year - else the latest year on record before it; null where no power prices are kept. */
export function chpFor(country: string | null, year: number): ChpPrices | null {
  const w = country ? WHOLESALE[country] : undefined
  const g = country ? GAS_BEFORE_TAX[country] : undefined
  if (!w || !g) return null
  for (let y = year; y >= year - 3; y--) {
    if (w[y] && g[y]) return { gas: (g[y][0] + g[y][1]) / 2, power: w[y].map((p) => p / 1000), year: y }
  }
  return null
}

// ---------- what glasshouses harvest and grow ----------

export type GlassCrop = 'tomato' | 'cucumber' | 'pepper' | 'lettuce' | 'strawberry'

/** Reported kg per m² a year under glass (Eurostat), per year. */
export function glassYields(country: string, crop: GlassCrop): { year: number; kgM2: number; ha: number }[] {
  return (GH_DATA.harvests[country]?.[crop] ?? []).map(([year, ha, kgM2]) => ({ year, ha, kgM2 }))
}

/** Area under glass by crop in the latest reported year - "what is grown under glass here". */
export function glassAreas(country: string | null): { year: number; crops: { crop: GlassCrop; ha: number }[] } | null {
  if (!country || !GH_DATA.harvests[country]) return null
  const byCrop = Object.entries(GH_DATA.harvests[country]) as [GlassCrop, [number, number, number][]][]
  const year = Math.max(...byCrop.flatMap(([, rows]) => rows.map((r) => r[0])))
  const crops = byCrop
    .map(([crop, rows]) => ({ crop, ha: rows.find((r) => r[0] === year)?.[1] ?? rows.at(-1)![1] }))
    .filter((c) => c.ha > 0)
    .sort((a, b) => b.ha - a.ha)
  return crops.length ? { year, crops } : null
}

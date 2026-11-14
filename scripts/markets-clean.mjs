// Currency artefacts in FAOSTAT producer prices. Where a country stopped publishing price levels, the bake chains them
// from FAOSTAT's producer price index - an estimate (flag E) that can lag a devaluation: Argentina publishes no level
// after 2014, and the chained soybean price "falls" from 277 to 97 €/t over 2015-2022 while the Rosario price rose
// fifteenfold in pesos; Nigeria's chained 2023-2024 prices halve with the naira.
//
// Official levels (USD or local currency published for the year - node_modules/.cache/markets/official.json, from
// scripts/markets_official.py) are kept. A chained year is compared with the world that year (the median across
// countries) relative to where the same crop sat in its official years - or, with none in the window, in its first
// year, the one closest to the level the chain starts from. A country-year whose chained crops sit, as a group, more
// than DRIFT away is dropped (normal year-to-year variation of a country's prices against the world: 95 % within
// 1.31x); a single chained crop-year more than OUTLIER away too.
//
//   imported by scripts/markets.mjs; `node scripts/markets-clean.mjs` patches src/data/markets.json in place
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { FAO_ITEM } from './markets-map.mjs'

export const DRIFT = 1.4
export const OUTLIER = 2
const median = (xs) => {
  const s = xs.filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b)
  if (!s.length) return NaN
  const m = (s.length - 1) / 2
  return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2
}

/**
 * Drops chained price-years that drifted off the world, in place.
 * @param prices iso3 → crop → series over `years` (€/t, nulls allowed)
 * @param official iso3 → crop → years with a published level
 */
export function cleanPrices(prices, years, official) {
  const dropped = []
  const crops = [...new Set(Object.values(prices).flatMap((p) => Object.keys(p)))]
  const bench = Object.fromEntries(crops.map((k) => [k, years.map((_, y) => median(Object.values(prices).map((p) => p[k]?.[y] ?? null)))]))
  for (const [iso3, p] of Object.entries(prices)) {
    const dev = {}
    const chained = {}
    for (const [k, s] of Object.entries(p)) {
      const own = new Set(official[iso3]?.[k] ?? [])
      const r = s.map((v, y) => (v !== null && bench[k][y] > 0 ? v / bench[k][y] : null))
      const anchorYears = years.map((yr, y) => (own.has(yr) ? y : -1)).filter((y) => y >= 0 && r[y] !== null)
      const first = r.findIndex((x) => x !== null)
      const anchor = anchorYears.length ? median(anchorYears.map((y) => r[y])) : r[first]
      dev[k] = r.map((x) => (x === null ? null : x / anchor))
      chained[k] = years.map((yr) => !own.has(yr))
    }
    years.forEach((year, y) => {
      const d = Object.keys(p).filter((k) => chained[k][y] && dev[k][y] !== null).map((k) => dev[k][y])
      const level = median(d)
      const whole = d.length >= 2 && (level > DRIFT || level < 1 / DRIFT)
      for (const [k, s] of Object.entries(p)) {
        const x = dev[k][y]
        if (s[y] === null || x === null || !chained[k][y]) continue
        if (whole || x > OUTLIER || x < 1 / OUTLIER) {
          dropped.push({ iso3, crop: k, year, value: s[y], why: whole ? `country ${level.toFixed(2)}x` : `crop ${x.toFixed(2)}x` })
          s[y] = null
        }
      }
    })
  }
  for (const [iso3, p] of Object.entries(prices)) {
    for (const [k, s] of Object.entries(p)) if (s.filter((v) => v !== null).length < 3) delete p[k]
    if (!Object.keys(p).length) delete prices[iso3]
  }
  return dropped
}

/** iso3 → crop → official years, from the M49 × FAOSTAT item table */
export function officialYears(countries, path = 'node_modules/.cache/markets/official.json') {
  if (!existsSync(path)) throw new Error(`${path} missing: python3 scripts/markets_official.py`)
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const out = {}
  for (const c of countries) {
    const m = raw[String(c.n3 ?? '').padStart(3, '0')]
    if (!m) continue
    out[c.iso3] = Object.fromEntries(Object.entries(FAO_ITEM).map(([k, item]) => [k, m[item] ?? []]))
  }
  return out
}

/** World median price per crop and each UN sub-region's usual ratio to it, from the cleaned prices. */
export function worldAndRegions(prices, countries) {
  const crops = [...new Set(Object.values(prices).flatMap((p) => Object.keys(p)))]
  const world = {}
  for (const k of crops) {
    const m = median(Object.values(prices).map((p) => (p[k] ? median(p[k]) : NaN)))
    if (m) world[k] = Math.round(m)
  }
  const subRatio = {}
  for (const sub of [...new Set(countries.map((c) => c.sub))]) {
    const ratios = countries.filter((c) => c.sub === sub && prices[c.iso3]).flatMap((c) => Object.entries(prices[c.iso3]).map(([k, s]) => median(s) / world[k]))
    subRatio[sub] = ratios.length >= 5 ? +median(ratios).toFixed(3) : 1
  }
  return { world, subRatio }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = 'src/data/markets.json'
  const m = JSON.parse(readFileSync(path, 'utf8'))
  // markets.json carries no M49 codes: take them from the Natural Earth table the bake used
  const adm = JSON.parse(readFileSync('node_modules/.cache/markets/adm0.geojson', 'utf8'))
  const n3 = Object.fromEntries(adm.features.map((f) => [f.properties.ISO_A3 !== '-99' ? f.properties.ISO_A3 : f.properties.ADM0_A3, f.properties.ISO_N3 !== '-99' ? f.properties.ISO_N3 : f.properties.ISO_N3_EH]))
  const dropped = cleanPrices(m.prices, m.years, officialYears(m.countries.map((c) => ({ ...c, n3: n3[c.iso3] }))))
  const { world, subRatio } = worldAndRegions(m.prices, m.countries)
  m.world = { ...m.world, ...world }
  m.subRatio = subRatio
  writeFileSync(path, JSON.stringify(m))
  const byCountry = {}
  for (const d of dropped) byCountry[d.iso3] = (byCountry[d.iso3] ?? 0) + 1
  console.log(`${dropped.length} chained price-years dropped as currency artefacts, in ${Object.keys(byCountry).length} countries`)
  console.log(Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k} ${v}`).join(', '))
  for (const iso of ['ARG', 'NGA', 'ETH', 'PAK', 'IND', 'KEN']) console.log(`  ${iso}: ${dropped.filter((d) => d.iso3 === iso && ['maize', 'soybean', 'wheat', 'rice'].includes(d.crop)).map((d) => `${d.crop} ${d.year} ${d.value} (${d.why})`).join('; ')}`)
}

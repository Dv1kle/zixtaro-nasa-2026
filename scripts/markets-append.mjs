// Append crops to src/data/markets.json without touching the crops already in it (all-crops plan).
// A full `node scripts/markets.mjs` re-run cleans prices across ALL crops of a country at once, so adding crops moved
// the cleaning of 101 existing price series and the sub-regional price ratios. The engine's existing economics were
// validated as they are; so the existing crops, the world prices of existing crops and the sub-regional ratios stay
// frozen at the base file, and only the new crops' series are taken from the fresh bake.
//
//   FAO_REBUILD=1 node scripts/markets.mjs            # fresh bake with the new crops in scripts/markets-map.mjs
//   node scripts/markets-append.mjs <base.json>       # base = the markets.json before (git show HEAD:src/data/markets.json)
import { readFileSync, writeFileSync } from 'node:fs'

const base = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const fresh = JSON.parse(readFileSync('src/data/markets.json', 'utf8'))
const known = new Set(Object.values(base.prices).flatMap((p) => Object.keys(p)).concat(Object.keys(base.world)))
const out = structuredClone(base)
let added = 0
for (const sec of ['prices', 'trade', 'yields']) {
  for (const [iso, byCrop] of Object.entries(fresh[sec] ?? {})) {
    for (const [crop, v] of Object.entries(byCrop)) {
      if (known.has(crop)) continue
      out[sec][iso] ??= {}
      out[sec][iso][crop] = v
      added++
    }
  }
}
for (const [crop, v] of Object.entries(fresh.world)) if (!known.has(crop)) out.world[crop] = v
for (const [crop, v] of Object.entries(fresh.shelf ?? {})) if (!(crop in (out.shelf ?? {}))) (out.shelf ??= {})[crop] = v
writeFileSync('src/data/markets.json', JSON.stringify(out))
console.log(`appended ${added} series for ${Object.keys(fresh.world).filter((c) => !known.has(c)).length} new crops; existing crops untouched`)

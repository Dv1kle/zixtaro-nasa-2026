// The scoreboard behind "checked against real harvests": runs the app's own crop water model at every demo
// site with reported yields (public/data/yields, from scripts/yields.py) and writes the results, so the page
// can show the whole check wherever the user's field is.
//
//   node scripts/validate.mjs

import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const cacheDir = new URL('node_modules/.cache/zixtaro-validate/', root)
await mkdir(cacheDir, { recursive: true })
const out = new URL('model.mjs', cacheDir)
await build({
  stdin: {
    contents: `
      export { parsePowerMonthly, analyzeClimate } from './src/lib/climate'
      export { cropRisk } from './src/lib/water'
      export { CROP_BY_ID } from './src/lib/crops'
      export { parseSoilGrids, averageProfiles } from './src/lib/soil'
      export { checkCrop } from './src/lib/validation'
    `,
    resolveDir: fileURLToPath(root),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: fileURLToPath(out),
  logLevel: 'warning',
  define: { 'import.meta.env.BASE_URL': '"/"' },
})
const m = await import(out.href)
const data = (p) => readFile(new URL(`public/data/${p}`, root), 'utf8').then(JSON.parse)

const index = await data('yields/index.json')
const seen = new Set()
const sites = []
for (const c of index.cells) {
  if (seen.has(c.cell)) continue // the demo farm's fields share Torgau's cell
  seen.add(c.cell)
  const y = await data(`yields/${c.id}.json`)
  const bundle = await data(`presets/${c.id}.json`)
  const climate = m.analyzeClimate(m.parsePowerMonthly(bundle.power, y.lat), y.lat, y.lon)
  const profiles = bundle.soil.map((r) => { try { return m.parseSoilGrids(r) } catch { return null } }).filter(Boolean)
  const soil = m.averageProfiles(profiles, bundle.samples?.length === profiles.length ? bundle.samples : profiles.map(() => ({ lat: y.lat, lon: y.lon })))
  const checks = []
  for (const [crop, s] of Object.entries(y.crops)) {
    const check = m.checkCrop(crop, s, m.cropRisk(m.CROP_BY_ID[crop], climate, soil), y.sources[s.src])
    if (!check) continue
    checks.push({ crop, n: check.rows.length, rho: Math.round(check.rho * 100) / 100, p: check.p, hits: check.hits, worst: check.worst, flagged: check.flagged, source: y.sources[s.src].name })
    console.log(`  ${c.id.padEnd(10)} ${crop.padEnd(10)} n=${check.rows.length} ρ=${check.rho.toFixed(2)} p=${check.p.toFixed(3)} hits=${check.hits}/5`)
  }
  sites.push({ id: c.id, label: c.label, soil: soil.texture, checks })
}
const all = sites.flatMap((s) => s.checks)
const rhos = all.map((c) => c.rho).sort((a, b) => a - b)
const summary = {
  sites,
  series: all.length,
  seasons: all.reduce((a, c) => a + c.n, 0),
  medianRho: rhos[Math.floor(rhos.length / 2)],
  significant: all.filter((c) => c.p < 0.05 && c.rho > 0).length,
  hits: all.reduce((a, c) => a + c.hits, 0),
  worst: all.length * 5,
  // picking 5 seasons at random would catch 5 × 5 / n of the 5 worst ones on average
  chance: Math.round(all.reduce((a, c) => a + 25 / c.n, 0) * 10) / 10,
  generatedAt: new Date().toISOString(),
}
await writeFile(new URL('public/data/yields/summary.json', root), JSON.stringify(summary))
console.log(`✓ ${summary.series} crop series, ${summary.seasons} seasons, median ρ ${summary.medianRho}, ${summary.significant} significant, ${summary.hits}/${summary.worst} worst harvests flagged (chance ${summary.chance})`)

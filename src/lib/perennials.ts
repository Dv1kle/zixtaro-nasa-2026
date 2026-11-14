// The long-term planting view. Tree and bush crops are planted once and bear for decades, so they are never ranked with
// the season's crops: for the nine plantation and orchard crops FAO's GAEZ v4 rates, its suitability index for the
// field's 5′ grid cell now (1981-2010) and in the 2050s (2041-2070, RCP 4.5 and 8.5), beside what the farmland around
// actually grows (CROPGRIDS 2020). Layers and the demo fields' values: scripts/perennials.ts; the grid of tree crops:
// scripts/perennials-grid.py.
import data from '../data/perennials.json'

export type GaezLayer = { id: number; crop: string; when: 'now' | '2050s'; rcp: '4.5' | '8.5' | null; land: 'cropland' | 'all'; name: string }
export const GAEZ_LAYERS = data.layers as GaezLayer[]
export const GAEZ_SOURCE = { source: data.source, service: data.service, portal: data.portal, built: data.built }
/**
 * How far GAEZ agrees with the farms, per crop: the share of the world's harvested area (CROPGRIDS 2020) on cropland it
 * rates suitable at all (index > 0) and at least moderately (> 25), 1981-2010 - scripts/perennials-check.py.
 */
export const GAEZ_AGREEMENT = ((data as { agreement?: Record<string, { suitable: number; moderate: number }> }).agreement ?? {}) as Partial<Record<PerennialId, { suitable: number; moderate: number }>>

/** The nine GAEZ v4 rates, in the order of public/data/crops/trees.json; then the large ones it does not. */
export const RATED = ['oilpalm', 'rubber', 'cocoa', 'olive', 'coconut', 'coffee', 'banana', 'tea', 'citrus'] as const
export const UNRATED = ['grape', 'mango', 'apple', 'plum', 'almond'] as const
export type PerennialId = (typeof RATED)[number]
export type TreeId = PerennialId | (typeof UNRATED)[number]
export const TREE_IDS: TreeId[] = [...RATED, ...UNRATED]

export const TREE_NAMES: Record<TreeId, string> = {
  oilpalm: 'Oil palm', rubber: 'Rubber', cocoa: 'Cocoa', olive: 'Olive', coconut: 'Coconut', coffee: 'Coffee',
  banana: 'Banana & plantain', tea: 'Tea', citrus: 'Citrus', grape: 'Grape', mango: 'Mango', apple: 'Apple', plum: 'Plum',
  almond: 'Almond',
}

/**
 * GAEZ v4's suitability classes of the index (0-100), as its class layers (siHr_*) code them: checked against the
 * index at 14 points (src/lib/perennials.test.ts).
 */
export const GAEZ_CLASSES = [
  { n: 1, above: 85, label: 'Very high' },
  { n: 2, above: 70, label: 'High' },
  { n: 3, above: 55, label: 'Good' },
  { n: 4, above: 40, label: 'Medium' },
  { n: 5, above: 25, label: 'Moderate' },
  { n: 6, above: 10, label: 'Marginal' },
  { n: 7, above: 0, label: 'Very marginal' },
  { n: 8, above: -Infinity, label: 'Not suitable' },
] as const
export type GaezClass = (typeof GAEZ_CLASSES)[number]
export const siClass = (si: number): GaezClass => (si > 0 ? GAEZ_CLASSES.find((c) => si > c.above)! : GAEZ_CLASSES[7])

export type LongTermRow = {
  id: PerennialId
  /** suitability index 0-100 - 1981-2010, and 2041-2070 under RCP 4.5 / 8.5; NaN where GAEZ has no data (water, ice) */
  now: number
  rcp45: number
  rcp85: number
  /** what the index describes: the current cropland of the 5′ cell, or all its land where it has no cropland */
  land: 'cropland' | 'all'
  /** where the cell's cropland rates 0: the index on all its land (slopes, forest, pasture), else null */
  otherLand: number | null
  /** the index on all the cell's land: steadier than the cropland one where a cell holds little cropland */
  allLand: { now: number; rcp45: number; rcp85: number }
  /** share of the harvested area around (the 0.5° CROPGRIDS cell) that grows it, 0-1; null while unknown */
  around: number | null
}

/** GAEZ's codes below the index: -1 on the cropland layers = no cropland in the cell; -9 = no data (water, ice). */
const NO_CROPLAND = -1

/**
 * GAEZ's values at a point (in GAEZ_LAYERS order: index 0-10 000, or its codes) folded into one row per crop, the best
 * rated first. The cell's cropland is rated where it has some, all its land where it has none.
 */
export function longTerm(values: number[], layers: GaezLayer[], around: Partial<Record<TreeId, number>> | null): LongTermRow[] {
  const raw = (crop: string, when: GaezLayer['when'], rcp: GaezLayer['rcp'], land: GaezLayer['land']) => {
    const i = layers.findIndex((l) => l.crop === crop && l.when === when && l.rcp === rcp && l.land === land)
    return i < 0 || !Number.isFinite(values[i]) ? NaN : values[i]
  }
  const si = (v: number) => (v >= 0 ? v / 100 : NaN)
  const rows = RATED.map((id): LongTermRow => {
    const land = raw(id, 'now', null, 'cropland') === NO_CROPLAND ? 'all' : 'cropland'
    const at = (when: GaezLayer['when'], rcp: GaezLayer['rcp']) => si(raw(id, when, rcp, land))
    const now = at('now', null)
    const all = (when: GaezLayer['when'], rcp: GaezLayer['rcp']) => si(raw(id, when, rcp, 'all'))
    return {
      id, now, rcp45: at('2050s', '4.5'), rcp85: at('2050s', '8.5'), land,
      otherLand: land === 'cropland' && now === 0 && all('now', null) > 0 ? all('now', null) : null,
      allLand: { now: all('now', null), rcp45: all('2050s', '4.5'), rcp85: all('2050s', '8.5') },
      around: around ? (around[id] ?? 0) : null,
    }
  })
  const n = (x: number) => (Number.isFinite(x) ? x : -1)
  const key = (r: LongTermRow) => [n(r.now), Math.max(n(r.rcp45), n(r.rcp85)), r.otherLand ?? 0, r.around ?? 0]
  return rows.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    for (let i = 0; i < ka.length; i++) if (kb[i] !== ka[i]) return kb[i] - ka[i]
    return 0
  })
}

// ---------- what the farmland around grows: CROPGRIDS tree crops on the 0.5° grid ----------

export type TreeGrid = Map<number, Partial<Record<TreeId, number>>>

/** public/data/crops/trees.bin: u16 row, u16 col, u8 n, n × (u8 crop, u8 share %) - rows from 90° N, cols from 180° W. */
export function parseTrees(buf: ArrayBuffer, ids: string[]): TreeGrid {
  const v = new DataView(buf)
  const out: TreeGrid = new Map()
  for (let o = 0; o + 5 <= v.byteLength; ) {
    const row = v.getUint16(o, true)
    const col = v.getUint16(o + 2, true)
    const n = v.getUint8(o + 4)
    o += 5
    const cell: Partial<Record<TreeId, number>> = {}
    for (let k = 0; k < n; k++, o += 2) cell[ids[v.getUint8(o)] as TreeId] = v.getUint8(o + 1) / 100
    out.set(row * 720 + col, cell)
  }
  return out
}

export const treesAt = (grid: TreeGrid, lat: number, lon: number) =>
  grid.get(Math.floor((90 - lat) / 0.5) * 720 + Math.floor((((lon + 180) % 360) + 360) % 360 / 0.5)) ?? {}

let trees: Promise<{ grid: TreeGrid; source: string; url: string } | null> | null = null
/** The tree-crop grid, fetched once (≈ 100 kB gzipped); a failed download is tried again on the next call. */
export async function treesAround(lat: number, lon: number): Promise<{ here: Partial<Record<TreeId, number>>; source: string; url: string } | null> {
  const base = `${import.meta.env.BASE_URL}data/crops/`
  trees ??= Promise.all([
    fetch(`${base}trees.json`).then((r) => (r.ok ? (r.json() as Promise<{ crops: string[]; source: string; url: string }>) : null)),
    fetch(`${base}trees.bin`).then((r) => (r.ok ? r.arrayBuffer() : null)),
  ])
    .then(([index, buf]) => (index && buf ? { grid: parseTrees(buf, index.crops), source: index.source, url: index.url } : null))
    .catch(() => null)
  const t = await trees
  if (!t) trees = null
  return t ? { here: treesAt(t.grid, lat, lon), source: t.source, url: t.url } : null
}

/** GAEZ's values at a point, live from FAO's GAEZ v4 service: one identify call returns every layer. */
export async function gaezAt(lat: number, lon: number, signal?: AbortSignal): Promise<number[]> {
  const u = new URL(`${data.service}/identify`)
  u.search = new URLSearchParams({
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    mosaicRule: JSON.stringify({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: GAEZ_LAYERS.map((l) => l.id) }),
    returnCatalogItems: 'true',
    returnGeometry: 'false',
    f: 'json',
  }).toString()
  const r = await fetch(u, { signal })
  if (!r.ok) throw new Error(`GAEZ ${r.status}`)
  const j = (await r.json()) as { properties?: { Values?: string[] }; catalogItems?: { features: { attributes: { objectid: number; name?: string } }[] } }
  const items = j.catalogItems?.features.map((f) => f.attributes) ?? []
  const by = new Map(items.map((a, i) => [a.objectid, { name: a.name, value: j.properties?.Values?.[i] }]))
  return GAEZ_LAYERS.map((l) => {
    const got = by.get(l.id)
    if (!got) throw new Error(`GAEZ answered without layer ${l.name}`)
    // the ids are baked: if FAO republishes the service under new ids, refuse rather than show another layer's values
    if (got.name !== undefined && got.name !== l.name) throw new Error(`GAEZ layer ${l.id} is now ${got.name}, not ${l.name} - rebuild the layer list (scripts/perennials.ts)`)
    return Number(got.value) // "NoData" (water, ice) -> NaN
  })
}

/** The demo fields' values, baked (scripts/perennials.ts), so they work offline. */
export const presetGaez = (presetId: string | null | undefined): number[] | null =>
  (presetId && (data.presets as Record<string, number[]>)[presetId]) || null

// Soil physics from ISRIC SoilGrids 2.0 (250 m): USDA texture class and plant-available water
// via the Saxton & Rawls (2006) pedotransfer functions. The soil "tank" size is what turns a
// climate signal into crop water stress.

export type SoilLayer = {
  top: number // cm
  bottom: number // cm
  sand: number // %
  silt: number // %
  clay: number // %
  soc: number // soil organic carbon, g/kg
  ph: number // pH in water
  bd: number // bulk density, g/cm³
  cfvo: number // coarse fragments, vol %
  fc: number // field capacity, m³/m³
  wp: number // wilting point, m³/m³
  paw: number // plant-available water, m³/m³ (net of coarse fragments)
}

export type SoilVariability = {
  samples: { lat: number; lon: number; paw100: number; texture: string; sand: number }[]
  paw100: [number, number]
  sand: [number, number]
  textures: string[]
}

export type SoilProfile = {
  layers: SoilLayer[]
  top: { sand: number; silt: number; clay: number; soc: number; ph: number; bd: number } // 0-30 cm
  texture: string // USDA class, 0-30 cm
  subTexture: string // USDA class, 30-100 cm
  paw100: number // plant-available water in the top metre, mm
  source: 'soilgrids' | 'manual' | 'provisional'
  /** only for areas sampled at several points */
  variability?: SoilVariability
  /** topsoil properties that come from the farmer's own lab test instead of the map */
  lab?: LabKey[]
}

/**
 * A farmer's soil test for the plough layer (0-30 cm). Each value replaces only its own property; everything the
 * lab did not measure stays from SoilGrids, and water holding is recomputed from the merged texture and carbon.
 */
export type LabSoil = { ph?: number; sand?: number; clay?: number; soc?: number /* g/kg */; bd?: number /* g/cm³ */ }
export type LabKey = keyof LabSoil
export const LAB_KEYS: LabKey[] = ['ph', 'sand', 'clay', 'soc', 'bd']
export const LAB_RANGE: Record<LabKey, [number, number]> = { ph: [3, 10], sand: [0, 100], clay: [0, 100], soc: [0, 200], bd: [0.8, 2] }
export const LAB_DEPTH_CM = 30

/** Keep only plausible lab values (and sand + clay ≤ 100). */
export function cleanLab(lab: LabSoil): LabSoil {
  const out: LabSoil = {}
  for (const k of LAB_KEYS) {
    const v = lab[k]
    if (v === undefined || !Number.isFinite(v)) continue
    const [lo, hi] = LAB_RANGE[k]
    if (v >= lo && v <= hi) out[k] = v
  }
  if (out.sand !== undefined && out.clay !== undefined && out.sand + out.clay > 100) {
    delete out.sand
    delete out.clay
  }
  return out
}

/** Merge a lab test into a mapped profile, layer by layer within the plough layer. */
export function fuseLab(profile: SoilProfile, labIn: LabSoil): SoilProfile {
  const lab = cleanLab(labIn)
  const keys = LAB_KEYS.filter((k) => lab[k] !== undefined)
  if (!keys.length) return profile
  const layers = profile.layers.map((l) => {
    if (l.top >= LAB_DEPTH_CM) return l
    let sand = lab.sand ?? l.sand
    let clay = lab.clay ?? l.clay
    // one fraction measured: the other keeps its map value unless the two no longer fit in 100 %
    if (sand + clay > 100) {
      if (lab.sand !== undefined) clay = 100 - sand
      else sand = 100 - clay
    }
    const silt = Math.max(0, 100 - sand - clay)
    return makeLayer(l.top, l.bottom, sand, silt, clay, lab.soc ?? l.soc, lab.ph ?? l.ph, lab.bd ?? l.bd, l.cfvo)
  })
  const out = finish(layers, profile.source)
  if (profile.variability) out.variability = profile.variability
  out.lab = keys
  return out
}

export const TEXTURE_CLASSES = [
  'sand', 'loamy sand', 'sandy loam', 'loam', 'silt loam', 'silt',
  'sandy clay loam', 'clay loam', 'silty clay loam', 'sandy clay', 'silty clay', 'clay',
] as const
export type TextureClass = (typeof TEXTURE_CLASSES)[number]

/** USDA soil texture class from sand/silt/clay percentages (normalised to 100). */
export function usdaTexture(sandIn: number, siltIn: number, clayIn: number): TextureClass {
  const total = sandIn + siltIn + clayIn
  const sand = (sandIn / total) * 100
  const silt = (siltIn / total) * 100
  const clay = (clayIn / total) * 100
  if (silt + 1.5 * clay < 15) return 'sand'
  if (silt + 2 * clay < 30) return 'loamy sand'
  if ((clay >= 7 && clay < 20 && sand > 52) || (clay < 7 && silt < 50)) return 'sandy loam'
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return 'loam'
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return 'silt loam'
  if (silt >= 80 && clay < 12) return 'silt'
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return 'sandy clay loam'
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return 'clay loam'
  if (clay >= 27 && clay < 40 && sand <= 20) return 'silty clay loam'
  if (clay >= 35 && sand > 45) return 'sandy clay'
  if (clay >= 40 && silt >= 40) return 'silty clay'
  return 'clay'
}

/**
 * Saxton & Rawls (2006) moisture retention.
 * @param sandPct sand %, @param clayPct clay %, @param omPct organic matter % (w)
 * @returns volumetric water content at wilting point (1500 kPa) and field capacity (33 kPa)
 */
export function saxtonRawls(sandPct: number, clayPct: number, omPct: number): { wp: number; fc: number; paw: number } {
  const S = sandPct / 100
  const C = clayPct / 100
  const OM = Math.max(0, Math.min(8, omPct)) // equations are calibrated for OM ≤ 8 %
  const t1500 = -0.024 * S + 0.487 * C + 0.006 * OM + 0.005 * S * OM - 0.013 * C * OM + 0.068 * S * C + 0.031
  const wp = t1500 + (0.14 * t1500 - 0.02)
  const t33 = -0.251 * S + 0.195 * C + 0.011 * OM + 0.006 * S * OM - 0.027 * C * OM + 0.452 * S * C + 0.299
  const fc = t33 + (1.283 * t33 * t33 - 0.374 * t33 - 0.015)
  return { wp, fc, paw: Math.max(0.01, fc - wp) }
}

/** Organic matter % from SOC in g/kg (van Bemmelen factor 1.724). */
export const omFromSoc = (socGkg: number) => (socGkg / 10) * 1.724

function makeLayer(top: number, bottom: number, sand: number, silt: number, clay: number, soc: number, ph: number, bd: number, cfvo: number): SoilLayer {
  const total = sand + silt + clay
  const s = (sand / total) * 100
  const si = (silt / total) * 100
  const c = (clay / total) * 100
  const { wp, fc, paw } = saxtonRawls(s, c, omFromSoc(soc))
  return { top, bottom, sand: s, silt: si, clay: c, soc, ph, bd, cfvo, wp, fc, paw: paw * (1 - Math.min(90, cfvo) / 100) }
}

function weighted(layers: SoilLayer[], from: number, to: number, key: keyof SoilLayer): number {
  let sum = 0
  let w = 0
  for (const l of layers) {
    const overlap = Math.max(0, Math.min(l.bottom, to) - Math.max(l.top, from))
    if (overlap > 0) {
      sum += (l[key] as number) * overlap
      w += overlap
    }
  }
  return w ? sum / w : NaN
}

/** Plant-available water (mm) between the surface and a rooting depth (m). */
export function rootZoneWater(profile: SoilProfile, depthM: number): number {
  const depthCm = depthM * 100
  let mm = 0
  for (const l of profile.layers) {
    const overlap = Math.max(0, Math.min(l.bottom, depthCm) - l.top)
    mm += l.paw * overlap * 10 // m³/m³ × cm × 10 = mm
  }
  // Below the deepest mapped layer, extend with the deepest layer's properties.
  const deepest = profile.layers[profile.layers.length - 1]
  if (deepest && depthCm > deepest.bottom) mm += deepest.paw * (depthCm - deepest.bottom) * 10
  return mm
}

function finish(layers: SoilLayer[], source: SoilProfile['source']): SoilProfile {
  const top = {
    sand: weighted(layers, 0, 30, 'sand'),
    silt: weighted(layers, 0, 30, 'silt'),
    clay: weighted(layers, 0, 30, 'clay'),
    soc: weighted(layers, 0, 30, 'soc'),
    ph: weighted(layers, 0, 30, 'ph'),
    bd: weighted(layers, 0, 30, 'bd'),
  }
  const subSand = weighted(layers, 30, 100, 'sand')
  const subSilt = weighted(layers, 30, 100, 'silt')
  const subClay = weighted(layers, 30, 100, 'clay')
  const profile: SoilProfile = {
    layers,
    top,
    texture: usdaTexture(top.sand, top.silt, top.clay),
    subTexture: Number.isFinite(subSand) ? usdaTexture(subSand, subSilt, subClay) : usdaTexture(top.sand, top.silt, top.clay),
    paw100: 0,
    source,
  }
  profile.paw100 = rootZoneWater(profile, 1)
  return profile
}

// ---------- SoilGrids parsing ----------

type SgDepth = { range: { top_depth: number; bottom_depth: number }; label: string; values: { mean: number | null } }
type SgLayer = { name: string; unit_measure: { d_factor: number }; depths: SgDepth[] }
export type SoilGridsResponse = { properties: { layers: SgLayer[] } }

export class NoSoilDataError extends Error {
  constructor() {
    super('SoilGrids has no soil data here - likely a city, water body or rock. Pick your texture manually.')
  }
}

export function parseSoilGrids(json: SoilGridsResponse): SoilProfile {
  const byDepth = new Map<string, { top: number; bottom: number; v: Record<string, number | null> }>()
  for (const layer of json.properties.layers) {
    for (const d of layer.depths) {
      const row = byDepth.get(d.label) ?? { top: d.range.top_depth, bottom: d.range.bottom_depth, v: {} }
      row.v[layer.name] = d.values.mean == null ? null : d.values.mean / layer.unit_measure.d_factor
      byDepth.set(d.label, row)
    }
  }
  const layers: SoilLayer[] = []
  for (const row of [...byDepth.values()].sort((a, b) => a.top - b.top)) {
    const { sand, silt, clay, soc, phh2o, bdod, cfvo } = row.v
    if (sand == null || silt == null || clay == null || sand + silt + clay <= 0) continue
    layers.push(makeLayer(row.top, row.bottom, sand, silt, clay, soc ?? 8, phh2o ?? 6.5, bdod ?? 1.45, cfvo ?? 0))
  }
  if (layers.length === 0) throw new NoSoilDataError()
  return finish(layers, 'soilgrids')
}

/** Average several sampled profiles depth by depth (areas), keeping the spread for display. */
export function averageProfiles(profiles: SoilProfile[], points: { lat: number; lon: number }[]): SoilProfile {
  if (profiles.length === 1) return profiles[0]
  const depthCount = Math.min(...profiles.map((p) => p.layers.length))
  const layers: SoilLayer[] = []
  for (let i = 0; i < depthCount; i++) {
    const ls = profiles.map((p) => p.layers[i])
    const m = (k: 'sand' | 'silt' | 'clay' | 'soc' | 'ph' | 'bd' | 'cfvo') => ls.reduce((s, l) => s + l[k], 0) / ls.length
    layers.push(makeLayer(ls[0].top, ls[0].bottom, m('sand'), m('silt'), m('clay'), m('soc'), m('ph'), m('bd'), m('cfvo')))
  }
  const out = finish(layers, 'soilgrids')
  const paws = profiles.map((p) => p.paw100)
  const sands = profiles.map((p) => p.top.sand)
  out.variability = {
    samples: profiles.map((p, i) => ({ ...points[i], paw100: p.paw100, texture: p.texture, sand: p.top.sand })),
    paw100: [Math.min(...paws), Math.max(...paws)],
    sand: [Math.min(...sands), Math.max(...sands)],
    textures: [...new Set(profiles.map((p) => p.texture))],
  }
  return out
}

// ---------- Manual fallback ----------

const REPRESENTATIVE: Record<TextureClass, [number, number, number]> = {
  sand: [90, 5, 5],
  'loamy sand': [80, 14, 6],
  'sandy loam': [65, 25, 10],
  loam: [40, 40, 20],
  'silt loam': [20, 65, 15],
  silt: [7, 88, 5],
  'sandy clay loam': [60, 13, 27],
  'clay loam': [32, 34, 34],
  'silty clay loam': [10, 56, 34],
  'sandy clay': [50, 8, 42],
  'silty clay': [7, 46, 47],
  clay: [22, 20, 58],
}

/** A plausible profile for a farmer-chosen texture class (used when SoilGrids is unavailable). */
export function manualProfile(klass: TextureClass, ph = 6.5, source: SoilProfile['source'] = 'manual'): SoilProfile {
  const [s, si, c] = REPRESENTATIVE[klass]
  const depths: [number, number, number][] = [[0, 5, 14], [5, 15, 12], [15, 30, 10], [30, 60, 5], [60, 100, 3], [100, 200, 2]]
  const layers = depths.map(([top, bottom, soc]) => makeLayer(top, bottom, s, si, c, soc, ph, 1.45, 2))
  return finish(layers, source)
}

// ---------- USDA texture triangle geometry (sand %, clay %) ----------

export const TEXTURE_POLYGONS: Record<TextureClass, [number, number][]> = {
  sand: [[100, 0], [85, 0], [90, 10]],
  'loamy sand': [[85, 0], [70, 0], [85, 15], [90, 10]],
  'sandy loam': [[70, 0], [50, 0], [43, 7], [52, 7], [52, 20], [80, 20], [85, 15]],
  loam: [[43, 7], [52, 7], [52, 20], [45, 27], [23, 27]],
  'silt loam': [[50, 0], [20, 0], [8, 12], [0, 12], [0, 27], [23, 27], [43, 7]],
  silt: [[20, 0], [0, 0], [0, 12], [8, 12]],
  'sandy clay loam': [[52, 20], [80, 20], [65, 35], [45, 35], [45, 27]],
  'clay loam': [[45, 27], [45, 40], [20, 40], [20, 27]],
  'silty clay loam': [[20, 27], [20, 40], [0, 40], [0, 27]],
  'sandy clay': [[45, 35], [65, 35], [45, 55]],
  'silty clay': [[20, 40], [0, 40], [0, 60]],
  clay: [[20, 40], [45, 40], [45, 55], [0, 100], [0, 60]],
}

/** Triangle coordinates (side = 1): bottom-left = 100 % sand, bottom-right = 100 % silt, apex = 100 % clay. */
export function trianglePoint(sand: number, clay: number): [number, number] {
  const silt = 100 - sand - clay
  const x = (silt + clay / 2) / 100
  const y = ((clay / 100) * Math.sqrt(3)) / 2
  return [x, y]
}

export function tankLabel(paw100: number): string {
  if (paw100 < 90) return 'a small tank'
  if (paw100 < 150) return 'a medium tank'
  return 'a large tank'
}

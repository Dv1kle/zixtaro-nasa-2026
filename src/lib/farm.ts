// "My farm" without accounts: several fields and greenhouses saved in this browser (guest mode -
// judges and farmers see it working in seconds, no sign-up). Each site keeps a snapshot of its
// latest plan, so the farm overview reads the same way for a 15 ha field and a 0.5 ha glasshouse.

import { fetchPower, fetchSoil } from './api'
import { analyzeClimate, parsePowerMonthly, type ClimateAnalysis } from './climate'
import type { CropId } from './crops'
import type { Field } from './geo'
import { DEFAULT_GH, greenhouseModel, planMargin, type GhCropId, type GreenhouseSpec } from './greenhouse'
import { PRESETS } from './presets'
import { buildStrategies, rankNext, type FieldContext, type Priorities } from './rotation'
import { averageProfiles, manualProfile, parseSoilGrids, type SoilProfile } from './soil'
import { allCropRisks, riskAfter } from './water'
import { readKey } from './storage'
import { addedSince, SCHEMA } from './version'
import { winterDrainage } from './nitrate'
import { rFactor } from './erosion'

export type Snapshot = {
  next: CropId; score: number; plan: CropId[]; texture: string; paw100: number; signal: string; at: string
  deficit?: number // irrigation the next crop needs in a typical recent season, mm
  /** the names of the forms the field grows (spring wheat on the prairies) - the ids alone read as the base forms */
  nextName?: string
  planNames?: string[]
}

/** A greenhouse's headline numbers, whole house, per year (recent decade). */
export type GhSnapshot = {
  crop: GhCropId
  heated: boolean
  plant: number | null // best calendar: months 1..12, null = no run pays for its energy
  firstHarvest: number | null
  clear: number | null
  heatMWh: number // all year, as if every month were heated - the climate signal
  lightMWh: number // lamps in the planned months
  heatChange: number // relative change of all-year heat demand vs 1981-2010
  margin: number // € per year after energy, best calendar
  shadeMonths: number
  tankM3: number
  rainCover: number
  overflowM3: number
  signal: string
  at: string
}

export type SiteKind = 'field' | 'greenhouse'

export type FarmField = {
  id: string
  name: string
  /** absent in farms saved before greenhouses existed = field */
  kind?: SiteKind
  gh?: GreenhouseSpec
  ghSnapshot?: GhSnapshot
  field: Field
  history: (CropId | null)[]
  priorities: Priorities
  exclude: CropId[]
  irrigated: boolean
  snapshot?: Snapshot
}

export type Farm = { name: string; guest: boolean; fields: FarmField[] }

const KEY = 'zixtaro:farm:v1'
export const uid = () => Math.random().toString(36).slice(2, 9)

export const kindOf = (ff: FarmField): SiteKind => ff.kind ?? 'field'

const DEMO_IDS: [string, string][] = [['torgau', 'North sands'], ['torgau-pivot', 'Pivot circle'], ['torgau-east', 'Dike field'], ['torgau-glass', 'Glasshouse']]

export function demoFarm(): Farm {
  return {
    name: 'Guest farm near Torgau',
    guest: true,
    fields: DEMO_IDS.map(([id, name]) => {
      const p = PRESETS.find((x) => x.id === id)!
      const base = { id: uid(), name, field: p.field, history: p.history, priorities: p.priorities, exclude: p.exclude, irrigated: p.irrigated }
      // strawberry: what the model picks for this house (heated tomato here pays for no run at the default prices)
      return id === 'torgau-glass' ? { ...base, kind: 'greenhouse' as const, gh: { ...DEFAULT_GH, floorM2: 6000, crop: 'strawberry' as const } } : base
    }),
  }
}

export function greenhouseSnapshot(climate: ClimateAnalysis, spec: GreenhouseSpec): GhSnapshot {
  const r = greenhouseModel(climate, spec)
  return {
    crop: spec.crop,
    heated: spec.heated,
    plant: r.plan.plant,
    firstHarvest: r.plan.firstHarvest,
    clear: r.plan.clear,
    heatMWh: (r.totals.heatKwh * spec.floorM2) / 1000,
    lightMWh: (r.plan.lightKwh * spec.floorM2) / 1000,
    heatChange: r.baseline.heatKwh > 0 ? r.totals.heatKwh / r.baseline.heatKwh - 1 : 0,
    margin: planMargin(r) * spec.floorM2,
    shadeMonths: r.totals.shadeMonths,
    tankM3: r.water.tankM3,
    rainCover: r.water.cover,
    overflowM3: r.water.overflowM3,
    signal: climate.signal.label,
    at: new Date().toISOString(),
  }
}

/** The demo farm as saved before greenhouses existed - untouched copies get the glasshouse added. */
export function upgradeDemo(f: Farm): Farm {
  const names = f.fields.map((x) => x.name).join('|')
  if (!f.guest || f.name !== 'Guest farm near Torgau' || names !== 'North sands|Pivot circle|Dike field') return f
  return { ...f, fields: [...f.fields, demoFarm().fields[3]] }
}

/** Farms saved before crops were added (schema 1, 2): their crop lists meant the new crops switched off. */
export function migrateFarm(f: Farm & { schema?: number }): Farm {
  if ((f.schema ?? 1) >= SCHEMA) return f
  const added = addedSince(f.schema ?? 1)
  return { ...f, fields: f.fields.map((x) => ({ ...x, exclude: [...new Set([...x.exclude, ...added])] })) }
}

export function loadFarm(): Farm {
  try {
    const raw = readKey(KEY)
    if (raw) return migrateFarm(upgradeDemo(JSON.parse(raw) as Farm))
  } catch {
    // private mode or blocked storage - fall back to the demo farm
  }
  return demoFarm()
}

export function saveFarm(f: Farm) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...f, schema: SCHEMA }))
  } catch {
    // storage is a convenience
  }
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null)

/** Greenhouse pipeline: only NASA POWER is needed. */
export async function summarizeGreenhouse(ff: FarmField): Promise<GhSnapshot | null> {
  const power = await fetchPower(ff.field).catch(() => null)
  if (!power) return null
  const climate = analyzeClimate(parsePowerMonthly(power.data, ff.field.lat), ff.field.lat, ff.field.lon)
  return greenhouseSnapshot(climate, ff.gh ?? DEFAULT_GH)
}

/** Run the full pipeline for a saved field (bundled data for the demo farm makes this instant). */
export async function summarize(ff: FarmField): Promise<Snapshot | null> {
  const power = await fetchPower(ff.field).catch(() => null)
  if (!power) return null
  const climate = analyzeClimate(parsePowerMonthly(power.data, ff.field.lat), ff.field.lat, ff.field.lon)
  const soilRes = await withTimeout(fetchSoil(ff.field, undefined), 4000)
  let soil: SoilProfile = manualProfile('loam', 6.5, 'provisional')
  if (soilRes) {
    const profiles: SoilProfile[] = []
    const pts: { lat: number; lon: number }[] = []
    soilRes.data.responses.forEach((r, i) => {
      if (!r) return
      try {
        profiles.push(parseSoilGrids(r))
        pts.push(soilRes.data.points[i])
      } catch {
        // skip roads, roofs, ponds
      }
    })
    if (profiles.length) soil = averageProfiles(profiles, pts)
  }
  const ctx: FieldContext = {
    risks: allCropRisks(climate, soil),
    soil,
    stressYear: null,
    irrigated: ff.irrigated,
    drying: climate.signal.drying,
    slopePct: null,
    winterDrain: winterDrainage(climate, soil),
    erosivity: rFactor(climate.monthly.recent),
    recentLabel: `${climate.recent.from}-${climate.recent.to}`,
    baselineLabel: `${climate.baseline.from}-${climate.baseline.to}`,
  }
  const ex = new Set(ff.exclude)
  const ranking = rankNext(ff.history, ctx, ff.priorities, ex)
  if (!ranking.length) return null
  const best = buildStrategies(ff.history, ctx, ff.priorities, ex)[0]
  const plan = best?.seq.map((e) => e.crop.id) ?? [ranking[0].crop.id]
  return {
    next: ranking[0].crop.id, nextName: ranking[0].crop.name, planNames: best?.seq.map((e) => e.crop.name) ?? [ranking[0].crop.name], score: ranking[0].score, plan, texture: soil.texture, paw100: soil.paw100, signal: climate.signal.label,
    deficit: riskAfter(ctx.risks[ranking[0].crop.id], ranking[0].afterFallow).recent.deficit, at: new Date().toISOString(),
  }
}

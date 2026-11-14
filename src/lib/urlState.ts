import { addedSince, SCHEMA } from './version'
import { COUNTRY, type CropKey } from './markets'
import { parseOwnPrice, type MarketMode } from './marketProfit'
// Shareable scenarios: the whole input state lives in the URL hash.

import { isCropId, type CropId } from './crops'
import type { SiteKind } from './farm'
import { DEFAULT_GH, isCover, isGhCropId, type GhCropId, type GhPriorities, type GreenhouseSpec, type Prices } from './greenhouse'
import { decodeRing, encodeRing, makeArea, type Field } from './geo'
import { SSPS, type WhatIf } from './scenario'
import type { Priorities } from './rotation'
import { cleanLab, LAB_KEYS, TEXTURE_CLASSES, type LabKey, type LabSoil, type TextureClass } from './soil'

export type Scenario = {
  field: Field
  history: (CropId | null)[]
  priorities: Priorities
  exclude: CropId[]
  irrigated: boolean // unlimited irrigation
  /** limited irrigation water per season, mm (0 = rainfed; ignored when `irrigated`) */
  budget: number
  replay: number | null
  texture: TextureClass | null
  /** the farmer's lab test for the topsoil (merged with SoilGrids) */
  lab: LabSoil
  site: SiteKind
  gh: GreenhouseSpec
  /** greenhouse: priorities, crops left out, crop prices (level vs the EU record, and the grower's own) */
  ghPriorities?: GhPriorities
  ghExclude?: GhCropId[]
  ghLevel?: number
  ghOwn?: Prices['own']
  warming: WhatIf // what-if applied to the recent decade (0 = as observed)
  /** count CO₂ effects on the crops in the 2050s scenarios */
  co2: boolean
  /** where the harvest is sold (auto when absent) */
  market?: MarketMode
  /** the grower's own prices, € per tonne */
  marketOwn?: Partial<Record<CropKey, number>>
}

/** m=auto|home|region|<ISO3>; anything else reads as auto (so an old or mistyped link still opens). */
export function parseMarketParam(s: string | null): MarketMode {
  if (s === 'home' || s === 'region') return { kind: s }
  if (s && COUNTRY[s]) return { kind: 'to', iso3: s }
  return { kind: 'auto' }
}
export const encodeMarketParam = (m: MarketMode): string | null => (m.kind === 'auto' ? null : m.kind === 'to' ? m.iso3 : m.kind)

const isCropKey = (x: string): x is CropKey => isCropId(x) || isGhCropId(x)
/** mp=wheat~400_tomato~2.5 (€ per t); junk pairs are dropped. */
export function decodeOwnPrices(s: string): Partial<Record<CropKey, number>> {
  const out: Partial<Record<CropKey, number>> = {}
  for (const pair of s.split('_')) {
    const [id, v] = pair.split('~')
    const price = parseOwnPrice(v)
    if (id && isCropKey(id) && price !== null) out[id] = price
  }
  return out
}
export function encodeOwnPrices(own: Partial<Record<CropKey, number>>): string | null {
  const pairs = Object.entries(own).filter(([, v]) => parseOwnPrice(v) !== null)
  return pairs.length ? pairs.map(([id, v]) => `${id}~${Math.round(v! * 100) / 100}`).join('_') : null
}

export function readScenario(): Partial<Scenario> {
  const q = new URLSearchParams(window.location.hash.slice(1))
  const out: Partial<Scenario> = {}
  const label = q.get('n') ?? undefined
  const a = q.get('a')
  if (a) {
    const ring = decodeRing(a)
    if (ring.length >= 3 && ring.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90)) out.field = makeArea(ring, label)
  } else {
    const f = q.get('f')?.split(',').map(Number)
    if (f && f.length === 2 && f.every(Number.isFinite) && Math.abs(f[0]) <= 90 && Math.abs(f[1]) <= 180) {
      out.field = { kind: 'point', lat: f[0], lon: f[1], label }
    }
  }
  const h = q.get('h')
  if (h) out.history = h.split('.').slice(-5).map((x) => (isCropId(x) ? x : null))
  const p = q.get('p')?.split('.').map(Number)
  if (p && p.length === 3 && p.every((x) => Number.isFinite(x) && x >= 0 && x <= 100)) {
    out.priorities = { soil: p[0], water: p[1], profit: p[2] }
  }
  const x = q.get('x')
  if (x !== null) out.exclude = x.split('.').filter(isCropId)
  // older links listed what was off among the crops that existed then: keep the crops added since off
  if (out.exclude && Number(q.get('v') ?? 1) < SCHEMA) out.exclude = [...new Set([...out.exclude, ...addedSince(Number(q.get('v') ?? 1))])]
  if (q.has('i')) {
    // i=1: unlimited irrigation (as in older links), i=0: rainfed, i=120: a 120 mm budget per season
    const i = Number(q.get('i'))
    out.irrigated = i === 1
    out.budget = Number.isFinite(i) && i >= 10 && i <= 1000 ? Math.round(i) : 0
  }
  const r = Number(q.get('r'))
  if (q.has('r')) out.replay = Number.isInteger(r) && r > 1900 ? r : null
  const t = q.get('t')
  if (t && (TEXTURE_CLASSES as readonly string[]).includes(t)) out.texture = t as TextureClass
  const l = q.get('l')
  if (l) out.lab = decodeLab(l)
  if (q.get('k') === 'g') out.site = 'greenhouse'
  const g = q.get('g')?.split('.')
  // cover.floor.heated.lit.screen.crop[.co2[.chp]] - links from before CO₂ dosing have six parts, '-' keeps CO₂ unset
  if (g && g.length >= 6 && g.length <= 8 && isCover(g[0]) && isGhCropId(g[5])) {
    out.gh = { cover: g[0], floorM2: Math.min(2_000_000, Math.max(50, Number(g[1]) || DEFAULT_GH.floorM2)), heated: g[2] === '1', lit: g[3] === '1', screen: g[4] === '1', crop: g[5] }
    if (g[6] === '0' || g[6] === '1') out.gh.co2 = g[6] === '1'
    if (g[7] === '1') out.gh.chp = true
  }
  const gp = q.get('gp')?.split('.').map(Number)
  if (gp && gp.length === 3 && gp.every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) out.ghPriorities = { profit: gp[0], climate: gp[1], steady: gp[2] }
  const gx = q.get('gx')
  if (gx !== null) out.ghExclude = gx.split('.').filter(isGhCropId)
  const gl = Number(q.get('gl'))
  if (q.has('gl') && Number.isFinite(gl) && gl >= 0.2 && gl <= 5) out.ghLevel = gl
  const go = q.get('go')
  if (go) {
    const own: NonNullable<Prices['own']> = {}
    // pairs are joined with "_" (old links used ".", which also split decimal prices): read "crop~price" wherever it is
    for (const [, id, v] of go.matchAll(/([a-z]+)~(\d+(?:\.\d+)?)/g)) {
      const price = Number(v)
      if (isGhCropId(id) && Number.isFinite(price) && price > 0 && price < 1000) own[id] = price
    }
    if (Object.keys(own).length) out.ghOwn = own
  }
  if (q.get('c') === '0') out.co2 = false
  if (q.has('m')) out.market = parseMarketParam(q.get('m'))
  const mp = q.get('mp')
  if (mp) out.marketOwn = decodeOwnPrices(mp)
  const w = q.get('w')
  if (w === '1' || w === '2' || w === '3') out.warming = Number(w) as WhatIf
  else if ((SSPS as readonly string[]).includes(w ?? '')) out.warming = w as WhatIf
  return out
}

export function scenarioHash(s: Scenario): string {
  const q = new URLSearchParams()
  if (s.field.kind === 'area') q.set('a', encodeRing(s.field.ring))
  else q.set('f', `${s.field.lat.toFixed(5)},${s.field.lon.toFixed(5)}`)
  if (s.field.label) q.set('n', s.field.label)
  q.set('v', String(SCHEMA))
  q.set('h', s.history.map((c) => c ?? '_').join('.'))
  q.set('p', `${s.priorities.soil}.${s.priorities.water}.${s.priorities.profit}`)
  q.set('x', s.exclude.join('.'))
  q.set('i', s.irrigated ? '1' : String(s.budget > 0 ? Math.round(s.budget) : 0))
  if (s.replay) q.set('r', String(s.replay))
  if (s.texture) q.set('t', s.texture)
  const lab = encodeLab(s.lab)
  if (lab) q.set('l', lab)
  if (s.site === 'greenhouse') {
    const g = s.gh
    q.set('k', 'g')
    q.set('g', [g.cover, Math.round(g.floorM2), +g.heated, +g.lit, +g.screen, g.crop, ...(g.chp ? [g.co2 === undefined ? '-' : +g.co2, 1] : g.co2 === undefined ? [] : [+g.co2])].join('.'))
    if (s.ghPriorities) q.set('gp', `${s.ghPriorities.profit}.${s.ghPriorities.climate}.${s.ghPriorities.steady}`)
    if (s.ghExclude?.length) q.set('gx', s.ghExclude.join('.'))
    if (s.ghLevel && s.ghLevel !== 1) q.set('gl', String(Math.round(s.ghLevel * 100) / 100))
    const own = Object.entries(s.ghOwn ?? {}).filter(([, v]) => v && v > 0)
    if (own.length) q.set('go', own.map(([id, v]) => `${id}~${Math.round(v! * 100) / 100}`).join('_'))
  }
  if (s.warming) q.set('w', String(s.warming))
  if (!s.co2) q.set('c', '0')
  const m = s.market ? encodeMarketParam(s.market) : null
  if (m) q.set('m', m)
  const mp = s.marketOwn ? encodeOwnPrices(s.marketOwn) : null
  if (mp) q.set('mp', mp)
  return `#${q.toString()}`
}

export function writeScenario(s: Scenario) {
  const next = scenarioHash(s)
  // keep the history entry's state: it marks pages (the Method page) that "Back" should close
  if (next !== window.location.hash) history.replaceState(history.state, '', next)
}

const LAB_CODE: Record<LabKey, string> = { ph: 'p', sand: 's', clay: 'c', soc: 'o', bd: 'b' }

/** Lab values as "p5.4_s45_o14" (pH, sand %, clay %, organic C g/kg, bulk density). */
export function encodeLab(lab: LabSoil): string {
  return LAB_KEYS.filter((k) => lab[k] !== undefined).map((k) => `${LAB_CODE[k]}${+lab[k]!.toFixed(2)}`).join('_')
}

export function decodeLab(s: string): LabSoil {
  const out: LabSoil = {}
  for (const part of s.split('_')) {
    const k = LAB_KEYS.find((x) => LAB_CODE[x] === part[0])
    const v = Number(part.slice(1))
    if (k && part.length > 1 && Number.isFinite(v)) out[k] = v
  }
  return cleanLab(out)
}

// src/lib/data/types.ts
// The field dossier's vocabulary: what a metric is, where it comes from, and one value of it for one field.

export type Evidence = 'observed' | 'modelled' | 'derived' | 'proxy' | 'input' | 'not-measurable'

export const GROUPS = ['soil', 'air', 'light', 'plant', 'water', 'terrain', 'windows', 'climate', 'economy', 'ecosystem'] as const
export type Group = (typeof GROUPS)[number]

export const SOURCE_IDS = [
  'power', 'om-forecast', 'om-archive', 'om-seasonal', 'om-flood', 'om-air', 'soilgrids', 'isda', 'modis', 'hls',
  'landsat', 's1', 'dem', 'grace', 'oni', 'hwsd', 'access', 'faostat', 'worldbank', 'literature', 'model', 'farmer',
] as const
export type SourceId = (typeof SOURCE_IDS)[number]

export type Source = {
  id: SourceId
  name: string
  provider: string
  mission?: string
  resolution: string
  coverage: string
  period: string
  license: string
  url: string
  /** live: fetched for the field on screen · prebake: a bundled file · reference: papers or the app's own model */
  access: 'live' | 'prebake' | 'reference'
}

export type Metric = {
  id: string
  group: Group
  name: string
  unit: string
  evidence: Evidence
  sources: SourceId[]
  method: string
  citation?: string
  caveat?: string
  digits?: number
}

/** O observed or modelled by a source · D derived · P honest proxy · I user or sensor input · X not measurable. */
export type AskedTag = 'O' | 'D' | 'P' | 'I' | 'X'
export type Asked = { n: number; name: string; tags: AskedTag[]; metrics: string[]; note: string }

export type Point = { t: string; v: number | null }

export type Value = {
  id: string
  v: number | null
  lo?: number
  hi?: number
  text?: string
  series?: Point[]
  asOf?: string
  source: SourceId
  from: 'live' | 'cache' | 'bundled'
  note?: string
}

export type SourceStatus = 'loading' | 'ok' | 'out-of-coverage' | 'rate-limited' | 'failed'
export type SourceState = { status: SourceStatus; message?: string }

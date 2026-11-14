import { CROPS, type CropId } from './crops'
// explicit .ts extension: scripts/prebake.mjs imports this file directly in Node
import { makeArea, type Field } from './geo.ts'
import type { Priorities } from './rotation'
import { EXTRA_CONTRACT, EXTRA_IDS, EXTRA_OPT_IN } from './cropsExtra'

export type Preset = {
  id: string
  /** demo-farm fields: bundled for offline use but not shown as chips */
  hidden?: boolean
  /** reuse another preset's pre-baked data (same NASA POWER cell) instead of baking its own */
  bundle?: string
  name: string
  region: string
  flag: string
  field: Field
  history: (CropId | null)[] // oldest → newest
  priorities: Priorities
  /** crops without a local market or unsuited to the farm type - switched off by default */
  exclude: CropId[]
  irrigated: boolean
  story: string
}

/**
 * Off unless the farmer opts in: forage leys need livestock, a green fallow earns nothing, a bare fallow pays only
 * through the next crop (on where it is the local practice), and potatoes and sugar beet are contract crops (a
 * processor, storage and special machinery).
 */
export const DEFAULT_EXCLUDE: CropId[] = ['clover', 'cover', 'fallow', 'potato', 'sugarbeet', 'cotton', 'sweetpotato', ...EXTRA_CONTRACT]

/** Contract crops need a processor, storage or a gin: on by default only where CROPGRIDS shows the region grows them. */
export const CONTRACT_CROPS: CropId[] = ['potato', 'sugarbeet', 'cotton', 'sweetpotato', ...EXTRA_CONTRACT]

/** The crops a freshly picked field starts without: forage and fallow, contract crops nobody grows around it, and the
 * opt-in crops (forage for a herd, vegetables) wherever they grow. */
export function defaultExcludeFor(here: { crops: { id: string; share: number }[] } | null, around?: Record<string, number> | null): CropId[] {
  const grown = new Set((here?.crops ?? []).filter((c) => c.share >= 0.02).map((c) => c.id))
  const off: CropId[] = ['clover', 'cover', 'fallow', ...CONTRACT_CROPS.filter((id) => !grown.has(id) || EXTRA_OPT_IN.includes(id as never))]
  // Where the page is held to one country (Lithuania, App.tsx) a field also starts without every crop CROPGRIDS
  // records nowhere within about 250 km: the engine ranks by climate, soil and price, and on its own it put chickpea
  // in three of four plans for a Lithuanian field - a crop no farm there sows, sells or has the seed for.
  if (around) for (const c of CROPS) if ((around[c.id] ?? 0) < GROWN_AROUND && !off.includes(c.id)) off.push(c.id)
  return off
}
/** the least share of the harvested area around a field at which a crop counts as grown there (0.01 %) */
export const GROWN_AROUND = 0.0001

/** The world crops added later, switched off on the demo farms: CROPGRIDS shows none of them grown in their cells. */
const WORLD: CropId[] = ['rice', 'cassava', 'sweetpotato', 'groundnut', 'cowpea', 'drybean', 'cotton', 'pearlmillet', ...EXTRA_IDS]

const point = (lat: number, lon: number): Field => ({ kind: 'point', lat, lon })

/**
 * What farms grow in and around Lithuania: every crop of the engine that CROPGRIDS 2020 records within about 250 km
 * of the four Lithuanian demo fields (the rule defaultExcludeFor applies to any field there). Forage, leys and fallow
 * are off as everywhere; potato and sugar beet are on - the country grows both.
 */
const LT_GROWN: CropId[] = ['wheat', 'barley', 'rye', 'triticale', 'oats', 'maize', 'rapeseed', 'pea', 'faba', 'lupin', 'buckwheat', 'potato', 'sugarbeet']
const LT_EXCLUDE: CropId[] = CROPS.map((c) => c.id).filter((id) => !LT_GROWN.includes(id))
/** the default every new field has: see the note in the first demo field */
const BALANCE: Priorities = { soil: 60, water: 15, profit: 45 }

/** A centre-pivot circle as an outlined field. */
function circle(lat: number, lon: number, r: number, n = 28): Field {
  const k = Math.cos((lat * Math.PI) / 180)
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  return makeArea(Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return [round(lon + (r * Math.sin(a)) / (111320 * k)), round(lat + (r * Math.cos(a)) / 110574)] as [number, number]
  }))
}

// Every field was checked against satellite imagery (it sits on farmland) and against
// SoilGrids (it returns a soil profile). Their NASA/ISRIC data is pre-baked for offline demos.
export const PRESETS: Preset[] = [
  {
    // The page opens here: the hackathon it was built for is in Vilnius, and a field the jury can drive to says more
    // than one in Saxony.
    id: 'joniskis',
    name: 'Joniškis',
    region: 'Šiauliai County, Lithuania',
    flag: '🇱🇹',
    // traced from imagery: a 42 ha field 4 km north-west of the town, on the Žiemgala plain
    field: makeArea([
      [23.54571, 56.26926], [23.54979, 56.27197], [23.5543, 56.27479], [23.56013, 56.27552], [23.56078, 56.27281],
      [23.55974, 56.2718], [23.55647, 56.26992], [23.55395, 56.26834], [23.55082, 56.26762],
    ]),
    // like every demo field's: a rotation typical of its region (the plain's grain farms: winter wheat, rapeseed,
    // barley), not this parcel's own record - open crop declarations in Lithuania are not published by year
    history: ['rapeseed', 'wheat', 'wheat', 'barley', 'wheat'],
    priorities: BALANCE,
    exclude: LT_EXCLUDE,
    irrigated: false,
    story: 'The Žiemgala plain, the country’s best soils: cereal after cereal, under summers that have turned drier.',
  },
  // Three more of Lithuania's farming regions, each a point on farmland checked on the national orthophoto, each with
  // a rotation typical of its region (not the parcel's own record).
  {
    id: 'vilkaviskis',
    name: 'Vilkaviškis',
    region: 'Marijampolė County, Lithuania',
    flag: '🇱🇹',
    field: point(54.7, 23.0),
    history: ['wheat', 'sugarbeet', 'wheat', 'rapeseed', 'wheat'],
    priorities: BALANCE,
    exclude: LT_EXCLUDE,
    irrigated: false,
    story: 'Suvalkija: deep loams, wheat with sugar beet and rapeseed between - a rotation with its breaks already in.',
  },
  {
    id: 'telsiai',
    name: 'Telšiai',
    region: 'Telšiai County, Lithuania',
    flag: '🇱🇹',
    field: point(55.93, 22.33),
    history: ['barley', 'oats', 'triticale', 'barley', 'wheat'],
    priorities: BALANCE,
    exclude: LT_EXCLUDE,
    irrigated: false,
    story: 'The Žemaitija upland: small fields among pasture, spring cereals one after another.',
  },
  {
    id: 'salcininkai',
    name: 'Šalčininkai',
    region: 'Vilnius County, Lithuania',
    flag: '🇱🇹',
    field: point(54.42, 25.33),
    history: ['rye', 'oats', 'buckwheat', 'rye', 'oats'],
    priorities: BALANCE,
    exclude: LT_EXCLUDE,
    irrigated: false,
    story: 'Light sandy land south-east of Vilnius: rye, oats and buckwheat, the crops that put up with it.',
  },
  {
    id: 'torgau',
    hidden: true, // the page is held to Lithuania: bundled, not offered as a chip
    name: 'Torgau',
    region: 'Saxony, Germany',
    flag: '🇩🇪',
    // traced from imagery: the 15 ha field beside the centre pivot, on the Elbe
    field: makeArea([
      [13.04639, 51.52322], [13.04978, 51.52208], [13.05332, 51.52087], [13.05279, 51.52004], [13.05021, 51.52004],
      [13.04721, 51.51991], [13.0442, 51.52001], [13.04388, 51.5206], [13.04506, 51.52204], [13.04592, 51.52298],
    ]),
    history: ['rapeseed', 'wheat', 'maize', 'wheat', 'rye'],
    // the default for every new field. Drought risk (the water axis) gets a low default weight: on the
    // 169 development cells each step up moved the ranking further from what farms grow (water 0 / 15 / 30 / 45 / 75:
    // mean rank 3.41 / 3.56 / 3.89 / 4.21 / 4.71) - drought already acts through the expected harvest and margin. A
    // risk-averse grower raises it (the water fader, "Drought-proof").
    priorities: { soil: 60, water: 15, profit: 45 },
    exclude: ['clover', 'cover', 'fallow', 'chickpea', ...WORLD],
    irrigated: false,
    story: 'Sandy soil beside a centre-pivot circle; the 2018-2022 droughts hit hard.',
  },
  {
    id: 'poltava',
    hidden: true, // the page is held to Lithuania: bundled, not offered as a chip
    name: 'Poltava',
    region: 'Poltava Oblast, Ukraine',
    flag: '🇺🇦',
    field: point(49.72, 34.33),
    history: ['sunflower', 'wheat', 'barley', 'sunflower', 'wheat'],
    priorities: { soil: 55, water: 60, profit: 60 },
    exclude: ['clover', 'cover', 'fallow', 'lupin', 'potato', ...WORLD],
    irrigated: false,
    story: 'Black-earth chernozem, but sunflower every third year wears it out.',
  },
  {
    id: 'iowa',
    hidden: true, // the page is held to Lithuania: bundled, not offered as a chip
    name: 'Story County',
    region: 'Iowa, USA',
    flag: '🇺🇸',
    field: point(42.095, -93.555),
    history: ['maize', 'soybean', 'maize', 'soybean', 'maize'],
    priorities: { soil: 55, water: 40, profit: 70 },
    exclude: ['clover', 'cover', 'fallow', 'lupin', 'potato', 'sugarbeet', 'rye', 'faba', 'lentil', 'chickpea', 'buckwheat', 'millet', 'linseed', 'triticale', ...WORLD],
    irrigated: false,
    story: 'Corn-belt classic: a two-crop rotation on deep, fertile loam.',
  },
  {
    id: 'kansas',
    hidden: true, // the page is held to Lithuania: bundled, not offered as a chip
    name: 'Finney County',
    region: 'Kansas, USA',
    flag: '🇺🇸',
    field: point(37.95, -100.95),
    history: ['sorghum', 'fallow', 'wheat', 'sorghum', 'wheat'],
    priorities: { soil: 50, water: 90, profit: 50 },
    exclude: ['clover', 'lupin', 'potato', 'sugarbeet', 'pea', 'faba', 'lentil', 'linseed', 'buckwheat', ...WORLD],
    irrigated: false, // dryland wheat-sorghum-fallow: the fallow is how these farms get by without irrigation
    story: 'Dryland wheat-sorghum-fallow above the shrinking Ogallala aquifer.',
  },
  {
    id: 'pergamino',
    hidden: true, // the page is held to Lithuania: bundled, not offered as a chip
    name: 'Pergamino',
    region: 'Buenos Aires, Argentina',
    flag: '🇦🇷',
    field: point(-33.955, -60.634),
    history: ['soybean', 'maize', 'wheat', 'soybean', 'soybean'],
    priorities: { soil: 65, water: 55, profit: 55 },
    exclude: ['clover', 'cover', 'fallow', 'lupin', 'potato', 'sugarbeet', 'rye', 'faba', 'lentil', 'buckwheat', 'millet', 'linseed', 'triticale', ...WORLD],
    irrigated: false,
    story: 'Pampas no-till, drifting towards soybean monoculture.',
  },
  {
    id: 'torgau-pivot',
    hidden: true,
    name: 'Pivot circle',
    region: 'Torgau, Saxony',
    flag: '🇩🇪',
    field: circle(51.5182, 13.039, 250),
    history: ['potato', 'wheat', 'sugarbeet', 'wheat', 'maize'],
    priorities: { soil: 50, water: 80, profit: 60 },
    exclude: ['clover', 'cover', 'fallow', 'chickpea', ...WORLD],
    irrigated: true,
    story: 'Irrigated high-value crops under the centre pivot.',
  },
  {
    id: 'torgau-east',
    hidden: true,
    name: 'Dike field',
    region: 'Torgau, Saxony',
    flag: '🇩🇪',
    field: makeArea([[13.0545, 51.52124], [13.06019, 51.52157], [13.06073, 51.51991], [13.06062, 51.51577], [13.05493, 51.51577], [13.05365, 51.51857], [13.05418, 51.52004]]),
    history: ['wheat', 'barley', 'rapeseed', 'wheat', 'barley'],
    priorities: { soil: 65, water: 60, profit: 50 },
    exclude: ['clover', 'cover', 'fallow', 'chickpea', ...WORLD],
    irrigated: false,
    story: 'Cereal-heavy field between the road and the Elbe dike.',
  },
  {
    id: 'torgau-glass',
    hidden: true,
    bundle: 'torgau', // 2 km from the North sands field, inside the same POWER cell
    name: 'Glasshouse',
    region: 'Torgau, Saxony',
    flag: '🇩🇪',
    field: point(51.5301, 13.0228),
    history: [null, null, null, null, null],
    priorities: { soil: 50, water: 50, profit: 50 },
    exclude: DEFAULT_EXCLUDE,
    irrigated: true,
    story: 'Heated glasshouse for tomatoes on the edge of town.',
  },
]

export const DEFAULT_PRESET = PRESETS[0]

export function presetFor(field: Field): Preset | undefined {
  return PRESETS.find(
    (p) => p.field.kind === field.kind && Math.abs(p.field.lat - field.lat) < 1e-5 && Math.abs(p.field.lon - field.lon) < 1e-5,
  )
}

/** A field nobody has described yet: five unknown seasons, there to be filled in (the engine reads them as no history). */
export const noHistory = (): (CropId | null)[] => [null, null, null, null, null]

/**
 * The crop history a page opens with: the link's own; else the demo field's, when the link points at a demo field
 * (or at no field: the default demo); else five unknown seasons. Earlier, a field from a link without a
 * history took the Torgau demo's rotation - experiment H found the rotation rules scoring a Colombian field on Saxon
 * history.
 */
export function initialHistory(fromUrl: { field?: Field; history?: (CropId | null)[] }): (CropId | null)[] {
  if (fromUrl.history) return fromUrl.history
  if (!fromUrl.field) return DEFAULT_PRESET.history
  return presetFor(fromUrl.field)?.history ?? noHistory()
}

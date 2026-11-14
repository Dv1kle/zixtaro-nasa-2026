/**
 * Field-level crop maps around a field, as the field experiments read them (H3-H8) and the page's practice layer does
 * (fieldPractice.ts): the USDA NASS Cropland Data Layer (USA) and AAFC's Annual Crop Inventory (Canada) as 30 m rasters
 * on a 6 km window, sampled every 4th pixel each way (2 500 points); the parcels declared under the CAP in France (RPG,
 * IGN Géoplateforme) and Denmark (Marker, Landbrugsstyrelsen) on a 2 km window, a 25 x 25 grid of points. Each source
 * class maps to an engine crop or to none. Kept here so the page and the
 * experiments read the same tables.
 */
import type { CropId } from './crops'
import dkCodes from '../data/dk-codes.json'

export type MapSource = 'cdl' | 'aci' | 'rpg' | 'dk'
/** the countries whose field-level crop maps the page reads */
export const MAP_SOURCE: Partial<Record<string, MapSource>> = { USA: 'cdl', CAN: 'aci', FRA: 'rpg', DNK: 'dk' }
/** each map as the page names it */
export const MAP_NAME: Record<MapSource, string> = { cdl: 'USDA Cropland Data Layer', aci: 'AAFC Annual Crop Inventory', rpg: 'French parcel register, RPG', dk: 'Danish field register, Marker' }

export const RASTER_HALF_M = 3000 // 6 km windows
export const RASTER_PX = 200
export const STEP = 4 // every 4th pixel each way: 2 500 sample points per raster window
export const RPG_HALF_DEG = 0.009 // ~2 km windows
export const RPG_GRID = 25

/** a raster window's bounding box, lon/lat, exactly as the image services are asked for it */
export function rasterBbox(lat: number, lon: number): [number, number, number, number] {
  const dLat = RASTER_HALF_M / 111_320
  const dLon = dLat / Math.cos((lat * Math.PI) / 180)
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => +v.toFixed(6)) as [number, number, number, number]
}
/** an RPG window's bounding box, lon/lat */
export function rpgBbox(lat: number, lon: number): [number, number, number, number] {
  const dLon = RPG_HALF_DEG / Math.cos((lat * Math.PI) / 180)
  return [lon - dLon, lat - RPG_HALF_DEG, lon + dLon, lat + RPG_HALF_DEG].map((v) => +v.toFixed(6)) as [number, number, number, number]
}
/** the sample points of a raster window: indices into its 200 x 200 grid, row by row (the rotation sampler's order) */
export function rasterPoints(w = RASTER_PX, h = RASTER_PX): number[] {
  const out: number[] = []
  for (let r = STEP / 2; r < h; r += STEP) for (let c = STEP / 2; c < w; c += STEP) out.push(r * w + c)
  return out
}
/** the sample points of an RPG window, row by row from the south-west (the rotation sampler's order) */
export function rpgPoints(lat: number, lon: number): { lat: number; lon: number }[] {
  const dLon = RPG_HALF_DEG / Math.cos((lat * Math.PI) / 180)
  const out: { lat: number; lon: number }[] = []
  for (let i = 0; i < RPG_GRID; i++) {
    for (let k = 0; k < RPG_GRID; k++) out.push({ lat: lat - RPG_HALF_DEG + ((i + 0.5) / RPG_GRID) * 2 * RPG_HALF_DEG, lon: lon - dLon + ((k + 0.5) / RPG_GRID) * 2 * dLon })
  }
  return out
}

// ---------- USA: CDL ----------

/** CDL class -> engine crops (double crops in growing order); absent = not a crop the engine knows; NONCROP = not cropland. */
const NONCROP = new Set([63, 64, 65, 81, 82, 83, 87, 88, 92, 111, 112, 121, 122, 123, 124, 131, 141, 142, 143, 152, 190, 195])
export const CDL: Record<number, CropId[]> = {
  1: ['maize'], 2: ['cotton'], 3: ['rice'], 4: ['sorghum'], 5: ['soybean'], 6: ['sunflower'], 10: ['groundnut'], 11: ['tobacco'],
  12: ['maize'], 13: ['maize'], 21: ['barley'], 22: ['wheat'], 23: ['wheat'], 24: ['wheat'], 26: ['wheat', 'soybean'], 27: ['rye'],
  28: ['oats'], 29: ['millet'], 30: ['wheat'], 31: ['rapeseed'], 32: ['linseed'], 33: ['safflower'], 34: ['rapeseed'], 35: ['rapeseed'],
  36: ['clover'], 37: ['grassley'], 39: ['buckwheat'], 41: ['sugarbeet'], 42: ['drybean'], 43: ['potato'], 45: ['sugarcane'],
  46: ['sweetpotato'], 48: ['watermelon'], 49: ['onion'], 51: ['chickpea'], 52: ['lentil'], 53: ['pea'], 54: ['tomato'], 58: ['clover'],
  59: ['grassley'], 176: ['grassley'], 205: ['triticale'], 216: ['chilli'], 224: ['vetch'], 225: ['wheat', 'maize'], 226: ['oats', 'maize'],
  228: ['triticale', 'maize'], 230: ['wheat'], 232: ['cotton'], 233: ['barley'], 234: ['wheat', 'sorghum'], 235: ['barley', 'sorghum'],
  236: ['wheat', 'sorghum'], 237: ['barley', 'maize'], 238: ['wheat', 'cotton'], 239: ['soybean', 'cotton'], 240: ['soybean', 'oats'],
  241: ['maize', 'soybean'], 243: ['cabbage'], 254: ['barley', 'soybean'],
}
/** sweet corn (12) is maize in a rotation but a vegetable, not the field crop the engine ranks */
export const CDL_NOT_TRUTH = new Set([12])
/** a CDL pixel value as engine crops and whether it is cropland at all */
export const cdlClass = (v: number) => ({ crops: CDL[v] ?? [], cropland: !NONCROP.has(v) && v !== 0 })
/** the CDL from the USDA's CroplandCROS image service, one raster per year */
export const CDL_SERVICE = 'https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer'
export const CDL_RASTER: Record<number, number> = { 2019: 1, 2020: 35, 2021: 36, 2022: 37, 2023: 38, 2024: 39 }

// ---------- Canada: ACI ----------

export const ACI: Record<number, CropId[]> = {
  122: ['grassley'], 133: ['barley'], 135: ['millet'], 136: ['oats'], 137: ['rye'], 138: ['wheat'], 139: ['triticale'], 140: ['wheat'],
  142: ['sorghum'], 143: ['quinoa'], 145: ['wheat'], 146: ['wheat'], 147: ['maize'], 148: ['tobacco'], 153: ['rapeseed'], 154: ['linseed'],
  155: ['rapeseed'], 156: ['safflower'], 157: ['sunflower'], 158: ['soybean'], 162: ['pea'], 163: ['chickpea'], 167: ['drybean'],
  168: ['faba'], 174: ['lentil'], 176: ['tomato'], 177: ['potato'], 178: ['sugarbeet'], 192: ['grassley'], 195: ['buckwheat'], 198: ['vetch'],
}
const ACI_CROPLAND = (v: number) => v >= 120 && v < 200
/** an ACI pixel value as engine crops and whether it is cropland at all */
export const aciClass = (v: number) => ({ crops: ACI[v] ?? [], cropland: ACI_CROPLAND(v) })
export const aciService = (year: number) => `https://agriculture.canada.ca/imagery-images/rest/services/annual_crop_inventory/${year}/ImageServer`

// ---------- France: RPG ----------

/** RPG crop codes (RPG.<year>:codes_cultures) -> engine crops; codes not listed = no crop the engine knows. */
const RPG_GROUPS: [CropId, string[]][] = [
  ['wheat', ['BTH', 'BTP', 'BDH', 'BDP', 'BDT', 'EPE', 'CHT', 'CPT']],
  ['barley', ['ORH', 'ORP', 'CHH', 'CPH']],
  ['oats', ['AVH', 'AVP', 'CHA', 'CPA']],
  ['rye', ['SGH', 'SGP', 'CHS', 'CPS']],
  ['triticale', ['TTH', 'TTP']],
  ['maize', ['MIS', 'MIE', 'CPZ', 'MID']],
  ['sorghum', ['SOG', 'CGO']],
  ['millet', ['MLT', 'CGP', 'CGS']],
  ['buckwheat', ['SRS', 'CGF']],
  ['rapeseed', ['CZH', 'CZP', 'OHN', 'OPN', 'OPR', 'OHR', 'NVE', 'NVH', 'MOT']],
  ['sunflower', ['TRN', 'OEH']],
  ['linseed', ['LIH', 'LIP', 'LIF']],
  ['soybean', ['SOJ']],
  ['groundnut', ['ARA']],
  ['faba', ['FEV', 'FVL', 'FVP', 'FVT', 'FFO']],
  ['lupin', ['LDH', 'LDP', 'LDT', 'LFH', 'LFP']],
  ['pea', ['PHI', 'PPR', 'PPT', 'PHS', 'PFH', 'PFP']],
  ['lentil', ['LEC']],
  ['chickpea', ['PCH']],
  ['rice', ['RIZ']],
  ['sugarbeet', ['BTN']],
  ['potato', ['PTC', 'PTF']],
  ['tobacco', ['TAB']],
  ['clover', ['LUZ', 'LUD', 'TRE', 'TRD', 'SAI', 'SAD', 'MLG', 'MLC', 'MLD', 'MLF', 'MEL', 'MED', 'MIN', 'LOT']],
  ['grassley', ['PTR', 'RGA', 'PRL', 'PPH', 'GFP', 'FET', 'DTY', 'FLO', 'PAT']],
  ['vetch', ['VES', 'VED', 'JOS', 'JOD']],
]
export const RPG: Record<string, CropId[]> = Object.fromEntries(RPG_GROUPS.flatMap(([id, codes]) => codes.map((c) => [c, [id]])))
/** sweet corn is maize in a rotation but a vegetable crop as a truth */
export const RPG_NOT_TRUTH = new Set(['MID'])
/** one year of the RPG's parcels in a box (no personal data in the layer; its geometry field is named differently in
 *  2022, so no field list is asked for) */
export const rpgUrl = (year: number, [w, s, e, n]: [number, number, number, number]) =>
  `https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=RPG.${year}:parcelles_graphiques&outputFormat=application/json&srsName=EPSG:4326&COUNT=5000&BBOX=${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)},urn:ogc:def:crs:EPSG::4326`

// ---------- Denmark: Marker ----------

/** Danish crop codes (Marker layers, field Afgkode) -> engine crops, from Landbrugsstyrelsen's yearly code lists
 *  (src/data/dk-codes.json); codes not mapped = no crop the engine knows */
type DkCodes = { codes: Record<string, { name: string | null; crop: string | null; notTruth?: boolean }> }
const DK_CODES = (dkCodes as unknown as DkCodes).codes
export const DK: Record<string, CropId[]> = Object.fromEntries(Object.entries(DK_CODES).filter(([, v]) => v.crop).map(([k, v]) => [k, [v.crop as CropId]]))
export const DK_NOT_TRUTH = new Set(Object.entries(DK_CODES).filter(([, v]) => v.notTruth).map(([k]) => k))
/** one year of the Marker parcels in a box: the crop code and the geometry only - the layer also carries the farm's
 *  business and case numbers (CVR, Journalnr), which are never asked for */
export const dkUrl = (year: number, [w, s, e, n]: [number, number, number, number]) =>
  `https://geodata.fvm.dk/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=Marker:Marker_${year}&outputFormat=application/json&srsName=EPSG:4326&count=5000&propertyName=the_geom,Afgkode&bbox=${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)},urn:ogc:def:crs:EPSG::4326`

// ---------- geometry and classes ----------

export type GeoJsonPolygon = { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
const inRing = (x: number, y: number, ring: number[][]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export function inPolygon(lon: number, lat: number, g: GeoJsonPolygon): boolean {
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][]
  return polys.some((rings) => inRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lon, lat, h)))
}

/** the crop a source class stands for: one ranked crop, never a double crop, never land that is not cropland (as H3);
 *  as the truth, a code that is not a field crop (sweet corn) is no crop */
export function cropOfClass(source: MapSource, code: number | string | null, asTruth = false): CropId | null {
  if (code === null) return null
  if (asTruth && ((source === 'rpg' && RPG_NOT_TRUTH.has(String(code))) || (source === 'dk' && DK_NOT_TRUTH.has(String(code))))) return null
  const c = source === 'cdl' ? cdlClass(Number(code)) : source === 'aci' ? aciClass(Number(code)) : { crops: (source === 'rpg' ? RPG : DK)[String(code)] ?? [], cropland: true }
  return c.cropland && c.crops.length === 1 ? c.crops[0] : null
}

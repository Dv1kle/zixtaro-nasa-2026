// Map layer definitions, kept apart from OrbitMap so the ~800 kB MapLibre chunk stays lazy.

export type MapLayer = 'satellite' | 'today' | 'rain' | 'moisture' | 'vegetation' | 'heat' | 'belts' | 'water'
export type GibsKind = 'today' | 'rain' | 'moisture' | 'vegetation' | 'heat'
/** Pictures Zixtaro draws itself from pre-baked NASA data (not GIBS tiles). */
export type OverlayKind = 'belts' | 'water'
export const isGibs = (l: MapLayer): l is GibsKind => l === 'today' || l === 'rain' || l === 'moisture' || l === 'vegetation' || l === 'heat'

export const GIBS_LAYERS: Record<GibsKind, { id: string; matrix: string; ext: 'png' | 'jpg'; maxzoom: number; opacity: number; zoom: number; yearly: boolean }> = {
  today: { id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', matrix: 'GoogleMapsCompatible_Level9', ext: 'jpg', maxzoom: 9, opacity: 1, zoom: 7.2, yearly: false },
  // GPM IMERG: the day's mean rain rate from orbit, 0.1° (≈ 10 km); a daily layer like the true-colour one
  rain: { id: 'IMERG_Precipitation_Rate', matrix: 'GoogleMapsCompatible_Level6', ext: 'png', maxzoom: 6, opacity: 0.85, zoom: 4.6, yearly: false },
  moisture: { id: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', matrix: 'GoogleMapsCompatible_Level6', ext: 'png', maxzoom: 6, opacity: 0.8, zoom: 5.4, yearly: true },
  vegetation: { id: 'MODIS_Terra_L3_NDVI_16Day', matrix: 'GoogleMapsCompatible_Level9', ext: 'png', maxzoom: 9, opacity: 0.88, zoom: 9.6, yearly: true },
  heat: { id: 'MODIS_Terra_L3_Land_Surface_Temp_8Day_Day', matrix: 'GoogleMapsCompatible_Level7', ext: 'png', maxzoom: 7, opacity: 0.78, zoom: 6.6, yearly: true },
}

export const LAYER_YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i) // SMAP starts in 2015

/** Peak-season date: early August (north) / early February (south); composites snap to their period. */
export function gibsDate(kind: GibsKind, year: number, south: boolean): string {
  if (kind === 'today') return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  // (IMERG's day is published a day later than the true-colour picture: two days back is always there)
  if (kind === 'rain') return new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
  if (south) return `${year}-02-01`
  return kind === 'vegetation' ? `${year}-07-28` : `${year}-08-01`
}

export function gibsUrl(kind: GibsKind, date: string): string {
  const g = GIBS_LAYERS[kind]
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${g.id}/default/${date}/${g.matrix}/{z}/{y}/{x}.${g.ext}`
}

// Where the pictures of the ground come from - one place for the map and for the static snapshots.
// Only imagery under open terms (docs/SPACE-APPS-COMPLIANCE.md): the world is Sentinel-2 cloudless 2016 (Copernicus
// Sentinel-2 of ESA, mosaicked by EOX, CC BY 4.0, 10 m); over Lithuania the national orthophoto of the National Land
// Service (geoportal.lt, the newest flight of each district) lies on top, sharp enough to trace a single field.
// Esri World Imagery, which did both before, is not under an open licence and is gone.
export const S2_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'
/** place names and borders over the picture: OpenStreetMap data, rendered by EOX */
export const LABEL_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/overlay_bright_3857/default/g/{z}/{y}/{x}.png'
const ORT_LT = 'https://www.geoportal.lt/arcgis/rest/services/NZT/ORT_recent/MapServer/export'
/** the orthophoto as map tiles: the service has no Web-Mercator cache, so each tile is cut by its bounding box */
export const ORT_LT_TILES = `${ORT_LT}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=jpg&f=image`
/** Lithuania's bounding box [west, south, east, north]: where the orthophoto is asked for */
export const LT_BOUNDS: [number, number, number, number] = [20.93, 53.89, 26.84, 56.45]
export const inLithuania = (lat: number, lon: number) => lon >= LT_BOUNDS[0] && lon <= LT_BOUNDS[2] && lat >= LT_BOUNDS[1] && lat <= LT_BOUNDS[3]
export const S2_CREDIT = 'Sentinel-2 cloudless 2016 by EOX (contains modified Copernicus Sentinel data 2016)'
export const ORT_LT_CREDIT = 'Orthophoto © Nacionalinė žemės tarnyba, geoportal.lt'
/** who to credit under a picture of this place */
export const imageryCredit = (lat: number, lon: number) => (inLithuania(lat, lon) ? ORT_LT_CREDIT : S2_CREDIT)

// A static snapshot of the ground with a projector for SVG overlays - used for the Street View locator and the
// printed report.

const R = 6378137
const mercX = (lon: number) => (R * lon * Math.PI) / 180
const mercY = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

export type StaticView = { url: string; project: (lat: number, lon: number) => [number, number]; metresPerPx: number }

/** Frame the given points (padded, at least `minWidthM` wide) into a W×H image. */
export function staticView(points: { lat: number; lon: number }[], W: number, H: number, minWidthM = 600, pad = 0.3): StaticView {
  const xs = points.map((p) => mercX(p.lon))
  const ys = points.map((p) => mercY(p.lat))
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  // Mercator metres are stretched by 1/cos(lat); keep a true-ground minimum width.
  const stretch = 1 / Math.cos((points[0].lat * Math.PI) / 180)
  let w = Math.max((Math.max(...xs) - Math.min(...xs)) * (1 + 2 * pad), minWidthM * stretch)
  let h = Math.max((Math.max(...ys) - Math.min(...ys)) * (1 + 2 * pad), 1)
  if (w / h > W / H) h = (w * H) / W
  else w = (h * W) / H
  const [xmin, xmax, ymin, ymax] = [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2]
  const box = `${xmin.toFixed(1)},${ymin.toFixed(1)},${xmax.toFixed(1)},${ymax.toFixed(1)}`
  const url = inLithuania(points[0].lat, points[0].lon)
    ? `${ORT_LT}?bbox=${box}&bboxSR=3857&imageSR=3857&size=${W},${H}&format=jpg&f=image`
    : `https://tiles.maps.eox.at/wms?service=WMS&version=1.1.1&request=GetMap&layers=s2cloudless_3857&styles=&srs=EPSG:3857&bbox=${box}&width=${W}&height=${H}&format=image/jpeg`
  return {
    url,
    project: (lat, lon) => [((mercX(lon) - xmin) / (xmax - xmin)) * W, ((ymax - mercY(lat)) / (ymax - ymin)) * H],
    metresPerPx: w / stretch / W,
  }
}

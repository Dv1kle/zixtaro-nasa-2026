// Farm boundaries and plans out of the browser: GeoJSON (QGIS, FieldView, most farm software)
// and KML (Google Earth, many terminal tools). No prescription maps - Zixtaro has no
// variable-rate data, so it does not pretend to.

import { CROP_BY_ID } from './crops'
import { kindOf, type Farm, type FarmField } from './farm'
import type { LonLat } from './geo'
import { COVERS, GH_CROP_BY_ID } from './greenhouse'

/** Closed exterior ring, counter-clockwise as RFC 7946 and KML expect. */
function outer(ring: LonLat[]): LonLat[] {
  let twice = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    twice += x1 * y2 - x2 * y1
  }
  const ccw = twice > 0 ? ring : [...ring].reverse()
  return [...ccw, ccw[0]]
}

function props(ff: FarmField): Record<string, string | number | boolean | null> {
  const base = { name: ff.name, kind: kindOf(ff), area_ha: ff.field.kind === 'area' ? Math.round(ff.field.areaHa * 100) / 100 : null }
  if (kindOf(ff) === 'greenhouse' && ff.gh) {
    const s = ff.ghSnapshot
    return {
      ...base,
      cover: COVERS[ff.gh.cover].label,
      floor_m2: ff.gh.floorM2,
      heated: ff.gh.heated,
      lit: ff.gh.lit,
      crop: GH_CROP_BY_ID[ff.gh.crop].name,
      heat_mwh_yr: s ? Math.round(s.heatMWh) : null,
      rain_tank_m3: s ? Math.round(s.tankM3) : null,
    }
  }
  const s = ff.snapshot
  return {
    ...base,
    irrigated: ff.irrigated,
    history: ff.history.map((id) => (id ? CROP_BY_ID[id].name : '?')).join(' > '),
    next_crop: s ? s.nextName ?? CROP_BY_ID[s.next].name : null,
    plan_4_seasons: s ? (s.planNames ?? s.plan.map((id) => CROP_BY_ID[id].name)).join(' > ') : null,
    score: s ? Math.round(s.score) : null,
  }
}

export function farmGeoJSON(farm: Farm): string {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      name: farm.name,
      features: farm.fields.map((ff) => ({
        type: 'Feature',
        properties: props(ff),
        geometry:
          ff.field.kind === 'area'
            ? { type: 'Polygon', coordinates: [outer(ff.field.ring)] }
            : { type: 'Point', coordinates: [ff.field.lon, ff.field.lat] },
      })),
    },
    null,
    2,
  )
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function farmKML(farm: Farm): string {
  const marks = farm.fields.map((ff) => {
    const data = Object.entries(props(ff))
      .map(([k, v]) => `<Data name="${k}"><value>${esc(String(v ?? ''))}</value></Data>`)
      .join('')
    const geom =
      ff.field.kind === 'area'
        ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${outer(ff.field.ring).map(([x, y]) => `${x},${y},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
        : `<Point><coordinates>${ff.field.lon},${ff.field.lat},0</coordinates></Point>`
    return `<Placemark><name>${esc(ff.name)}</name><ExtendedData>${data}</ExtendedData>${geom}</Placemark>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(farm.name)}</name>${marks.join('')}</Document></kml>\n`
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

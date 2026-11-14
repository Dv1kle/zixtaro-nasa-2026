// Google Street View: the nearest roadside panorama, turned to face the field.
// Needs VITE_GOOGLE_MAPS_API_KEY (Maps JavaScript API). Without it we fall back to Google Maps URLs.

import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { bearingDeg, distanceM } from './geo'

export const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || null

let configured = false

export async function loadStreetView(): Promise<google.maps.StreetViewLibrary> {
  if (!GOOGLE_KEY) throw new Error('No Google Maps API key configured')
  if (!configured) {
    setOptions({ key: GOOGLE_KEY, v: 'weekly' })
    configured = true
  }
  return importLibrary('streetView')
}

export type PanoHit = {
  pano: string
  lat: number
  lon: number
  date: string | null // "2023-06"
  distance: number // m from the field centre
  heading: number // from the panorama towards the field
}

/** Search outward until a road panorama turns up (fields are rarely right on the road). */
export async function nearestPano(lib: google.maps.StreetViewLibrary, target: { lat: number; lon: number }): Promise<PanoHit | null> {
  const svc = new lib.StreetViewService()
  for (const radius of [150, 500, 1500, 5000]) {
    try {
      const { data } = await svc.getPanorama({
        location: { lat: target.lat, lng: target.lon },
        radius,
        preference: lib.StreetViewPreference.NEAREST,
        sources: [lib.StreetViewSource.OUTDOOR],
      })
      const ll = data.location?.latLng
      if (!ll || !data.location?.pano) continue
      const p = { lat: ll.lat(), lon: ll.lng() }
      return {
        pano: data.location.pano,
        ...p,
        date: data.imageDate ?? null,
        distance: distanceM(p, target),
        heading: bearingDeg(p, target),
      }
    } catch {
      // ZERO_RESULTS at this radius - widen the search
    }
  }
  return null
}

/** Keyless deep links (Google Maps URLs need no API key). */
export const mapsLinks = (lat: number, lon: number) => ({
  streetView: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}`,
  satellite: `https://www.google.com/maps/@?api=1&map_action=map&center=${lat.toFixed(6)},${lon.toFixed(6)}&zoom=17&basemap=satellite`,
})

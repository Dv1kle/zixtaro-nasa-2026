// The globe: open imagery (Sentinel-2; Lithuania's orthophoto on top, lib/staticmap) on SRTM terrain, NASA GIBS layers on top, a cinematic
// fly-in from orbit, a slow idle orbit around the field - and a pen for drawing the field.

import { Map as MLMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource, type ImageSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { MotionValue } from 'motion/react'
import { useEffect, useRef, type RefObject } from 'react'
import { ringAreaHa, ringBbox, type Field, type LonLat } from '../lib/geo'
import { GIBS_LAYERS, LAYER_YEARS, gibsDate, gibsUrl, isGibs, type GibsKind, type MapLayer } from '../lib/layers'
import { TERRAIN_TILES } from '../lib/sources'
import { LABEL_TILES, LT_BOUNDS, ORT_LT_CREDIT, ORT_LT_TILES, S2_CREDIT, S2_TILES } from '../lib/staticmap'

setWorkerUrl(workerUrl)

const LEAF = '#c9b07a'
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

const STYLE: StyleSpecification = {
  version: 8,
  projection: { type: 'globe' },
  sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
  sources: {
    imagery: { type: 'raster', tiles: [S2_TILES], tileSize: 256, maxzoom: 14, attribution: S2_CREDIT },
    // (from zoom 12: lower down the mosaic is as good, and a country-wide cut is a heavy request for their server)
    'ort-lt': { type: 'raster', tiles: [ORT_LT_TILES], tileSize: 256, bounds: LT_BOUNDS, minzoom: 12, maxzoom: 19, attribution: ORT_LT_CREDIT },
    labels: { type: 'raster', tiles: [LABEL_TILES], tileSize: 256, maxzoom: 12, attribution: 'Names © OpenStreetMap contributors, rendering © EOX' },
    terrain: { type: 'raster-dem', tiles: [TERRAIN_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Terrain: AWS Terrain Tiles (SRTM)' },
    field: { type: 'geojson', data: EMPTY },
    draft: { type: 'geojson', data: EMPTY },
    samples: { type: 'geojson', data: EMPTY },
    'overlay-lines': { type: 'geojson', data: EMPTY },
  },
  terrain: { source: 'terrain', exaggeration: 1.4 },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-fade-duration': 200 } },
    { id: 'ort-lt', type: 'raster', source: 'ort-lt', minzoom: 12, paint: { 'raster-fade-duration': 200 } },
    // raster labels smear when pitched, so they only live in the orbital & regional views
    { id: 'labels', type: 'raster', source: 'labels', maxzoom: 8.5, paint: { 'raster-opacity': 0.85, 'raster-opacity-transition': { duration: 400, delay: 0 } } },
    { id: 'field-fill', type: 'fill', source: 'field', paint: { 'fill-color': LEAF, 'fill-opacity': 0.14 } },
    // every line and corner the reader draws or owns sits on a dark casing: straw alone vanished on pale, dry ground
    { id: 'field-glow', type: 'line', source: 'field', paint: { 'line-color': LEAF, 'line-width': 9, 'line-blur': 7, 'line-opacity': 0.45 } },
    { id: 'field-case', type: 'line', source: 'field', paint: { 'line-color': '#0a0b0e', 'line-width': 5.5, 'line-opacity': 0.7 } },
    { id: 'field-line', type: 'line', source: 'field', paint: { 'line-color': LEAF, 'line-width': 2.4 } },
    { id: 'draft-fill', type: 'fill', source: 'draft', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#f2ece0', 'fill-opacity': 0.14 } },
    { id: 'draft-case', type: 'line', source: 'draft', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#0a0b0e', 'line-width': 6, 'line-opacity': 0.75 } },
    { id: 'draft-line', type: 'line', source: 'draft', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#f2ece0', 'line-width': 2.4, 'line-dasharray': [2, 1.4] } },
    { id: 'draft-halo', type: 'circle', source: 'draft', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 13, 'circle-color': '#0a0b0e', 'circle-opacity': 0.35, 'circle-blur': 0.6 } },
    { id: 'draft-pts', type: 'circle', source: 'draft', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6.5, 'circle-color': '#f2ece0', 'circle-stroke-color': '#0a0b0e', 'circle-stroke-width': 2.5 } },
    // crop-belt edges: dashed = 1981-2010, solid = the last decade
    { id: 'edge-then', type: 'line', source: 'overlay-lines', filter: ['==', ['get', 'period'], 'baseline'], paint: { 'line-color': '#e9e2d2', 'line-width': 1.6, 'line-opacity': 0.75, 'line-dasharray': [2, 2] } },
    { id: 'edge-now', type: 'line', source: 'overlay-lines', filter: ['==', ['get', 'period'], 'recent'], paint: { 'line-color': LEAF, 'line-width': 2.4 } },
    { id: 'samples-halo', type: 'circle', source: 'samples', paint: { 'circle-radius': 11, 'circle-color': '#d6a35c', 'circle-opacity': 0.18 } },
    { id: 'samples-pts', type: 'circle', source: 'samples', paint: { 'circle-radius': 5, 'circle-color': '#d6a35c', 'circle-stroke-color': '#0a0b0e', 'circle-stroke-width': 2 } },
  ],
}

export type MapControls = { undo: () => void; finish: () => void; clear: () => void }

/** A picture drawn from pre-baked NASA data (crop belts, GRACE water storage), draped on the globe. */
export type OverlayImage = { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] }
export type MapOverlay = {
  images: OverlayImage[] // an image can't span all 360° of longitude, so the world comes in halves
  resampling: 'nearest' | 'linear'
  lines?: GeoJSON.FeatureCollection
  /** [west, south, east, north] to frame; null = frame the field */
  frame: [number, number, number, number] | null
  zoom?: number
}

type Props = {
  field: Field
  mode: 'point' | 'area'
  layer: MapLayer
  year: number
  padLeft: number
  samples: { lat: number; lon: number }[]
  controls: RefObject<MapControls | null>
  onPick: (lat: number, lon: number) => void
  onArea: (ring: LonLat[]) => void
  onDraftChange?: (vertices: number, areaHa: number) => void
  /** approximate camera altitude in km, reported while the camera moves */
  onAltitude?: (km: number) => void
  overlay?: MapOverlay | null
  /** 0 → 1 as the reader scrolls out of the hero: the camera keeps falling toward the field, low and oblique */
  dive?: MotionValue<number>
}

/** Camera height: MapLibre places the camera 1.5 viewport-heights from the centre, in ground metres per pixel. */
function cameraAltitudeKm(map: MLMap): number {
  const c = map.getCenter()
  const metresPerPixel = (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / 2 ** map.getZoom()
  return (1.5 * map.getCanvas().clientHeight * metresPerPixel * Math.cos((map.getPitch() * Math.PI) / 180)) / 1000
}

const polygon = (ring: LonLat[]): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } })

export default function OrbitMap(props: Props) {
  const { field, mode, layer, year, samples, controls } = props
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const latest = useRef(props)
  latest.current = props
  const draft = useRef<LonLat[]>([])
  const lastInteraction = useRef(0)
  const visible = useRef(true)
  // the opening flight has set the camera down over the field; only then may the scroll take the camera lower
  const landed = useRef(false)
  // the scroll owns the camera (the idle orbit and the opening flight keep their hands off)
  const diving = useRef(false)
  // isStyleLoaded() is false while any tiles load, so track readiness ourselves.
  const ready = useRef(false)
  const queue = useRef<(() => void)[]>([])
  const whenReady = (fn: () => void) => (ready.current ? fn() : queue.current.push(fn))

  /** Where the camera should rest for the current field and layer. */
  const rest = (map: MLMap) => {
    const { field: f, layer: l, padLeft, overlay } = latest.current
    if (!isGibs(l) && l !== 'satellite') {
      // decades of NASA data over a whole region: flat and zoomed out
      const canvas = map.getCanvas()
      const freeW = Math.max(240, canvas.clientWidth - padLeft - 80)
      const freeH = Math.max(200, canvas.clientHeight - 220)
      const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
      if (overlay?.frame) {
        const [w, s, e, n] = overlay.frame
        const zw = Math.log2((freeW * 360) / (512 * (e - w)))
        const zh = Math.log2((freeH * 2 * Math.PI) / (512 * (mercY(n) - mercY(s))))
        const cy = (mercY(n) + mercY(s)) / 2
        const lat = (360 / Math.PI) * Math.atan(Math.exp(cy)) - 90
        return { center: [(w + e) / 2, lat] as [number, number], zoom: Math.max(1.2, Math.min(zw, zh) - 0.15), pitch: 0, bearing: 0, padding: { left: padLeft, right: 0, top: 0, bottom: 0 } }
      }
      return { center: [f.lon, f.lat] as [number, number], zoom: overlay?.zoom ?? 2.4, pitch: 0, bearing: 0, padding: { left: padLeft, right: 0, top: 0, bottom: 0 } }
    }
    const base = l === 'satellite' ? 13.6 : GIBS_LAYERS[l].zoom
    // Areas: zoom so the outline fills the free (right-hand) part of the screen.
    // (cameraForBounds under the globe projection lands ~1.5 levels too far out.)
    let zoom = base
    if (f.kind === 'area') {
      const [w, s, e, n] = ringBbox(f.ring)
      const cos = Math.cos((f.lat * Math.PI) / 180)
      const canvas = map.getCanvas()
      const freeW = Math.max(240, canvas.clientWidth - padLeft - 100)
      const freeH = Math.max(200, canvas.clientHeight - 280)
      const mpp = Math.max(((e - w) * 111320 * cos) / freeW, ((n - s) * 110574) / freeH) * 1.25
      // a pitched camera magnifies the near edge, and the idle orbit swings the long axis around
      const fit = Math.log2((156543.03392 * cos) / Math.max(mpp, 0.05)) - (l === 'satellite' ? 0.85 : 0)
      zoom = Math.max(3, Math.min(l === 'satellite' ? 16.5 : base, fit))
    }
    return {
      center: [f.lon, f.lat] as [number, number],
      zoom,
      pitch: l === 'satellite' ? (f.kind === 'area' ? 48 : 52) : 0,
      bearing: l === 'satellite' ? (f.kind === 'area' ? -18 : -22) : 0,
      padding: { left: padLeft, right: 0, top: 0, bottom: 0 },
    }
  }

  const renderDraft = (map: MLMap, cursor?: LonLat) => {
    const pts = draft.current
    const line = cursor ? [...pts, cursor] : pts
    const feats: GeoJSON.Feature[] = pts.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }))
    if (line.length >= 2) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } })
    if (line.length >= 3) feats.push(polygon(line))
    ;(map.getSource('draft') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: feats })
  }

  // Create the map once.
  useEffect(() => {
    if (!box.current) return
    const f0 = latest.current.field
    // No opening flight: the map opens on the field, and snaps to its resting view as soon as the style is in.
    const map = new MLMap({
      container: box.current,
      style: STYLE,
      center: [f0.lon, f0.lat],
      zoom: 12.4,
      attributionControl: { compact: true },
      cooperativeGestures: true,
      maxPitch: 70,
      fadeDuration: 150,
    })
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __map?: MLMap }).__map = map // handy for debugging & screenshots
    map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true }), 'bottom-right')
    map.getCanvas().style.cursor = 'crosshair'

    const el = document.createElement('div')
    el.className = 'field-marker'
    el.innerHTML = '<span class="cross"></span><span class="ring"></span><span class="ring r2"></span><span class="dot"></span>'
    markerRef.current = new Marker({ element: el }).setLngLat([f0.lon, f0.lat]).addTo(map)

    // ---- drawing & picking ----
    const finish = () => {
      if (draft.current.length < 3) return
      const ring = draft.current
      draft.current = []
      renderDraft(map)
      latest.current.onDraftChange?.(0, 0)
      map.doubleClickZoom.enable()
      latest.current.onArea(ring)
    }
    controls.current = {
      undo: () => {
        draft.current = draft.current.slice(0, -1)
        renderDraft(map)
        latest.current.onDraftChange?.(draft.current.length, draft.current.length >= 3 ? ringAreaHa(draft.current) : 0)
      },
      finish,
      clear: () => {
        draft.current = []
        renderDraft(map)
        latest.current.onDraftChange?.(0, 0)
      },
    }
    map.on('click', (e) => {
      lastInteraction.current = Date.now()
      if (latest.current.mode === 'point') {
        latest.current.onPick(e.lngLat.lat, e.lngLat.lng)
        return
      }
      map.doubleClickZoom.disable()
      const pts = draft.current
      if (pts.length >= 3) {
        // clicking the first corner closes the shape
        const first = map.project(pts[0] as [number, number])
        if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < 12) return finish()
      }
      draft.current = [...pts, [e.lngLat.lng, e.lngLat.lat]]
      renderDraft(map)
      latest.current.onDraftChange?.(draft.current.length, draft.current.length >= 3 ? ringAreaHa(draft.current) : 0)
    })
    map.on('dblclick', (e) => {
      if (latest.current.mode !== 'area') return
      e.preventDefault()
      finish()
    })
    map.on('mousemove', (e) => {
      if (latest.current.mode === 'area' && draft.current.length) renderDraft(map, [e.lngLat.lng, e.lngLat.lat])
    })

    // ---- altitude readout & label fading ----
    let frame = 0
    let labelsOn = true
    const report = () => {
      frame = 0
      latest.current.onAltitude?.(cameraAltitudeKm(map))
      const want = map.getPitch() < 18
      if (want !== labelsOn && map.getLayer('labels')) {
        labelsOn = want
        map.setPaintProperty('labels', 'raster-opacity', want ? 0.85 : 0)
      }
    }
    map.on('move', () => {
      if (!frame) frame = requestAnimationFrame(report)
    })
    let orbiting = false
    // Sources and layers can go in as soon as the style is parsed - no need to wait for every tile.
    const onReady = () => {
      if (ready.current) return
      ready.current = true
      for (const fn of queue.current.splice(0)) {
        try {
          fn()
        } catch (e) {
          console.warn(e)
        }
      }
      if (!diving.current) map.jumpTo(rest(map))
      orbiting = true
      landed.current = true
      report()
    }
    map.once('style.load', onReady)
    map.once('load', onReady)
    for (const ev of ['mousedown', 'touchstart', 'wheel', 'dragstart'] as const) map.on(ev, () => (lastInteraction.current = Date.now()))

    // ---- a slow orbit while nobody touches the map ----
    let raf = 0
    let prev = performance.now()
    // the idle orbit is ambience, not information: it holds still for readers who ask for reduced motion
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    const spin = (t: number) => {
      const dt = Math.min(0.1, (t - prev) / 1000)
      prev = t
      const calm = Date.now() - lastInteraction.current > 7000
      if (orbiting && calm && !still.matches && !diving.current && visible.current && latest.current.mode !== 'area' && latest.current.layer === 'satellite' && !map.isMoving()) {
        map.setBearing(map.getBearing() + dt * 2.2)
      }
      raf = requestAnimationFrame(spin)
    }
    raf = requestAnimationFrame(spin)
    const io = new IntersectionObserver(([entry]) => (visible.current = entry.isIntersecting), { threshold: 0.2 })
    io.observe(box.current)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      controls.current = null
      ready.current = false
      queue.current = []
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follow the field (point or area).
  const first = useRef(true)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markerRef.current?.setLngLat([field.lon, field.lat])
    const apply = () => (map.getSource('field') as GeoJSONSource | undefined)?.setData(field.kind === 'area' ? { type: 'FeatureCollection', features: [polygon(field.ring)] } : EMPTY)
    whenReady(apply)
    if (first.current) {
      first.current = false
      return
    }
    lastInteraction.current = Date.now()
    const c = map.getCenter()
    const far = Math.hypot(c.lng - field.lon, c.lat - field.lat) > 3
    map.flyTo({ ...rest(map), duration: far ? 5200 : 2200, curve: far ? 1.6 : 1.2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field])

  // The dive: scrolling out of the hero keeps the camera falling - two zoom levels lower, tipped toward the horizon,
  // swinging round, the field drifting from the right-hand half to the middle as the text it made room for leaves.
  // Scroll back up and it climbs back to where it rested. Only on the satellite layer and never while drawing.
  useEffect(() => {
    const dive = props.dive
    if (!dive) return
    let frame = 0
    let base: ReturnType<typeof rest> | null = null
    let bearing0 = 0
    let catchUp = 0
    const pose = (v: number) => {
      const e = v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2
      const b = base!
      return {
        center: b.center,
        zoom: b.zoom + e * 2.3,
        pitch: b.pitch + e * (66 - b.pitch),
        bearing: bearing0 + e * 28,
        padding: { ...b.padding, left: b.padding.left * (1 - e) },
      }
    }
    const apply = () => {
      frame = 0
      const map = mapRef.current
      const { layer: l, mode: m } = latest.current
      if (!map || !ready.current || l !== 'satellite' || m === 'area') return
      const v = dive.get()
      if (v <= 0.002) {
        if (diving.current && base) {
          base = null
          catchUp = 0
          map.easeTo({ ...rest(map), bearing: map.getBearing(), duration: 700 })
          // the climb back owns the camera until it is done: the idle orbit's setBearing would otherwise stop()
          // the ease on its very first frame, before MapLibre counts the camera as moving
          map.once('moveend', () => {
            if (dive.get() <= 0.002) diving.current = false
          })
        }
        return
      }
      if (!diving.current || !base) {
        diving.current = true
        // the scroll takes the camera over - from a settled field view, or out of the opening flight if the reader
        // scrolls before it has landed (stop() ends that flight; its moveend marks the camera as landed)
        const far = !landed.current && map.getZoom() < rest(map).zoom - 3
        map.stop()
        landed.current = true
        base = rest(map)
        bearing0 = map.getBearing()
        if (far || v > 0.03) {
          const ms = far ? 2200 : 500
          if (far) map.flyTo({ ...pose(v), duration: ms, curve: 1.4 })
          else map.easeTo({ ...pose(v), duration: ms })
          catchUp = performance.now() + ms
          frame = requestAnimationFrame(apply)
          return
        }
      }
      if (performance.now() < catchUp) {
        frame = requestAnimationFrame(apply)
        return
      }
      map.jumpTo(pose(v))
    }
    const off = dive.on('change', () => {
      if (!frame) frame = requestAnimationFrame(apply)
    })
    if (import.meta.env.DEV) (window as unknown as { __dive?: MotionValue<number> }).__dive = dive // QA probes
    return () => {
      off()
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.dive])

  // Soil sample points.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () =>
      (map.getSource('samples') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: field.kind === 'area' && samples.length > 1 ? samples.map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) : [],
      })
    whenReady(apply)
  }, [samples, field])

  // Leaving drawing mode drops an unfinished outline.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    lastInteraction.current = Date.now()
    if (mode === 'point') {
      draft.current = []
      whenReady(() => renderDraft(map))
      map.doubleClickZoom.enable()
    }
    // with the pen out the map is the whole task: the wheel zooms it without Ctrl (no "use Ctrl + scroll" card over
    // the field) and never scrolls the page away under the pen
    if (mode === 'area') map.cooperativeGestures.disable()
    else map.cooperativeGestures.enable()
    box.current?.toggleAttribute('data-lenis-prevent', mode === 'area')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // NASA GIBS overlays: one layer per year, cross-faded - this is what makes the time-lapse smooth.
  const south = field.lat < 0
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      for (const kind of Object.keys(GIBS_LAYERS) as GibsKind[]) {
        const years = GIBS_LAYERS[kind].yearly ? LAYER_YEARS : [0]
        for (const y of years) {
          const id = `${kind}-${south ? 's' : 'n'}-${y}`
          const wanted = layer === kind
          if (!map.getLayer(id)) {
            if (!wanted) continue
            map.addSource(id, { type: 'raster', tiles: [gibsUrl(kind, gibsDate(kind, y, south))], tileSize: 256, maxzoom: GIBS_LAYERS[kind].maxzoom, attribution: 'NASA GIBS / EOSDIS' })
            map.addLayer(
              { id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 450, delay: 0 }, 'raster-fade-duration': 0 } },
              'labels',
            )
          }
          const on = wanted && (!GIBS_LAYERS[kind].yearly || y === year)
          map.setPaintProperty(id, 'raster-opacity', on ? GIBS_LAYERS[kind].opacity : 0)
        }
      }
      // hide the other hemisphere's copies if the field moved across the equator
      for (const l of map.getStyle().layers) {
        if (/^(moisture|vegetation|heat|today)-[ns]-/.test(l.id) && !l.id.includes(`-${south ? 's' : 'n'}-`)) map.setPaintProperty(l.id, 'raster-opacity', 0)
      }
    }
    whenReady(apply)
  }, [layer, year, south])

  // Our own pictures from pre-baked NASA data: crop belts and GRACE water storage.
  const overlay = props.overlay ?? null
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const images = overlay?.images ?? []
      for (let k = 0; k < Math.max(images.length, 2); k++) {
        const id = `overlay-${k}`
        const img = images[k]
        const src = map.getSource(id) as ImageSource | undefined
        if (img) {
          if (src) src.updateImage({ url: img.url, coordinates: img.coordinates })
          else {
            map.addSource(id, { type: 'image', url: img.url, coordinates: img.coordinates })
            map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0.92, 'raster-fade-duration': 0 } }, 'labels')
          }
          map.setPaintProperty(id, 'raster-resampling', overlay!.resampling)
          map.setLayoutProperty(id, 'visibility', 'visible')
        } else if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
      }
      ;(map.getSource('overlay-lines') as GeoJSONSource | undefined)?.setData(overlay?.lines ?? EMPTY)
    }
    whenReady(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay])
  // A new region to frame (another crop keeps the view; another region or layer moves the camera).
  const frameKey = overlay?.frame?.join(',') ?? `z${overlay?.zoom ?? ''}`
  const lastFrame = useRef(frameKey)
  useEffect(() => {
    const map = mapRef.current
    if (!map || lastFrame.current === frameKey) return
    lastFrame.current = frameKey
    if (isGibs(layer) || layer === 'satellite') return
    whenReady(() => map.easeTo({ ...rest(map), duration: 1600 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey])

  // Re-frame when the layer changes (SMAP is 9 km - it needs a regional view).
  const lastLayer = useRef(layer)
  useEffect(() => {
    const map = mapRef.current
    if (!map || lastLayer.current === layer) return
    lastLayer.current = layer
    lastInteraction.current = Date.now()
    map.easeTo({ ...rest(map), duration: 1800 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer])

  // MapLibre forces `position: relative` on its container, so size it with h/w-full inside an absolute wrapper.
  return <div ref={box} className="h-full w-full" aria-label="Globe map - click to choose a field, or draw its outline" />
}

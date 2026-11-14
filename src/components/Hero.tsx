import { ArrowDown, Check, CloudRain, CloudSun, Crosshair, Droplets, Flame, Hexagon, Leaf, LoaderCircle, LocateFixed, MapPin, Pause, Play, Satellite, Search, Sprout, Undo2, Warehouse, Waves, Wheat, X } from 'lucide-react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react'
import { cameraAltitude, formatAltitude } from '../lib/descent'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { searchPlaces, type Place } from '../lib/api'
import { BELT_CROPS, BELT_REGIONS, beltOverlay, loadRegion, regionFor, type BeltRegion, type BeltStats, type BeltView } from '../lib/belts'
import { CROP_BY_ID, type CropId } from '../lib/crops'
import { graceFor, type GraceHere } from '../lib/grace'
import { IMERG_LEGEND, IMERG_SNOW_LEGEND, LST_LEGEND, NDVI_LEGEND, SMAP_LEGEND } from '../lib/color'
import { weatherLabel, type Forecast } from '../lib/forecast'
import { coord } from '../lib/format'
import { formatArea, makeArea, type Field, type LonLat } from '../lib/geo'
import { LAYER_YEARS, type MapLayer } from '../lib/layers'
import type { SiteKind } from '../lib/farm'
import { useAfterIntro, useEdgeFade, useMedia } from '../lib/hooks'
import { SPAN, useScrollSpan } from '../lib/scrollSpan'
import { useLang } from '../lib/i18n'
import { useMode } from '../lib/mode'
import { PRESETS, type Preset } from '../lib/presets'
import type { MapControls, MapOverlay } from './OrbitMap'
import { Boundary, CropTile } from './ui'

const OrbitMap = lazy(() => import('./OrbitMap'))

type Props = {
  field: Field
  place: string | null
  presetId: string | null
  signal: string | null
  weather: Forecast['now'] | null
  samples: { lat: number; lon: number }[]
  soilProgress: { done: number; total: number }
  onField: (f: Field) => void
  onPreset: (p: Preset) => void
  site: SiteKind
  onSite: (k: SiteKind) => void
  onTour: () => void
  /** the page's answer, once the model has one: the hero says it, the descent below proves it */
  answer: { label: string; name: string; color: string } | null
}

/** "Next season: Sunflower" - the answer up front, a link down to the plan that argues for it */
function HeroAnswer({ answer, className = '' }: { answer: NonNullable<Props['answer']>; className?: string }) {
  return (
    <a href="#plan" className={`group flex items-baseline justify-between gap-4 ${className}`} aria-label={`${answer.label}: ${answer.name} - see why in the plan`}>
      <span className="font-mono text-xs text-ink-3">{answer.label}</span>
      <span className="flex min-w-0 items-baseline gap-2.5">
        <i aria-hidden className="h-2.5 w-2.5 shrink-0 translate-y-[-0.15em] rounded-full" style={{ background: answer.color }} />
        <span className="truncate font-display-soft text-[1.9rem] leading-none text-ink">{answer.name}</span>
      </span>
      <span className="ml-auto shrink-0 font-mono text-xs text-ink-3 transition-colors group-hover:text-leaf">why →</span>
    </a>
  )
}

const LAYERS: { id: MapLayer; label: string; sub: string; icon: typeof Satellite; decades?: boolean }[] = [
  { id: 'satellite', label: 'Satellite', sub: 'Sentinel-2 (ESA) · 10 m; Lithuania: national orthophoto', icon: Satellite },
  { id: 'today', label: 'Yesterday', sub: 'NASA VIIRS true colour · daily · 375 m', icon: CloudSun },
  { id: 'rain', label: 'Rain', sub: 'NASA GPM IMERG rain and snow from orbit · a day’s mean rate, two days ago · 10 km', icon: CloudRain },
  { id: 'moisture', label: 'Soil moisture', sub: 'NASA SMAP L4 root zone · 9 km', icon: Waves },
  { id: 'vegetation', label: 'Vegetation', sub: 'NASA MODIS NDVI · 16-day · 250 m', icon: Leaf },
  { id: 'heat', label: 'Surface heat', sub: 'NASA MODIS land surface temp · 8-day · 1 km', icon: Flame },
  { id: 'belts', label: 'Crop belts', sub: 'Zixtaro’s crop model on every NASA POWER cell · 1981-2010 vs 2016-2025', icon: Sprout, decades: true },
  { id: 'water', label: 'Water storage', sub: 'NASA GRACE & GRACE-FO · total water storage trend since 2002 · ≈300 km', icon: Droplets, decades: true },
]

type WaterMeta = { from: string; to: string; limitCmPerYear: number; images: MapOverlay['images'] }
type WaterHere = GraceHere

/** A second thought under one line (a native details): the story folds it, the workbench shows it as it was. */
function Fold({ fold, open, summary, children }: { fold: boolean; open: boolean; summary: string; children: ReactNode }) {
  if (!fold) return <>{children}</>
  return (
    <details open={open || undefined} className="mt-2">
      <summary className="cursor-pointer py-2 font-mono text-[11px] tracking-wider text-ink-3 uppercase transition-colors hover:text-ink">{summary}</summary>
      {children}
    </details>
  )
}

function usePadLeft() {
  const [pad, setPad] = useState(0)
  useEffect(() => {
    const on = () => setPad(window.innerWidth >= 1024 ? Math.min(640, window.innerWidth * (window.innerWidth < 1280 ? 0.55 : 0.42)) : 0)
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return pad
}

export function Hero({ field, place, presetId, signal, weather, samples, soilProgress, onField, onPreset, site, onSite, onTour, answer }: Props) {
  const lang = useLang()
  // The hero comes in through the loader's last frames: the film takes ~950 ms to let go of the screen and is still
  // nearly opaque for the first half of that - started with it, the title had risen before anyone could see it.
  // (No loader - a return visit: at once.)
  const landed = useAfterIntro(480, 0)
  const [layer, setLayer] = useState<MapLayer>('satellite')
  const [layersOpen, setLayersOpen] = useState(false)
  const story = useMode() === 'story'
  const [year, setYear] = useState(2018)
  const [playing, setPlaying] = useState(false)
  // 'area' = the pen is out: clicks add corners. Area fields stay areas after drawing ends.
  const [mode, setMode] = useState<'point' | 'area'>('point')
  const [draft, setDraft] = useState(0)
  const [draftHa, setDraftHa] = useState(0)
  const drawing = mode === 'area'
  const controls = useRef<MapControls | null>(null)
  const padLeft = usePadLeft()
  const desktop = useMedia('(min-width: 1024px)')
  const yearly = layer === 'moisture' || layer === 'vegetation' || layer === 'heat'

  // decades of NASA data, drawn by Zixtaro itself: crop belts and GRACE water storage
  const [beltCrop, setBeltCrop] = useState<CropId>('maize')
  const [beltView, setBeltView] = useState<BeltView>('change')
  const [beltData, setBeltData] = useState<BeltRegion | null>(null)
  const region = regionFor(field.lat, field.lon)
  useEffect(() => {
    if (layer !== 'belts') return
    let live = true
    loadRegion(region).then((d) => live && setBeltData(d))
    return () => {
      live = false
    }
  }, [layer, region])
  const belt = useMemo(
    () => (layer === 'belts' && beltData?.region === region ? beltOverlay(beltData, beltCrop, beltView) : null),
    [layer, beltData, region, beltCrop, beltView],
  )
  const [water, setWater] = useState<WaterMeta | null>(null)
  const [waterHere, setWaterHere] = useState<WaterHere | null>(null)
  useEffect(() => {
    if (layer !== 'water') return
    let live = true
    const base = `${import.meta.env.BASE_URL}data/grace/`
    fetch(`${base}trend.json`).then((r) => (r.ok ? r.json() : null)).then((d) => live && setWater(d)).catch(() => {})
    setWaterHere(null)
    graceFor(field.lat, field.lon, presetId).then((d) => live && setWaterHere(d))
    return () => {
      live = false
    }
  }, [layer, presetId, field.lat, field.lon])
  const overlay = useMemo<MapOverlay | null>(() => {
    if (layer === 'belts' && belt) {
      const r = BELT_REGIONS[region]
      return { images: [{ url: belt.url, coordinates: belt.coordinates }], resampling: 'nearest', lines: belt.lines, frame: [r.lon[0], r.lat[0], r.lon[1], r.lat[1]] }
    }
    if (layer === 'water' && water)
      return {
        images: water.images.map((im) => ({ url: `${import.meta.env.BASE_URL}data/grace/${im.url}`, coordinates: im.coordinates })),
        resampling: 'linear',
        frame: null,
        zoom: desktop ? 2.5 : 1.6,
      }
    return null
  }, [layer, belt, region, water, desktop])

  // Phones: the globe lives in a window between the intro and the site card instead of behind the text.
  const sectionRef = useRef<HTMLElement>(null)
  const introRef = useRef<HTMLDivElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const [win, setWin] = useState<{ top: number; height: number } | null>(null)

  // The signature move. On desktop the hero holds still for most of another screen while the scroll takes the camera
  // the rest of the way down: the controls stay behind in orbit, the camera's own height grows to fill the frame,
  // and the field turns from a map into a place. Phones keep the globe in its window; reduced motion keeps it still.
  const reduce = useReducedMotion()
  const runway = desktop && !reduce
  const scrollYProgress = useScrollSpan(sectionRef, SPAN.pin)
  const dive = useTransform(scrollYProgress, [0, 0.82], [0, 1], { clamp: true })
  const deck = useTransform(dive, [0, 0.3], [1, 0])
  const deckY = useTransform(dive, [0, 0.3], [0, -48])
  const veil = useTransform(dive, [0, 0.4], [1, 0])
  const callout = useTransform(dive, [0.14, 0.34], [0, 1])
  const calloutY = useTransform(dive, [0.14, 1], [24, -16])
  const [away, setAway] = useState(false)
  useMotionValueEvent(dive, 'change', (v) => setAway(runway && v > 0.22))
  const calloutNum = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!runway) return
    const write = (km: number) => {
      if (calloutNum.current) calloutNum.current.textContent = formatAltitude(km * 1000)
    }
    const km = cameraAltitude.get()
    if (km != null) write(km)
    return cameraAltitude.subscribe(write)
  }, [runway])
  useLayoutEffect(() => {
    const sec = sectionRef.current
    const w = windowRef.current
    if (desktop || !sec || !w) return
    const measure = () => {
      const a = sec.getBoundingClientRect()
      const b = w.getBoundingClientRect()
      const next = { top: Math.round(b.top - a.top), height: Math.round(b.height) }
      setWin((prev) => (prev && prev.top === next.top && prev.height === next.height ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(sec)
    ro.observe(w)
    if (introRef.current) ro.observe(introRef.current)
    return () => ro.disconnect()
  }, [desktop])
  const fullscreenPen = drawing && !desktop
  // the pen takes the whole phone screen; the page behind must not scroll away under it
  useEffect(() => {
    if (!fullscreenPen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [fullscreenPen])
  const fade = 'linear-gradient(180deg, transparent, #000 56px, #000 calc(100% - 56px), transparent)'
  const mapStyle: CSSProperties | undefined =
    desktop || fullscreenPen ? undefined : { top: win?.top ?? 0, height: win?.height ?? 0, maskImage: fade, WebkitMaskImage: fade }

  useEffect(() => {
    if (!playing || !yearly) return
    const t = setInterval(() => setYear((y) => (y >= LAYER_YEARS[LAYER_YEARS.length - 1] ? LAYER_YEARS[0] : y + 1)), 1300)
    return () => clearInterval(t)
  }, [playing, yearly])
  useEffect(() => {
    if (!yearly) setPlaying(false)
  }, [yearly])
  useEffect(() => {
    if (mode !== 'area') return
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Escape') controls.current?.clear()
      if (e.key === 'Backspace') controls.current?.undo()
      if (e.key === 'Enter') controls.current?.finish()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [mode])

  return (
    <section ref={sectionRef} id="orbit" className={`relative bg-void ${runway ? 'h-[190svh] overflow-clip' : 'min-h-[100svh] overflow-hidden'}`}>
      <div className={runway ? 'sticky top-0 h-[100svh] overflow-hidden' : 'contents'}>
      <Starfield />
      <div className={fullscreenPen ? 'fixed inset-0 z-[45]' : 'absolute inset-x-0 lg:inset-y-0'} style={{ ...mapStyle, filter: fullscreenPen || drawing ? undefined : 'saturate(0.78) contrast(1.1) brightness(0.86)' }}>
        <Boundary fallback={<GlobePlaceholder broken />}>
        <Suspense fallback={<GlobePlaceholder />}>
          <OrbitMap
            field={field}
            mode={mode}
            layer={layer}
            year={year}
            padLeft={padLeft}
            samples={samples}
            controls={controls}
            onPick={(lat, lon) => onField({ kind: 'point', lat, lon })}
            onArea={(ring: LonLat[]) => {
              setMode('point')
              onField(makeArea(ring))
            }}
            onDraftChange={(n, ha) => {
              setDraft(n)
              setDraftHa(ha)
            }}
            onAltitude={cameraAltitude.set}
            overlay={overlay}
            dive={runway ? dive : undefined}
          />
        </Suspense>
        </Boundary>
      </div>
      {/* the film still's vignette: the frame darkens toward its edges, the eye goes to the field */}
      <div aria-hidden className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${drawing ? 'opacity-0' : ''}`} style={{ background: 'radial-gradient(115% 95% at 62% 48%, transparent 52%, rgb(10 11 14 / 0.62) 100%)' }} />
      {/* legibility veils (desktop: the globe sits behind the text) - gone while drawing, so the whole field is visible */}
      <motion.div className="pointer-events-none absolute inset-0" style={runway ? { opacity: veil } : undefined}>
        <div className={`pointer-events-none absolute inset-0 hidden transition-opacity duration-500 lg:block ${drawing ? 'opacity-0' : ''}`}>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,5,10,.94)_0%,rgba(3,5,10,.72)_30%,rgba(3,5,10,.15)_52%,transparent_65%)]" />
        </div>
      </motion.div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-void/80 to-transparent" />
      <div className={`pointer-events-none absolute inset-y-0 left-0 hidden w-full bg-[linear-gradient(90deg,rgba(3,5,10,.55),transparent_55%)] transition-opacity duration-700 lg:block ${layer === 'satellite' ? 'opacity-0' : 'opacity-100'}`} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-void" />

      <AnimatePresence>
        {desktop && !drawing && ((layer === 'belts' && belt && beltData) || (layer === 'water' && waterHere)) && (
          <motion.div
            key={layer}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass pointer-events-none absolute top-36 right-8 z-10 w-[340px] rounded-2xl p-4"
          >
            {layer === 'belts' && belt && beltData ? (
              <BeltHeadline stats={belt.stats} data={beltData} crop={beltCrop} />
            ) : waterHere ? (
              <WaterHeadline here={waterHere} place={place?.split(',')[0] ?? null} />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* the altimeter rail's gutter: stays when the hero's veil lifts, so the rail reads over bright imagery */}
      {runway && !drawing && <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-52 bg-gradient-to-r from-void/85 via-void/45 to-transparent xl:w-60" />}
      {/* the dive's one statement: the camera's height, large, falling as the reader scrolls */}
      {/* (never while drawing: the field and the pen's panel are the whole frame then) */}
      {runway && !drawing && (
        <motion.div aria-hidden style={{ opacity: callout, y: calloutY }} className="pointer-events-none absolute inset-x-0 bottom-[15svh] z-10 flex flex-col items-center px-8 text-center [text-shadow:0_2px_28px_rgb(3_5_10/0.7)]">
          <span className="font-mono text-xs text-ink-2">camera above {field.label?.split(',')[0] ?? place?.split(',')[0] ?? 'your field'}</span>
          <span ref={calloutNum} className="font-display-soft mt-3 text-[clamp(4.5rem,10vw,9rem)] leading-[0.85] font-[340] text-ink tabular-nums" />
          <span className="mt-6 max-w-md text-[15px] leading-relaxed text-pretty text-ink-2">Down through the cloud deck to the field itself: the ground, the air over it, the soil under it.</span>
        </motion.div>
      )}

      <AnimatePresence>
        {drawing && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className={`glass rounded-3xl p-4 sm:p-5 ${fullscreenPen ? 'fixed right-16 bottom-4 left-3 z-[46]' : 'absolute bottom-8 left-1/2 z-30 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2'}`}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-leaf/15 text-leaf"><Hexagon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] text-ink">{draft === 0 ? 'Tap the corners of your field on the map' : draft < 3 ? `${draft} of at least 3 corners - keep going` : `${draft} corners · about ${formatArea(draftHa)}`}</div>
                <div className="text-xs text-ink-3">{desktop ? 'Drag to move the map · Backspace undoes · Enter or a click on the first corner finishes' : 'Two fingers move the map · tap the first corner to finish'}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button onClick={() => controls.current?.undo()} disabled={!draft} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 text-sm text-ink-2 hover:text-ink disabled:opacity-30"><Undo2 className="h-4 w-4" /> Undo</button>
              <button onClick={() => controls.current?.clear()} disabled={!draft} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 text-sm text-ink-2 hover:text-ink disabled:opacity-30"><X className="h-4 w-4" /> Clear</button>
              <button onClick={() => { controls.current?.clear(); setMode('point') }} className="rounded-full px-3 py-2 text-sm text-ink-3 hover:text-ink">Cancel</button>
              <button onClick={() => controls.current?.finish()} disabled={draft < 3} className="ml-auto flex items-center gap-2 rounded-full bg-leaf px-5 py-2.5 text-sm font-semibold text-[#0a0b0e] shadow-[0_0_24px_rgba(201,176,122,.35)] transition disabled:opacity-30 disabled:shadow-none">
                <Check className="h-4 w-4" /> Done - analyse this field
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* the hero's controls: on desktop they stay behind in orbit as the camera dives (and leave the tab order) */}
      <motion.div inert={away} style={runway ? { opacity: deck, y: deckY } : undefined} className="pointer-events-none relative z-10">
      <div className={`pointer-events-none relative z-10 mx-auto flex min-h-[100svh] max-w-[1400px] flex-col px-5 pt-20 pb-8 transition-opacity duration-500 short:pt-16 short:pb-5 sm:px-8 lg:pl-28 xl:pl-36 ${drawing ? 'invisible opacity-0' : 'opacity-100'}`}>
        {/* It used to come in on mount - under the loader, where nobody saw it. It comes in as the film lets go of the
            screen: the title line by line out of its masks, the serif word last, the controls with them. */}
        <motion.div
          ref={introRef}
          initial={{ opacity: 0, y: 24 }}
          animate={landed ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="pointer-events-auto max-w-xl"
        >
          <div className="kicker text-orbit/80">{story ? 'Step 1 of 4 · choose your field' : 'NASA Space Apps 2026 · Field Shift'}</div>
          <h1 data-in={landed || undefined} className="font-display-soft mt-4 text-balance text-[clamp(3.4rem,min(9.6vw,13.5svh),9.4rem)] leading-[0.84] uppercase short:mt-3 short:text-[clamp(2.8rem,11svh,6rem)]">
            {lang === 'en' ? (
              <>
                <span className="hl"><span>From orbit</span></span>
                <span className="hl" style={{ '--k': 1 } as CSSProperties}><span>to <em className="font-voice text-leaf">root zone.</em></span></span>
              </>
            ) : (
              <span className="hl"><span>From orbit to root zone.</span></span> // one phrase for the translator
            )}
          </h1>
          {/* one instrument line, not a paragraph: the hero is the object */}
          {/* (a sentence in the reading face: as a row of small mono capitals it was the fourth such row on this screen,
              and the one line that says what the page is for read as a caption) */}
          <p className="mt-[clamp(1rem,2.6svh,1.5rem)] max-w-md text-[15px] leading-snug text-ink-2 short:mt-3">
            {site === 'greenhouse'
              ? '45 years of NASA sunlight over the roof · the light, heat and water it needs · priced'
              : '45 years of NASA sky · the soil beneath · the next 16 days → one crop for next season'}
          </p>

          {/* phones: the answer before the globe, not 15 000 px below it */}
          {answer && !story && <HeroAnswer answer={answer} className="mt-[clamp(1rem,2.6svh,1.5rem)] border-y border-white/10 py-3 lg:hidden" />}

          {/* the tour is an offer, not the main action: a quiet link, the field's own button stays the loudest thing here */}
          {/* (the workbench's: in the story the tour was a second way round the same page) */}
          {!story && (
          <button
            onClick={onTour}
            className="group mt-[clamp(0.75rem,2svh,1.25rem)] -ml-1 flex min-h-[44px] items-center gap-2.5 rounded-full py-1.5 pr-3 pl-1 text-sm text-ink-2 transition-colors hover:text-ink short:mt-2"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full border border-white/20 transition-colors group-hover:border-leaf/60 group-hover:text-leaf">
              <Play className="h-3 w-3 translate-x-px" />
            </span>
            Take the three-minute tour
            <span className="font-mono text-[11px] text-ink-3">narrated</span>
          </button>
          )}

          <PlaceSearch onField={onField} setMode={setMode} />

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {PRESETS.filter((p) => !p.hidden).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setMode('point')
                  onPreset(p)
                }}
                aria-pressed={presetId === p.id}
                className={`border-b py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors ${
                  presetId === p.id ? 'border-leaf text-leaf' : 'border-transparent text-ink-3 hover:border-ink-3 hover:text-ink'
                }`}
              >
                <span className="mr-1.5">{p.flag}</span>
                {p.name}
                {p.field.kind === 'area' && <Hexagon className="ml-1.5 inline h-3 w-3 opacity-70" />}
              </button>
            ))}
          </div>
        </motion.div>

        {/* the globe's window on phones */}
        <div ref={windowRef} data-tour="globe" aria-hidden className="pointer-events-none -mx-5 mt-4 h-[46svh] min-h-[280px] max-h-[520px] sm:-mx-8 lg:hidden" />

        <div className="mt-4 flex flex-col gap-4 lg:mt-auto lg:flex-row lg:items-end lg:justify-between lg:pt-5 short:lg:pt-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="glass pointer-events-auto w-full rounded-2xl p-4 short:p-3 lg:max-w-md"
          >
            <div className="flex items-start gap-3">
              {field.kind === 'area' ? <Hexagon className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /> : <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] text-ink">{field.label ?? place ?? 'Locating…'}</div>
                <div className="num mt-0.5 text-xs text-ink-3">
                  {field.kind === 'area' ? `${formatArea(field.areaHa)} · centre ${coord(field.lat, field.lon)}` : coord(field.lat, field.lon)}
                </div>
                {field.kind === 'area' && soilProgress.total > 1 && (
                  <div className={`mt-1 font-mono text-[11px] text-wheat short:hidden ${story ? 'hidden' : ''}`}>
                    {soilProgress.done < soilProgress.total ? `sampling soil ${soilProgress.done}/${soilProgress.total}…` : `${soilProgress.total} soil samples across the field`}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                  {signal ? (
                    <span>
                      NASA POWER: <span className="text-wheat">{signal}</span>
                    </span>
                  ) : (
                    <span>Reading 45 years of NASA POWER data…</span>
                  )}
                  {weather && (
                    <span className={`num text-ink-2 short:hidden ${story ? 'hidden' : ''}`}>
                      now {Math.round(weather.temp)} °C · {weatherLabel(weather.code).toLowerCase()} · {Math.round(weather.wind)} km/h
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* the story: one way on from this card. What kind of site it is and how it is marked are a second thought,
                folded under one line until asked for (open while an outline is being drawn - its button says so) */}
            <Fold fold={story} open={mode === 'area'} summary="Mark a single point instead, or draw a new outline">
            <div className="mt-3 flex flex-wrap gap-2 short:mt-2">
              {/* (the greenhouse is another tool with its own model: the workbench's) */}
              {!story && (
              <div className="grid flex-1 basis-[172px] grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1" role="group" aria-label="Site type">
                <button onClick={() => onSite('field')} aria-pressed={site === 'field'} className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${site === 'field' ? 'bg-white/12 text-ink' : 'text-ink-3 hover:text-ink'}`}>
                  <Wheat className="h-3.5 w-3.5" /> Field
                </button>
                <button onClick={() => onSite('greenhouse')} aria-pressed={site === 'greenhouse'} className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${site === 'greenhouse' ? 'bg-white/12 text-ink' : 'text-ink-3 hover:text-ink'}`}>
                  <Warehouse className="h-3.5 w-3.5" /> Greenhouse
                </button>
              </div>
              )}
              <div className="grid flex-1 basis-[172px] grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1" role="group" aria-label="Select the site by">
                <button onClick={() => setMode('point')} aria-pressed={mode === 'point' && field.kind === 'point'} className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${mode === 'point' && field.kind === 'point' ? 'bg-white/12 text-ink' : 'text-ink-3 hover:text-ink'}`}>
                  <MapPin className="h-3.5 w-3.5" /> Point
                </button>
                <button
                  onClick={() => setMode(mode === 'area' ? 'point' : 'area')}
                  aria-pressed={mode === 'area'}
                  title={field.kind === 'area' ? 'Redraw the field outline' : 'Draw the field outline on the map'}
                  className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition ${mode === 'area' ? 'bg-leaf text-[#0a0b0e]' : field.kind === 'area' ? 'bg-leaf/15 text-leaf' : 'text-ink-3 hover:text-ink'}`}
                >
                  <Hexagon className="h-3.5 w-3.5" /> {mode === 'area' ? 'Drawing…' : field.kind === 'area' ? 'Redraw' : 'Outline'}
                </button>
              </div>
            </div>
            </Fold>
            {/* (the story: no answer before the farmer has said anything about the field) */}
            {answer && !story && <HeroAnswer answer={answer} className="mt-3 hidden border-t border-white/10 pt-3 lg:flex" />}
            <a href={story ? '#field' : '#ground'} className="mt-3 flex items-center justify-between rounded-xl bg-leaf px-4 py-2.5 text-sm font-medium text-[#0a0b0e] transition hover:brightness-110 short:mt-2 short:py-2">
              {site === 'greenhouse' ? 'Descend to this greenhouse' : story ? 'Continue with this field' : 'Descend to this field'}
              <ArrowDown className="h-4 w-4" />
            </a>
          </motion.div>

          {/* the map's layers: one quiet switch in the frame until the reader asks for them */}
          {!layersOpen && layer === 'satellite' ? (
            <button onClick={() => setLayersOpen(true)} className={`pointer-events-auto self-start px-3 py-2 font-mono text-[11px] tracking-[0.18em] text-ink-3 uppercase transition-colors hover:text-ink lg:self-end lg:mr-14 ${story ? '' : 'border border-ink/25 bg-void/70 hover:border-ink'}`}>
              Layers · satellite +
            </button>
          ) : (
          <LayerPanel
            layer={layer}
            setLayer={setLayer}
            year={year}
            setYear={setYear}
            playing={playing}
            setPlaying={setPlaying}
            south={field.lat < 0}
            belts={{ crop: beltCrop, setCrop: setBeltCrop, view: beltView, setView: setBeltView, stats: belt?.stats ?? null, data: beltData?.region === region ? beltData : null }}
            water={{ meta: water, here: waterHere, place: place?.split(',')[0] ?? null }}
          />
          )}
        </div>
      </div>
      </motion.div>
      </div>
    </section>
  )
}

function PlaceSearch({ onField, setMode }: { onField: Props['onField']; setMode: (m: 'point' | 'area') => void }) {
  const wide = useMedia('(min-width: 640px)')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const ac = useRef<AbortController | null>(null)

  // One request per search, sent on Enter. The public Nominatim service asks not to be used for search-as-you-type
  // (its usage policy), and a request per keystroke-pause was exactly that.
  const [asked, setAsked] = useState('')
  const search = () => {
    const term = q.trim()
    if (term.length < 3) return
    ac.current?.abort()
    ac.current = new AbortController()
    setBusy(true)
    setAsked(term)
    searchPlaces(term, ac.current.signal)
      .then((r) => {
        setResults(r)
        setOpen(true)
      })
      .catch(() => setResults([]))
      .finally(() => setBusy(false))
  }

  const done = () => {
    setOpen(false)
    setQ('')
  }
  const asPoint = (p: Place) => {
    setMode('point')
    onField({ kind: 'point', lat: p.lat, lon: p.lon, label: p.label })
    done()
  }
  const asArea = (p: Place) => {
    if (!p.area) return
    setMode('point')
    onField(p.area)
    done()
  }

  return (
    <div className="relative mt-4 short:mt-3">
      <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3 focus-within:border-leaf/50">
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin text-ink-3" /> : <Search className="h-4 w-4 text-ink-3" />}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            // Enter asks; Enter again on the answers takes the first
            if (e.key === 'Enter') results[0] && asked === q.trim() ? asPoint(results[0]) : search()
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder={wide ? 'Type a village or district and press Enter - or click the globe' : 'Type a place, press Enter'}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
          aria-label="Search a place"
        />
        <button
          onClick={() => navigator.geolocation?.getCurrentPosition((pos) => onField({ kind: 'point', lat: pos.coords.latitude, lon: pos.coords.longitude }))}
          className="-my-2.5 -mr-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:text-leaf"
          title="Use my location"
          aria-label="Use my location"
        >
          <LocateFixed className="h-4 w-4" />
        </button>
      </div>
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="glass absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl py-1"
          >
            {results.map((r) => (
              <li key={`${r.lat},${r.lon}`} className="flex items-center gap-2 px-2 hover:bg-white/5">
                <button onClick={() => asPoint(r)} className="min-w-0 flex-1 px-2 py-2.5 text-left text-sm text-ink-2 hover:text-ink">
                  <span className="block truncate">{r.label}</span>
                  <span className="font-mono text-[11px] text-ink-4">{r.kind}</span>
                </button>
                {r.area?.kind === 'area' && (
                  <button onClick={() => asArea(r)} className="flex shrink-0 items-center gap-1 rounded-full border border-leaf/40 px-2.5 py-1 font-mono text-[11px] text-leaf hover:bg-leaf/10" title="Analyse the whole territory">
                    <Hexagon className="h-3 w-3" /> {formatArea(r.area.areaHa)}
                  </button>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

type BeltProps = { crop: CropId; setCrop: (c: CropId) => void; view: BeltView; setView: (v: BeltView) => void; stats: BeltStats | null; data: BeltRegion | null }
type WaterProps = { meta: WaterMeta | null; here: WaterHere | null; place: string | null }

function LayerPanel({
  layer, setLayer, year, setYear, playing, setPlaying, south, belts, water,
}: {
  layer: MapLayer
  setLayer: (l: MapLayer) => void
  year: number
  setYear: (y: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  south: boolean
  belts: BeltProps
  water: WaterProps
}) {
  const active = LAYERS.find((l) => l.id === layer)!
  const yearly = layer === 'moisture' || layer === 'vegetation' || layer === 'heat'
  const legend = layer === 'moisture' ? SMAP_LEGEND : layer === 'heat' ? LST_LEGEND : NDVI_LEGEND
  const labels = layer === 'moisture' ? ['dry 0.0', 'm³/m³', '0.6 wet'] : layer === 'heat' ? ['−15 °C', 'surface', '55 °C'] : ['bare 0.0', 'NDVI', '1.0 dense']
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.8 }}
      className="glass pointer-events-auto w-full rounded-2xl p-3 lg:mr-14 lg:max-w-md"
    >
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/[0.04] p-1">
        {LAYERS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLayer(l.id)}
            title={l.sub}
            aria-pressed={layer === l.id}
            className={`relative flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] leading-tight hyphens-auto [overflow-wrap:anywhere] transition ${layer === l.id ? (l.decades ? 'bg-leaf/15 text-leaf' : 'bg-white/12 text-ink') : l.decades ? 'text-leaf/70 hover:text-leaf' : 'text-ink-3 hover:text-ink'}`}
          >
            <l.icon className="h-3.5 w-3.5" />
            {l.label}
          </button>
        ))}
      </div>
      <div className="mt-2 px-1 font-mono text-[11px] tracking-wide text-ink-3">{active.sub}</div>
      <AnimatePresence initial={false}>
        {layer === 'belts' && (
          <motion.div key="belts" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <BeltControls {...belts} />
          </motion.div>
        )}
        {layer === 'water' && (
          <motion.div key="water" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <WaterLegend {...water} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {layer === 'rain' && (
          <motion.div key="rain" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid grid-cols-[2fr_1fr] gap-3 px-1">
              <div>
                <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${IMERG_LEGEND.join(',')})` }} />
                <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3">
                  <span>light</span>
                  <span>rain</span>
                  <span>heavy</span>
                </div>
              </div>
              <div>
                <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${IMERG_SNOW_LEGEND.join(',')})` }} />
                <div className="mt-1 text-center font-mono text-[11px] text-ink-3">snow</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {yearly && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 flex items-center gap-3 px-1">
              <button onClick={() => setPlaying(!playing)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-leaf text-[#0a0b0e]" aria-label={playing ? 'Pause time-lapse' : 'Play time-lapse'}>
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
              </button>
              <input
                type="range"
                min={LAYER_YEARS[0]}
                max={LAYER_YEARS[LAYER_YEARS.length - 1]}
                value={year}
                onChange={(e) => {
                  setPlaying(false)
                  setYear(Number(e.target.value))
                }}
                className="fader flex-1"
                style={{ ['--fader' as string]: 'var(--color-leaf)', ['--val' as string]: `${((year - LAYER_YEARS[0]) / (LAYER_YEARS.length - 1)) * 100}%` }}
                aria-label="Year"
              />
              <div className="num w-[74px] text-right text-sm text-ink">
                {south ? 'Feb' : layer === 'vegetation' ? 'Jul' : 'Aug'} {year}
              </div>
            </div>
            <div className="mt-3 px-1">
              <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${legend.join(',')})` }} />
              <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3">
                {labels.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Starfield() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-70"
      style={{
        backgroundImage: [
          'radial-gradient(1px 1px at 12% 18%, #fff 50%, transparent 51%)',
          'radial-gradient(1px 1px at 72% 12%, #cfe8ff 50%, transparent 51%)',
          'radial-gradient(1.4px 1.4px at 88% 64%, #fff 50%, transparent 51%)',
          'radial-gradient(1px 1px at 34% 78%, #fff 50%, transparent 51%)',
          'radial-gradient(1px 1px at 55% 40%, #ffe9c4 50%, transparent 51%)',
          'radial-gradient(1.2px 1.2px at 8% 60%, #fff 50%, transparent 51%)',
          'radial-gradient(1px 1px at 93% 30%, #fff 50%, transparent 51%)',
          'radial-gradient(1px 1px at 46% 8%, #fff 50%, transparent 51%)',
          'radial-gradient(1px 1px at 64% 88%, #cfe8ff 50%, transparent 51%)',
          'radial-gradient(1px 1px at 22% 44%, #fff 50%, transparent 51%)',
        ].join(','),
        backgroundSize: '520px 520px',
      }}
    />
  )
}

/** The globe while its chunk loads - or, `broken`, where it can't run (no WebGL2): the page works without it. */
function GlobePlaceholder({ broken = false }: { broken?: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center lg:pl-[40%]">
      <div className={`h-[46vmin] w-[46vmin] rounded-full bg-[radial-gradient(circle_at_35%_30%,#1b3a5c,#07121f_60%,#0a0b0e)] shadow-[0_0_120px_20px_rgba(90,160,255,.15)] ${broken ? '' : 'animate-pulse'}`} />
      {broken && (
        <p className="absolute bottom-[18%] max-w-xs px-6 text-center font-mono text-[11px] leading-relaxed text-ink-3 lg:left-[58%] lg:-translate-x-1/2">
          The 3D globe needs WebGL2, which this browser has switched off. Search a place or pick a demo field: everything below still works.
        </p>
      )}
    </div>
  )
}

const km = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x / 10) * 10)} km`

/** Which crop, which picture, and what moved - for the crop-belt layer. */
function BeltControls({ crop, setCrop, view, setView, stats, data }: BeltProps) {
  const p = data?.periods
  const views: { id: BeltView; label: string }[] = [
    { id: 'change', label: 'What moved' },
    { id: 'baseline', label: p ? `${p.baseline[0]}-${p.baseline[1]}` : 'then' },
    { id: 'recent', label: p ? `${p.recent[0]}-${p.recent[1]}` : 'now' },
  ]
  const name = CROP_BY_ID[crop].name.toLowerCase()
  const fade = useEdgeFade<HTMLDivElement>()
  return (
    <div className="mt-3 space-y-3 px-1">
      <div ref={fade} className="edge-fade scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {BELT_CROPS.map((id) => (
          <button key={id} onClick={() => setCrop(id)} aria-pressed={crop === id} title={CROP_BY_ID[id].name} className={`shrink-0 rounded-lg p-0.5 transition ${crop === id ? 'ring-1 ring-leaf' : 'opacity-60 hover:opacity-100'}`}>
            <CropTile crop={CROP_BY_ID[id]} size="xs" />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-white/[0.05] p-1">
        {views.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} aria-pressed={view === v.id} className={`rounded-full px-2 py-1 font-mono text-[11px] transition ${view === v.id ? 'bg-white/12 text-ink' : 'text-ink-3 hover:text-ink'}`}>
            {v.label}
          </button>
        ))}
      </div>
      {view === 'change' ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-leaf" />newly suitable</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-heat" />no longer suitable</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-wheat/50" />suitable both times</span>
          <span className="flex items-center gap-1.5"><i className="h-px w-3 border-t border-dashed border-ink" />edge then</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-leaf" />edge now</span>
        </div>
      ) : (
        <div>
          <div className="h-2 rounded-full bg-[linear-gradient(90deg,var(--color-heat),var(--color-wheat)_50%,var(--color-leaf))]" />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3"><span>unsuitable</span><span>rainfed suitability</span><span>ideal</span></div>
        </div>
      )}
      {stats && data && (
        <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-[12.5px] leading-snug text-ink-2 lg:hidden">
          Rainfed {name} across {data.label.toLowerCase()}: suitable area{' '}
          <span className={stats.areaChange >= 0 ? 'text-leaf' : 'text-heat'}>{stats.areaChange >= 0 ? '+' : '−'}{Math.abs(Math.round(stats.areaChange * 100))}%</span>
          {stats.edgeShiftKm !== null && Math.abs(stats.edgeShiftKm) >= 20 && (
            <>
              , its poleward edge <span className="text-leaf">{km(stats.edgeShiftKm)}</span> {stats.edgeShiftKm >= 0 ? 'toward the pole' : 'toward the equator'}
            </>
          )}{' '}
          since {data.periods.baseline[0]}-{data.periods.baseline[1]}.
          <div className="mt-1 font-mono text-[11px] text-ink-4">{data.soil} · 0.5° cells · the regional picture, not advice for one field</div>
        </div>
      )}
    </div>
  )
}

function WaterLegend({ meta, here, place }: WaterProps) {
  return (
    <div className="mt-3 space-y-2 px-1">
      <div className="h-2 rounded-full bg-[linear-gradient(90deg,rgb(176_102_42),rgb(176_102_42/0.15)_45%,rgb(60_150_220/0.15)_55%,rgb(60_150_220))]" />
      <div className="flex justify-between font-mono text-[11px] text-ink-3">
        <span>losing water −{meta?.limitCmPerYear ?? 2} cm/yr</span>
        <span>gaining +{meta?.limitCmPerYear ?? 2}</span>
      </div>
      {here && (
        <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-[12.5px] leading-snug text-ink-2 lg:hidden">
          Around {place ?? 'this field'} the ground and everything on it holds{' '}
          <span className={here.change.cm < 0 ? 'text-heat' : 'text-water'}>{Math.abs(here.change.cm).toFixed(0)} cm of water {here.change.cm < 0 ? 'less' : 'more'}</span> than in {here.change.from}
          {' '}({here.trendCmPerYear >= 0 ? '+' : '−'}{Math.abs(here.trendCmPerYear * 10).toFixed(0)} mm a year{here.p !== null && here.p >= 0.05 ? ', not significant' : ''}).
          <div className="mt-1 font-mono text-[11px] text-ink-4">soil, groundwater, snow and lakes together · a ≈300 km footprint, not your well</div>
        </div>
      )}
      {meta && <div className="font-mono text-[11px] text-ink-4">{meta.from} → {meta.to} · CSR RL06.3 mascons</div>}
    </div>
  )
}

/** The big numbers of the crop-belt map, floating over the globe on desktop. */
function BeltHeadline({ stats, data, crop }: { stats: BeltStats; data: BeltRegion; crop: CropId }) {
  const c = CROP_BY_ID[crop]
  const area = Math.round(stats.areaChange * 100)
  return (
    <div>
      <div className="flex items-center gap-2">
        <CropTile crop={c} size="xs" />
        <div className="min-w-0">
          <div className="kicker !text-[11px]">rainfed {c.name.toLowerCase()} · {data.label}</div>
          <div className="font-mono text-[11px] text-ink-4">
            {data.periods.baseline[0]}-{data.periods.baseline[1]} → {data.periods.recent[0]}-{data.periods.recent[1]}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className={`font-display-soft text-3xl leading-none ${area >= 0 ? 'text-leaf' : 'text-heat'}`}>{area >= 0 ? '+' : '−'}{Math.abs(area)}%</div>
          <div className="mt-1 text-[11px] text-ink-3">suitable area</div>
        </div>
        {stats.edgeShiftKm !== null && (
          <div>
            <div className={`font-display-soft text-3xl leading-none ${stats.edgeShiftKm >= 0 ? 'text-leaf' : 'text-heat'}`}>{km(stats.edgeShiftKm)}</div>
            <div className="mt-1 text-[11px] text-ink-3">{stats.edgeShiftKm >= 0 ? 'poleward edge moved toward the pole' : 'poleward edge moved toward the equator'}</div>
          </div>
        )}
      </div>
      <div className="mt-3 font-mono text-[11px] leading-relaxed text-ink-4">
        {stats.gained} cells newly suitable · {stats.lost} lost · NASA POWER, {data.soil}
      </div>
    </div>
  )
}

function WaterHeadline({ here, place }: { here: WaterHere; place: string | null }) {
  const lost = here.change.cm < 0
  return (
    <div>
      <div className="kicker !text-[11px]">water stored around {place ?? 'this field'} · NASA GRACE-FO</div>
      <div className={`font-display-soft mt-2 text-3xl leading-none ${lost ? 'text-heat' : 'text-water'}`}>
        {lost ? '−' : '+'}{Math.abs(here.change.cm).toFixed(0)} cm
      </div>
      <div className="mt-1 text-[12px] leading-snug text-ink-2">
        of water {lost ? 'lost' : 'gained'} since {here.change.from} - soil, groundwater, snow and lakes together ({here.trendCmPerYear >= 0 ? '+' : '−'}
        {Math.abs(here.trendCmPerYear * 10).toFixed(0)} mm a year{here.p !== null && here.p >= 0.05 ? ', not significant' : ''}).
      </div>
      <div className="mt-2 font-mono text-[11px] text-ink-4">a ≈300 km footprint, not your well</div>
    </div>
  )
}

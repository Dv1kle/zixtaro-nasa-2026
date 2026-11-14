import { Compass, ExternalLink, Mountain, Navigation, Thermometer } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { weatherLabel, type Forecast } from '../lib/forecast'
import { formatArea, type Field } from '../lib/geo'
import type { Loadable } from '../lib/hooks'
import { useWidth } from '../lib/hooks'
import { staticView, imageryCredit } from '../lib/staticmap'
import { GOOGLE_KEY, loadStreetView, mapsLinks, nearestPano, type PanoHit } from '../lib/streetview'
import type { Terrain } from '../lib/terrain'
import { Chip, Reveal, SectionHeader, Skeleton, MapImage } from './ui'
import { Instrument, usePlate } from './Instrument'

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
const compass = (deg: number) => COMPASS[Math.round(deg / 45) % 8]

type Props = { field: Field; terrain: Loadable<Terrain>; forecast: Loadable<Forecast>; /** a pinned crossing stands before the section: as a plate it rides up over that scene (story mode) */ over?: boolean }

export function GroundSection({ field, terrain, forecast, over = false }: Props) {
  const plate = usePlate(over)
  const [pano, setPano] = useState<PanoHit | null>(null)
  const [status, setStatus] = useState<'nokey' | 'loading' | 'ready' | 'none' | 'error'>(GOOGLE_KEY ? 'loading' : 'nokey')
  const [err, setErr] = useState('')
  const links = mapsLinks(field.lat, field.lon)
  // without a Maps key there is no panorama to embed: the big panel becomes the field up close, and the roadside
  // view opens in Google Maps (a link needs no key)
  const keyless = !GOOGLE_KEY

  return (
    <section id="ground" className={`sec-ground relative scroll-mt-16 px-5 pt-16 pb-14 sm:pt-24 sm:pb-20 sm:px-8 lg:pl-28 xl:pl-36 ${plate.root}`}>
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col">
        <SectionHeader
          kicker="Ground truth"
          altitude="2.5 m · eye level"
          title={<>From orbit to the <em className="text-leaf">roadside</em>.</>}
          dek={
            keyless
              ? 'Satellites see the field from 705 km. Remote-sensing people call the check on the ground ‘ground truth’ - it starts here: the field up close, the lie of the land and the weather right now, with the roadside view one tap away.'
              : 'Satellites see the field from 705 km. Remote-sensing people call the check on the ground ‘ground truth’ - here it is: the nearest Street View panorama, turned to face your field, plus the terrain and the weather right now.'
          }
        />

        <Instrument
          title="The field at eye level"
          kicker="Instrument · 2.5 m"
          label="Open the ground view"
          facts={
            terrain.status === 'ready'
              ? [
                  { value: Math.round(terrain.data.elevation), unit: 'm', label: 'above sea level' },
                  { value: terrain.data.slopePct.toFixed(1), unit: '%', label: `mean slope - water-erosion risk ${terrain.data.slopePct >= 6 ? 'high' : terrain.data.slopePct >= 3 ? 'moderate' : 'low'}` },
                  { value: terrain.data.slopePct < 0.5 ? 'slow' : terrain.data.slopePct < 3 ? 'good' : 'fast', label: terrain.data.slopePct < 0.5 ? 'drainage - watch for waterlogging' : 'drainage - surface runoff' },
                ]
              : []
          }
        >
        {keyless ? (
          <>
            {/* a wide close-up where the panorama would be, the ground facts in a row under it */}
            <Reveal className="panel relative mt-12 overflow-hidden p-0">
              <FieldCloseup field={field} links={links} />
            </Reveal>
            <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_1fr]">
              <Reveal delay={0.06} className="panel grid grid-cols-2 content-start gap-x-5 gap-y-4 p-5 sm:grid-cols-4">
                <TerrainFacts field={field} terrain={terrain} />
              </Reveal>
              <Reveal delay={0.12} className="panel p-5">
                <NowFacts forecast={forecast} />
              </Reveal>
            </div>
          </>
        ) : (
          <div className="mt-12 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Reveal className="panel relative min-h-[420px] overflow-hidden p-0 lg:min-h-[520px]">
              <StreetView field={field} onPano={setPano} status={status} setStatus={setStatus} setErr={setErr} />
              {status === 'ready' && pano && (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5">
                  <Chip tone="info">Google Street View{pano.date ? ` · ${new Date(`${pano.date}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}</Chip>
                  <Chip>{Math.round(pano.distance)} m from the field</Chip>
                  <Chip tone="good">looking {compass(pano.heading)} at it</Chip>
                </div>
              )}
              {status !== 'ready' && <NoPanorama field={field} status={status} err={err} />}
            </Reveal>

            <div className="flex min-w-0 flex-col gap-4">
              <Reveal delay={0.06} className="panel overflow-hidden p-0">
                <Locator field={field} pano={pano} />
              </Reveal>
              <Reveal delay={0.12} className="panel grid grid-cols-2 gap-x-5 gap-y-4 p-5">
                <TerrainFacts field={field} terrain={terrain} />
              </Reveal>
              <Reveal delay={0.18} className="panel p-5">
                <NowFacts forecast={forecast} />
              </Reveal>
            </div>
          </div>
        )}
        {!keyless && (
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <a href={links.streetView} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-ink-2 transition hover:border-white/40 hover:text-ink">
              <ExternalLink className="h-3.5 w-3.5" /> Open Street View in Google Maps
            </a>
            <a href={links.satellite} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-ink-2 transition hover:border-white/40 hover:text-ink">
              <ExternalLink className="h-3.5 w-3.5" /> Google satellite view
            </a>
          </div>
        )}
        </Instrument>
      </div>
    </section>
  )
}

/** Nice round scale-bar lengths: 1, 2 or 5 × 10ⁿ metres. */
function niceMetres(m: number) {
  const p = 10 ** Math.floor(Math.log10(m))
  return [5, 2, 1].map((k) => k * p).find((v) => v <= m) ?? p
}

/**
 * No Street View key: the field up close (open imagery, lib/staticmap), its outline drawn on as the panel arrives, a scale bar,
 * and the roadside view as a Google Maps link. The picture drifts slowly; the outline moves with it.
 */
function FieldCloseup({ field, links }: { field: Field; links: ReturnType<typeof mapsLinks> }) {
  const [box, width] = useWidth<HTMLDivElement>(720)
  const reduce = useReducedMotion()
  // the imagery service can be unreachable: then the frame stops claiming to be a satellite picture
  const [noImage, setNoImage] = useState(false)
  // wide panels lay the caption over the picture's lower part; on a phone it goes underneath, clear of the field
  const overlay = width >= 600
  const H = overlay ? Math.round(Math.min(540, Math.max(400, width * 0.42))) : 300
  const ring = field.kind === 'area' ? field.ring : null
  const view = useMemo(() => {
    const core = ring ? ring.map(([lon, lat]) => ({ lat, lon })) : [{ lat: field.lat, lon: field.lon }]
    // under an overlaid caption, a point below the field stretches the frame downwards, so the outline sits higher up
    const lats = core.map((p) => p.lat)
    const span = Math.max(Math.max(...lats) - Math.min(...lats), 0.002)
    const pts = overlay ? [...core, { lat: Math.min(...lats) - span * 0.8, lon: field.lon }] : core
    const v = staticView(pts, width, H, ring ? 700 : 600, ring ? 0.55 : 0.3)
    // the same frame at up to twice the pixels, so the picture stays sharp on dense screens
    const k = Math.min(2, 2048 / Math.max(width, H))
    return { ...v, sharp: staticView(pts, Math.round(width * k), Math.round(H * k), ring ? 700 : 600, ring ? 0.55 : 0.3).url }
  }, [field, ring, width, H, overlay])
  const barM = niceMetres((view.metresPerPx * width) / 5)
  const barPx = barM / view.metresPerPx
  const [fx, fy] = view.project(field.lat, field.lon)
  const outline = ring ? ring.map(([lon, lat]) => view.project(lat, lon).join(',')).join(' ') : ''
  return (
    <div ref={box} className="relative w-full">
      <div className="relative overflow-hidden" style={{ height: H }}>
        <div className="closeup-drift absolute inset-0 origin-center">
          <MapImage src={view.sharp} alt="Satellite close-up of the field" className="absolute inset-0 h-full w-full object-cover" onFail={setNoImage} />
          <svg width={width} height={H} className="absolute inset-0" aria-hidden>
            {ring ? (
              <>
                <polygon points={outline} fill="rgb(201 176 122 / 0.10)" stroke="none" />
                <motion.polygon
                  points={outline}
                  fill="none"
                  stroke="var(--color-leaf)"
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  style={{ filter: 'drop-shadow(0 0 6px rgb(201 176 122 / 0.7))' }}
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
                />
              </>
            ) : (
              <>
                <circle cx={fx} cy={fy} r={16} fill="rgb(201 176 122 / 0.16)" />
                <circle cx={fx} cy={fy} r={6} fill="var(--color-leaf)" stroke="#0a0b0e" strokeWidth={2} />
              </>
            )}
          </svg>
        </div>
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-t ${overlay ? 'from-void/95 via-void/35 to-transparent' : 'from-void/70 via-transparent to-transparent'}`} />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <Chip className="!bg-void/75 backdrop-blur-sm">{field.kind === 'area' ? `your field · ${formatArea(field.areaHa)}` : 'your field'}</Chip>
          {!noImage && <Chip className="!bg-void/75">satellite close-up</Chip>}
        </div>
        <div className={`absolute right-3 bottom-3 flex flex-col items-end gap-1 text-right font-mono text-[11px] text-white/75 ${noImage ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2">
            <span>N ↑</span>
            <span className="flex flex-col items-center">
              <span className="block h-1.5 border-x border-b border-white/75" style={{ width: barPx }} />
              <span className="mt-0.5">{barM >= 1000 ? `${barM / 1000} km` : `${barM} m`}</span>
            </span>
          </div>
          <span className="text-white/60">{imageryCredit(field.lat, field.lon)}</span>
        </div>
      </div>
      <div className={`flex flex-col items-start gap-3 ${overlay ? 'absolute inset-x-0 bottom-0 p-7 pr-36' : 'relative p-5'}`}>
        <div className="kicker !text-leaf">Eye level is one tap away</div>
        <p className="max-w-md text-[15px] leading-relaxed text-ink-2">
          Google Street View opens at the nearest road - stand at the edge of this field and look across it.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={links.streetView} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full bg-leaf px-4 py-2 text-sm font-medium text-[#0a0b0e] transition hover:brightness-110">
            <Navigation className="h-4 w-4" aria-hidden /> Look around at eye level
          </a>
          <a href={links.satellite} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-white/20 bg-void/50 px-4 py-2 text-sm text-ink-2 backdrop-blur-sm transition hover:border-white/40 hover:text-ink">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Google satellite view
          </a>
        </div>
      </div>
    </div>
  )
}

function StreetView({
  field, onPano, status, setStatus, setErr,
}: {
  field: Field
  onPano: (p: PanoHit | null) => void
  status: string
  setStatus: (s: 'nokey' | 'loading' | 'ready' | 'none' | 'error') => void
  setErr: (e: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null)
  const touched = useRef(false)

  useEffect(() => {
    if (!GOOGLE_KEY || !el.current) return
    let cancelled = false
    let raf = 0
    setStatus('loading')
    onPano(null)
    touched.current = false
    ;(async () => {
      try {
        const lib = await loadStreetView()
        const hit = await nearestPano(lib, { lat: field.lat, lon: field.lon })
        if (cancelled) return
        if (!hit) {
          setStatus('none')
          return
        }
        const opts: google.maps.StreetViewPanoramaOptions = {
          pano: hit.pano,
          pov: { heading: hit.heading, pitch: -3 },
          zoom: 0.6,
          addressControl: false,
          fullscreenControl: true,
          motionTracking: false,
          motionTrackingControl: false,
          showRoadLabels: false,
          enableCloseButton: false,
          panControl: false,
          zoomControl: true,
        }
        if (panoRef.current) {
          panoRef.current.setPano(hit.pano)
          panoRef.current.setPov(opts.pov!)
        } else {
          panoRef.current = new lib.StreetViewPanorama(el.current!, opts)
        }
        onPano(hit)
        setStatus('ready')
        // A slow look-around centred on the field until someone takes the wheel.
        const t0 = performance.now()
        const sway = (t: number) => {
          if (cancelled || touched.current || !panoRef.current) return
          const k = (t - t0) / 1000
          panoRef.current.setPov({ heading: hit.heading + Math.sin(k / 3.2) * 28, pitch: -3 + Math.sin(k / 5) * 2 })
          raf = requestAnimationFrame(sway)
        }
        raf = requestAnimationFrame(sway)
      } catch (e) {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.lat, field.lon])

  return (
    <div role="img"
      ref={el}
      onPointerDown={() => (touched.current = true)}
      onWheel={() => (touched.current = true)}
      className={`absolute inset-0 transition-opacity duration-700 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
      aria-label="Google Street View near the field"
    />
  )
}

function NoPanorama({ field, status, err }: { field: Field; status: string; err: string }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const view = useMemo(() => staticView([{ lat: field.lat, lon: field.lon }], Math.min(1280, width), 520, field.kind === 'area' ? 900 : 700), [field, width])
  return (
    <div ref={box} className="absolute inset-0">
      <MapImage src={view.url} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-[3px]" />
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/60 to-void/20" />
      <div className="relative flex h-full flex-col items-start justify-end gap-4 p-6 sm:p-8">
        {status === 'loading' && (
          <>
            <Skeleton className="h-4 w-48" />
            <div className="text-sm text-ink-2">Looking for the nearest Street View panorama…</div>
          </>
        )}
        {status === 'none' && <div className="max-w-lg text-[15px] text-ink-2">Google has no Street View panorama within 5 km of this field. Farmland is often off the camera cars’ routes.</div>}
        {status === 'error' && <div className="max-w-lg text-[15px] text-ink-2">Street View could not load ({err}). The key may be missing the Maps JavaScript API or blocked for this domain.</div>}
      </div>
    </div>
  )
}

/** Satellite locator: the field, the panorama and the direction the camera looks. */
function Locator({ field, pano }: { field: Field; pano: PanoHit | null }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const H = 260
  const pts = [{ lat: field.lat, lon: field.lon }, ...(pano ? [{ lat: pano.lat, lon: pano.lon }] : []), ...(field.kind === 'area' ? field.ring.map(([lon, lat]) => ({ lat, lon })) : [])]
  const view = useMemo(() => staticView(pts, width, H, 450, 0.25), [width, field, pano]) // eslint-disable-line react-hooks/exhaustive-deps
  const [fx, fy] = view.project(field.lat, field.lon)
  const cone = pano
    ? (() => {
      const [px, py] = view.project(pano.lat, pano.lon)
      const r = Math.min(120, Math.hypot(fx - px, fy - py) + 30)
      const a = ((pano.heading - 90) * Math.PI) / 180
      const spread = (30 * Math.PI) / 180
      const p1 = [px + r * Math.cos(a - spread), py + r * Math.sin(a - spread)]
      const p2 = [px + r * Math.cos(a + spread), py + r * Math.sin(a + spread)]
      return { px, py, d: `M${px},${py} L${p1[0]},${p1[1]} A${r},${r} 0 0 1 ${p2[0]},${p2[1]} Z` }
    })()
    : null
  return (
    <div ref={box} className="relative" style={{ height: H }}>
      <MapImage src={view.url} alt="Satellite view of the field" className="absolute inset-0 h-full w-full object-cover" />
      <svg width={width} height={H} className="absolute inset-0">
        {field.kind === 'area' && (
          <polygon points={field.ring.map(([lon, lat]) => view.project(lat, lon).join(',')).join(' ')} fill="rgb(201 176 122 / 0.18)" stroke="var(--color-leaf)" strokeWidth={2} />
        )}
        {cone && (
          <>
            <path d={cone.d} className="cone-pulse" fill="rgb(159 178 138 / 0.25)" stroke="var(--color-orbit)" strokeWidth={1} />
            <circle cx={cone.px} cy={cone.py} r={6} fill="var(--color-orbit)" stroke="#0a0b0e" strokeWidth={2} />
          </>
        )}
        {field.kind === 'point' && <circle cx={fx} cy={fy} r={6} fill="var(--color-leaf)" stroke="#0a0b0e" strokeWidth={2} />}
      </svg>
      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
        <Chip className="!bg-void/75 backdrop-blur-sm">{field.kind === 'area' ? `your field · ${formatArea(field.areaHa)}` : 'your field'}</Chip>
        {pano && <Chip tone="info" className="!bg-void/75 backdrop-blur-sm">● camera</Chip>}
      </div>
      <div className="absolute right-3 bottom-2 font-mono text-[11px] text-white/60">{imageryCredit(field.lat, field.lon)}</div>
    </div>
  )
}

function TerrainFacts({ field, terrain }: { field: Field; terrain: Loadable<Terrain> }) {
  if (terrain.status !== 'ready') {
    return (
      <>
        <div className="col-span-full flex items-center gap-2 text-sm text-ink-3">
          <Mountain className="h-4 w-4" /> {terrain.status === 'error' ? 'Terrain unavailable' : 'Reading the terrain…'}
        </div>
      </>
    )
  }
  const t = terrain.data
  const risk = t.slopePct >= 6 ? 'high' : t.slopePct >= 3 ? 'moderate' : 'low'
  return (
    <>
      <div className="col-span-full flex items-center gap-2 text-sm text-ink">
        <Mountain className="h-4 w-4 text-wheat" /> Terrain <span className="font-mono text-[11px] text-ink-4">SRTM via AWS Terrain Tiles</span>
      </div>
      <Fact k="Elevation" v={`${Math.round(t.elevation)} m`} sub={field.kind === 'area' && t.max - t.min >= 1 ? `${Math.round(t.min)}-${Math.round(t.max)} m across` : undefined} />
      <Fact k="Mean slope" v={`${t.slopePct.toFixed(1)} %`} sub={`water-erosion risk ${risk}`} />
      <Fact k="Faces" v={t.aspect ?? 'flat'} sub={t.aspect ? 'downhill direction' : 'no dominant aspect'} icon={<Compass className="h-3.5 w-3.5" />} />
      <Fact k="Drainage" v={t.slopePct < 0.5 ? 'slow' : t.slopePct < 3 ? 'good' : 'fast'} sub={t.slopePct < 0.5 ? 'watch for waterlogging' : 'surface runoff'} />
    </>
  )
}

function NowFacts({ forecast }: { forecast: Loadable<Forecast> }) {
  if (forecast.status !== 'ready') {
    return <div className="flex items-center gap-2 text-sm text-ink-3"><Thermometer className="h-4 w-4" /> {forecast.status === 'error' ? 'Live weather unavailable' : 'Checking the weather…'}</div>
  }
  const n = forecast.data.now
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-ink">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-leaf" />
          </span>
          At the field right now
        </div>
        <span className="font-mono text-[11px] text-ink-4">Open-Meteo · {n.time.slice(11, 16)} local</span>
      </div>
      <div className="mt-3 flex items-end gap-4">
        <div className="font-display-soft text-5xl leading-none">{Math.round(n.temp)}°</div>
        <div className="pb-1 text-sm text-ink-2">
          {weatherLabel(n.code)} · humidity {Math.round(n.humidity)}% · wind {Math.round(n.wind)} km/h{n.rain > 0 ? ` · ${n.rain} mm rain` : ''}
        </div>
      </div>
    </div>
  )
}

function Fact({ k, v, sub, icon }: { k: string; v: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="kicker !text-[11px]">{k}</div>
      <div className="mt-1 flex items-center gap-1.5 text-lg text-ink">{icon}{v}</div>
      {sub && <div className="text-xs text-ink-3">{sub}</div>}
    </div>
  )
}

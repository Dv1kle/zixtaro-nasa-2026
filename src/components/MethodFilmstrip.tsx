// Method → How it works: the chain from satellite to advice as a filmstrip of the descent, every frame drawn from a
// real field run through the real engine - the demo field near Torgau, whose NASA POWER months, SoilGrids samples and
// past crops ship with the app (public/data/presets/torgau.json), so the frames are the same numbers the page shows
// for that field. On wide screens the strip is pinned and the reader's scroll pulls it sideways, frame by frame;
// on phones and under reduced motion the frames simply follow each other down the page.
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { airWarm } from '../lib/airCore'
import { analyzeClimate, parsePowerMonthly, type ClimateAnalysis } from '../lib/climate'
import { diverging } from '../lib/color'
import { CROP_BY_ID, FAMILY_LABEL, type CropId } from '../lib/crops'
import { signed, MONTHS_SHORT } from '../lib/format'
import { useMedia } from '../lib/hooks'
import { PRESETS } from '../lib/presets'
import { averageProfiles, parseSoilGrids, type SoilProfile } from '../lib/soil'
import { staticView } from '../lib/staticmap'
import { cropRisk, type CropRisk } from '../lib/water'

type Demo = { climate: ClimateAnalysis; soil: SoilProfile; risk: CropRisk; history: (CropId | null)[]; priorities: { soil: number; water: number; profit: number }; ring: [number, number][] }

const PRESET = PRESETS.find((p) => p.id === 'torgau')

function useDemo(): Demo | null {
  const [d, setD] = useState<Demo | null>(null)
  useEffect(() => {
    if (!PRESET) return
    let off = false
    fetch(`${import.meta.env.BASE_URL}data/presets/torgau.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (off || !b) return
        const f = PRESET.field
        const climate = analyzeClimate(parsePowerMonthly(b.power, f.lat), f.lat, f.lon)
        const soil = averageProfiles(b.soil.map(parseSoilGrids), b.samples)
        const risk = cropRisk(CROP_BY_ID.wheat, climate, soil)
        setD({ climate, soil, risk, history: PRESET.history, priorities: PRESET.priorities, ring: f.kind === 'area' ? (f.ring as [number, number][]) : [[f.lon, f.lat]] })
      })
      .catch(() => {})
    return () => {
      off = true
    }
  }, [])
  return d
}

// ---------- the frames' pictures ----------

const W = 640
const H = 400

/** 01 · orbit: the field from above, outlined, and under it the 45 years of its air as one strip */
function Orbit({ d }: { d: Demo }) {
  const view = useMemo(() => staticView(d.ring.map(([lon, lat]) => ({ lat, lon })), 1280, 800, 900, 0.9), [d.ring])
  const pts = d.ring.map(([lon, lat]) => view.project(lat, lon).map((v) => v / 2).join(',')).join(' ')
  const a = d.climate.anomalies
  const tMax = Math.max(1, ...a.map((x) => Math.abs(x.t)))
  return (
    <div className="relative h-full w-full">
      <img src={view.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ filter: 'saturate(0.55) contrast(1.08) brightness(0.72)' }} loading="lazy" />
      {/* the grade: cool slate in the shadows, the field itself the one warm thing */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgb(20 30 44 / 0.25), rgb(10 11 14 / 0.55))', mixBlendMode: 'multiply' }} />
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <polygon points={pts} fill="rgb(201 176 122 / 0.12)" stroke="var(--color-leaf)" strokeWidth={1.6} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 px-4 pt-10 pb-4" style={{ background: 'linear-gradient(180deg, transparent, rgb(10 11 14 / 0.9) 45%)' }}>
        <div className="flex h-5">
          {a.map((x) => <span key={x.year} className="h-full flex-1" style={{ background: airWarm(diverging(x.t, tMax)) }} title={`${x.year}: ${signed(x.t, 2, ' °C')}`} />)}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-3"><span>{a[0].year}</span><span>air temperature, each year against {d.climate.baseline.from}-{d.climate.baseline.to}</span><span>{a[a.length - 1].year}</span></div>
      </div>
    </div>
  )
}

/** 02 · evaporation: rain each month against what the air pulls out of the field */
function Thirst({ d }: { d: Demo }) {
  const m = d.climate.monthly.recent
  const max = Math.max(...m.map((x) => Math.max(x.p, x.pet))) * 1.12
  const pad = { l: 34, r: 14, t: 26, b: 30 }
  const bw = (W - pad.l - pad.r) / 12
  const X = (i: number) => pad.l + i * bw + bw / 2
  const Y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const pet = m.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.pet).toFixed(1)}`).join('')
  const gap = m.map((x, i) => ({ i, d: Math.max(0, x.pet - x.p) }))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {[50, 100, 150].filter((v) => v < max).map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--color-ink)" strokeOpacity={0.07} />
          <text x={pad.l - 6} y={Y(v) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">{v}</text>
        </g>
      ))}
      {gap.map((g) => g.d > 0 && <rect key={g.i} x={X(g.i) - bw * 0.42} width={bw * 0.84} y={Y(m[g.i].pet)} height={Y(m[g.i].p) - Y(m[g.i].pet)} fill="var(--color-heat)" opacity={0.13} />)}
      {m.map((x, i) => <rect key={i} x={X(i) - bw * 0.17} width={bw * 0.34} y={Y(x.p)} height={Y(0) - Y(x.p)} fill="var(--color-water)" />)}
      <path d={pet} fill="none" stroke="var(--color-heat)" strokeWidth={2} />
      {m.map((x, i) => <rect key={i} x={X(i) - 2.5} y={Y(x.pet) - 2.5} width={5} height={5} fill="var(--color-heat)" />)}
      {m.map((_, i) => <text key={i} x={X(i)} y={H - 10} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">{MONTHS_SHORT[i][0]}</text>)}
      <text x={pad.l} y={14} className="fill-ink-3 font-mono text-[10px]">mm a month, {d.climate.recent.from}-{d.climate.recent.to} · rain ▮ · demand ─ · the gap rain cannot cover ▒</text>
    </svg>
  )
}

/** a horizon's colour from its texture and carbon: sand pale, clay warm, organic matter dark */
function horizonTone(l: SoilProfile['layers'][number]) {
  const t = Math.max(1, l.sand + l.silt + l.clay)
  const mixc = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k)
  let c = [160 * l.sand, 138 * l.sand, 102 * l.sand].map((v, i) => (v + [118, 100, 75][i] * l.silt + [108, 75, 58][i] * l.clay) / t)
  c = mixc(c, [48, 33, 15], Math.min(0.85, 0.05 + 0.8 * Math.pow(Math.max(0, (l.soc - 1) / 22), 0.75)))
  return `rgb(${c.map((v) => Math.round(v)).join(' ')})`
}

/** 03 · the bucket: the soil to two metres, the roots' reach, the water held within it */
function Bucket({ d }: { d: Demo }) {
  const depth = CROP_BY_ID.wheat.rootDepth
  const top = 34
  const bottom = H - 22
  const Y = (cm: number) => top + (cm / 200) * (bottom - top)
  const x0 = 250
  const w = 120
  const lastLabel = { current: -99 }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {d.soil.layers.map((l, i) => {
        const h = Y(Math.min(200, l.bottom)) - Y(l.top)
        // thin topsoil horizons share one label: a depth is named only with room above it for its own
        const named = i === 0 || Y(l.top) - lastLabel.current >= 16
        if (named) lastLabel.current = Y(l.top)
        return (
          <g key={l.top}>
            <rect x={x0} y={Y(l.top)} width={w} height={h} fill={horizonTone(l)} />
            {named && <line x1={x0 - 10} x2={x0} y1={Y(l.top)} y2={Y(l.top)} stroke="var(--color-ink)" strokeOpacity={0.3} />}
            {named && <text x={x0 - 14} y={Y(l.top) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">{l.top} cm</text>}
            {h >= 14 && <text x={x0 + w + 14} y={Y(l.top) + h / 2 + 3} className="fill-ink-3 font-mono text-[10px]">sand {Math.round(l.sand)} · clay {Math.round(l.clay)} %</text>}
          </g>
        )
      })}
      {/* the cylinder's light on the profile */}
      <rect x={x0} y={Y(0)} width={w} height={Y(200) - Y(0)} fill="url(#bucket-shade)" />
      <defs>
        <linearGradient id="bucket-shade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#0a0b0e" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#fff3df" stopOpacity="0.08" />
          <stop offset="1" stopColor="#0a0b0e" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect x={x0 + 6} y={Y(0)} width={2.5} height={Y(depth * 100) - Y(0)} fill="var(--color-leaf)" opacity={0.9} />
      <line x1={x0} x2={x0 + w + 8} y1={Y(depth * 100)} y2={Y(depth * 100)} stroke="var(--color-leaf)" strokeWidth={1.2} strokeDasharray="4 3" />
      <text x={x0 + w + 14} y={Y(depth * 100) + 14} className="fill-leaf font-mono text-[10.5px]">winter wheat’s roots · {Math.round(depth * 100)} cm</text>
      <text x={x0 - 34} y={20} className="fill-ink-3 font-mono text-[10px]">SoilGrids horizons to 2 m · {d.soil.texture}</text>
    </svg>
  )
}

/** 04 · the harvest: winter wheat's yield lost to water stress, season by season */
function Harvest({ d }: { d: Demo }) {
  const ys = d.risk.byYear
  const pad = { l: 34, r: 12, t: 30, b: 28 }
  const max = Math.max(0.3, ...ys.map((y) => y.loss)) * 1.1
  const bw = (W - pad.l - pad.r) / ys.length
  const Y = (v: number) => pad.t + (v / max) * (H - pad.t - pad.b)
  const recent = d.climate.recent.from
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <line x1={pad.l} x2={W - pad.r} y1={pad.t} y2={pad.t} stroke="var(--color-ink)" strokeOpacity={0.3} />
      {[0.25, 0.5].filter((v) => v < max).map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--color-ink)" strokeOpacity={0.07} />
          <text x={pad.l - 6} y={Y(v) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">{v * 100}%</text>
        </g>
      ))}
      {/* each season a bar hanging from the line: how much of the harvest the dry spells took */}
      {ys.map((y, i) => (
        <rect key={y.year} x={pad.l + i * bw + bw * 0.18} width={bw * 0.64} y={pad.t} height={Math.max(0.5, Y(y.loss) - pad.t)} fill={y.year >= recent ? 'var(--color-wheat)' : 'var(--color-ink-3)'} opacity={y.year >= recent ? 1 : 0.55} />
      ))}
      {ys.filter((y) => y.year % 10 === 0).map((y) => (
        <text key={y.year} x={pad.l + ys.indexOf(y) * bw + bw / 2} y={H - 8} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">{y.year}</text>
      ))}
      <text x={pad.l} y={16} className="fill-ink-3 font-mono text-[10px]">share of the harvest lost to water stress, rainfed · {recent}-{ys[ys.length - 1].year} in wheat</text>
    </svg>
  )
}

/** 05 · rotation: the field's own last seasons, family by family, with the breaks the rules ask for */
function Rotation({ d }: { d: Demo }) {
  const seasons = d.history.filter((c): c is CropId => !!c).map((c) => CROP_BY_ID[c])
  return (
    <div className="flex h-full flex-col justify-center gap-6 px-6 sm:px-10">
      <div className="font-mono text-[10px] text-ink-3">the last seasons on this field, oldest first</div>
      <ol className="flex items-end gap-2 sm:gap-3">
        {seasons.map((c, i) => (
          <li key={i} className="flex flex-1 flex-col gap-2">
            <span className="font-display-soft text-[clamp(1.8rem,4vw,3.2rem)] leading-none text-ink">{c.symbol}</span>
            <span className="h-[3px]" style={{ background: c.family === 'poaceae' ? 'var(--color-wheat)' : c.family === 'brassicaceae' ? 'var(--color-orbit)' : 'var(--color-water)' }} />
            <span className="font-mono text-[10px] leading-snug text-ink-3">{c.name}<br />{FAMILY_LABEL[c.family]}</span>
          </li>
        ))}
        <li className="flex flex-1 flex-col gap-2">
          <span className="font-display-soft text-[clamp(1.8rem,4vw,3.2rem)] leading-none text-leaf">?</span>
          <span className="h-[3px] bg-leaf" />
          <span className="font-mono text-[10px] leading-snug text-leaf">next season<br />ranked here</span>
        </li>
      </ol>
    </div>
  )
}

/** 06 · your priorities: three weights, one score you can take apart */
function Priorities({ d }: { d: Demo }) {
  const rows: [string, number][] = [['soil', d.priorities.soil], ['water', d.priorities.water], ['profit', d.priorities.profit]]
  return (
    <div className="flex h-full flex-col justify-center gap-5 px-6 sm:px-10">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-4">
          <span className="font-display-soft text-2xl leading-none uppercase">{k}</span>
          <span className="relative h-px bg-ink/20"><span className="absolute inset-y-[-1px] left-0 bg-leaf" style={{ width: `${v}%` }} /></span>
          <span className="text-right font-mono text-xs text-ink-2">{v}</span>
        </div>
      ))}
      <div className="mt-3 border-t border-ink/15 pt-4 font-mono text-[11px] text-ink-3">the demo field’s sliders · every crop’s score splits back into these three</div>
    </div>
  )
}

// ---------- the strip ----------

type Frame = { k: string; title: string; caption: (d: Demo) => ReactNode; source: string; pic: (d: Demo) => ReactNode }

const FRAMES: Frame[] = [
  {
    k: 'NASA POWER',
    title: 'From orbit',
    caption: (d) => <>The field’s weather is NASA POWER’s cell around it, every month since {d.climate.firstYear}: rain, temperature, sunlight, humidity, wind. Here it ran <b className="font-normal text-ink">{signed(d.climate.means.recent.t - d.climate.means.baseline.t, 1, ' °C')}</b> warmer in {d.climate.recent.from}-{d.climate.recent.to} than in {d.climate.baseline.from}-{d.climate.baseline.to}.</>,
    source: 'NASA POWER · MERRA-2 · 0.5° × 0.625° · imagery Sentinel-2 (ESA Copernicus, mosaic by EOX)',
    pic: (d) => <Orbit d={d} />,
  },
  {
    k: 'Evaporation · FAO-56',
    title: 'What the air takes',
    caption: () => <>Penman-Monteith turns the sunlight, humidity and wind into the water the air pulls out of the field. Where the red line stands above the rain, the soil has to pay the difference.</>,
    source: 'FAO-56 reference ET₀ from NASA POWER radiation, humidity and wind',
    pic: (d) => <Thirst d={d} />,
  },
  {
    k: 'Root-zone bucket',
    title: 'What the soil holds',
    caption: (d) => <>SoilGrids’ horizons say how much water the ground can hold; the crop’s roots say how much of it is within reach - here <b className="font-normal text-ink">{Math.round(d.risk.taw)} mm</b> for winter wheat.</>,
    source: 'ISRIC SoilGrids 2.0 · 250 m · averaged over the field’s samples',
    pic: (d) => <Bucket d={d} />,
  },
  {
    k: 'Yield loss · FAO-33',
    title: 'What the harvest loses',
    caption: (d) => {
      const ys = d.risk.byYear
      const mean = (f: (y: (typeof ys)[number]) => boolean) => { const s = ys.filter(f); return s.length ? s.reduce((a, y) => a + y.loss, 0) / s.length : 0 }
      return <>Every season since {ys[0].year} is replayed in 10-day steps: the water the crop wanted, the water it got, and the share of the harvest the shortfall cost - <b className="font-normal text-ink">{Math.round(100 * mean((y) => y.year < d.climate.recent.from))} %</b> on average before {d.climate.recent.from}, <b className="font-normal text-wheat">{Math.round(100 * mean((y) => y.year >= d.climate.recent.from))} %</b> since.</>
    },
    source: 'FAO-33 yield response to water (Kʏ) · a 10-day soil-water balance',
    pic: (d) => <Harvest d={d} />,
  },
  {
    k: 'Rotation rules',
    title: 'What came before',
    caption: () => <>Plant families, break intervals, disease bridges and nitrogen: the field’s own past seasons decide what may follow - as risks on show, never hidden points.</>,
    source: 'common agronomic guidance · the field’s recorded seasons',
    pic: (d) => <Rotation d={d} />,
  },
  {
    k: 'Your priorities',
    title: 'One score, taken apart',
    caption: () => <>Soil, water and profit are weighed the way you set them; the score of every crop splits back into exactly these three, so any pick can be argued with.</>,
    source: 'your sliders · FAOSTAT prices for the profit axis',
    pic: (d) => <Priorities d={d} />,
  },
]

function FrameCard({ f, i, d, wide }: { f: Frame; i: number; d: Demo; wide: boolean }) {
  return (
    <figure className={`flex flex-col ${wide ? 'h-full w-[min(64vw,980px)] shrink-0' : ''}`}>
      <div className={`relative overflow-hidden bg-space ${wide ? 'min-h-0 flex-1' : 'aspect-[16/10]'}`}>
        {f.pic(d)}
      </div>
      <figcaption className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,15rem)_1fr]">
        <div>
          <div className="font-mono text-[10.5px] tracking-wide text-leaf uppercase">
            <span className="text-ink-4">{String(i + 1).padStart(2, '0')} / {String(FRAMES.length).padStart(2, '0')} · </span>
            {f.k}
          </div>
          <div className="mt-1.5 font-display-soft text-[clamp(1.6rem,2.6vw,2.4rem)] leading-[0.9] uppercase">{f.title}</div>
        </div>
        <div>
          <p className="max-w-[56ch] text-[15px] leading-relaxed text-pretty text-ink-2">{f.caption(d)}</p>
          <div className="mt-2 font-mono text-[10.5px] text-ink-4">{f.source}</div>
        </div>
      </figcaption>
    </figure>
  )
}

const CAPTION = 'The chain from satellite to advice, drawn from the demo field near Torgau, Saxony (its data ship with the app)'

/** wide screens: the strip pinned, the reader's scroll pulling it sideways frame by frame (mounted once the data is
 *  in, so the scroll tracking binds to a runway that exists) */
function WideStrip({ d, scroller }: { d: Demo; scroller: RefObject<HTMLDivElement | null> }) {
  const runway = useRef<HTMLElement>(null)
  const [span, setSpan] = useState(0)
  const [at, setAt] = useState(0)
  const { scrollYProgress } = useScroll({ container: scroller, target: runway, offset: ['start start', 'end end'] })
  const x = useTransform(scrollYProgress, (v) => -v * span)
  useMotionValueEvent(scrollYProgress, 'change', (v) => setAt(Math.min(FRAMES.length - 1, Math.round(v * (FRAMES.length - 1)))))
  // how far the strip travels: every frame but the last, at the frames' own width and gap (min(64vw, 980px), 6vw)
  useEffect(() => {
    const measure = () => setSpan((FRAMES.length - 1) * (Math.min(innerWidth * 0.64, 980) + innerWidth * 0.06))
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [])
  return (
    <section aria-label={CAPTION} ref={runway} className="relative mt-10" style={{ height: `${FRAMES.length * 85}vh` }}>
      <div className="sticky top-[112px] flex h-[calc(100vh-112px)] flex-col justify-center overflow-hidden">
        <div className="mb-6 flex items-baseline justify-between gap-6">
          <p className="font-mono text-[11px] text-ink-4">{CAPTION}.</p>
          {/* the strip's own counter: a frame per stage of the chain */}
          <ol className="flex gap-1.5" aria-hidden>
            {FRAMES.map((f, i) => <li key={f.k} className={`h-[3px] w-8 transition-colors duration-300 ${i <= at ? 'bg-leaf' : 'bg-ink/15'}`} />)}
          </ol>
        </div>
        <div className="relative h-[min(72vh,700px)]">
          <motion.div className="flex h-full gap-[6vw]" style={{ x }}>
            {FRAMES.map((f, i) => <FrameCard key={f.k} f={f} i={i} d={d} wide />)}
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export function MethodFilmstrip({ scroller }: { scroller: RefObject<HTMLDivElement | null> }) {
  const d = useDemo()
  const reduce = useReducedMotion()
  const wide = useMedia('(min-width: 1024px)') && !reduce
  if (!d) return <div className="mt-16 h-[50vh] animate-pulse bg-space/60" aria-hidden />
  if (wide) return <WideStrip d={d} scroller={scroller} />
  return (
    <section aria-label={CAPTION} className="mt-16 space-y-16">
      <p className="font-mono text-[11px] text-ink-4">{CAPTION}.</p>
      {FRAMES.map((f, i) => <FrameCard key={f.k} f={f} i={i} d={d} wide={false} />)}
    </section>
  )
}

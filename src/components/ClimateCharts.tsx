import { useReducedMotion } from 'motion/react'
import { lazy, Suspense, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { airWarm, airWet } from '../lib/airCore'
import type { ClimateAnalysis } from '../lib/climate'
import { diverging } from '../lib/color'
import { MONTHS_SHORT, signed } from '../lib/format'
import { useMedia, useWidth } from '../lib/hooks'
import { useNear } from '../lib/prewarm'
import { mean, median, senSlope } from '../lib/stats'

// ---------- The air core: 45 years of this field's air as one object ----------
//
// The years are cast as layers in two clear resin cores (AirCore3D, a lazy three.js object): air temperature in the
// large one, the growing-season water balance in the slim one behind. This wrapper keeps everything that is not the
// picture: the keys, the year readout, the keyboard (one slider: arrows, Page Up/Down, Home/End, Escape), a table for
// screen readers, and a flat crisp strip wherever WebGL is missing or before the object has loaded.

const AirCore3D = lazy(() => import('./AirCore3D'))
// the object has no frame: it dissolves into the page on all four sides
const CORE_FADE = 'linear-gradient(90deg, transparent, #000 11%, #000 89%, transparent), linear-gradient(180deg, transparent, #000 16%, #000 82%, transparent)'
const CORE_MASK = { maskImage: CORE_FADE, WebkitMaskImage: CORE_FADE, maskComposite: 'intersect', WebkitMaskComposite: 'source-in' } as const

/** a small, crisp key for one core: the ramp end to end with its scale */
function CoreKey({ kind, max, label }: { kind: 't' | 'cwb'; max: number; label: string }) {
  const r = kind === 't' ? airWarm : airWet
  const stops = Array.from({ length: 9 }, (_, i) => `${r(i / 8)} ${(i / 8) * 100}%`).join(', ')
  const lo = kind === 't' ? `−${max.toFixed(1)} °C` : `−${Math.round(max)} mm`
  const hi = kind === 't' ? `+${max.toFixed(1)} °C` : `+${Math.round(max)} mm`
  return (
    <div className="flex items-center gap-2.5 font-mono text-[10.5px] text-ink-3">
      <span className="w-28 text-ink-2 sm:w-auto">{label}</span>
      <span className="hidden sm:inline">{lo}</span>
      <i aria-hidden className="block h-1.5 w-16 sm:w-24" style={{ background: `linear-gradient(90deg, ${stops})` }} />
      <span className="hidden sm:inline">{hi}</span>
    </div>
  )
}

/** the flat stand-in: the same layers as two crisp bands (no WebGL, or while the object loads) */
function FlatCore({ years, tMax, wMax, focus, laidTo }: { years: { year: number; t: number; cwb: number }[]; tMax: number; wMax: number; focus: number | null; laidTo: number }) {
  const n = years.length
  return (
    <svg viewBox={`0 0 ${n} 10`} preserveAspectRatio="none" className="block h-full w-full" shapeRendering="crispEdges" aria-hidden>
      {years.map((y, i) => (
        <g key={y.year} opacity={i <= laidTo ? 1 : 0.08}>
          <rect x={i} y={3} width={1} height={3.4} fill={airWarm(diverging(y.t, tMax))} />
          <rect x={i} y={7} width={1} height={1.4} fill={airWet(diverging(y.cwb, wMax))} />
        </g>
      ))}
      {focus !== null && <rect x={focus + 0.45} y={2.4} width={0.1} height={6.6} fill="var(--color-leaf)" />}
    </svg>
  )
}

export function Stripes({ climate, activeYear, onHover }: { climate: ClimateAnalysis; activeYear: number | null; onHover?: (year: number | null) => void }) {
  const host = useRef<HTMLDivElement>(null)
  // the object is made ahead of the reader (in a pause of the scrolling, or as the core comes near) and then kept
  const near = useNear(host, { margin: '60% 0px' })
  const reduce = !!useReducedMotion()
  const touch = useMedia('(hover: none)')
  // where the page's scroll is driven frame by frame (lib/scroll: a fine pointer, a desktop's width, motion on) the
  // object is drawn on the canvas the scenes share; elsewhere it keeps a canvas of its own (see AirCore3D)
  const shared = useMedia('(pointer: fine) and (min-width: 1024px)') && !reduce
  const [hover, setHover] = useState<number | null>(null)
  const [noGl, setNoGl] = useState(false)
  const a = climate.anomalies
  const n = a.length
  const tMax = Math.max(1, ...a.map((x) => Math.abs(x.t)))
  const wMax = Math.max(60, ...a.map((x) => Math.abs(x.cwb)))
  const active = activeYear !== null ? a.findIndex((x) => x.year === activeYear) : -1
  const focus = hover ?? (active >= 0 ? active : null)
  // the Play sweep and the desktop scroll cast the core up to their year; a hover shows it whole
  const laidTo = activeYear !== null && hover === null && active >= 0 ? active : n - 1

  const pick = (i: number | null) => {
    if (i === hover) return
    setHover(i)
    onHover?.(i === null ? null : a[i].year)
  }
  const onPick = (i: number | null, mouse: boolean) => {
    // a tap keeps its year until another tap; a hover follows the pointer
    if (i === null && !mouse) return
    pick(i)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = focus ?? n - 1
    const to: Record<string, number> = { ArrowLeft: cur - 1, ArrowDown: cur - 1, ArrowRight: cur + 1, ArrowUp: cur + 1, PageDown: cur - 10, PageUp: cur + 10, Home: 0, End: n - 1 }
    if (e.key === 'Escape') return pick(null)
    if (!(e.key in to)) return
    e.preventDefault()
    pick(Math.min(n - 1, Math.max(0, to[e.key])))
  }

  const h = focus !== null ? a[focus] : null
  // where the year in focus stands among all of them - said only when it is one of the extremes
  const warmRank = h ? [...a].sort((p, q) => q.t - p.t).findIndex((x) => x.year === h.year) + 1 : 0
  const coldRank = h ? n + 1 - warmRank : 0
  const dryRank = h ? [...a].sort((p, q) => p.cwb - q.cwb).findIndex((x) => x.year === h.year) + 1 : 0
  const wetRank = h ? n + 1 - dryRank : 0
  const tag = (rank: number, word: string) => (rank <= 5 ? <span className="text-ink-3"> · {rank === 1 ? `the ${word}` : `${word} #${rank}`} of {n}</span> : null)
  const valueText = h ? `${h.year}: air ${signed(h.t, 2, ' °C')} against ${climate.baseline.from}-${climate.baseline.to}, water balance ${signed(h.cwb, 0, ' mm')}` : 'no year selected'
  const flat = <FlatCore years={a} tMax={tMax} wMax={wMax} focus={focus} laidTo={laidTo} />

  return (
    <div ref={host} className="relative">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
        <CoreKey kind="t" max={tMax} label={`air at 2 m vs ${climate.baseline.from}-${climate.baseline.to}`} />
        <CoreKey kind="cwb" max={wMax} label={`water balance, ${climate.season.label}`} />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={`The air over this field, ${climate.firstYear}-${climate.lastYear}: one layer per year`}
        aria-valuemin={climate.firstYear}
        aria-valuemax={climate.lastYear}
        aria-valuenow={h?.year ?? climate.lastYear}
        aria-valuetext={valueText}
        onKeyDown={onKey}
        onBlur={() => hover !== null && pick(null)}
        className="relative mt-2 -mx-5 h-[240px] outline-none focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-leaf/60 sm:mx-0 sm:h-[400px] lg:h-[460px]"
        style={CORE_MASK}
      >
        {near && !noGl ? (
          <Suspense fallback={<div className="flex h-full items-center px-4 sm:px-0">{flat}</div>}>
            <AirCore3D years={a} tMax={tMax} wMax={wMax} focus={focus} laidTo={laidTo} reduce={reduce} onPick={onPick} onFail={() => setNoGl(true)} shared={shared} />
          </Suspense>
        ) : (
          <div className="flex h-full items-center px-4 sm:px-0">{flat}</div>
        )}
      </div>

      <div className="mt-2 flex min-h-12 flex-wrap items-baseline gap-x-6 gap-y-1" aria-live="polite">
        {h ? (
          <>
            <span className="font-display-soft text-5xl leading-none text-ink tabular-nums">{h.year}</span>
            <span className="num text-sm text-ink-2">
              air <span className={h.t > 0 ? 'text-heat' : 'text-water'}>{signed(h.t, 2, ' °C')}</span>
              {h.t > 0 ? tag(warmRank, 'warmest') : tag(coldRank, 'coldest')}
            </span>
            <span className="num text-sm text-ink-2">
              water balance <span className={h.cwb < 0 ? 'text-wheat' : 'text-water'}>{signed(h.cwb, 0, ' mm')}</span>
              {h.cwb < 0 ? tag(dryRank, 'driest') : tag(wetRank, 'wettest')}
            </span>
          </>
        ) : (
          <span className="text-sm text-ink-3">
            {touch ? 'Tap' : 'Run the pointer along'} the core - each layer is a year of NASA POWER data for this exact field{touch ? '' : '; arrow keys step through them'}.
          </span>
        )}
      </div>

      {/* the same data as a table, for screen readers */}
      <table className="sr-only">
        <caption>Air temperature anomaly and growing-season water balance per year, {climate.firstYear}-{climate.lastYear}</caption>
        <thead>
          <tr><th>Year</th><th>Air temperature anomaly (°C)</th><th>Water balance anomaly (mm)</th></tr>
        </thead>
        <tbody>
          {a.map((x) => (
            <tr key={x.year}><td>{x.year}</td><td>{signed(x.t, 2)}</td><td>{signed(x.cwb, 0)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Root-zone wetness with the driest seasons called out ----------

export function WetnessChart({ climate, activeYear = null, onHover }: { climate: ClimateAnalysis; activeYear?: number | null; onHover?: (year: number | null) => void }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const height = 290
  const pad = { l: 44, r: 16, t: 20, b: 48 }
  const ys = climate.years.filter((y) => Number.isFinite(y.wGS))
  const vals = ys.map((y) => y.wGS)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo || 0.1
  const y0 = lo - span * 0.1
  const y1 = hi + span * 0.12
  const X = (year: number) => pad.l + ((year - ys[0].year) / (ys[ys.length - 1].year - ys[0].year)) * (width - pad.l - pad.r)
  const Y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (height - pad.t - pad.b)
  const base = ys.filter((y) => y.year >= climate.baseline.from && y.year <= climate.baseline.to).map((y) => y.wGS)
  const bMean = mean(base)
  const bSd = Math.sqrt(mean(base.map((v) => (v - bMean) ** 2)))
  const driest = new Set(climate.driest.slice(0, 5).map((d) => d.year))
  // Sen's line: median slope, intercept = median residual
  const slope = senSlope(vals, ys.map((y) => y.year))
  const intercept = median(ys.map((y) => y.wGS - slope * y.year))
  const trendAt = (year: number) => intercept + slope * year
  const line = ys.map((y, i) => `${i ? 'L' : 'M'}${X(y.year).toFixed(1)},${Y(y.wGS).toFixed(1)}`).join('')
  const ticks = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1]
  // the year under the pointer (nearest dot), so the other charts can follow it
  const yearAt = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    const t = Math.min(1, Math.max(0, (px - pad.l) / (width - pad.l - pad.r)))
    const want = ys[0].year + t * (ys[ys.length - 1].year - ys[0].year)
    return ys.reduce((best, y) => (Math.abs(y.year - want) < Math.abs(best.year - want) ? y : best), ys[0]).year
  }
  // the active year, read off the dot: its wetness and, for the five driest, its rank
  const active = activeYear !== null ? ys.find((y) => y.year === activeYear) : undefined
  const rank = active ? climate.driest.findIndex((d) => d.year === active.year) + 1 : 0
  const labelY = active ? (Y(active.wGS) - 12 < pad.t + 6 ? Y(active.wGS) + 20 : Y(active.wGS) - 12) : 0
  // Driest-year labels sit on one row under the plot: neighbours are pushed apart (and back from the right edge),
  // a leader joins each label to its dot.
  const band = height - pad.b + 20
  const gap = 34
  const labels = ys.filter((y) => driest.has(y.year)).map((y) => ({ year: y.year, x: X(y.year), lx: X(y.year), v: y.wGS }))
  for (let i = 1; i < labels.length; i++) labels[i].lx = Math.max(labels[i].lx, labels[i - 1].lx + gap)
  const over = labels.length ? labels[labels.length - 1].lx - (width - pad.r) : 0
  if (over > 0) {
    labels[labels.length - 1].lx -= over
    for (let i = labels.length - 2; i >= 0; i--) labels[i].lx = Math.min(labels[i].lx, labels[i + 1].lx - gap)
  }

  return (
    <div ref={box} className="w-full min-w-0">
      <svg
        width={width}
        height={height}
        className="block overflow-visible"
        onPointerMove={(e) => e.pointerType === 'mouse' && onHover?.(yearAt(e))}
        onPointerDown={(e) => e.pointerType !== 'mouse' && onHover?.(yearAt(e))}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onHover?.(null)}
      >
        <rect x={pad.l} width={width - pad.l - pad.r} y={Y(bMean + bSd)} height={Y(bMean - bSd) - Y(bMean + bSd)} fill="rgb(95 208 243 / 0.08)" />
        <line x1={pad.l} x2={width - pad.r} y1={Y(bMean)} y2={Y(bMean)} stroke="rgb(95 208 243 / 0.45)" strokeDasharray="3 4" />
        <text x={width - pad.r} y={Y(bMean + bSd) - 6} textAnchor="end" className="fill-water/70 font-mono text-[10px]">
          {climate.baseline.from}-{climate.baseline.to} normal ± 1σ
        </text>
        {ticks.map((t) => (
          <text key={t} x={pad.l - 8} y={Y(t) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">
            {t.toFixed(2)}
          </text>
        ))}
        <path d={line} fill="none" stroke="rgb(255 255 255 / 0.28)" strokeWidth={1.2} />
        <line
          x1={X(ys[0].year)} x2={X(ys[ys.length - 1].year)}
          y1={Y(trendAt(ys[0].year))} y2={Y(trendAt(ys[ys.length - 1].year))}
          stroke="var(--color-heat)" strokeWidth={1.5} strokeDasharray="6 5" opacity={0.8}
        />
        {labels.map((l) => (
          <line key={l.year} x1={l.x} x2={l.lx} y1={Y(l.v) + 6} y2={band - 10} stroke="rgb(255 123 84 / 0.4)" strokeDasharray="2 2" />
        ))}
        {activeYear !== null && ys.some((y) => y.year === activeYear) && (
          <line x1={X(activeYear)} x2={X(activeYear)} y1={pad.t} y2={height - pad.b} stroke="white" strokeOpacity={0.7} strokeWidth={1.5} />
        )}
        {ys.map((y) => (
          <circle
            key={y.year}
            cx={X(y.year)}
            cy={Y(y.wGS)}
            r={y.year === activeYear ? 6.5 : driest.has(y.year) ? 5 : 2.6}
            fill={y.year === activeYear ? 'white' : driest.has(y.year) ? 'var(--color-heat)' : 'rgb(255 255 255 / 0.7)'}
            opacity={activeYear !== null && y.year > activeYear ? 0.15 : 1}
          />
        ))}
        {labels.map((l) => (
          <text key={l.year} x={l.lx} y={band} textAnchor="middle" className="fill-heat font-mono text-[10.5px]">
            {l.year}
          </text>
        ))}
        {active && (
          // beside the cursor line, not across it: right of it, or left of it in the right half of the chart
          <text
            x={X(active.year) > pad.l + (width - pad.l - pad.r) * 0.55 ? X(active.year) - 9 : X(active.year) + 9}
            y={labelY}
            textAnchor={X(active.year) > pad.l + (width - pad.l - pad.r) * 0.55 ? 'end' : 'start'}
            className="fill-ink font-mono text-[10.5px]"
            style={{ paintOrder: 'stroke', stroke: 'rgb(3 5 10 / 0.85)', strokeWidth: 4 }}
          >
            {active.year} · {active.wGS.toFixed(2)}{rank > 0 && rank <= 5 ? ` · driest #${rank}` : ''}
          </text>
        )}
        {ys.filter((y) => y.year % 10 === 0).map((y) => (
          <text key={y.year} x={X(y.year)} y={height - 4} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">
            {y.year}
          </text>
        ))}
      </svg>
    </div>
  )
}

// ---------- Rain vs evaporative demand, month by month ----------

export function WaterCalendar({ climate }: { climate: ClimateAnalysis }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const height = 260
  const pad = { l: 40, r: 10, t: 16, b: 28 }
  const { baseline, recent } = climate.monthly
  const max = Math.max(...recent.map((m) => Math.max(m.p, m.pet)), ...baseline.map((m) => Math.max(m.p, m.pet))) * 1.1
  const bw = (width - pad.l - pad.r) / 12
  const X = (i: number) => pad.l + i * bw
  const Y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b)
  const petLine = (ms: typeof recent) => ms.map((m, i) => `${i ? 'L' : 'M'}${(X(i) + bw / 2).toFixed(1)},${Y(m.pet).toFixed(1)}`).join('')
  const demandArea =
    `M${X(0) + bw / 2},${Y(0)} ` +
    recent.map((m, i) => `L${(X(i) + bw / 2).toFixed(1)},${Y(m.pet).toFixed(1)}`).join(' ') +
    ` L${X(11) + bw / 2},${Y(0)} Z`
  const ticks = useMemo(() => {
    const step = max > 160 ? 50 : 25
    return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step).filter((v) => v > 0)
  }, [max])

  return (
    <div ref={box} className="w-full min-w-0">
      <svg width={width} height={height} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgb(255 255 255 / 0.05)" />
            <text x={pad.l - 8} y={Y(t) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">
              {t}
            </text>
          </g>
        ))}
        <defs>
          <linearGradient id="demand-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgb(255 123 84 / 0.28)" />
            <stop offset="1" stopColor="rgb(255 123 84 / 0.02)" />
          </linearGradient>
        </defs>
        <path d={demandArea} fill="url(#demand-fill)" />
        {recent.map((m, i) => (
          <g key={i}>
            <rect x={X(i) + bw * 0.22} width={bw * 0.56} y={Y(baseline[i].p)} height={Y(0) - Y(baseline[i].p)} fill="none" stroke="rgb(95 208 243 / 0.45)" strokeDasharray="2 2" rx={3} />
            <rect x={X(i) + bw * 0.3} width={bw * 0.4} y={Y(m.p)} height={Y(0) - Y(m.p)} fill="var(--color-water)" opacity={0.85} rx={3} />
            <text x={X(i) + bw / 2} y={height - 8} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">
              {MONTHS_SHORT[i][0]}
            </text>
          </g>
        ))}
        <path d={petLine(baseline)} fill="none" stroke="var(--color-heat)" strokeOpacity={0.45} strokeDasharray="4 4" strokeWidth={1.5} />
        <path d={petLine(recent)} fill="none" stroke="var(--color-heat)" strokeWidth={2.4} />
        {recent.map((m, i) => (
          <circle key={i} cx={X(i) + bw / 2} cy={Y(m.pet)} r={2.8} fill="var(--color-heat)" />
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-ink-3">
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-water" />rain {climate.recent.from}-{climate.recent.to}</span>
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm border border-dashed border-water/60" />rain {climate.baseline.from}-{climate.baseline.to}</span>
        <span className="flex items-center gap-2"><i className="h-0.5 w-4 bg-heat" />evaporative demand (FAO-56 ET₀)</span>
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-heat/25" />demand rain can’t cover</span>
      </div>
    </div>
  )
}

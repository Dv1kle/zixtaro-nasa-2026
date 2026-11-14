import { Droplets } from 'lucide-react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import { graceFor, type GraceHere, type GraceSeries } from '../lib/grace'
import { mix } from '../lib/color'
import type { Crop } from '../lib/crops'
import type { Loadable } from '../lib/hooks'
import { rootZoneWater, TEXTURE_CLASSES, TEXTURE_POLYGONS, tankLabel, trianglePoint, type SoilLayer, type SoilProfile, type TextureClass, type LabSoil } from '../lib/soil'
import { useWidth } from '../lib/hooks'
import { formatArea, type Field } from '../lib/geo'
import { staticView } from '../lib/staticmap'
import { Instrument, usePlate } from './Instrument'
import { LAB_LABEL, SoilLabForm } from './SoilLabForm'
import { Chip, ErrorBox, Reveal, SectionHeader, Skeleton, MapImage } from './ui'

type Props = {
  field: Field
  progress: { done: number; total: number }
  state: Loadable<SoilProfile>
  soil: SoilProfile | null // effective profile (SoilGrids or manual)
  texture: TextureClass | null
  setTexture: (t: TextureClass | null) => void
  lab: LabSoil
  setLab: (l: LabSoil) => void
  climate: ClimateAnalysis | null
  roots: Crop[]
  presetId: string | null
  /** a pinned crossing stands before the section: as a plate it rides up over that scene (story mode) */
  over?: boolean
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function SoilSection({ field, progress, state, soil, texture, setTexture, lab, setLab, climate, roots, presetId, over = false }: Props) {
  const plate = usePlate(over)
  const peakEt = climate ? Math.max(...climate.monthly.recent.map((m) => m.pet / 30.4)) : null
  const days = soil && peakEt ? Math.round(soil.paw100 / peakEt) : null
  const title = soil ? (
    <>
      {cap(soil.texture)}: <em className="text-wheat">{tankLabel(soil.paw100)}</em>.
    </>
  ) : state.status === 'error' ? (
    'No soil map here.'
  ) : (
    'Probing the soil…'
  )
  const dek = soil
    ? `${soil.source === 'provisional' ? 'SoilGrids is slow to answer, so for now this is a typical loam - the plan will refine itself when real soil data arrives, or set your texture below' : soil.source === 'manual' ? 'Using the texture you chose' : `The soil map (SoilGrids) puts ${Math.round(soil.top.sand)}% sand in the topsoil${soil.variability ? ` (average of ${soil.variability.samples.length} samples across the field)` : ''}`}. The top metre holds about ${Math.round(soil.paw100)} mm of water crops can use${days ? ` - enough for ${days} days of midsummer weather` : ''}. Deep roots reach more of it; shallow ones run dry first.`
    : undefined

  return (
    <section id="roots" className={`sec-soil relative scroll-mt-16 overflow-hidden px-5 pt-16 pb-16 sm:pt-24 sm:pb-20 sm:px-8 lg:pl-28 xl:pl-36 ${plate.root}`}>
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col">
        <SectionHeader step={plate.story ? 'Step 3 of 4 · the soil under it' : undefined} kicker="Root zone" altitude="−0.6 m · below ground" title={title} dek={dek} />
        <Instrument
          title={soil ? `${cap(soil.texture)} · the root zone` : 'The root zone'}
          kicker="Instrument · −0.6 m"
          label="Open the soil instrument"
          facts={
            soil
              ? [
                  { value: Math.round(soil.paw100), unit: 'mm', label: 'water crops can reach in the top metre' },
                  ...(days ? [{ value: days, unit: 'days', label: 'of midsummer weather that covers' }] : []),
                  { value: (soil.top.soc / 10).toFixed(1), unit: '%', label: 'carbon (humus) in the topsoil' },
                ]
              : []
          }
        >
        {field.kind === 'area' && progress.total > 1 && !texture && (
          <Reveal className="mt-10">
            <FieldSamples field={field} soil={soil} progress={progress} />
          </Reveal>
        )}

        {state.status === 'loading' && !soil && (
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[520px]" />
            <Skeleton className="h-[520px]" />
          </div>
        )}
        {state.status === 'error' && !texture && (
          <div className="mt-10 space-y-4">
            <ErrorBox title="SoilGrids has no profile for this point" error={state.error} />
            <TexturePicker texture={texture} setTexture={setTexture} canReset={false} />
          </div>
        )}

        {soil && (
          <div className="mt-14 grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
            {/* the lab test edits this profile, so it sits under it; the texture override stays by the triangle */}
            <div className="flex min-w-0 flex-col gap-4">
              <Reveal className="panel p-5 sm:p-7">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[15px] text-ink">Soil profile & root reach</div>
                  <div className="font-mono text-[11px] text-ink-3">0-200 cm · bar area = plant-available water</div>
                </div>
                <SoilColumn soil={soil} roots={roots} />
              </Reveal>
              <Reveal delay={0.1}>
                <SoilLabForm soil={soil} lab={lab} setLab={setLab} />
              </Reveal>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <Reveal delay={0.08} className="panel p-5 sm:p-7">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[15px] text-ink">USDA texture triangle</div>
                  <div className="font-mono text-[11px] text-ink-3">● 0-30 cm ○ 30-100 cm</div>
                </div>
                <TextureTriangle soil={soil} />
              </Reveal>
              <Reveal delay={0.14} className="panel grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4 sm:p-6 lg:grid-cols-2">
                <Fact label="Water in 1 m" value={`${Math.round(soil.paw100)}`} unit="mm" />
                <Fact label="pH (water)" value={soil.top.ph.toFixed(1)} lab={soil.lab?.includes('ph')} />
                <Fact label="Organic carbon" value={(soil.top.soc / 10).toFixed(1)} unit="%" lab={soil.lab?.includes('soc')} />
                <Fact label="Bulk density" value={soil.top.bd.toFixed(2)} unit="g/cm³" lab={soil.lab?.includes('bd')} />
              </Reveal>
              <Reveal delay={0.2}>
                <TexturePicker texture={texture} setTexture={setTexture} canReset={state.status === 'ready'} />
              </Reveal>
            </div>
          </div>
        )}
        <GracePanel lat={field.lat} lon={field.lon} presetId={presetId} />

        {soil && (
          <p className="mt-8 font-mono text-[11px] leading-relaxed text-ink-4">
            {soil.source === 'manual'
              ? 'Representative profile for the chosen texture class'
              : 'ISRIC SoilGrids 2.0 · 250 m · mean predictions (model-based, uncertainty is real)'}
            {soil.lab?.length ? ` · topsoil ${soil.lab.map((k) => LAB_LABEL[k]).join(', ')} from your lab test` : ''}{' '}
            · plant-available water via Saxton & Rawls (2006) pedotransfer functions
          </p>
        )}
        </Instrument>
      </div>
    </section>
  )
}

function Fact({ label, value, unit, lab = false }: { label: string; value: string; unit?: string; lab?: boolean }) {
  return (
    <div>
      <div className="kicker !text-[11px]">{label}{lab && <span className="ml-1.5 text-wheat">· lab</span>}</div>
      <div className="mt-1.5 font-display-soft text-3xl text-ink">
        {value}
        {unit && <span className="ml-1 font-mono text-xs text-ink-3">{unit}</span>}
      </div>
    </div>
  )
}

function TexturePicker({ texture, setTexture, canReset }: { texture: TextureClass | null; setTexture: (t: TextureClass | null) => void; canReset: boolean }) {
  return (
    <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm text-ink">Know your soil better than the map?</div>
        <div className="text-xs text-ink-3">Override the texture - every water number updates.</div>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={texture ?? ''}
          onChange={(e) => setTexture((e.target.value || null) as TextureClass | null)}
          className="rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-ink outline-none focus:border-leaf/60"
          aria-label="Soil texture"
        >
          <option value="">{canReset ? 'SoilGrids (default)' : 'Choose texture…'}</option>
          {TEXTURE_CLASSES.map((t) => (
            <option key={t} value={t}>
              {cap(t)}
            </option>
          ))}
        </select>
        {texture && <Chip tone="warn">manual</Chip>}
      </div>
    </div>
  )
}

// ---------- The profile column ----------

function soilColor(l: SoilLayer): string {
  const sandy = mix('#a88a6a', '#d2ae72', l.sand / 100)
  const base = mix(sandy, '#8b4a2c', Math.min(1, l.clay / 50))
  return mix(base, '#140d08', Math.min(0.62, l.soc / 45))
}

function rootPath(x: number, y0: number, y1: number, seed: number): string {
  let d = `M${x},${y0}`
  const steps = 7
  for (let i = 1; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps
    const wobble = Math.sin(seed * 3.1 + i * 1.7) * 4
    d += ` L${(x + wobble).toFixed(1)},${y.toFixed(1)}`
  }
  // lateral rootlets
  for (let i = 1; i < steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps
    const len = 10 + ((seed * 7 + i * 13) % 12)
    const dir = i % 2 ? 1 : -1
    d += ` M${x},${y.toFixed(1)} q${dir * len * 0.5},${len * 0.2} ${dir * len},${len * 0.8}`
  }
  return d
}

function SoilColumn({ soil, roots }: { soil: SoilProfile; roots: Crop[] }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const reduce = useReducedMotion()
  const height = 520
  const top = 26
  const bottomPad = 18
  const axis = 44
  const colW = Math.min(300, width * 0.52)
  const barX = axis + colW + 16
  const barMax = width - barX - 44
  const Y = (cm: number) => top + (cm / 200) * (height - top - bottomPad)
  // root-tip labels: crops that reach the same depth side by side would print their pills on top of each other,
  // so a label that collides with one already placed drops a row (with a thin leader back to its tip)
  const pillW = colW < 220 ? 26 : 44 // the pill widths drawn below (compact = colW < 220)
  const labelY: number[] = []
  roots.forEach((c, i) => {
    const x = axis + (colW * 0.74 * (i + 1)) / (roots.length + 1)
    let y = Y(Math.min(200, c.rootDepth * 100)) + 16
    const clash = () =>
      labelY.some((py, j) => Math.abs(py - y) < 18 && Math.abs(axis + (colW * 0.74 * (j + 1)) / (roots.length + 1) - x) < pillW + 4)
    while (clash()) y += 20
    labelY.push(y)
  })
  // Bar width = water per cm of soil, height = layer thickness → the bar's area is the layer's water.
  const maxPaw = Math.max(0.2, ...soil.layers.map((l) => l.paw))
  const compact = colW < 220

  return (
    <div ref={box} className="mt-5 w-full min-w-0">
      <svg ref={ref} width={width} height={height} className="block overflow-visible">
        <defs>
          <pattern id="sand-dots" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.9" fill="rgb(255 240 210 / 0.35)" />
            <circle cx="5" cy="4.5" r="0.7" fill="rgb(255 240 210 / 0.25)" />
          </pattern>
          <linearGradient id="col-shade" x1="0" x2="1">
            <stop offset="0" stopColor="rgb(0 0 0 / 0.35)" />
            <stop offset="0.5" stopColor="rgb(0 0 0 / 0)" />
            <stop offset="1" stopColor="rgb(0 0 0 / 0.35)" />
          </linearGradient>
        </defs>
        {[0, 30, 60, 100, 150, 200].map((cm) => (
          <g key={cm}>
            <line x1={axis - 6} x2={axis} y1={Y(cm)} y2={Y(cm)} stroke="rgb(255 255 255 / 0.3)" />
            <text x={axis - 10} y={Y(cm) + 3} textAnchor="end" className="fill-ink-3 font-mono text-[10px]">
              {cm === 0 ? '0' : `−${cm}`}
            </text>
          </g>
        ))}
        <text x={axis - 10} y={top - 12} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">cm</text>
        {soil.layers.map((l) => (
          <g key={l.top}>
            <rect x={axis} y={Y(l.top)} width={colW} height={Y(l.bottom) - Y(l.top)} fill={soilColor(l)} />
            <rect x={axis} y={Y(l.top)} width={colW} height={Y(l.bottom) - Y(l.top)} fill="url(#sand-dots)" opacity={l.sand / 100} />
            <line x1={axis} x2={axis + colW} y1={Y(l.top)} y2={Y(l.top)} stroke="rgb(0 0 0 / 0.35)" />
            {Y(l.bottom) - Y(l.top) > 22 && (
              <text x={axis + colW - 8} y={Y(l.top) + 15} textAnchor="end" className="fill-white/60 font-mono text-[10px]">
                sand {Math.round(l.sand)} · clay {Math.round(l.clay)}
              </text>
            )}
            {/* water held by this layer */}
            <motion.rect
              x={barX}
              y={Y(l.top) + 2}
              width={Math.max(2, (l.paw / maxPaw) * barMax)}
              height={Math.max(2, Y(l.bottom) - Y(l.top) - 4)}
              rx={3}
              fill="var(--color-water)"
              opacity={0.75}
              style={{ originX: 0, transformBox: 'fill-box' }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : undefined}
              transition={{ duration: 1, delay: 0.2 + l.top / 400, ease: [0.16, 1, 0.3, 1] }}
            />
            <text x={barX + Math.max(2, (l.paw / maxPaw) * barMax) + 6} y={(Y(l.top) + Y(l.bottom)) / 2 + 3} className="fill-water font-mono text-[10px]">
              {Math.round(l.paw * (l.bottom - l.top) * 10)} mm
            </text>
          </g>
        ))}
        <rect x={axis} y={Y(0)} width={colW} height={Y(200) - Y(0)} fill="url(#col-shade)" />
        <line x1={axis - 6} x2={axis + colW + 6} y1={Y(0)} y2={Y(0)} stroke="var(--color-leaf)" strokeWidth={2} />
        <text x={axis} y={top - 10} className="fill-leaf font-mono text-[10px]">surface</text>
        {roots.map((c, i) => {
          const x = axis + (colW * 0.74 * (i + 1)) / (roots.length + 1)
          const tip = Y(Math.min(200, c.rootDepth * 100))
          const ly = labelY[i]
          return (
            <g key={c.id}>
              <motion.path
                d={rootPath(x, Y(0), tip, i + 1)}
                fill="none"
                stroke={c.color}
                strokeWidth={2}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 6px ${c.color})` }}
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={inView ? { pathLength: 1, opacity: 1 } : undefined}
                transition={{ duration: 1.8, delay: 0.4 + i * 0.25, ease: [0.16, 1, 0.3, 1] }}
              />
              <circle cx={x} cy={tip} r={4} fill={c.color} />
              {ly > tip + 16 && <line x1={x} x2={x} y1={tip + 4} y2={ly - 10} stroke={c.color} strokeOpacity={0.45} strokeWidth={1} />}
              <g transform={`translate(${x},${ly})`}>
                <rect x={compact ? -13 : -22} y={-10} width={compact ? 26 : 44} height={16} rx={8} fill="rgb(3 5 10 / 0.8)" stroke={c.color} strokeOpacity={0.5} />
                <text textAnchor="middle" y={2} className="fill-white font-mono text-[10px]">
                  {compact ? c.symbol : `${c.symbol} ${c.rootDepth} m`}
                </text>
              </g>
            </g>
          )
        })}
      </svg>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {roots.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
            <span className="flex items-center gap-2 text-ink-2">
              <i className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              {c.name}
            </span>
            <span className="num text-water">{Math.round(rootZoneWater(soil, c.rootDepth))} mm in reach</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Texture triangle ----------

const ABBR: Record<TextureClass, string> = {
  sand: 'S', 'loamy sand': 'LS', 'sandy loam': 'SL', loam: 'L', 'silt loam': 'SiL', silt: 'Si',
  'sandy clay loam': 'SCL', 'clay loam': 'CL', 'silty clay loam': 'SiCL', 'sandy clay': 'SC', 'silty clay': 'SiC', clay: 'C',
}

function TextureTriangle({ soil }: { soil: SoilProfile }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const side = Math.min(440, width - 40)
  const padX = (width - side) / 2
  const h = (side * Math.sqrt(3)) / 2
  const padT = 18
  const P = (sand: number, clay: number) => {
    const [x, y] = trianglePoint(sand, clay)
    return [padX + x * side, padT + h - (y / (Math.sqrt(3) / 2)) * h] as const
  }
  const sub = soil.layers.filter((l) => l.top >= 30 && l.bottom <= 100)
  const subSand = sub.reduce((s, l) => s + l.sand * (l.bottom - l.top), 0) / Math.max(1, sub.reduce((s, l) => s + l.bottom - l.top, 0))
  const subClay = sub.reduce((s, l) => s + l.clay * (l.bottom - l.top), 0) / Math.max(1, sub.reduce((s, l) => s + l.bottom - l.top, 0))
  const [tx, ty] = P(soil.top.sand, soil.top.clay)
  const [sx, sy] = P(subSand, subClay)

  return (
    <div ref={box} className="mt-4 w-full min-w-0">
      <svg width={width} height={h + padT + 34} className="block">
        {(Object.keys(TEXTURE_POLYGONS) as TextureClass[]).map((k) => {
          const pts = TEXTURE_POLYGONS[k].map(([s, c]) => P(s, c))
          const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length
          const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
          const on = k === soil.texture
          return (
            <g key={k}>
              <polygon
                points={pts.map((p) => p.join(',')).join(' ')}
                fill={on ? 'rgb(201 176 122 / 0.14)' : 'rgb(255 255 255 / 0.015)'}
                stroke={on ? 'rgb(201 176 122 / 0.7)' : 'rgb(255 255 255 / 0.16)'}
                strokeWidth={on ? 1.5 : 1}
              />
              <text x={cx} y={cy + 3} textAnchor="middle" className={`font-mono text-[10px] ${on ? 'fill-leaf' : 'fill-ink-4'}`}>
                {ABBR[k]}
              </text>
            </g>
          )
        })}
        <circle cx={sx} cy={sy} r={5} fill="none" stroke="var(--color-wheat)" strokeWidth={1.5} />
        <circle cx={tx} cy={ty} r={14} fill="rgb(201 176 122 / 0.15)" className="tri-pulse" />
        <circle cx={tx} cy={ty} r={5.5} fill="var(--color-leaf)" stroke="#0a0b0e" strokeWidth={1.5} />
        <text x={padX} y={padT + h + 22} className="fill-ink-3 font-mono text-[10px]">← sand</text>
        <text x={padX + side} y={padT + h + 22} textAnchor="end" className="fill-ink-3 font-mono text-[10px]">silt →</text>
        <text x={padX + side / 2} y={padT - 6} textAnchor="middle" className="fill-ink-3 font-mono text-[10px]">clay ↑</text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-2">
        <Chip tone="good">topsoil · {soil.texture}</Chip>
        <Chip tone="warn">subsoil · {soil.subTexture}</Chip>
      </div>
    </div>
  )
}

/** Where the soil was sampled inside the outlined field, and how much the samples differ. */
function FieldSamples({ field, soil, progress }: { field: Extract<Field, { kind: 'area' }>; soil: SoilProfile | null; progress: { done: number; total: number } }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const W = Math.min(width, 520)
  const H = 220
  const pts = field.ring.map(([lon, lat]) => ({ lat, lon }))
  const view = staticView(pts, W, H, 300, 0.12)
  const v = soil?.variability
  const pawMax = v ? Math.max(...v.samples.map((s) => s.paw100)) : 1
  return (
    <div ref={box} className="panel grid gap-5 p-4 sm:p-5 md:grid-cols-[auto_1fr]">
      <div className="relative overflow-hidden rounded-xl" style={{ width: W, height: H }}>
        <MapImage src={view.url} alt="Your field with soil sample points" className="absolute inset-0 h-full w-full object-cover" />
        <svg width={W} height={H} className="absolute inset-0">
          <polygon points={field.ring.map(([lon, lat]) => view.project(lat, lon).join(',')).join(' ')} fill="rgb(201 176 122 / 0.12)" stroke="var(--color-leaf)" strokeWidth={2} />
          {v?.samples.map((s, i) => {
            const [x, y] = view.project(s.lat, s.lon)
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={8 + 10 * (s.paw100 / pawMax)} fill="rgb(95 208 243 / 0.25)" stroke="var(--color-water)" />
                <text x={x} y={y + 3.5} textAnchor="middle" className="fill-white font-mono text-[10px]">{i + 1}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="min-w-0">
        <div className="kicker">Across your field · {formatArea(field.areaHa)}</div>
        {progress.done < progress.total && (
          <div className="mt-3 flex items-center gap-3 text-sm text-ink-2">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-wheat transition-[width] duration-700" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            sampling SoilGrids {progress.done}/{progress.total} - about 12 s apart (fair-use limit)
          </div>
        )}
        {v && (
          <>
            <div className="mt-3 text-[15px] text-ink-2">
              Plant-available water varies from <span className="text-water">{Math.round(v.paw100[0])}</span> to <span className="text-water">{Math.round(v.paw100[1])} mm</span>, sand from{' '}
              {Math.round(v.sand[0])} to {Math.round(v.sand[1])}%. {v.paw100[1] - v.paw100[0] > 25 ? 'That is enough to manage zones differently - sow the thirstier crop where the tank is bigger.' : 'The field is fairly uniform, so one plan fits it.'}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {v.samples.map((s, i) => (
                <Chip key={i} tone="info">#{i + 1} · {s.texture} · {Math.round(s.paw100)} mm</Chip>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- Deeper still: GRACE-FO water storage ----------

/** Below the roots: the water the whole region gained or lost since 2002, weighed by NASA's GRACE satellites. */
function GracePanel({ lat, lon, presetId }: { lat: number; lon: number; presetId: string | null }) {
  const [g, setG] = useState<GraceHere | null>(null)
  useEffect(() => {
    let live = true
    setG(null)
    graceFor(lat, lon, presetId).then((d) => live && setG(d))
    return () => {
      live = false
    }
  }, [lat, lon, presetId])
  if (!g) return null
  const lost = g.change.cm < 0
  return (
    <Reveal className="panel mt-4 grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,300px)_1fr]">
      <div>
        <div className="flex items-center gap-2 text-[15px] text-ink">
          <Droplets className="h-4 w-4 text-water" /> Deeper still: the whole region’s water
        </div>
        <div className={`font-display-soft mt-4 text-5xl leading-none ${lost ? 'text-heat' : 'text-water'}`}>
          {lost ? '−' : '+'}
          {Math.abs(g.change.cm).toFixed(0)}
          <span className="ml-1.5 font-mono text-base text-ink-3">cm</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          of water {lost ? 'lost' : 'gained'} since {g.change.from} - soil moisture, groundwater, snow and lakes together, weighed from orbit by
          NASA’s GRACE and GRACE-FO satellites ({g.trendCmPerYear >= 0 ? '+' : '−'}
          {Math.abs(g.trendCmPerYear * 10).toFixed(0)} mm a year{g.p !== null ? (g.p < 0.05 ? `, p ${g.p < 0.001 ? '< 0.001' : `= ${g.p.toFixed(3)}`}` : ', not significant') : ''}).
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-3">
          A ≈300 km footprint: it tells whether the region is drawing down its reserves - not the level in your well. When the root zone runs
          dry, this is the water deep roots and irrigation lean on.
        </p>
      </div>
      {g.series ? <GraceChart s={g.series} /> : (
        <div className="grid place-items-center rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-ink-3">
          The monthly record is pre-baked for the demo fields; switch the globe to “Water storage” to see this trend for the whole planet.
        </div>
      )}
    </Reveal>
  )
}

function GraceChart({ s }: { s: GraceSeries }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const H = 220
  const pad = { l: 34, r: 8, t: 12, b: 24 }
  const t = s.months.map((m) => Number(m.slice(0, 4)) + (Number(m.slice(5, 7)) - 0.5) / 12)
  const t0 = Math.floor(t[0])
  const t1 = Math.ceil(t[t.length - 1])
  const lo = Math.min(...s.cm)
  const hi = Math.max(...s.cm)
  const span = Math.max(8, hi - lo) * 1.1
  const mid = (hi + lo) / 2
  const X = (x: number) => pad.l + ((x - t0) / (t1 - t0)) * (width - pad.l - pad.r)
  const Y = (v: number) => pad.t + (1 - (v - (mid - span / 2)) / span) * (H - pad.t - pad.b)
  // break the line over the 2017-2018 gap between the two missions
  let d = ''
  s.cm.forEach((v, i) => {
    const jump = i === 0 || t[i] - t[i - 1] > 2.5 / 12
    d += `${jump ? 'M' : 'L'}${X(t[i]).toFixed(1)},${Y(v).toFixed(1)}`
  })
  const meanT = t.reduce((a, b) => a + b, 0) / t.length
  const meanV = s.cm.reduce((a, b) => a + b, 0) / s.cm.length
  const trendAt = (x: number) => meanV + s.trendCmPerYear * (x - meanT)
  const step = span > 60 ? 20 : 10
  const ticks: number[] = []
  for (let v = Math.ceil((mid - span / 2) / step) * step; v <= mid + span / 2; v += step) ticks.push(v)
  const gapFrom = t.findIndex((x, i) => i > 0 && x - t[i - 1] > 2.5 / 12)
  return (
    <div ref={box} className="min-w-0">
      <svg width={width} height={H} className="block overflow-visible" role="img" aria-label="GRACE and GRACE-FO water storage anomaly, monthly">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'rgb(255 255 255 / 0.18)' : 'rgb(255 255 255 / 0.06)'} />
            <text x={pad.l - 6} y={Y(v) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">{v > 0 ? `+${v}` : v}</text>
          </g>
        ))}
        <text x={pad.l - 6} y={pad.t - 2} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">cm</text>
        {gapFrom > 0 && (
          <g>
            <rect x={X(t[gapFrom - 1])} y={pad.t} width={X(t[gapFrom]) - X(t[gapFrom - 1])} height={H - pad.t - pad.b} fill="rgb(255 255 255 / 0.03)" />
            <text x={(X(t[gapFrom - 1]) + X(t[gapFrom])) / 2} y={H - pad.b - 6} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">GRACE → GRACE-FO</text>
          </g>
        )}
        <motion.path d={d} fill="none" stroke="var(--color-water)" strokeWidth={1.6} strokeLinejoin="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
        <line x1={X(t[0])} x2={X(t[t.length - 1])} y1={Y(trendAt(t[0]))} y2={Y(trendAt(t[t.length - 1]))} stroke={s.trendCmPerYear < 0 ? 'var(--color-heat)' : 'var(--color-leaf)'} strokeWidth={2} strokeDasharray="5 4" />
        {Array.from({ length: t1 - t0 + 1 }, (_, i) => t0 + i).filter((y) => y % 4 === 2).map((y) => (
          <text key={y} x={X(y)} y={H - 6} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">{y}</text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-water" />monthly water storage vs the 2004-2009 mean</span>
        <span className="flex items-center gap-1.5"><i className="h-0 w-4 border-t-2 border-dashed border-heat" />trend</span>
        <span>{s.source}</span>
      </div>
    </div>
  )
}

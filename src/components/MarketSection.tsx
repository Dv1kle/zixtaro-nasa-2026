// Where the harvest sells: one clear answer first (where each crop nets most and how much stays with the farmer),
// then the price path from market to farm, how much that price swings, every market checked, the farmer's own
// prices and every assumption behind it with its source.
import { AlertTriangle, ArrowRight, BookOpen, Check, Pencil, Plane, Ship, Truck, Warehouse } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { CROP_BY_ID, type CropId } from '../lib/crops'
import { GH_CROP_BY_ID, type GhCropId } from '../lib/greenhouse'
import { RATES, RATE_SOURCES, type Mode } from '../lib/logistics'
import { COUNTRY, MARKETS, type CropKey } from '../lib/markets'
import { parseOwnPrice, shipOptions, type CropQuote, type MarketContext, type MarketMode } from '../lib/marketProfit'
import type { SeaMatrix } from '../lib/logistics'
import { countryName, flagOf, MarketChip, Place } from './MarketChip'
import { CropTile, Reveal, SectionHeader, type TileCrop } from './ui'
import { useLang } from '../lib/i18n'
import { openMethod } from '../lib/nav'
import { Instrument, usePlate } from './Instrument'

/** the specimen card of a market crop: field and greenhouse crops share the table */
const tileOf = (id: CropKey): TileCrop | null => (CROP_BY_ID as Record<string, TileCrop | undefined>)[id as CropId] ?? (GH_CROP_BY_ID as Record<string, TileCrop | undefined>)[id as GhCropId] ?? null

export type MarketCrop = { id: CropKey; name: string; /** t per ha (field) or kg per m² a year (greenhouse), when known */ harvest?: number }

const eur = (x: number) => `${x < 0 ? '−' : ''}€${Math.abs(Math.round(x)).toLocaleString('en-US')}`
/** Greenhouse prices are cents per kg: keep two decimals where whole euros would read €0 or €1. */
const eurKg = (x: number) => (Math.abs(x) >= 20 ? eur(x) : `${x < 0 ? '−' : ''}€${Math.abs(x).toFixed(2)}`)
const MODE_ICON: Record<Mode, typeof Truck> = { local: Warehouse, road: Truck, sea: Ship, air: Plane }
const MODE_LABEL: Record<Mode, string> = { local: 'farm gate', road: 'by road', sea: 'by sea', air: 'by air' }
const SOURCE_LABEL: Record<CropQuote['source'], string> = {
  faostat: 'FAOSTAT record',
  import: 'world price (grows almost none - import parity)',
  estimate: 'estimate from neighbours',
  yours: 'your price',
}

function Waterfall({ q, unit }: { q: CropQuote; unit: 't' | 'kg' }) {
  const lang = useLang()
  const k = unit === 'kg' ? 1000 : 1
  const money = (x: number) => (unit === 'kg' ? eurKg(x / k) : eur(x / k))
  const r = q.route
  const sold = r.reachable ? 1 : 0
  const steps = [
    { label: <>Price in <Place iso3={q.market} flag={false} /></>, v: q.price, kind: 'total' as const },
    { label: r.mode === 'local' ? 'Freight: none, sold at the farm gate' : `Freight ${MODE_LABEL[r.mode]}: ${Math.round(r.km).toLocaleString('en-US')} km, ${r.days < 1 ? 'under a day' : `${Math.round(r.days)} days`}`, v: -r.freight, kind: 'step' as const },
    { label: `Import duty: ${Math.round(r.tariff * 100)} %`, v: -r.tariff * q.price * sold, kind: 'step' as const },
    { label: `Spoiled on the way: ${Math.round(r.loss * 100)} %`, v: -(r.loss * q.price * sold + (r.reachable ? 0 : q.price)), kind: 'step' as const },
    { label: 'You keep', v: q.netPerT, kind: 'total' as const },
  ]
  const max = Math.max(q.price, 1)
  const min = Math.min(0, q.netPerT)
  const span = max - min
  const x = (v: number) => ((v - min) / span) * 100
  let run = 0
  return (
    <div className="space-y-2.5" role="img" aria-label={`From ${money(q.price)} to ${money(q.netPerT)} per ${unit}`}>
      {steps.map((s, i) => {
        const from = s.kind === 'total' ? 0 : run
        const to = s.kind === 'total' ? s.v : run + s.v
        run = to
        const left = x(Math.min(from, to))
        const width = Math.max(0.6, Math.abs(x(to) - x(from)))
        const tone = s.kind === 'total' ? (s.v >= 0 ? 'bg-leaf' : 'bg-danger') : 'bg-wheat/80'
        return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_5.5rem]">
            <span className={`min-w-0 leading-snug ${s.kind === 'total' ? 'text-ink' : 'text-ink-2'}`}>{s.label}</span>
            <span className={`text-right font-mono tabular-nums sm:order-last ${s.v < 0 ? 'text-wheat' : 'text-ink'}`}>
              {s.kind === 'step' && Math.abs(s.v) >= 0.5 ? '−' : ''}{money(Math.abs(s.v)).replace('−', '')}
            </span>
            <span className="relative col-span-2 h-2.5 rounded bg-white/[0.05] sm:col-span-1 sm:h-5">
              <span className={`absolute inset-y-0 rounded ${tone}`} style={{ left: `${left}%`, width: `${width}%` }} />
              {min < 0 && <span className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${x(0)}%` }} />}
            </span>
          </div>
        )
      })}
      <p className="pt-1 text-[13px] leading-relaxed text-ink-3">
        Per {unit}. Selling at home keeps {money(q.homeNetPerT)}.
        {Math.abs(q.netPerT - q.homeNetPerT) >= (unit === 'kg' ? 5 : 1) && (
          <> <strong className={q.netPerT > q.homeNetPerT ? 'text-leaf' : 'text-wheat'}>{q.netPerT > q.homeNetPerT ? `${money(q.netPerT - q.homeNetPerT)} more than at home.` : `${money(q.homeNetPerT - q.netPerT)} less than at home.`}</strong></>
        )}
        {!r.reachable && <> <span className="text-danger">It does not arrive fresh: the load is lost.</span></>}
      </p>
    </div>
  )
}

function PriceRisk({ q, unit }: { q: CropQuote; unit: 't' | 'kg' }) {
  const k = unit === 'kg' ? 1000 : 1
  const money = (x: number) => (unit === 'kg' ? eurKg(x / k) : eur(x / k))
  const lo = q.p10
  const hi = Math.max(q.p90, lo + 1)
  const x = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`
  const spread = Math.round(((q.p90 - q.p10) / 2 / q.median) * 100)
  const d = q.demand
  return (
    <div>
      <div className="relative mt-4 h-2.5 rounded-full bg-gradient-to-r from-wheat/40 via-leaf/40 to-leaf/70">
        <span className="absolute -top-1.5 h-5.5 w-1 -translate-x-1/2 rounded-full bg-ink" style={{ left: x(q.price) }} title="the price the ranking uses" />
        <span className="absolute -top-1 h-4.5 w-px bg-ink-3" style={{ left: x(q.median) }} />
      </div>
      <div className="mt-2 flex justify-between gap-2 font-mono text-[12px] text-ink-3">
        <span>bad year {money(q.p10)}</span>
        <span>median {money(q.median)}</span>
        <span>good year {money(q.p90)}</span>
      </div>
      <p className="mt-4 text-[14.5px] leading-relaxed text-ink-2">
        The price here swings about <strong className="text-ink">±{spread} %</strong> from year to year (2015-2024). The ranking counts a bad-year price, {money(q.price)}, so a crop with a jumpy price has to earn its place.
      </p>
      <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
        {Math.abs(d) < 0.01 ? 'This market neither imports nor exports much of it: no bonus, no malus.' : d > 0
          ? <>This market <strong className="text-leaf">imports</strong> the crop, so it gets a small bonus in the ranking (+{Math.round(d * 100)} %).</>
          : <>This market <strong className="text-wheat">exports</strong> the crop, so it gets a small malus in the ranking (−{Math.round(-d * 100)} %).</>}
      </p>
      <p className="mt-2 text-[13px] text-ink-3">Price source: {SOURCE_LABEL[q.source]}{q.niche ? '; a small market, capped at the world median' : ''}.</p>
    </div>
  )
}

/**
 * The logistics, drawn as the trip itself: the field and every market checked on one plate (an equirectangular
 * survey sheet - graticule, square survey marks, the routes as arcs: road solid, sea dashed, air dotted), the market
 * that pays most in straw, the one the plan sells to in bone with its load moving along the line, and beside it a
 * departure board - each market a row with its mode, distance, days and what a tonne leaves at the farm. Under the
 * plate a telemetry strip spells out the chosen trip: freight, duty, spoilage, what you keep.
 */
function RouteBoard({
  options,
  origin,
  home,
  chosen,
  onPick,
  money,
  unit,
}: {
  options: CropQuote[]
  origin: [number, number]
  home: string
  chosen: string | undefined
  onPick: (iso3: string) => void
  money: (x: number) => string
  unit: 't' | 'kg'
}) {
  const lang = useLang()
  const reduce = useReducedMotion()
  // a narrower sheet on a phone, so the marks and names keep a readable size when the plate is drawn 350 px wide
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const W = narrow ? 400 : 640
  const H = narrow ? 300 : 360
  const best = options[0]
  const pick = options.find((o) => o.market === chosen) ?? best
  // the sheet: the field and every market's hub, framed with a margin, lon scaled by the latitude's cosine
  const pts = [origin, ...options.map((o) => COUNTRY[o.market]?.hub ?? origin)]
  const midLat = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2
  const k = Math.cos((midLat * Math.PI) / 180)
  const xs = pts.map((p) => p[0] * k)
  const ys = pts.map((p) => -p[1])
  const pad = 0.16
  let x0 = Math.min(...xs)
  let x1 = Math.max(...xs)
  let y0 = Math.min(...ys)
  let y1 = Math.max(...ys)
  const spanX = Math.max(x1 - x0, 4)
  const spanY = Math.max(y1 - y0, 3)
  const s = Math.min((W * (1 - 2 * pad)) / spanX, (H * (1 - 2 * pad)) / spanY)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  x0 = cx - W / 2 / s
  x1 = cx + W / 2 / s
  y0 = cy - H / 2 / s
  y1 = cy + H / 2 / s
  const at = ([lon, lat]: [number, number]): [number, number] => [(lon * k - x0) * s, (-lat - y0) * s]
  const [ox, oy] = at(origin)
  const arc = (o: CropQuote) => {
    const [hx, hy] = at(COUNTRY[o.market]?.hub ?? origin)
    const dx = hx - ox
    const dy = hy - oy
    const len = Math.hypot(dx, dy) || 1
    // bulge to the north (up) the way a long route reads on a chart
    const bend = Math.min(90, len * 0.22) * (dx >= 0 ? -1 : 1)
    const mx = (ox + hx) / 2 + (-dy / len) * bend
    const my = (oy + hy) / 2 + (dx / len) * bend
    return { d: `M${ox.toFixed(1)},${oy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${hx.toFixed(1)},${hy.toFixed(1)}`, hx, hy }
  }
  const dash: Record<Mode, string | undefined> = { local: undefined, road: undefined, sea: '6 5', air: '1.5 5' }
  // the graticule: every 5° (10° on a wide sheet)
  const step = (x1 - x0) / k > 60 ? 10 : 5
  const lons: number[] = []
  const lats: number[] = []
  for (let lon = Math.ceil(x0 / k / step) * step; lon <= x1 / k; lon += step) lons.push(lon)
  for (let lat = Math.ceil(-y1 / step) * step; lat <= -y0; lat += step) lats.push(lat)
  // labels: the chosen market, the best, then the rest by what they pay - each only where it has room, so a cluster
  // of neighbours reads as marks with the important names, not a pile of letters
  const placed: { x: number; y: number; w: number; h: number }[] = [{ x: ox + 11, y: oy - 20, w: 64, h: 14 }]
  const labelled = new Set<string>()
  for (const o of [...options].sort((a, b) => Number(b.market === pick.market) - Number(a.market === pick.market) || Number(b.market === best.market) - Number(a.market === best.market) || b.netPerT - a.netPerT)) {
    const [hx, hy] = at(COUNTRY[o.market]?.hub ?? origin)
    const box = { x: hx + 6, y: hy - 7, w: 20, h: 13 }
    if (placed.some((q) => box.x < q.x + q.w && box.x + box.w > q.x && box.y < q.y + q.h && box.y + box.h > q.y)) continue
    placed.push(box)
    labelled.add(o.market)
  }
  // graticule labels only where they have room
  const lonLabels = lons.filter((_, i) => i % Math.max(1, Math.ceil(46 / (step * k * s))) === 0).filter((lon) => (lon * k - x0) * s > 36)
  const latLabels = lats.filter((_, i) => i % Math.max(1, Math.ceil(26 / (step * s))) === 0).filter((lat) => (-lat - y0) * s < H - 20)
  const maxKeep = Math.max(...options.map((o) => o.netPerT), 1)
  const homeNet = options.find((o) => o.market === home)?.netPerT ?? best.homeNetPerT
  const r = pick.route
  return (
    <div className="route-board grid gap-0 border border-white/10 lg:grid-cols-[1.15fr_1fr]">
      <div className="relative border-b border-white/10 lg:border-r lg:border-b-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Routes from your field to ${options.length} markets; selling to ${countryName(pick.market, lang)}`}>
          <defs>
            <pattern id="rb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#rb-hatch)" className="text-ink" />
          <g className="text-ink" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1">
            {lons.map((lon) => <line key={`x${lon}`} x1={(lon * k - x0) * s} x2={(lon * k - x0) * s} y1={0} y2={H} />)}
            {lats.map((lat) => <line key={`y${lat}`} y1={(-lat - y0) * s} y2={(-lat - y0) * s} x1={0} x2={W} />)}
          </g>
          <g className="font-mono text-ink-4" fill="currentColor" fontSize="9">
            {lonLabels.map((lon) => <text key={`lx${lon}`} x={(lon * k - x0) * s + 3} y={H - 6}>{Math.abs(lon)}°{lon >= 0 ? 'E' : 'W'}</text>)}
            {latLabels.map((lat) => <text key={`ly${lat}`} x={4} y={(-lat - y0) * s - 3}>{Math.abs(lat)}°{lat >= 0 ? 'N' : 'S'}</text>)}
          </g>
          {/* every route, quietly; then the best and the chosen on top */}
          {options.map((o) => {
            if (o.route.mode === 'local') return null
            const a = arc(o)
            return <path key={`a${o.market}`} d={a.d} fill="none" className="text-ink" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1" strokeDasharray={dash[o.route.mode]} />
          })}
          {best.route.mode !== 'local' && best.market !== pick.market && (
            <path d={arc(best).d} fill="none" className="text-leaf" stroke="currentColor" strokeWidth="1.6" strokeDasharray={dash[best.route.mode]} />
          )}
          {pick.route.mode !== 'local' && (
            <g>
              <path d={arc(pick).d} fill="none" className="text-ink" stroke="currentColor" strokeWidth="2.2" strokeDasharray={dash[pick.route.mode]} />
              {/* the load on its way - a small square travelling the route (still under reduced motion) */}
              {!reduce && (
                <rect width="6" height="6" x="-3" y="-3" className="text-leaf" fill="currentColor">
                  <animateMotion dur={`${Math.min(9, 3 + r.days * 0.25).toFixed(1)}s`} repeatCount="indefinite" path={arc(pick).d} rotate="auto" />
                </rect>
              )}
            </g>
          )}
          {options.map((o) => {
            const [hx, hy] = at(COUNTRY[o.market]?.hub ?? origin)
            const on = o.market === pick.market
            const top = o.market === best.market
            const label = COUNTRY[o.market]?.a2 ?? o.market
            return (
              <g key={`m${o.market}`} className={on ? 'text-ink' : top ? 'text-leaf' : 'text-ink-3'}>
                <rect x={hx - (on ? 4.5 : 3)} y={hy - (on ? 4.5 : 3)} width={on ? 9 : 6} height={on ? 9 : 6} fill={on || top ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2" />
                {labelled.has(o.market) && <text x={hx + 7} y={hy + 3.5} fontSize={on ? 12 : 10} className="font-mono" fill="currentColor">{label}</text>}
              </g>
            )
          })}
          {/* your field: a survey cross in a square */}
          <g className="text-ink">
            <rect x={ox - 7} y={oy - 7} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <line x1={ox - 11} x2={ox + 11} y1={oy} y2={oy} stroke="currentColor" strokeWidth="1" />
            <line y1={oy - 11} y2={oy + 11} x1={ox} x2={ox} stroke="currentColor" strokeWidth="1" />
            <text x={ox + 13} y={oy - 9} fontSize="10" className="font-mono" fill="currentColor">your field</text>
          </g>
        </svg>
        {/* the chosen trip as a telemetry strip */}
        <dl className="grid grid-cols-3 border-t border-white/10 font-mono text-[11px] sm:grid-cols-6">
          {[
            ['mode', MODE_LABEL[r.mode].replace('by ', '')],
            ['distance', r.mode === 'local' ? '0 km' : `${Math.round(r.km).toLocaleString('en-US')} km`],
            ['days', r.mode === 'local' ? '0' : r.days < 1 ? '< 1' : `${Math.round(r.days)}`],
            ['freight', r.freight > 0.5 ? `−${money(r.freight).replace('−', '')}` : 'none'],
            ['duty · spoil', `${Math.round(r.tariff * 100)} % · ${Math.round(r.loss * 100)} %`],
            ['you keep', money(pick.netPerT)],
          ].map(([k2, v], i) => (
            <div key={k2} className={`px-3 py-2.5 ${i > 0 ? 'border-l border-white/10' : ''} ${i >= 3 ? 'max-sm:border-t' : ''} ${i === 3 ? 'max-sm:border-l-0' : ''}`}>
              <dt className="text-[9.5px] tracking-[0.12em] text-ink-4 uppercase">{k2}</dt>
              <dd className={`mt-1 tabular-nums ${k2 === 'you keep' ? 'text-leaf' : 'text-ink'}`}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {/* the departure board */}
      <div className="min-w-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_5.2rem] items-baseline gap-x-3 border-b border-white/10 px-4 py-2 font-mono text-[9.5px] tracking-[0.12em] text-ink-4 uppercase">
          <span>market · route</span>
          <span className="text-right">km · days</span>
          <span className="text-right">keep / {unit}</span>
        </div>
        <ol className="max-h-[420px] overflow-y-auto" data-lenis-prevent>
          {options.map((o) => {
            const Icon = MODE_ICON[o.route.mode]
            const on = o.market === pick.market
            const top = o.market === best.market
            const gain = o.netPerT - homeNet
            return (
              <li key={o.market}>
                <button
                  onClick={() => onPick(o.market)}
                  aria-pressed={on}
                  className={`group relative grid w-full grid-cols-[minmax(0,1fr)_auto_5.2rem] items-center gap-x-3 border-b border-white/[0.06] px-4 py-2.5 text-left transition-colors ${on ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'}`}
                >
                  {on && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-leaf" />}
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[14px] text-ink">
                      <span aria-hidden>{flagOf(o.market)}</span>
                      <span className="truncate">{countryName(o.market, lang)}</span>
                      {top && <span className="shrink-0 border border-leaf/50 px-1.5 py-px font-mono text-[9px] tracking-[0.1em] text-leaf uppercase">pays most</span>}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
                      <Icon className="h-3 w-3" aria-hidden />
                      {MODE_LABEL[o.route.mode]}
                      {o.source !== 'faostat' && <span className="text-ink-4">· {o.source === 'import' ? 'world price' : o.source === 'yours' ? 'your price' : 'estimate'}</span>}
                    </span>
                    {/* what a tonne leaves, against the best market */}
                    <span aria-hidden className="mt-1.5 block h-[3px] bg-white/[0.06]">
                      <span className={`block h-full ${top ? 'bg-leaf' : on ? 'bg-ink-2' : 'bg-ink-4/60'}`} style={{ width: `${Math.max(2, (Math.max(0, o.netPerT) / maxKeep) * 100)}%` }} />
                    </span>
                  </span>
                  <span className="text-right font-mono text-[11px] text-ink-3 tabular-nums">
                    {o.route.mode === 'local' ? 'farm gate' : <>{Math.round(o.route.km).toLocaleString('en-US')}<br />{o.route.days < 1 ? '< 1 d' : `${Math.round(o.route.days)} d`}</>}
                  </span>
                  <span className="text-right font-mono tabular-nums">
                    <span className={`block text-[13px] ${top ? 'text-leaf' : 'text-ink'}`}>{money(o.netPerT)}</span>
                    <span className={`block text-[10.5px] ${gain > 0.5 ? 'text-leaf' : 'text-ink-4'}`}>{o.market === home ? 'home' : gain > 0.5 ? `+${money(gain)}` : `−${money(-gain).replace('−', '')}`}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

export function MarketSection(props: {
  /** the market's own scene stands before it: the plate rides up over that scene's last screen */
  over?: boolean
  site: 'field' | 'greenhouse'
  ctx: MarketContext
  mode: MarketMode
  setMode: (m: MarketMode) => void
  own: Partial<Record<CropKey, number>>
  setOwn: (o: Partial<Record<CropKey, number>>) => void
  sea: SeaMatrix | null
  origin: [number, number]
  crops: MarketCrop[]
  guessed?: boolean
  /** travel time from the field to the nearest city of 50 000+, hours (access.ts) */
  toCity?: number | null
}) {
  const { ctx, crops, sea, origin } = props
  const lang = useLang()
  const withPrices = Object.keys(MARKETS.prices).length
  const gh = props.site === 'greenhouse'
  const unit = gh ? 'kg' : 't'
  const k = gh ? 1000 : 1
  const money = (x: number) => (gh ? eurKg(x / k) : eur(x / k))
  const [picked, setPicked] = useState<CropKey | null>(null)
  // (the list opens with the crop the chosen plan sells first: another plan, and the section turns to its crop)
  const first = crops[0]?.id
  useEffect(() => setPicked(null), [first])
  const crop = crops.find((c) => c.id === picked) ?? crops[0]
  const q = crop ? ctx.quotes[crop.id] : undefined
  const best = useMemo(
    () => crops.map((c) => ({ c, list: shipOptions({ origin, home: ctx.home, crop: c.id, sea, own: props.own[c.id] }) })),
    [crops, origin, ctx.home, sea, props.own],
  )
  const options = best.find((b) => b.c.id === crop?.id)?.list ?? []
  const top = options[0]
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const shipTo = (iso3: string) => props.setMode(iso3 === ctx.home ? { kind: 'home' } : { kind: 'to', iso3 })
  const chosenHere = props.mode.kind === 'to' ? props.mode.iso3 : q?.market
  const plate = usePlate(props.over)

  return (
    <section id="market" className={`relative scroll-mt-16 px-5 pt-16 pb-16 sm:px-8 sm:pt-24 sm:pb-20 lg:pl-28 xl:pl-36 ${plate.root} ${plate.story && !props.over ? 'plate-veil' : ''}`}>
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col">
        <SectionHeader
          kicker="Sell"
          altitude="▲ 0 m"
          title={crop ? <>Where <em className="text-leaf">{crop.name.toLowerCase()}</em> sells best.</> : <>Where it sells.</>}
          dek={<>Farm-gate prices from FAOSTAT for {withPrices} countries (the rest estimated from their neighbours), freight by road, sea or air, import duty and spoilage on the way. Your country comes from the field's coordinates: <Place iso3={ctx.home} />.</>}
        />
        <Instrument
          title={crop ? <>The trip to the buyer · {crop.name.toLowerCase()}</> : 'The trip to the buyer'}
          kicker="Instrument · the market"
          label="Open the market board"
          facts={
            top
              ? [
                  { value: money(top.netPerT), label: `per ${unit === 'kg' ? 'kilo' : 'tonne'} at the best market, after freight, duty and spoilage` },
                  { value: <Place iso3={top.market} flag={false} />, label: top.market === ctx.home ? 'the best market is home' : 'the best market' },
                  ...(top.market !== ctx.home ? [{ value: `+${money(top.netPerT - top.homeNetPerT)}`, label: `per ${unit === 'kg' ? 'kilo' : 'tonne'} over selling at home` }] : []),
                ]
              : []
          }
        >
        <Reveal className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <MarketChip ctx={ctx} mode={props.mode} onMode={props.setMode} guessed={props.guessed} />
          {props.toCity != null && (
            <span
              className="flex items-center gap-1.5 text-[13px] text-ink-2"
              title="Travel time by road and track in 2015 (Nelson et al. 2019). Produce that keeps under 30 days is marked down where a field lies farther out than 95 % of the world’s growers of that crop (CROPGRIDS 2020)."
            >
              <Truck className="h-3.5 w-3.5 text-ink-3" aria-hidden />
              {props.toCity >= 42 ? 'over 42 h' : props.toCity < 1 ? `${Math.max(10, Math.round(props.toCity * 60))} min` : `${props.toCity.toFixed(1)} h`} to a city of 50 000+
            </span>
          )}
          <span className="text-[13px] text-ink-3">The plan above re-ranks when you change the market.</span>
          <button onClick={() => openMethod('limits')} className="flex items-center gap-1.5 text-[13px] text-orbit hover:underline">
            <BookOpen className="h-3.5 w-3.5" aria-hidden /> What the market model leaves out
          </button>
        </Reveal>

        {!crops.length ? (
          <p className="mt-10 text-ink-3">The market appears once the crops are ranked.</p>
        ) : (
          <>
            {/* one crop at a time: pick it here, the rest of the section follows */}
            <Reveal className="mt-10">
              {/* the crops as specimen cards: the one being read lifts */}
              <div className="flex flex-wrap gap-x-5 gap-y-4" role="tablist" aria-label="Crop">
                {crops.map((c) => {
                  const on = c.id === crop?.id
                  return (
                    <button
                      key={c.id}
                      role="tab"
                      aria-selected={on}
                      onClick={() => setPicked(c.id)}
                      className="group flex w-[72px] flex-col items-center gap-2.5 pt-1 text-center"
                    >
                      <CropTile crop={tileOf(c.id)} size="md" glow={on} />
                      <span className={`line-clamp-2 text-[12px] leading-tight transition-colors ${on ? 'text-ink' : 'text-ink-3 group-hover:text-ink-2'}`}>{c.name}</span>
                    </button>
                  )
                })}
              </div>
            </Reveal>

            {crop && top && (
              <Reveal className="mt-5">
                <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="min-w-0">
                    {/* who pays most is a fact about demand; a field crop gets there through a trader or co-op, not a ship of its own */}
                    <div className="kicker">Who pays most for {crop.name.toLowerCase()}</div>
                    <p className="font-display-soft mt-2 text-[clamp(1.35rem,2.4vw,1.9rem)] leading-snug text-ink">
                      {top.market === ctx.home
                        ? <>Home does: <Place iso3={top.market} /> pays <span className="text-leaf">{money(top.netPerT)}</span> per {unit}.</>
                        : <><Place iso3={top.market} />: <span className="text-leaf">{money(top.netPerT)}</span> per {unit} after the trip, <span className="text-leaf">{money(top.netPerT - top.homeNetPerT)}</span> more than at home.</>}
                    </p>
                    <p className="mt-1.5 text-[14px] text-ink-3">
                      {top.market === ctx.home
                        ? 'No market abroad pays more once freight, duty and spoilage are paid.'
                        : `After freight ${MODE_LABEL[top.route.mode]}, duty and spoilage.${gh ? '' : ' A farm this size reaches it through a trader or co-op - that demand is what lifts the price at your gate.'}${!gh && crop.harvest ? ` About ${eur((top.netPerT - top.homeNetPerT) * crop.harvest)} more per hectare.` : ''}`}
                    </p>
                  </div>
                  {top.market !== chosenHere && (
                    <button onClick={() => shipTo(top.market)} className="flex shrink-0 items-center gap-2 self-start rounded-full bg-leaf px-4 py-2.5 text-sm font-medium text-[#0a0b0e] transition hover:brightness-110 sm:self-center">
                      {/* one span: in the flex button each loose text run was a sentence of its own ("Plan with" | "prices") */}
                      <span>{top.market === ctx.home ? 'Plan with home prices' : <>Plan with <Place iso3={top.market} flag={false} /> prices</>}</span> <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  {top.market === chosenHere && (
                    <span className="flex shrink-0 items-center gap-1.5 self-start text-sm text-leaf sm:self-center"><Check className="h-4 w-4" aria-hidden /> The plan uses this market</span>
                  )}
                </div>
              </Reveal>
            )}

            {crop && q && (
              <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
                <Reveal className="panel p-5 sm:p-6">
                  {/* the best market above can be another country: name the one this waterfall is about */}
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[15px] text-ink">Where you sell now: <Place iso3={q.market} /></span>
                    <span className="kicker">from the market to you · {props.mode.kind === 'auto' ? (q.market === ctx.home ? 'auto' : <>auto: pays more than <Place iso3={ctx.home} flag={false} /></>) : props.mode.kind === 'to' ? 'shipped' : props.mode.kind === 'home' ? 'at home' : 'the region'}</span>
                  </div>
                  <Waterfall q={q} unit={unit} />
                </Reveal>
                <Reveal className="panel p-5 sm:p-6">
                  <div className="kicker">How much the price in <Place iso3={q.market} flag={false} /> swings</div>
                  <PriceRisk q={q} unit={unit} />
                </Reveal>
              </div>
            )}

            {crop && options.length > 1 && (
              <Reveal className="mt-8">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h3 className="font-display-soft text-[clamp(1.4rem,2.2vw,1.9rem)] leading-none text-ink uppercase">The trip to the buyer</h3>
                  <span className="font-mono text-[11px] text-ink-4">{options.length} markets checked · road solid · sea dashed · air dotted</span>
                </div>
                <p className="mt-2 max-w-2xl text-[13px] text-ink-3">What a {unit === 't' ? 'tonne' : 'kilo'} of {crop.name.toLowerCase()} leaves at your gate after freight, duty and spoilage, for every market we checked. Tap a market to sell there.</p>
                <div className="mt-4">
                  <RouteBoard options={options} origin={origin} home={ctx.home} chosen={chosenHere} onPick={shipTo} money={money} unit={unit} />
                </div>
              </Reveal>
            )}

            <Reveal className="mt-10">
              <h3 className="text-[15px] text-ink">All your top crops</h3>
              <p className="mt-1 text-[13px] text-ink-3">The best market for each, and how much more it leaves than selling at home. Tap a crop to see it above.</p>
              {/* a table where there is room, a list on phones */}
              <div className="mt-3 hidden overflow-hidden border border-white/10 md:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-ink-3">
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-2.5 font-normal">Crop</th>
                      <th className="px-4 py-2.5 font-normal">Best market</th>
                      <th className="px-4 py-2.5 text-right font-normal">You keep per {unit}</th>
                      <th className="px-4 py-2.5 text-right font-normal">More than at home</th>
                      {!gh && <th className="px-4 py-2.5 text-right font-normal">Per hectare</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {best.map(({ c, list }) => {
                      const t = list[0]
                      if (!t) return null
                      const Icon = MODE_ICON[t.route.mode]
                      const gain = t.netPerT - t.homeNetPerT
                      const on = c.id === crop?.id
                      return (
                        <tr key={c.id} className={`cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.04] ${on ? 'bg-white/[0.05]' : ''}`} onClick={() => setPicked(c.id)} aria-selected={on}>
                          <td className="px-4 py-3 text-ink"><span className="inline-flex items-center gap-3"><CropTile crop={tileOf(c.id)} size="xs" glow={on} />{c.name}</span></td>
                          <td className="px-4 py-3 text-ink-2">
                            <span className="inline-flex items-center gap-2"><span aria-hidden>{flagOf(t.market)}</span>{countryName(t.market, lang)}<Icon className="h-3.5 w-3.5 text-ink-3" aria-label={MODE_LABEL[t.route.mode]} /></span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">{money(t.netPerT)}</td>
                          <td className={`px-4 py-3 text-right font-mono tabular-nums ${gain > 0.5 ? 'text-leaf' : 'text-ink-3'}`}>{gain > 0.5 ? `+${money(gain)}` : 'home is best'}</td>
                          {!gh && <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-2">{gain > 0.5 && c.harvest ? `+${eur(gain * c.harvest)}` : '-'}</td>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="mt-3 space-y-2 md:hidden">
                {best.map(({ c, list }) => {
                  const t = list[0]
                  if (!t) return null
                  const gain = t.netPerT - t.homeNetPerT
                  const on = c.id === crop?.id
                  return (
                    <li key={c.id}>
                      <button onClick={() => setPicked(c.id)} aria-pressed={on} className={`w-full rounded-2xl border p-3.5 text-left transition ${on ? 'border-leaf/50 bg-leaf/[0.07]' : 'border-white/10 bg-white/[0.02]'}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex items-center gap-3 text-[15px] text-ink"><CropTile crop={tileOf(c.id)} size="xs" glow={on} />{c.name}</span>
                          <span className="font-mono text-sm text-ink">{money(t.netPerT)}<span className="text-ink-3">/{unit}</span></span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="text-ink-2"><span aria-hidden>{flagOf(t.market)}</span> {countryName(t.market, lang)}</span>
                          <span className={gain > 0.5 ? 'text-leaf' : 'text-ink-3'}>{gain > 0.5 ? `+${money(gain)} vs home` : 'home is best'}</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Reveal>

            <Reveal className="mt-10">
              <div className="panel p-5 sm:p-6">
                <div className="flex items-center gap-2 text-[15px] text-ink"><Pencil className="h-4 w-4 text-leaf" aria-hidden /> Know your price? Type it in.</div>
                <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-3">
                  What a buyer pays you at the farm, in € per {unit}. It replaces the market price for that crop everywhere on the page. Leave a box empty to use the market.
                </p>
                <div className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                  {crops.map((c) => {
                    const d = drafts[c.id] ?? (props.own[c.id] ? String(props.own[c.id]! / k) : '')
                    const bad = d.trim() !== '' && parseOwnPrice(d.replace(',', '.')) === null
                    const market = ctx.quotes[c.id] ? Math.round((ctx.quotes[c.id]!.homeNetPerT / k) * 100) / 100 : null
                    return (
                      <label key={c.id} className="flex items-center justify-between gap-3 text-sm text-ink-2">
                        <span className="min-w-0 truncate">{c.name}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-ink-3">€</span>
                          <input
                            inputMode="decimal"
                            value={d}
                            placeholder={market !== null ? String(market) : '-'}
                            onChange={(e) => {
                              const v = e.target.value
                              setDrafts({ ...drafts, [c.id]: v })
                              const p = parseOwnPrice(v.replace(',', '.'))
                              const next = { ...props.own }
                              if (p === null) delete next[c.id]
                              else next[c.id] = p * k
                              props.setOwn(next)
                            }}
                            aria-invalid={bad}
                            aria-label={`Your price for ${c.name}, € per ${unit}`}
                            className={`w-28 rounded-lg border bg-black/30 px-2.5 py-2 text-right font-mono text-sm text-ink outline-none placeholder:text-ink-4 ${bad ? 'border-danger' : 'border-white/15 focus:border-leaf/60'}`}
                          />
                          <span className="w-6 text-ink-3">/{unit}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                {Object.keys(props.own).length > 0 && (
                  <button onClick={() => { setDrafts({}); props.setOwn({}) }} className="mt-4 text-[13px] text-ink-3 underline decoration-white/20 underline-offset-4 hover:text-ink">
                    Clear my prices
                  </button>
                )}
              </div>
            </Reveal>

            <Reveal className="mt-4">
              <details className="rounded-2xl border border-white/10 p-5">
                <summary className="cursor-pointer text-sm text-ink">Freight, duty and sources</summary>
                <div className="mt-4 grid gap-x-8 gap-y-2 text-[13px] leading-relaxed text-ink-3 lg:grid-cols-2">
                  <p>Road: {RATES.roadBulk} € per t·km in bulk, {RATES.roadReefer} € refrigerated. {RATE_SOURCES.road}.</p>
                  <p>Sea: {RATES.seaBulkFix} € per t + {RATES.seaBulkKm} € per t·km in bulk, {RATES.port} € per t at each port; a refrigerated container costs €{RATES.reeferFeu.toLocaleString('en-US')} + {RATES.reeferFeuKm} € per km for {RATES.feuTonnes} t. {RATE_SOURCES.sea}; {RATE_SOURCES.reefer}.</p>
                  <p>Air: {RATES.airKg} € per kg, only for what would spoil at sea. {RATE_SOURCES.air}.</p>
                  <p>Duty: the buyer's average applied tariff on farm products (World Bank), capped at 30 %; none inside a customs union (EU, Mercosur, EAEU, USMCA, SACU, EAC). Food embargoes in force are respected (Russia since 2014, Ukraine since 2022).</p>
                  <p>Shelf life (USDA Handbook 66): grain and pulses keep; {Object.entries(MARKETS.shelf).filter(([, d]) => (d ?? 365) <= 30).map(([id, d]) => `${id} ${d} d`).join(', ')}.</p>
                  <p className="flex items-start gap-1.5 text-wheat"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Not modelled: quotas, trade deals beyond customs unions, plant-health bans, currency risk, the buyer's quality premiums.</p>
                  <p className="lg:col-span-2">Sources: {Object.values(MARKETS.sources).map((s) => s.note.split(':')[0]).join(' · ')} · fetched {MARKETS.fetched}. Country: {COUNTRY[ctx.home]?.name ?? ctx.home}.</p>
                </div>
              </details>
            </Reveal>
          </>
        )}
        </Instrument>
      </div>
    </section>
  )
}

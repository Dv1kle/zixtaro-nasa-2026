// One field, two NASA rain records (lib/rainTwo): the reanalysis the model runs on, and the rain measured from
// orbit by GPM IMERG. A cross-check for the reader, set like the water bucket's check against MERRA-2 - a sentence
// that says what was found, the two lines, and the small print. It is asked for when the tab is opened; nothing
// waits for it and nothing is scored with it.
import { Satellite } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { fetchImerg } from '../lib/api'
import type { ClimateAnalysis } from '../lib/climate'
import { useWidth } from '../lib/hooks'
import { compareRain, parseImerg, type RainTwo } from '../lib/rainTwo'

const EASE = [0.16, 1, 0.3, 1] as const

type State = { status: 'loading' } | { status: 'error' } | { status: 'short' } | { status: 'ready'; two: RainTwo }

export function RainTwoPanel({ climate }: { climate: ClimateAnalysis }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [box, width] = useWidth<HTMLDivElement>(640)
  useEffect(() => {
    const stop = new AbortController()
    setState({ status: 'loading' })
    fetchImerg(climate.lat, climate.lon, stop.signal)
      .then((r) => {
        const two = compareRain(climate, parseImerg(r.data))
        setState(two ? { status: 'ready', two } : { status: 'short' })
      })
      .catch(() => !stop.signal.aborted && setState({ status: 'error' }))
    return () => stop.abort()
  }, [climate])

  const two = state.status === 'ready' ? state.two : null
  const scale = useMemo(() => {
    if (!two) return null
    const all = two.years.flatMap((y) => [y.power, y.imerg])
    const lo = Math.min(...all)
    const hi = Math.max(...all)
    const pad = (hi - lo) * 0.12 || 50
    return { lo: Math.max(0, lo - pad), hi: hi + pad }
  }, [two])

  const head = (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div className="flex items-center gap-2 text-[15px] text-ink">
        <Satellite className="h-4 w-4 text-orbit" aria-hidden /> The same rain, measured two ways
      </div>
      <div className="font-mono text-[11px] text-ink-3">NASA POWER (MERRA-2, gauge-corrected) vs NASA GPM IMERG · annual totals</div>
    </div>
  )

  if (state.status === 'loading') return <div className="panel h-56 animate-pulse" aria-busy="true" />
  if (!two || !scale)
    return (
      <div className="panel p-5 sm:p-6">
        {head}
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">
          {state.status === 'short'
            ? 'The satellite record does not cover enough full years at this place to set beside the model’s rain.'
            : 'The satellite record could not be fetched just now - no connection, or NASA POWER did not answer. Nothing on this page depends on it: the model runs on the gauge-corrected record either way.'}
        </p>
      </div>
    )

  const W = width
  const H = Math.max(140, Math.min(200, width * 0.22))
  const n = two.years.length
  const x = (i: number) => 8 + (i / Math.max(1, n - 1)) * (W - 16)
  const y = (v: number) => 14 + (1 - (v - scale.lo) / (scale.hi - scale.lo)) * (H - 34)
  const path = (pick: (r: RainTwo['years'][number]) => number) => two.years.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pick(r)).toFixed(1)}`).join(' ')
  const from = two.years[0].year
  const to = two.years[n - 1].year
  const pc = Math.round(Math.abs(two.bias) * 100)
  const word = two.months.r >= 0.8 ? 'closely' : two.months.r >= 0.6 ? 'clearly' : two.months.r >= 0.4 ? 'loosely' : 'barely'
  const sure = Math.abs(two.bias) <= 0.1 && two.months.r >= 0.7 && two.apart.length <= n / 5

  return (
    <div className="panel p-5 sm:p-6">
      {head}
      <p className="mt-3 max-w-4xl text-lg leading-relaxed text-ink">
        From orbit, GPM IMERG measured {Math.round(two.mean.imerg)} mm of rain a year here in {from}-{to}; the record the model runs on has {Math.round(two.mean.power)} mm
        {pc >= 1 ? ` - the satellite sees ${pc} % ${two.bias > 0 ? 'more' : 'less'}` : ' - the same to within one per cent'}. Month by month the two {word} agree (r = {two.months.r.toFixed(2)} over {two.months.n} months).
      </p>
      <p className="mt-2 max-w-4xl text-[15px] leading-relaxed text-ink-2">
        {two.driest.power === two.driest.imerg ? `Both name ${two.driest.power} the driest year.` : `They name different driest years: ${two.driest.power} in the model’s record, ${two.driest.imerg} from orbit.`}{' '}
        {two.apart.length > 0 && `In ${two.apart.length} of ${n} years the annual totals part by more than a fifth (${two.apart.slice(0, 6).join(', ')}${two.apart.length > 6 ? ', …' : ''}). `}
        {sure ? 'For this field the rain is a settled input.' : 'Read this field’s water figures with that in mind: the rain itself is their least certain input.'}
      </p>
      <div ref={box} className="mt-4 w-full">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`Annual rain ${from} to ${to}: NASA POWER against GPM IMERG`}>
          <line x1={0} x2={W} y1={y(two.mean.power)} y2={y(two.mean.power)} stroke="rgb(255 255 255 / 0.08)" />
          <motion.path d={path((r) => r.imerg)} fill="none" stroke="var(--color-orbit)" strokeWidth={2} initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: EASE }} />
          <motion.path d={path((r) => r.power)} fill="none" stroke="var(--color-leaf)" strokeWidth={2} strokeDasharray="5 4" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: EASE, delay: 0.15 }} />
          {two.years.map((r, i) => (i % 5 === 0 || i === n - 1) && (
            <text key={r.year} x={x(i)} y={H - 2} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-ink-4 font-mono text-[10px]">{r.year}</text>
          ))}
          <text x={6} y={10} className="fill-ink-4 font-mono text-[10px]">{Math.round(scale.hi)} mm</text>
          <text x={6} y={H - 16} className="fill-ink-4 font-mono text-[10px]">{Math.round(scale.lo)} mm</text>
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-5 bg-orbit" /> GPM IMERG - rain measured from orbit, ≈ 10 km</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-5 border-t-2 border-dashed border-leaf" /> NASA POWER - the reanalysis the model runs on, ≈ 50 km</span>
      </div>
      <p className="mt-3 max-w-4xl text-xs leading-relaxed text-ink-3">
        Neither line is a rain gauge in this field. MERRA-2 is a weather model pulled toward observations and corrected with gauges; IMERG reads rain from microwave and infrared sensors in orbit and is corrected monthly with gauges too. They are two estimates of the same rain,
        made differently: where they part, a gauge of your own settles it. The satellite record starts in 2001, so the model keeps to the longer one; IMERG enters no score. Month-by-month agreement is counted after each record’s own seasonal cycle is taken out.
      </p>
    </div>
  )
}

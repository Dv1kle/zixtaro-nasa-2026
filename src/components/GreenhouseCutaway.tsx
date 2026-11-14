import { Pause, Play } from 'lucide-react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { useNear } from '../lib/prewarm'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { MONTHS_SHORT } from '../lib/format'
import { cutawayMonth, yearTank } from '../lib/ghCutaway'
import { co2On, type GhResult } from '../lib/greenhouse'
import { GreenhouseCutawayFlat } from './GreenhouseCutawayFlat'

// The house in cross-section, month by month, drawn from the model's own numbers: sunlight from CERES (the height of
// the sun and the strength of its beams), what the cover lets through, lamps, heating pipes and the heat leaving
// through the roof, the screens, the crop from planting to harvest, and rain running off the roof into the tank.
// A cut-away 3D model of the house (GreenhouseCutaway3D, lazy three.js) where WebGL runs; the flat drawing where not.

const Cutaway3D = lazy(() => import('./GreenhouseCutaway3D'))
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// the model dissolves into the panel at its edges instead of ending in a box
const EDGE: CSSProperties = {
  maskImage: 'linear-gradient(90deg, transparent 0, #000 3.5%, #000 96.5%, transparent 100%), linear-gradient(180deg, transparent 0, #000 7%, #000 92%, transparent 100%)',
  maskComposite: 'intersect',
  WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 3.5%, #000 96.5%, transparent 100%), linear-gradient(180deg, transparent 0, #000 7%, #000 92%, transparent 100%)',
  WebkitMaskComposite: 'source-in',
}

export function GreenhouseCutaway({ result, month, setMonth }: { result: GhResult; month: number; setMonth: (m: number) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const inView = useInView(box, { margin: '-15% 0px' })
  // the model is made ahead of the reader (in a pause of the scrolling, or as the section comes near) and then stays;
  // its loop sleeps whenever it is off screen
  const near = useNear(box, { margin: '900px 0px' })
  const reduce = useReducedMotion()
  const [playing, setPlaying] = useState(!reduce)
  const [noGl, setNoGl] = useState(false)
  useEffect(() => {
    if (!playing || !inView || reduce) return
    const t = setInterval(() => setMonth((month + 1) % 12), 2600)
    return () => clearInterval(t)
  }, [playing, inView, reduce, month, setMonth])

  const levels = useMemo(() => yearTank(result), [result])
  const look = useMemo(() => cutawayMonth(result, month, levels), [result, month, levels])
  const lights = useMemo(() => {
    const max = Math.max(...result.months.map((x) => x.dliOut), 1)
    return result.months.map((x) => x.dliOut / max)
  }, [result])
  const { m, inCrop, lamps, rainMm, level, inside, hot } = look
  const crop = result.crop
  const spec = result.spec
  const heatedNow = spec.heated && m.heatKwh >= 5
  const co2 = co2On(spec)
  const chp = !!spec.chp && spec.heated
  const kit = useMemo(() => ({ heated: spec.heated, lit: spec.lit, screen: spec.screen, co2, chp }), [spec.heated, spec.lit, spec.screen, co2, chp])
  const labels = useMemo(
    () => ({
      out: `${m.tOut.toFixed(0)}°`,
      inside: inCrop ? (hot ? `${inside.toFixed(0)}° inside by day - shade!` : `${inside.toFixed(0)}° inside by day${heatedNow ? ' · heated' : ''}`) : null,
      hot,
      note: inCrop ? null : m.state === 'idle' ? (spec.heated ? 'left cold - heating would cost more than it earns' : 'empty') : `too cold: nights ≈ ${m.insideNight.toFixed(0)} °C inside`,
      tank: `tank ${Math.round(level * 100)}%`,
      floor: `${Math.round(spec.floorM2).toLocaleString('en-US')} m² floor`,
    }),
    [m, inCrop, hot, inside, heatedNow, spec.heated, spec.floorM2, level],
  )
  const said = `${MONTHS_LONG[month]}: ${m.state === 'harvest' ? 'harvesting' : m.state === 'establish' ? 'young plants' : m.state === 'idle' ? 'house left empty' : 'too cold for the crop'}, ${m.dliOut.toFixed(0)} mol of daylight outside, ${m.tOut.toFixed(0)} °C outside${heatedNow && inCrop ? ', boiler on' : ''}${lamps ? ', lamps on' : ''}`

  return (
    <div ref={box} className="gh-anim">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker">The house through the year · {crop.name.toLowerCase()}</div>
          <motion.div key={month} initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.45 }} className="font-display-soft mt-2 text-4xl leading-none text-ink">
            {MONTHS_LONG[month]}
          </motion.div>
        </div>
        {/* fixed cells: the numbers change every month, the layout never does */}
        <dl className="grid w-full grid-cols-2 gap-x-5 gap-y-2 font-mono text-[11px] text-ink-3 sm:w-auto sm:grid-cols-[repeat(4,minmax(0,max-content))]">
          <div className="min-w-[9.5rem]"><dt>light, mol/m²·day</dt><dd className="text-sm text-wheat">{m.dliOut.toFixed(0)} → {(m.dliIn + (lamps ? m.supp : 0)).toFixed(0)}{lamps ? ' with lamps' : ''}</dd></div>
          <div className="min-w-[7rem]"><dt>boiler heat</dt><dd className="text-sm text-heat">{spec.heated && inCrop && m.heatKwh >= 1 ? `${m.heatKwh.toFixed(0)} kWh/m²` : 'off'}</dd></div>
          <div className="min-w-[8rem]"><dt>rain · tank</dt><dd className="text-sm text-water">{rainMm.toFixed(0)} mm · {Math.round(level * 100)}%</dd></div>
          <div className="min-w-[8.5rem]"><dt>out · in by day</dt><dd className={`text-sm ${hot && inCrop ? 'text-heat' : 'text-ink-2'}`}>{m.tOut.toFixed(0)}° · {inside.toFixed(0)}°</dd></div>
        </dl>
      </div>

      {noGl ? (
        <div className="mt-4" role="img" aria-label={said}>
          <GreenhouseCutawayFlat result={result} look={look} />
        </div>
      ) : (
        <div role="img" aria-label={said} className="relative -mx-5 mt-4 aspect-[4/3] sm:mx-0 sm:aspect-[1000/580]" style={EDGE}>
          {near && (
            <Suspense fallback={null}>
              <Cutaway3D look={look} lights={lights} crop={{ id: crop.id }} cover={spec.cover} kit={kit} reduce={!!reduce} labels={labels} onFail={() => setNoGl(true)} />
            </Suspense>
          )}
        </div>
      )}

      {/* month scrubber = the calendar */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setPlaying(!playing)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-ink-2 hover:text-ink"
          aria-label={playing ? 'Pause the year' : 'Play the year'}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <div className="relative grid flex-1 grid-cols-12 gap-1">
          {result.months.map((x, i) => (
            <button
              key={i}
              onClick={() => {
                setPlaying(false)
                setMonth(i)
              }}
              aria-pressed={i === month}
              aria-label={MONTHS_LONG[i]}
              className="relative rounded-md pt-1 pb-1.5 text-center transition hover:bg-white/5"
            >
              {i === month && <motion.span layoutId="gh-month" className="absolute inset-0 rounded-md bg-white/10" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
              <span className={`relative block font-mono text-[11px] ${i === month ? 'text-ink' : 'text-ink-4'}`}>{MONTHS_SHORT[i][0]}</span>
              <span className={`relative mx-auto mt-1 block h-1 w-4/5 rounded-full ${x.state === 'harvest' ? 'bg-leaf' : x.state === 'establish' ? 'bg-leaf/40' : x.state === 'idle' ? 'bg-wheat/50' : 'bg-white/10'}`} />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-10 font-mono text-[11px] text-ink-4">
        <span className="flex items-center gap-1.5"><i className="h-1 w-3 rounded-full bg-leaf" />harvest</span>
        <span className="flex items-center gap-1.5"><i className="h-1 w-3 rounded-full bg-leaf/40" />planted</span>
        <span className="flex items-center gap-1.5"><i className="h-1 w-3 rounded-full bg-wheat/50" />{spec.heated ? 'left cold' : 'empty'}</span>
        <span className="flex items-center gap-1.5"><i className="h-1 w-3 rounded-full bg-white/10" />too cold</span>
      </div>
    </div>
  )
}

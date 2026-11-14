import { Satellite } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { checkBucket } from '../lib/bucketCheck'
import type { ClimateAnalysis } from '../lib/climate'
import type { SoilProfile } from '../lib/soil'
import { useLater, useWidth } from '../lib/hooks'

const EASE = [0.16, 1, 0.3, 1] as const

/** Zixtaro's water bucket against NASA MERRA-2's root-zone wetness, season by season, with honest intervals. */
export function BucketCheckPanel({ climate, soil }: { climate: ClimateAnalysis; soil: SoilProfile }) {
  const check = useLater(() => checkBucket(climate, soil), [climate, soil], 500)
  const [box, width] = useWidth<HTMLDivElement>(640)
  const z = useMemo(() => {
    if (!check) return null
    const std = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length
      const s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1
      return xs.map((x) => (x - m) / s)
    }
    const rows = check.seasons.rows
    return { years: rows.map((r) => r.year), model: std(rows.map((r) => r.model)), nasa: std(rows.map((r) => r.nasa)) }
  }, [check])
  if (!check || !z) return <div className="panel h-48 animate-pulse" />
  const W = width
  const H = Math.max(130, Math.min(190, width * 0.2))
  const x = (i: number) => 8 + (i / Math.max(1, z.years.length - 1)) * (W - 16)
  const y = (v: number) => H / 2 - Math.max(-2.8, Math.min(2.8, v)) * (H / 6.2)
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const f = (a: { rho: number; lo: number; hi: number }) => `ρ = ${a.rho.toFixed(2)} (95 % CI ${a.lo.toFixed(2)}-${a.hi.toFixed(2)})`
  const word = check.months.rho >= 0.7 ? 'closely' : check.months.rho >= 0.5 ? 'clearly' : check.months.rho >= 0.3 ? 'loosely' : 'barely'
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><Satellite className="h-4 w-4 text-orbit" /> Checked against NASA's own soil-moisture model</div>
        <div className="font-mono text-[11px] text-ink-3">Zixtaro bucket vs MERRA-2 GWETROOT · anomalies · block bootstrap</div>
      </div>
      <p className="mt-3 max-w-4xl text-lg leading-relaxed text-ink">
        The water in Zixtaro's root-zone bucket {word} follows NASA's land-surface model here: {f(check.months)} over {check.months.n} months,
        and {f(check.seasons)} across {check.seasons.n} growing seasons.
      </p>
      <div ref={box} className="mt-4 w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Growing-season water, Zixtaro bucket versus NASA MERRA-2, as standard scores by year">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgb(255 255 255 / 0.08)" />
        <motion.path d={path(z.nasa)} fill="none" stroke="var(--color-orbit)" strokeWidth={2} initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: EASE }} />
        <motion.path d={path(z.model)} fill="none" stroke="var(--color-leaf)" strokeWidth={2} strokeDasharray="5 4" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, delay: 0.3, ease: EASE }} />
        {z.years.map((yr, i) => (i % 10 === 0 || i === z.years.length - 1) && (
          <text key={yr} x={x(i)} y={H - 2} textAnchor={i === 0 ? 'start' : i === z.years.length - 1 ? 'end' : 'middle'} className="fill-ink-4 font-mono text-[10px]">{yr}</text>
        ))}
        <text x={6} y={12} className="fill-ink-4 font-mono text-[10px]">wetter</text>
        <text x={6} y={H - 14} className="fill-ink-4 font-mono text-[10px]">drier</text>
      </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-5 rounded-full bg-orbit" /> NASA MERRA-2 root-zone wetness</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-5 rounded-full border-t-2 border-dashed border-leaf" /> Zixtaro FAO-56 bucket, this soil</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        MERRA-2 runs NASA's Catchment land-surface model - several soil layers and a water table - so it is a different model from Zixtaro's
        FAO-56 bucket. Both see largely the same MERRA-2 weather, so this checks the bucket's storage, evaporation and drainage, not the rain.
        Seasonal cycles are removed first, so the agreement is about wet and dry spells. Intervals: 300 resamples of whole years, fixed seed.
      </p>
    </div>
  )
}

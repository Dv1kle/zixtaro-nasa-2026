import { Flame } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import { CROP_BY_ID, type Crop, type CropId } from '../lib/crops'
import { formOf } from '../lib/water'
import type { DailyAnalysis } from '../lib/daily'
import { cropExtremes, HOT_DAYS_HIT, T_CRIT } from '../lib/extremes'
import { MONTHS_SHORT, pct } from '../lib/format'
import { CropTile } from './ui'

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * Heat waves at flowering, crop by crop: how often a season now brings ≥ 3 days above each crop's critical
 * temperature in its most sensitive month, then and now - the extreme a monthly mean hides.
 */
export function HeatWavePanel({ climate, daily }: { climate: ClimateAnalysis; daily: DailyAnalysis }) {
  const rows = useMemo(() => {
    const ids = Object.keys(T_CRIT) as CropId[]
    return ids
      // the form this field grows (the autumn-sown wheat of Punjab flowers in February, not in May)
      .map((id) => ({ id, crop: formOf(CROP_BY_ID[id], climate) }))
      .map(({ id, crop }) => ({ id, crop, x: cropExtremes(crop, daily.raw, climate) }))
      // the share of seasons with a heat wave at flowering (the score prices its degree-days instead)
      .map((r) => (r.x ? { ...r, x: { ...r.x, heat: { ...r.x.heat, ...r.x.heat.waves } } } : r))
      .filter((r): r is { id: CropId; crop: Crop; x: NonNullable<typeof r.x> } => r.x !== null)
      .sort((a, b) => b.x.heat.recent - b.x.heat.baseline - (a.x.heat.recent - a.x.heat.baseline) || b.x.heat.recent - a.x.heat.recent)
      .slice(0, 8)
  }, [climate, daily])
  if (!rows.length) return null
  const worst = rows[0]
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><Flame className="h-4 w-4 text-heat" /> Heat waves at flowering</div>
        <div className="font-mono text-[11px] text-ink-3">share of seasons with ≥ {HOT_DAYS_HIT} days above the crop's critical temperature · NASA POWER daily</div>
      </div>
      {worst.x.heat.recent - worst.x.heat.baseline >= 0.1 && (
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">
          {worst.crop.name} now meets a flowering heat wave in <span className="text-heat">{pct(worst.x.heat.recent)}</span> of seasons, against{' '}
          {pct(worst.x.heat.baseline)} in {climate.baseline.from}-{climate.baseline.to} - invisible in monthly averages, decisive for grain set.
        </p>
      )}
      <div className="mt-5 grid gap-x-8 gap-y-2.5 md:grid-cols-2">
        {rows.map(({ id, crop: c, x }, i) => {
          return (
            <div key={id} className="grid grid-cols-[132px_minmax(0,1fr)_78px] items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)_78px]">
              <span className="flex min-w-0 items-center gap-2">
                <CropTile crop={c} size="xs" />
                <span className="min-w-0">
                  <span className="block text-[13px] leading-tight text-ink-2 sm:truncate">{c.name}</span>
                  <span className="block font-mono text-[11px] text-ink-4">≥ {x.heat.tCrit} °C · {MONTHS_SHORT[x.heat.month - 1]}</span>
                </span>
              </span>
              <span className="relative h-5">
                <span className="absolute inset-x-0 top-0.5 h-1.5 rounded-full bg-white/[0.05]" />
                <motion.span className="absolute top-0.5 left-0 h-1.5 rounded-full bg-white/35" initial={{ width: 0 }} whileInView={{ width: `${x.heat.baseline * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.05 * i, ease: EASE }} />
                <span className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-white/[0.05]" />
                <motion.span className="absolute top-3 left-0 h-1.5 rounded-full bg-heat shadow-[0_0_10px_-1px_var(--color-heat)]" initial={{ width: 0 }} whileInView={{ width: `${x.heat.recent * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.05 * i + 0.2, ease: EASE }} />
              </span>
              <span className="num text-right text-[12px]">
                <span className="text-ink-4">{pct(x.heat.baseline)}</span> <span className="text-ink-3">→</span> <span className={x.heat.recent > x.heat.baseline ? 'text-heat' : 'text-ink-2'}>{pct(x.heat.recent)}</span>
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 font-mono text-[11px] text-ink-4">
        <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full bg-white/35" /> {climate.baseline.from}-{climate.baseline.to}</span>
        <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full bg-heat" /> {climate.recent.from}-{climate.recent.to}</span>
        <span>critical temperatures: Porter & Gawith 1999, Morrison & Stewart 2002, Prasad et al. 2006-08, Sita et al. 2017 and others</span>
      </div>
    </div>
  )
}

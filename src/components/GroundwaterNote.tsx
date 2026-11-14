import { Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { graceFor, type GraceHere } from '../lib/grace'
import type { WinterDrainage } from '../lib/nitrate'

/**
 * Can the water budget last? Three numbers side by side: what the region's total water store has done since 2002,
 * weighed from orbit by NASA GRACE / GRACE-FO; what this field gives back to the ground each winter (drainage below
 * the roots - the recharge that tops the store up); and what the chosen irrigation budget takes out.
 */
export function GroundwaterNote({ lat, lon, presetId, budget, unlimited, recharge, irrigationNeed }: {
  lat: number
  lon: number
  presetId: string | null
  budget: number
  unlimited: boolean
  recharge: WinterDrainage | undefined
  irrigationNeed: number // mm per season the top pick would draw when unlimited
}) {
  const [g, setG] = useState<GraceHere | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    graceFor(lat, lon, presetId).then((x) => live && setG(x)).catch(() => live && setG(null))
    return () => {
      live = false
    }
  }, [lat, lon, presetId])
  const take = unlimited ? irrigationNeed : budget
  if (take <= 0 || g === undefined) return null
  const back = recharge?.bare ?? null
  const trend = g?.trendCmPerYear ?? null
  const losing = trend !== null && trend <= -0.3
  const over = back !== null && take > back
  const tone = losing && over ? 'bad' : losing || over ? 'warn' : 'ok'
  const cls = tone === 'bad' ? 'border-heat/35 bg-heat/[0.07]' : tone === 'warn' ? 'border-wheat/30 bg-wheat/[0.06]' : 'border-water/25 bg-water/[0.05]'
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm leading-relaxed text-ink-2 ${cls}`}>
      <Waves className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'bad' ? 'text-heat' : tone === 'warn' ? 'text-wheat' : 'text-water'}`} />
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11.5px]">
          <span><span className="text-ink-4">you take</span> <span className="text-ink">{Math.round(take)} mm</span>/season{unlimited ? ' (what the pick needs)' : ''}</span>
          {back !== null && <span><span className="text-ink-4">the field gives back</span> <span className="text-ink">~{Math.round(back)} mm</span> in winter</span>}
          {trend !== null && (
            <span>
              <span className="text-ink-4">region's water store</span>{' '}
              <span className={trend < 0 ? 'text-heat' : 'text-water'}>{trend > 0 ? '+' : ''}{trend.toFixed(1)} cm/yr</span> since {g?.change.from ?? 2002}
              {g?.p != null && <span className="text-ink-4"> ({g.p < 0.05 ? 'significant' : 'not significant'})</span>}
            </span>
          )}
        </div>
        <p>
          {tone === 'bad'
            ? `The region has been losing water from orbit's point of view, and this budget draws more than the field's own winter recharge. If it comes from groundwater, it adds to the decline - plan the lower budgets on the irrigation ladder, or crops that need less.`
            : tone === 'warn' && losing
              ? `The region has been losing water since ${g?.change.from ?? 2002}; even a budget within the field's own recharge competes with that deficit. Check your abstraction licence and the local aquifer trend.`
              : tone === 'warn'
                ? `This budget draws more than the field returns in an average winter; that is sustainable only where rivers or a gaining aquifer make up the difference.`
                : `The budget stays within what the field returns in winter, and the region's water store is not declining.`}
        </p>
        <p className="text-[11px] text-ink-4">
          GRACE / GRACE-FO (CSR RL06.3 mascons) weigh total water storage - soil, groundwater, snow, lakes - at ≈ 300 km resolution: a regional
          signal, not a well level. Winter recharge: drainage below the roots from Zixtaro's water model on NASA POWER, bare soil.
        </p>
      </div>
    </div>
  )
}

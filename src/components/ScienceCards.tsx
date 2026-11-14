import { Bug, CalendarDays, Sigma, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import { baseForm, type FormOf } from '../lib/crops'
import type { DailyAnalysis } from '../lib/daily'
import { dailyCheck } from '../lib/dailyWater'
import { pct, signed } from '../lib/format'
import { insectPressure } from '../lib/pests'
import type { FieldContext } from '../lib/rotation'
import type { SobolGap } from '../lib/sobol'

const EASE = [0.16, 1, 0.3, 1] as const

/** Sobol indices of the lead: what the gap between the pick and the runner-up depends on, interactions included. */
export function SobolBlock({ s, form = baseForm }: { s: SobolGap; form?: FormOf }) {
  const top = s.factors.filter((f) => f.ST >= 0.02)
  return (
    <div className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-[14px] text-ink"><Sigma className="h-4 w-4 text-orbit" /> What the lead depends on - all inputs varied together</div>
        <div className="font-mono text-[11px] text-ink-3">Sobol indices · {s.n * (s.factors.length + 2)} runs · lead {signed(s.gap, 1)} ± {s.sd.toFixed(1)} points</div>
      </div>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-3">
        The share of the uncertainty in {form(s.pick).name.toLowerCase()}’s lead over {form(s.rival).name.toLowerCase()} each input explains -
        alone (light) and with its interactions (full bar). One-at-a-time tests miss the interactions; these do not.
      </p>
      <ul className="mt-3 space-y-1.5">
        {(top.length ? top : s.factors.slice(0, 3)).map((f, i) => (
          <li key={f.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_44px] items-center gap-3 text-[12.5px]">
            <span className="truncate text-ink-2">{f.label}</span>
            <span className="relative h-2 rounded-full bg-white/[0.05]">
              <motion.i className="absolute inset-y-0 left-0 rounded-full bg-orbit/35" initial={{ width: 0 }} whileInView={{ width: `${f.ST * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.05 * i, ease: EASE }} />
              <motion.i className="absolute inset-y-0 left-0 rounded-full bg-orbit" initial={{ width: 0 }} whileInView={{ width: `${f.S1 * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.05 * i, ease: EASE }} />
            </span>
            <span className="num text-right text-ink-3">{pct(f.ST)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] text-ink-4">Saltelli et al. 2010 (first order), Jansen 1999 (total order); the estimator is tested against the Ishigami function’s exact indices. Seasons stay as observed here - the Monte Carlo above resamples them.</p>
    </div>
  )
}

/** The monthly water model re-run day by day on NASA POWER daily data: do the crops keep their order? */
export function DailyCheckCard({ climate, ctx, daily }: { climate: ClimateAnalysis; ctx: FieldContext; daily: DailyAnalysis | null }) {
  const check = useMemo(() => (daily ? dailyCheck(climate, ctx.soil, daily.raw, ctx.risks) : null), [climate, ctx.soil, ctx.risks, daily])
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 text-[14px] text-ink"><CalendarDays className="h-4 w-4 text-water" /> Day by day, does the order hold?</div>
      {!check ? (
        <p className="mt-2 text-[13px] text-ink-3">{daily ? 'Too few complete seasons in the daily record.' : 'Waiting for NASA POWER daily data…'}</p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-display-soft text-4xl text-ink">ρ {check.rho.toFixed(2)}</span>
            <span className="text-[13px] text-ink-3">rank agreement of {check.n} crops’ water-stress loss, monthly model vs daily re-run</span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
            FAO-56 single Kc, day by day, with Hargreaves ET₀ from daily Tmax/Tmin (eq. 52) - the monthly model uses Penman-Monteith, so levels differ;
            what matters for the ranking is the order. {check.rho >= 0.7 ? 'It holds: monthly smoothing does not reorder the crops much.' : 'It shifts: short dry spells matter here, so read close water scores as ties.'}
          </p>
        </>
      )}
    </div>
  )
}

/** Insect pressure from warmth: degree-days above 10 °C, then and now, with Deutsch et al.'s loss range. */
export function PestCard({ climate }: { climate: ClimateAnalysis }) {
  const x = useMemo(() => insectPressure(climate), [climate])
  if (!x) return null
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 text-[14px] text-ink"><Bug className="h-4 w-4 text-heat" /> Warmth for insects</div>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-display-soft text-4xl text-ink">{signed(x.change * 100, 0, ' %')}</span>
        <span className="text-[13px] text-ink-3">degree-days above 10 °C: {Math.round(x.baseline)} → {Math.round(x.recent)} a year</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
        More warmth means more pest generations a season. Deutsch et al. (2018) project insect losses of maize, rice and wheat to rise
        10-25 % per °C of warming; this field has warmed {signed(x.dT, 1, ' °C')} since {climate.baseline.from}-{climate.baseline.to}
        {x.dT > 0 ? ` - on that scale, roughly ${Math.round(x.lossRise[0])}-${Math.round(x.lossRise[1])} % more lost to insects` : ''}. A regional proxy,
        not a forecast for any pest; rotation breaks (above) remain the first defence.
      </p>
    </div>
  )
}

const FINDINGS = [
  { k: 'Profit and risk come first', v: 'Practices spread when they are relatively advantageous and can be tried on part of the farm first; soil benefits alone rarely decide.', src: 'Pannell et al. 2006', our: 'Every plan shows its margin and risk; the sandbox lets you try a rotation before committing.' },
  { k: 'No single farmer profile', v: 'Thirty-five years of US studies found few factors that consistently predict adoption; information, capacity and attitudes matter more than demographics.', src: 'Prokopy et al. 2019', our: 'Priorities are yours to set, and every answer explains itself instead of assuming a type of farmer.' },
  { k: 'Markets and contracts constrain rotations', v: 'Grain legumes declined in Europe despite their rotation benefits because of weaker relative profitability, missing markets and know-how.', src: 'Zander et al. 2016; Preissel et al. 2015', our: 'What the region already grows (CROPGRIDS) sits next to the plan; contract crops stay off unless grown locally.' },
  { k: 'Decision tools are rarely used', v: 'Uptake depends on relevance to the farmer’s own decision, ease of use, trust in the data and fit with advisers - not on model sophistication.', src: 'McCown 2002; Rose et al. 2016', our: 'One decision screen, every number traceable to its source, limits and failure modes stated.' },
]

/** How farmers actually decide on rotations - the literature, kept apart from our own interview. */
export function FarmerEvidence() {
  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex items-center gap-2 text-[15px] text-ink"><Users className="h-4 w-4 text-[#c9b8ff]" /> How farmers actually decide - and what we changed because of it</div>
      <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Published studies describe farmers in their own regions and times; they do not describe any particular farmer who uses Zixtaro. They are
        supporting evidence for the design. Our own farmer interview is separate primary research and is not merged into these statements.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {FINDINGS.map((f) => (
          <div key={f.k} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[14px] text-ink">{f.k}</div>
            <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{f.v} <span className="font-mono text-[11px] text-ink-4">- {f.src}</span></p>
            <p className="mt-2 text-[12.5px] leading-snug text-leaf/90">→ {f.our}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

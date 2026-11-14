import { Target } from 'lucide-react'
import { motion } from 'motion/react'
import cal from '../data/calibration.json'
import { pct } from '../lib/format'

const EASE = [0.16, 1, 0.3, 1] as const
type Bin = { from: number; to: number; n: number; meanShare: number | null; hitRate: number | null }

/**
 * Is the share honest? The out-of-sample check: decisions made on the demo fields with
 * data up to two years before, re-ranked once the next ten seasons were observed. Said vs held, bin by bin.
 */
export function CalibrationNote() {
  const bins = (cal.all.bins as Bin[]).filter((b) => b.n >= 5)
  const w = cal.weather
  const torgau = cal.rows.filter((r) => r.s === 'torgau' && r.t !== r.p && r.w >= 0.9)
  return (
    <div className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-[14px] text-ink"><Target className="h-4 w-4 text-leaf" /> Is that share honest? Checked out of sample</div>
        <div className="font-mono text-[11px] text-ink-3">{cal.decisions} decisions · {cal.sites.length} demo fields · {cal.years[0]}-{cal.years[1]} · next {cal.horizon} seasons as truth</div>
      </div>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-3">
        Each decision saw only the record up to two years before; the pick was then re-ranked once the following {cal.horizon} seasons had been
        observed. A share is honest if picks rated “holds in 80 %” stay first about 80 % of the time.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {bins.map((b, i) => {
          const said = b.meanShare ?? 0
          const held = b.hitRate ?? 0
          const gap = held - said
          return (
            <div key={b.from} className="rounded-xl bg-white/[0.025] p-3">
              <div className="flex items-baseline justify-between font-mono text-[11px] text-ink-4">
                <span>rated {Math.round(b.from * 100)}-{Math.round(b.to * 100)} %</span>
                <span>n {b.n}</span>
              </div>
              {[['said', said, 'bg-white/35'], ['held', held, gap >= -0.05 ? 'bg-leaf' : 'bg-wheat']].map(([k, v, c]) => (
                <div key={k as string} className="mt-2 grid grid-cols-[34px_1fr_38px] items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-3">{k as string}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.i className={`block h-full rounded-full ${c as string}`} initial={{ width: 0 }} whileInView={{ width: `${(v as number) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.08 * i, ease: EASE }} />
                  </span>
                  <span className="num text-right text-[12px] text-ink-2">{pct(v as number)}</span>
                </div>
              ))}
              <div className="mt-2 text-[11.5px] text-ink-3">{Math.abs(gap) <= 0.05 ? 'about right' : gap > 0 ? 'cautious - held more often than rated' : 'over-confident'}</div>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
        Brier score {cal.all.brier.toFixed(3)} against {cal.all.brierClimatology.toFixed(3)} for always saying “{pct(cal.all.hitRate)}”; the pick was
        in the top two {pct(cal.top2)} of the time. Resampling the weather alone is over-confident
        {torgau.length ? ` - at Torgau it rated sunflower above 90 % for ${torgau[0].d}-${torgau[torgau.length - 1].d}, yet the drier decade that followed put ${torgau[0].t === 'rapeseed' ? 'winter rapeseed' : torgau[0].t} first` : ''}: the past decade
        cannot show a trend coming, which is why the share above also varies soil, crop response, prices and priorities. Caveats: decisions a year
        apart share nine of their ten verifying seasons, the truth is the model’s own ranking on observed weather (not harvests), and five fields
        are few. Weather-only Brier {w.brier.toFixed(3)}.
      </p>
    </div>
  )
}

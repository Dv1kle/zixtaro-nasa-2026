import { CalendarClock } from 'lucide-react'
import { motion } from 'motion/react'
import { CROP_BY_ID } from '../lib/crops'
import { pct } from '../lib/format'
import { SHIFTS, type SowAdvice } from '../lib/sowing'
import { CropTile } from './ui'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const EASE = [0.16, 1, 0.3, 1] as const
const date = ([m, d]: [number, number], south: boolean) => {
  const mm = south ? ((m + 5) % 12) + 1 : m
  return `${d} ${MON[mm - 1]}`
}
const weeks = (days: number) => `${Math.abs(days / 7)} weeks ${days < 0 ? 'earlier' : 'later'}`

/** Sow earlier or later? Five windows per crop, the best one named, with what it buys and what rules the others out. */
export function SowingPanel({ advice, south }: { advice: SowAdvice[]; south: boolean }) {
  if (!advice.length) return null
  const moved = advice.filter((a) => a.best.shift !== 0 && a.best.index - a.now.index >= 0.03)
  const lead = moved.sort((a, b) => b.best.index - b.now.index - (a.best.index - a.now.index))[0]
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><CalendarClock className="h-4 w-4 text-leaf" /> Sow earlier or later?</div>
        <div className="font-mono text-[11px] text-ink-3">every window re-run: water, heat at flowering, frost, warmth to ripen</div>
      </div>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">
        {lead
          ? `In this field's recent climate the usual date is not the best one: sowing ${lead.crop.name.toLowerCase()} ${weeks(lead.best.shift)} (${date(lead.best.sow, south)}) lifts its expected share of yield from ${pct(lead.now.index)} to ${pct(lead.best.index)}${lead.best.loss < lead.now.loss - 0.02 ? ` - water-stress loss ${pct(lead.now.loss)} → ${pct(lead.best.loss)}` : ''}${lead.best.waves < lead.now.waves - 0.05 ? `, heat at flowering ${pct(lead.now.waves)} → ${pct(lead.best.waves)} of seasons` : ''}.`
          : "In this field's recent climate the usual sowing dates are still the best windows."}
      </p>
      <div className="mt-5 space-y-2">
        <div className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 font-mono text-[11px] text-ink-4 max-sm:hidden">
          <span>crop</span>
          <span className="flex justify-between">{SHIFTS.map((s) => <span key={s} className="w-8 text-center">{s === 0 ? 'usual' : `${s > 0 ? '+' : '−'}${Math.abs(s / 7)}w`}</span>)}</span>
          <span>best window</span>
        </div>
        {advice.map((a, i) => {
          const c = a.crop
          const max = Math.max(...a.options.map((o) => o.index), 0.01)
          return (
            <div key={a.id} className="grid grid-cols-1 items-center gap-2 rounded-xl bg-white/[0.02] px-3 py-2 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <CropTile crop={c} size="xs" />
                <span className="truncate text-[13px] text-ink-2">{c.name}</span>
              </span>
              <span className="flex items-end justify-between" aria-label={`${c.name}: windows from six weeks earlier to six weeks later`}>
                {SHIFTS.map((s) => {
                  const o = a.options.find((x) => x.shift === s)
                  if (!o) return <span key={s} className="w-8" />
                  const best = o.shift === a.best.shift
                  return (
                    <span key={s} className="flex w-8 flex-col items-center gap-1" title={`${date(o.sow, south)}: ${o.ok ? `expected ${pct(o.index)} of yield · loss ${pct(o.loss)} · flowering heat ${pct(o.waves)}${o.frost ? ` · frost ${pct(o.frost)}` : ''}` : o.why}`}>
                      <span className="flex h-8 w-3 items-end overflow-hidden rounded-sm bg-white/[0.04]">
                        <motion.i
                          className="block w-full rounded-sm"
                          style={{ background: !o.ok ? 'rgb(255 255 255 / 0.12)' : best ? c.color : `color-mix(in oklab, ${c.color} 45%, transparent)`, boxShadow: best ? `0 0 10px ${c.color}` : undefined }}
                          initial={{ height: 0 }}
                          whileInView={{ height: `${(o.index / max) * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.6, delay: 0.04 * i, ease: EASE }}
                        />
                      </span>
                      <span className={`font-mono text-[11px] ${!o.ok ? 'text-ink-4 line-through' : best ? 'text-ink' : 'text-ink-4'}`}>{date(o.sow, south).replace(' ', ' ')}</span>
                    </span>
                  )
                })}
              </span>
              <span className="text-[12px] leading-snug text-ink-3">
                {a.best.shift === 0 || a.best.index - a.now.index < 0.01 ? (
                  <>keep {date(a.now.sow, south)}{!a.now.ok ? ` - ${a.now.why}` : ''}</>
                ) : (
                  <>
                    <span className="text-leaf">{weeks(a.best.shift)}</span> · {pct(a.now.index)} → {pct(a.best.index)} of yield
                  </>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Each window moves the whole FAO-56 season and re-runs the root-zone water model, heat at flowering and frost after emergence
        (NASA POWER daily) and warmth to ripen. Ruled out (struck through): a seed bed colder than the crop needs, too little warmth left, or
        a frost-tender crop still drying in the field three weeks before the average first autumn frost. Bars: expected share of yield from
        these factors. Hover a bar for its numbers.
      </p>
    </div>
  )
}

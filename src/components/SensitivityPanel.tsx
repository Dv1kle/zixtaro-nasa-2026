import { ArrowRight, Droplets, Shuffle } from 'lucide-react'
import { motion } from 'motion/react'
import { baseForm, type CropId, type FormOf } from '../lib/crops'
import { pct } from '../lib/format'
import { LADDER, type Confidence, type Sensitivity } from '../lib/robust'
import { Chip, CropTile, type WaterApi } from './ui'
import { CalibrationNote } from './CalibrationNote'
import { SobolBlock } from './ScienceCards'
import type { SobolGap } from '../lib/sobol'

const EASE = [0.16, 1, 0.3, 1] as const
const SOURCE_TONE: Record<string, string> = {
  'NASA POWER': 'text-orbit border-orbit/30 bg-orbit/[0.07]',
  SoilGrids: 'text-wheat border-wheat/30 bg-wheat/[0.07]',
  'FAO-33': 'text-leaf border-leaf/30 bg-leaf/[0.07]',
  prices: 'text-ink-2 border-white/15 bg-white/[0.04]',
  'your priorities': 'text-[#c9b8ff] border-[#b8a8ff]/30 bg-[#b8a8ff]/[0.07]',
}

/**
 * How sure the pick is, and what would change it. Framed as robustness - "holds in 87 % of plausible variations" -
 * not as error bars, so a close call reads as "two good options", never as "the model is broken".
 */
export function SensitivityPanel({ confidence, sens, water, sobol, form = baseForm }: { confidence: Confidence | null; sens: Sensitivity | null; water: WaterApi; sobol?: SobolGap | null; /** crops as this field grows them */ form?: FormOf }) {
  if (!confidence || !sens) return <div className="panel h-72 animate-pulse" />
  const pick = form(sens.pick)
  const mine = confidence.shares.find((s) => s.id === sens.pick)?.share ?? 0
  const second = confidence.shares.find((s) => s.id !== sens.pick)
  const verdict =
    mine >= 0.8
      ? { word: 'Solid', text: `${pick.name} stays first in ${pct(mine)} of ${confidence.runs} plausible variations of the inputs.` }
      : mine >= 0.55
        ? { word: 'Likely', text: `${pick.name} stays first in ${pct(mine)} of ${confidence.runs} variations${second ? `; ${form(second.id).name.toLowerCase()} takes over in ${pct(second.share)}` : ''}.` }
        : {
          word: 'Close call',
          text: `${pick.name} leads in only ${pct(mine)} of ${confidence.runs} variations${second ? ` - ${form(second.id).name.toLowerCase()} wins ${pct(second.share)}` : ''}. Both are sound here; let market and machinery decide.`,
        }
  const changed = sens.flips.filter((f) => f.top !== sens.pick)
  const held = sens.flips.filter((f) => f.top === sens.pick)
  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><Shuffle className="h-4 w-4 text-orbit" /> How sure - and what would change the pick</div>
        <div className="font-mono text-[11px] text-ink-3">seeded Monte Carlo · same inputs, same answer</div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr]">
        {/* ---- robustness ---- */}
        <div>
          <div className="flex items-end gap-4">
            <div className="font-display-soft text-[clamp(3rem,7vw,4.6rem)] leading-[0.85] text-ink tabular-nums">{Math.round(mine * 100)}<span className="text-[0.45em] text-ink-3">%</span></div>
            <div className="pb-1">
              <div className={`kicker ${mine >= 0.8 ? '!text-leaf' : mine >= 0.55 ? '!text-wheat' : '!text-heat'}`}>{verdict.word}</div>
              <div className="mt-1 max-w-sm text-[14px] leading-snug text-ink-2">{verdict.text}</div>
            </div>
          </div>

          <div className="mt-6 space-y-2.5" role="table" aria-label="How often each contender finishes first, second and third">
            <div className="grid grid-cols-[112px_minmax(0,1fr)_34px] sm:grid-cols-[150px_minmax(0,1fr)_44px] items-center gap-3 font-mono text-[11px] text-ink-4" role="row">
              <span role="columnheader">contender</span>
              <span role="columnheader" className="flex gap-2 sm:gap-3">
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-ink-2" />1st</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-ink-2/55" />2nd</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-ink-2/25" />3rd</span>
              </span>
              <span role="columnheader" className="text-right">median</span>
            </div>
            {confidence.ranks.map((r, i) => {
              const c = form(r.id)
              return (
                <div key={r.id} className="grid grid-cols-[112px_minmax(0,1fr)_34px] sm:grid-cols-[150px_minmax(0,1fr)_44px] items-center gap-3" role="row">
                  <span className="flex min-w-0 items-center gap-2" role="cell">
                    <CropTile crop={c} size="xs" />
                    <span className="truncate text-[13px] text-ink-2">{c.name}</span>
                  </span>
                  <span className="flex h-3 overflow-hidden rounded-full bg-white/[0.05]" role="cell" aria-label={`${c.name}: first ${pct(r.r1)}, second ${pct(r.r2)}, third ${pct(r.r3)}`}>
                    {[r.r1, r.r2, r.r3].map((v, k) => (
                      <motion.i
                        key={k}
                        className="block h-full"
                        style={{ background: c.color, opacity: [1, 0.55, 0.25][k] }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${v * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.9, delay: 0.08 * i + 0.12 * k, ease: EASE }}
                      />
                    ))}
                  </span>
                  <span className="num text-right text-[12px] text-ink-3" role="cell">#{r.median}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-1.5">
            <span className="mr-1 self-center font-mono text-[11px] text-ink-4">varied together:</span>
            {confidence.varied.map((v) => <Chip key={v}>{v}</Chip>)}
          </div>
        </div>

        {/* ---- one factor at a time ---- */}
        <div>
          <div className="kicker">Push one input to its limit</div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            Everything else stays as observed. {changed.length === 0 ? `None of these alone moves ${pick.name.toLowerCase()} off first place.` : `${changed.length} of ${sens.flips.length} would hand first place to another crop.`}
          </p>
          <ul className="mt-4 space-y-1.5">
            {changed.map((f, i) => {
              const flipped = f.top !== sens.pick
              return (
                <motion.li
                  key={f.key}
                  initial={{ opacity: 0, x: 12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.04 * i, ease: EASE }}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${flipped ? 'bg-wheat/[0.07] ring-1 ring-wheat/25' : 'bg-white/[0.025]'}`}
                >
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] ${SOURCE_TONE[f.source]}`}>{f.source}</span>
                  <span className={`min-w-0 flex-1 text-[13px] leading-snug ${flipped ? 'text-ink' : 'text-ink-3'}`}>{f.label}</span>
                  <ArrowRight className={`h-3.5 w-3.5 shrink-0 ${flipped ? 'text-wheat' : 'text-ink-4'}`} />
                  <span className="flex shrink-0 items-center gap-1.5">
                    <CropTile crop={form(f.top)} size="xs" dim={!flipped} />
                    <span className={`hidden w-20 truncate text-[12px] sm:inline ${flipped ? 'text-wheat' : 'text-ink-4'}`}>{flipped ? form(f.top).name : 'unchanged'}</span>
                  </span>
                </motion.li>
              )
            })}
          </ul>
          {held.length > 0 && (
            <div className="mt-3">
              <div className="text-[12px] text-ink-4">{changed.length ? 'These leave the pick where it is:' : 'Each of these leaves the pick where it is:'}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {held.map((f) => (
                  <span key={f.key} title={f.source} className={`rounded-full border px-2.5 py-1 text-[12px] leading-snug ${SOURCE_TONE[f.source]}`}>{f.label}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {sobol ? <SobolBlock s={sobol} form={form} /> : sobol === undefined && (
        <div className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4 sm:p-5" aria-busy="true">
          <div className="text-[12.5px] text-ink-3">Global sensitivity (Sobol) - computing…</div>
          <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-2 animate-pulse rounded-full bg-white/[0.05]" style={{ animationDelay: `${i * 120}ms` }} />)}</div>
        </div>
      )}
      <CalibrationNote />

      <IrrigationLadder sens={sens} water={water} form={form} />
    </div>
  )
}

/** Seasonal irrigation budgets 0…300 mm on one track: which crop leads at each, and where it tips. */
function IrrigationLadder({ sens, water, form }: { sens: Sensitivity; water: WaterApi; form: FormOf }) {
  const max = LADDER[LADDER.length - 1]
  const x = (b: number) => (b / max) * 100
  const current = water.value.irrigated ? null : water.value.budget
  const tips = sens.tipping.filter((t) => t.budget > 0)
  // contiguous runs of the same leader
  const runs: { id: CropId; from: number; to: number }[] = []
  sens.ladder.forEach((s, i) => {
    const next = sens.ladder[i + 1]?.budget ?? max
    const last = runs[runs.length - 1]
    if (last && last.id === s.top) last.to = next
    else runs.push({ id: s.top, from: s.budget, to: i === sens.ladder.length - 1 ? max : next })
  })
  const summary = tips.length
    ? tips.map((t) => `from ${t.budget} mm, ${form(t.id).name.toLowerCase()} takes first place`).join('; ')
    : `${form(sens.pick).name} stays first at every budget up to ${max} mm`
  return (
    <div className="mt-9 border-t border-white/8 pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] text-ink"><Droplets className="h-4 w-4 text-water" /> Irrigation ladder - the water it takes to change the answer</div>
        <div className="font-mono text-[11px] text-ink-3">mm per season · every crop and season re-simulated · tap a step to use it</div>
      </div>
      <p className="mt-2 text-[14px] text-ink-2">{summary.charAt(0).toUpperCase() + summary.slice(1)}.</p>
      <div className="relative mt-6 pb-10">
        <div className="relative flex h-10 overflow-hidden rounded-xl bg-white/[0.03]">
          {runs.map((r, i) => {
            const c = form(r.id)
            return (
              <motion.div
                key={`${r.id}-${r.from}`}
                className="relative flex h-full items-center gap-2 overflow-hidden border-r border-black/40 px-2"
                style={{ width: `${x(r.to - r.from)}%`, background: `linear-gradient(90deg, color-mix(in oklab, ${c.color} 34%, transparent), color-mix(in oklab, ${c.color} 16%, transparent))` }}
                initial={{ clipPath: 'inset(0 100% 0 0)' }}
                whileInView={{ clipPath: 'inset(0 0% 0 0)' }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.25 * i, ease: EASE }}
              >
                <CropTile crop={c} size="xs" />
                <span className="truncate text-[12px] text-white/85">{c.name}</span>
              </motion.div>
            )
          })}
        </div>
        {/* clickable steps */}
        <div className="absolute inset-x-0 top-0 h-10">
          {sens.ladder.map((s) => (
            <button
              key={s.budget}
              onClick={() => (s.budget === 0 ? water.onRainfed() : water.onBudget(s.budget))}
              className="group absolute top-0 h-10 w-6 -translate-x-1/2"
              style={{ left: `${Math.min(99, Math.max(1, x(s.budget)))}%` }}
              aria-label={`Use ${s.budget} mm per season: ${form(s.top).name} first, ${pct(s.loss)} water-stress loss`}
            >
              <span className="absolute inset-y-1 left-1/2 w-px bg-white/20 transition group-hover:bg-white/70" />
            </button>
          ))}
        </div>
        {/* axis */}
        <div className="absolute inset-x-0 top-12 flex justify-between font-mono text-[11px] text-ink-4">
          {sens.ladder.map((s) => (
            <span key={s.budget} className="absolute -translate-x-1/2 text-center" style={{ left: `${x(s.budget)}%` }}>
              {s.budget}
              <span className="block text-[11px] text-ink-4/80">{pct(s.loss)}</span>
            </span>
          ))}
        </div>
        {current !== null && (
          <motion.div
            className="pointer-events-none absolute -top-2 h-14 w-0.5 rounded-full bg-water shadow-[0_0_14px_var(--color-water)]"
            initial={false}
            animate={{ left: `${x(Math.min(max, current))}%` }}
            transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          >
            <span className={`absolute -top-5 rounded-full bg-water px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-[#0a0b0e] ${x(current) < 10 ? 'left-0' : x(current) > 90 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
              you · {current === 0 ? 'rainfed' : `${current} mm`}
            </span>
          </motion.div>
        )}
      </div>
      <p className="text-xs leading-relaxed text-ink-3">
        Below each budget: the water-stress loss the leading crop keeps. Irrigation starts when the root zone passes the FAO-56 stress
        threshold and refills it until the season's budget is spent; the water is priced at €1.50/mm/ha. More water never raises stress - the
        model is monotonic by construction and tested on every crop and season.
      </p>
    </div>
  )
}

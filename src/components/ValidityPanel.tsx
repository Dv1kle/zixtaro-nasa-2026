import { AlertTriangle, CheckCircle2, ChevronDown, CircleSlash, ShieldQuestion } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import type { DailyAnalysis } from '../lib/daily'
import type { Evaluation, FieldContext } from '../lib/rotation'
import type { ScaleNote } from '../lib/scale'
import { cropValidity, FAILURE_MODES, fieldValidity, type Level } from '../lib/validity'
import { CropTile } from './ui'

const TONE: Record<Level, { icon: typeof CheckCircle2; cls: string; bar: string; label: string }> = {
  out: { icon: CircleSlash, cls: 'text-heat', bar: 'bg-heat', label: 'outside the model' },
  stretch: { icon: AlertTriangle, cls: 'text-wheat', bar: 'bg-wheat', label: 'at its edge' },
  ok: { icon: CheckCircle2, cls: 'text-leaf', bar: 'bg-leaf', label: 'holds' },
}
const HANDLED: Record<(typeof FAILURE_MODES)[number]['handled'], { label: string; cls: string }> = {
  detected: { label: 'checked here', cls: 'border-leaf/30 text-leaf' },
  partial: { label: 'proxy only', cls: 'border-wheat/30 text-wheat' },
  'not-modelled': { label: 'not modelled', cls: 'border-white/15 text-ink-3' },
}

/**
 * Where the model holds for this field and where it is stretched: the failure modes this field's own data trigger,
 * the leading crops whose parameters are at their edge here, and the full register of known failure modes.
 */
export function ValidityPanel({ ctx, climate, daily, scale, elevation, ranking }: {
  ctx: FieldContext
  climate: ClimateAnalysis
  daily: DailyAnalysis | null
  scale: ScaleNote
  elevation: number | null
  ranking: Evaluation[]
}) {
  const [open, setOpen] = useState(false)
  const flags = useMemo(() => fieldValidity({ climate, soil: ctx.soil, daily, scale, elevation }), [climate, ctx.soil, daily, scale, elevation])
  // the leading crops' weak spots, grouped by reason so a shared caveat reads once
  const reasons = useMemo(() => {
    const by = new Map<string, { level: Level; crops: Evaluation[] }>()
    for (const e of ranking.slice(0, 8)) {
      for (const r of cropValidity(e.crop, climate).reasons) {
        const g = by.get(r.text) ?? { level: r.level, crops: [] }
        g.crops.push(e)
        by.set(r.text, g)
      }
    }
    return [...by.entries()].map(([text, g]) => ({ text, ...g })).sort((a, b) => (a.level === 'out' ? -1 : 0) - (b.level === 'out' ? -1 : 0))
  }, [ranking, climate])
  const count = (l: Level) => flags.filter((f) => f.level === l).length
  const problems = flags.filter((f) => f.level !== 'ok')
  const holds = flags.filter((f) => f.level === 'ok')

  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><ShieldQuestion className="h-4 w-4 text-orbit" /> Where this model holds on your field</div>
        <div className="flex gap-3 font-mono text-[11px]">
          {(['out', 'stretch', 'ok'] as Level[]).map((l) => (
            <span key={l} className={TONE[l].cls}>{count(l)} {TONE[l].label}</span>
          ))}
        </div>
      </div>
      <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-ink-2">
        {problems.length === 0
          ? 'None of the known failure modes that can be checked is triggered by this field’s data. The ones that cannot be checked are listed below.'
          : problems.some((p) => p.level === 'out')
            ? 'This field lies outside what parts of the model were built for. Read the ranking as indicative and check the flagged parts locally.'
            : 'This field stretches some of the model’s assumptions. The ranking still applies; the flagged parts deserve a local check.'}
      </p>

      {problems.length > 0 && (
        <ul className="mt-5 grid gap-2.5 md:grid-cols-2">
          {problems.map((f, i) => {
            const T = TONE[f.level]
            return (
              <motion.li
                key={f.id + i}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 pr-3 pl-4"
              >
                <i className={`absolute inset-y-0 left-0 w-[3px] ${T.bar}`} />
                <div className={`flex items-center gap-2 text-[13.5px] ${T.cls}`}><T.icon className="h-3.5 w-3.5 shrink-0" />{f.title}</div>
                <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{f.detail}</div>
              </motion.li>
            )
          })}
        </ul>
      )}

      {holds.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {holds.map((f) => (
            <span key={f.id} title={f.detail} className="flex items-center gap-1.5 rounded-full border border-leaf/20 bg-leaf/[0.05] px-3 py-1 text-[12px] text-leaf/90">
              <CheckCircle2 className="h-3.5 w-3.5" />{f.title}
            </span>
          ))}
        </div>
      )}

      {reasons.length > 0 && (
        <div className="mt-6">
          <div className="kicker">Leading crops with weaker parameters here</div>
          <ul className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
            {reasons.map((r) => {
              const T = TONE[r.level]
              return (
                <li key={r.text} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                  <span className={`flex min-w-0 flex-1 basis-64 items-center gap-2 text-[13px] ${T.cls}`}><T.icon className="h-3.5 w-3.5 shrink-0" />{r.text}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {r.crops.map((e) => (
                      <span key={e.crop.id} className="flex items-center gap-1.5 rounded-full border border-white/10 py-0.5 pr-2.5 pl-0.5 text-[12px] text-ink-2">
                        <CropTile crop={e.crop} size="xs" className="!h-5 !w-5 !rounded-full !text-[11px]" />{e.crop.name}
                      </span>
                    ))}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-6 flex items-center gap-2 text-[13px] text-ink-2 hover:text-ink">
        All {FAILURE_MODES.length} known failure modes
        <span className="font-mono text-[11px] text-ink-4">
          {FAILURE_MODES.filter((m) => m.handled === 'detected').length} checked · {FAILURE_MODES.filter((m) => m.handled === 'partial').length} by proxy · {FAILURE_MODES.filter((m) => m.handled === 'not-modelled').length} not modelled
        </span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06]">
            {FAILURE_MODES.map((m) => {
              const hit = flags.find((f) => f.id === m.id && f.level !== 'ok')
              return (
                <li key={m.id} className="grid gap-x-4 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_auto]">
                  <div className={`text-[13px] ${hit ? TONE[hit.level].cls : 'text-ink'}`}>{m.what}{hit ? ' · this field' : ''}</div>
                  <div className="text-[12.5px] leading-snug text-ink-3">{m.effect}</div>
                  <span className={`h-fit w-fit rounded-full border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap ${HANDLED[m.handled].cls}`}>{HANDLED[m.handled].label}</span>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

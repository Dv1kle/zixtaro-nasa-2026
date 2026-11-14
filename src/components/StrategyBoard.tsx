// The plans, side by side - and the rotation the farm is on among them, judged by the same numbers. Then one plan
// read out in full: its four seasons as four plants in their vitrines, and under them why it is on the table, what
// it rests on, what it gives against carrying on and what that costs, what is not known, and what to check on the
// ground (lib/strategyReading).
//
// The plans are a ledger, one row each: read across, a plan; read down, a measure - so the best figure of each
// column is found at a glance, and the crops are large enough to be recognised. (They were four narrow cards under
// a small turning carousel: a wide screen held mostly air, and the owner's word for the cards was "small".) Below
// 1280 px a row folds into a card.
import { AlertTriangle, ArrowRight, Check, CornerDownRight } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useRef, type CSSProperties } from 'react'
import { CROP_BY_ID, type CropId } from '../lib/crops'
import { euro, pct } from '../lib/format'
import { useMedia } from '../lib/hooks'
import { EASE_OUT } from '../lib/motion'
import { currentRotation, planReport, type PlanEnv, type PlanReport } from '../lib/planMetrics'
import { PERSONAS, type Evaluation, type FieldContext, type Priorities, type Strategy } from '../lib/rotation'
import { asNow, readPlan, type Line, type PlanKey, type PlanView, type Reading } from '../lib/strategyReading'
import { Chip, CropTile, useSpecimen } from './ui'

const signedT = (v: number) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${Math.abs(v).toFixed(1)}`
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const soilOf = (r: PlanReport) => avg(r.seq.map((e) => e.sub.soil))
const socOf = (r: PlanReport) => r.carbon.delta[r.carbon.delta.length - 1] ?? 0

type Row = { label: string; sub: string; get: (r: PlanReport) => number; fmt: (v: number) => string; better: 'high' | 'low'; tie: number; own?: boolean }

/** the ledger's columns: the sandbox's measures, the five a row has room for */
function rowsFor(replay: number | null, hasNow: boolean): Row[] {
  return [
    { label: 'Soil health', sub: 'index', get: soilOf, fmt: pct, better: 'high', tie: 0.005 },
    { label: 'Fertiliser N', sub: 'kg/ha · 4 seasons', get: (r) => r.fertiliserN, fmt: (v) => String(Math.round(v)), better: 'low', tie: 0.5 },
    { label: 'Water-stress loss', sub: replay ? `${replay}-like season` : 'typical season', get: (r) => r.loss, fmt: pct, better: 'low', tie: 0.005 },
    { label: 'Gross margin', sub: 'per ha · season', get: (r) => r.margin, fmt: euro, better: 'high', tie: 0.5 },
    // (the measure is the difference from the rotation the farm is on: that row has no figure of its own)
    ...(hasNow ? [{ label: 'Soil carbon', sub: 't C/ha · 20 y vs now', get: socOf, fmt: signedT, better: 'high' as const, tie: 0.05, own: true }] : []),
  ]
}

const PARTS: { key: keyof Reading; n: string; label: string }[] = [
  { key: 'why', n: '01', label: 'Why it is here' },
  { key: 'rests', n: '02', label: 'What it rests on' },
  { key: 'gives', n: '03', label: 'What it gives' },
  { key: 'costs', n: '', label: 'At what price' },
  { key: 'gaps', n: '04', label: 'What is not known' },
  { key: 'check', n: '05', label: 'Check on the ground' },
]

export function StrategyBoard(props: {
  strategies: Strategy[]
  history: (CropId | null)[]
  ctx: FieldContext
  priorities: Priorities
  env: PlanEnv
  replay: number | null
  /** the first season's year */
  start: number
  /** the plan the farmer goes on with - the page's, so everything below it follows (lib/strategyReading chosenPlan) */
  picked: PlanKey
  onPick: (key: PlanKey) => void
}) {
  const { strategies, history, ctx, priorities, env, replay, start, picked, onPick } = props
  const plans = useMemo<PlanView[]>(() => {
    const ref = currentRotation(history)
    const out: PlanView[] = []
    const now = asNow(history, strategies[0]?.seq.length ?? 4)
    if (now) out.push({ key: 'now', label: 'As now', blurb: 'Your last seasons, sown again - the yardstick for the plans below it.', ids: now, report: planReport(now, history, ctx, priorities, env, ref), w: null })
    for (const s of strategies) {
      const ids = s.seq.map((e) => e.crop.id)
      out.push({ key: s.key, label: s.label, blurb: s.blurb, ids, report: planReport(ids, history, ctx, priorities, env, ref), w: PERSONAS.find((p) => p.key === s.key)?.w ?? null })
    }
    return out
  }, [strategies, history, ctx, priorities, env])
  const now = plans.find((p) => p.key === 'now') ?? null
  const plan = plans.find((p) => p.key === picked) ?? plans.find((p) => p.key === 'you') ?? plans[0]
  const reading = useMemo(() => (plan ? readPlan(plan, { now, all: plans, ctx, priorities, start }) : null), [plan, now, plans, ctx, priorities, start])
  const read = useRef<HTMLDivElement>(null)
  const rows = rowsFor(replay, !!now)
  // the ledger's plants: as large as the row lets them be
  const wide = useMedia('(min-width: 1536px)')

  if (!plan || !reading) return null

  const pick = (key: PlanKey) => {
    onPick(key)
    // where the plans are a column of cards the reading is far below them: bring it up
    const el = read.current
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.92) {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' })
    }
  }
  const best = (row: Row, p: PlanView) => {
    const vals = plans.map((x) => row.get(x.report))
    const top = row.better === 'high' ? Math.max(...vals) : Math.min(...vals)
    const worst = row.better === 'high' ? Math.min(...vals) : Math.max(...vals)
    // a lead inside the tie is no lead; where every plan is level nobody is marked
    return Math.abs(row.get(p.report) - top) <= row.tie && Math.abs(top - worst) > row.tie
  }

  return (
    <div>
      {/* the ledger */}
      <div className="plan-ledger" role="radiogroup" aria-label="The plans - choose the one to go on with" style={{ '--plan-cols': rows.length } as CSSProperties}>
        <div className="plan-ledger-head" aria-hidden>
          <span>Plan</span>
          <span>Four seasons</span>
          <span className="plan-row-metrics">
            {rows.map((r) => (
              <span key={r.label}>
                {r.label}
                <i>{r.sub}</i>
              </span>
            ))}
          </span>
          <span className="text-right">Score</span>
        </div>
        {plans.map((p) => {
          const on = p.key === plan.key
          const isNow = p.key === 'now'
          return (
            <button key={p.key} role="radio" aria-checked={on} onClick={() => pick(p.key)} className={`plan-row group ${on ? 'plan-row-on' : ''} ${isNow ? 'plan-row-now' : ''}`}>
              <span className="plan-row-name">
                <span className={`kicker ${on ? '!text-leaf' : ''}`}>{p.label}</span>
                <span className="mt-1.5 block text-[13.5px] leading-snug text-pretty text-ink-3">{p.blurb}</span>
                <span className="plan-read mt-3 font-mono text-[11px] tracking-[0.08em] uppercase">
                  <span>{on ? 'Your plan - read out below' : 'Choose this plan'}</span>
                  <CornerDownRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </span>

              <span className="plan-row-seq">
                {p.ids.map((id, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="flex flex-col items-center gap-1.5">
                      <CropTile crop={CROP_BY_ID[id]} size={wide ? 'lg' : 'md'} className={wide ? '!h-[4.75rem] !w-[4.75rem]' : 'max-[420px]:!h-14 max-[420px]:!w-14'} />
                      <span className="num text-[11px] text-ink-4">{start + i}</span>
                    </span>
                    {i < p.ids.length - 1 && <ArrowRight className="mb-5 h-3 w-3 shrink-0 text-ink-4" aria-hidden />}
                  </span>
                ))}
              </span>

              <span className="plan-row-metrics">
                {rows.map((r) => {
                  const own = isNow && !!r.own
                  const win = !own && best(r, p)
                  return (
                    <span key={r.label} className="plan-metric">
                      <span className="plan-metric-label">
                        {r.label} <i>{r.sub}</i>
                      </span>
                      <span className={`num plan-metric-value ${win ? 'text-leaf' : 'text-ink'}`}>
                        {win && <Check className="h-3.5 w-3.5 shrink-0" aria-label="best of the plans" />}
                        {own ? '—' : r.fmt(r.get(p.report))}
                      </span>
                    </span>
                  )
                })}
              </span>

              <span className="plan-row-score">
                <span className="font-display-soft text-[2.6rem] leading-[0.85] 2xl:text-[3.1rem]">{Math.round(p.report.score)}</span>
                <span className="mt-1.5 block font-mono text-[10px] tracking-[0.12em] text-ink-4 uppercase xl:hidden">avg score</span>
              </span>
            </button>
          )
        })}
      </div>

      {!now && (
        <p className="mt-5 max-w-3xl border-l border-wheat/50 pl-4 text-[13.5px] leading-relaxed text-ink-3">
          The rotation this field is on is not known yet. Name at least two of its last seasons in{' '}
          <a href="#field" className="text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink/60">Field</a> and carrying on as now is measured here, beside these plans.
        </p>
      )}

      {/* one plan, read out */}
      <div ref={read} className="plan-reading mt-16 scroll-mt-28">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="kicker">Your plan, read out</div>
            <h4 className="mt-2 font-display-soft text-[clamp(2rem,4.2vw,3.6rem)] leading-[0.9] uppercase">
              {plan.label} <em className="font-voice text-leaf normal-case">in full</em>
            </h4>
          </div>
          <div className="flex flex-wrap border border-ink/15" role="group" aria-label="Which plan to read">
            {plans.map((p) => (
              <button
                key={p.key}
                onClick={() => onPick(p.key)}
                aria-pressed={p.key === plan.key}
                className={`min-h-[40px] px-3.5 py-2 font-mono text-[11px] tracking-wide uppercase transition ${p.key === plan.key ? 'bg-leaf text-void' : 'text-ink-3 hover:text-ink'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* its four seasons: the plants themselves, one vitrine each */}
        <ol className="mt-8 grid grid-cols-2 gap-x-px gap-y-8 lg:grid-cols-4">
          {plan.report.seq.map((e, i) => (
            <Season key={i} e={e} index={i} of={plan.report.seq.length} year={start + i} planKey={plan.key} />
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Chip>{plan.report.families} plant {plan.report.families === 1 ? 'family' : 'families'} in four seasons</Chip>
          {plan.report.breaks.length > 0 && (
            <Chip tone="warn">
              {plan.report.breaks.length} rotation {plan.report.breaks.length === 1 ? 'rule' : 'rules'} broken
            </Chip>
          )}
          {/* what choosing does, said where it is done */}
          <span className="font-mono text-[11px] tracking-[0.04em] text-ink-3">The page follows this plan from here: the sandbox, nitrogen, the soil outlook, the elevator and the market.</span>
        </div>

        <dl className="mt-10 border-t border-ink/20" aria-live="polite">
          {PARTS.map((part) => {
            const lines = reading[part.key]
            if (!lines.length) return null
            const risky = part.key === 'check'
            return (
              <div key={part.key} className={`grid gap-x-8 gap-y-2 py-6 lg:grid-cols-[2.2rem_13rem_minmax(0,1fr)] ${part.n ? 'border-t border-ink/12 first:border-t-0' : 'pt-0'}`}>
                <span className="hidden font-mono text-[11px] text-wheat lg:block">{part.n}</span>
                <dt className="font-mono text-[11px] tracking-[0.12em] text-ink-3 uppercase">
                  <span className="mr-2 text-wheat lg:hidden">{part.n}</span>
                  {part.label}
                </dt>
                <dd>
                  <ul className="max-w-[78ch] space-y-2.5">
                    {lines.map((l, i) => (
                      <ReadingLine key={`${plan.key}-${part.key}-${i}`} line={l} risky={risky && l.year !== undefined} />
                    ))}
                  </ul>
                </dd>
              </div>
            )
          })}
        </dl>
      </div>
    </div>
  )
}

/** One season of the plan being read: the crop in its own vitrine, its year above it, and why it stands there. */
function Season({ e, index, of, year, planKey }: { e: Evaluation; index: number; of: number; year: number; planKey: PlanKey }) {
  const reduce = useReducedMotion()
  // (a card's drawing is 320 px: sharp at this size on an ordinary screen; a dense one gets a larger drawing, the
  // card's own standing in until it is ready)
  const dense = typeof window !== 'undefined' && window.devicePixelRatio >= 1.5
  const large = useSpecimen(e.crop, dense ? 512 : undefined)
  const small = useSpecimen(e.crop)
  const src = large ?? small ?? null
  const why = e.notes.find((n) => n.tone === 'good')?.text ?? e.crop.blurb
  const flagged = e.flags.length > 0 || e.notes.some((n) => n.tone === 'bad')
  return (
    <li className="min-w-0">
      <div className="plan-vitrine season-vitrine">
        <div className="season-year">
          <span className="num font-display-soft">{year}</span>
          <span className="font-mono whitespace-nowrap">
            <span className="max-sm:hidden">season </span>
            {index + 1} / {of}
          </span>
        </div>
        <div aria-hidden className="plan-vitrine-stage">
          <span className="plan-vitrine-pool" />
          <AnimatePresence mode="wait" initial={false}>
            {src && (
              <motion.img
                // another plan brings its plants in one after the other, left to right; the same crop still arrives anew
                key={`${planKey}-${e.crop.id}`}
                src={src}
                alt=""
                draggable={false}
                decoding="async"
                className="plan-vitrine-img"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.16 } }}
                transition={{ duration: 0.7, ease: EASE_OUT, delay: reduce ? 0 : index * 0.08 }}
              />
            )}
          </AnimatePresence>
        </div>
        <div className="plan-vitrine-label font-mono">
          <span>{e.crop.name}</span>
          <i translate="no" className="font-voice max-sm:hidden">{e.crop.latin}</i>
        </div>
      </div>
      <div className="mt-3.5 pr-5">
        <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-ink-3">
          <span className="num text-[13px] text-ink">{Math.round(e.score)}</span>
          <span>score</span>
          {flagged && (
            <span className="flex items-center gap-1 text-heat">
              <AlertTriangle className="h-3 w-3" aria-hidden /> a risk to check
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-3 text-[13.5px] leading-snug text-pretty text-ink-2">{why}</p>
      </div>
    </li>
  )
}

function ReadingLine({ line, risky }: { line: Line; risky: boolean }) {
  return (
    <li className="flex gap-2.5 text-[15px] leading-relaxed text-pretty text-ink-2">
      {risky && <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-heat" aria-hidden />}
      <span className="min-w-0">
        {line.year !== undefined && line.crop && (
          <span className="mr-2 font-mono text-[11px] whitespace-nowrap text-ink-3">
            <span className="num">{line.year}</span> · <span>{line.crop.name}</span>
          </span>
        )}
        <span>{line.text}</span>
      </span>
    </li>
  )
}

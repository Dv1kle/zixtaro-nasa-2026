import { ArrowLeftRight, CloudRain, Droplets, GitCompareArrows, Layers, Sprout, TrendingDown } from 'lucide-react'
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import { CROP_BY_ID, type CropId } from '../lib/crops'
import { chainFor, compare, FACTOR_INFO, type Attribution, type Chain, type Kind } from '../lib/explain'
import { pct, signed } from '../lib/format'
import type { Evaluation, FieldContext, Priorities } from '../lib/rotation'
import { CropTile } from './ui'

const EASE = [0.16, 1, 0.3, 1] as const
const KIND: Record<Kind, { label: string; cls: string; title: string }> = {
  science: { label: 'published model', cls: 'border-leaf/30 text-leaf bg-leaf/[0.07]', title: 'Computed with a published, peer-reviewed method from measured data' },
  rule: { label: 'agronomic rule', cls: 'border-wheat/30 text-wheat bg-wheat/[0.07]', title: 'Expert rule of thumb (break intervals, tolerances) - sound, but not measured on this field' },
  assumption: { label: 'assumption', cls: 'border-heat/35 text-heat bg-heat/[0.08]', title: 'Reference values you should replace with your own (prices, costs)' },
  yours: { label: 'your input', cls: 'border-[#b8a8ff]/35 text-[#c9b8ff] bg-[#b8a8ff]/[0.07]', title: 'What you told Zixtaro' },
}

/**
 * Why crop A and not crop B, on this field: an exact Shapley breakdown of the score gap (honest for a score that
 * multiplies its parts), then the water story from the NASA record down to the points it cost.
 */
export function WhyPanel({ ranking, ctx, climate, priorities }: { ranking: Evaluation[]; ctx: FieldContext; climate: ClimateAnalysis; priorities: Priorities }) {
  const [aId, setA] = useState<CropId | null>(null)
  const [bId, setB] = useState<CropId | null>(null)
  const byId = useMemo(() => new Map(ranking.map((e) => [e.crop.id, e])), [ranking])
  const a = (aId && byId.get(aId)) || ranking[0]
  const b = (bId && bId !== a.crop.id && byId.get(bId)) || ranking.find((e) => e.crop.id !== a.crop.id)
  const cmp = useMemo(() => (a && b ? compare(a, b, priorities) : null), [a, b, priorities])
  const chains = useMemo(() => (a && b ? [chainFor(a, ctx, climate), chainFor(b, ctx, climate)] : null), [a, b, ctx, climate])
  if (!a || !b || !cmp || !chains) return null
  const choices = ranking.slice(0, 8).filter((e) => e.crop.id !== a.crop.id)
  const lead = cmp.parts.filter((p) => Math.abs(p.points) >= 0.5)
  const main = lead[0]
  const against = cmp.parts.find((p) => p.points <= -0.5)
  const headline = main
    ? `${a.crop.name} scores ${Math.abs(cmp.gap).toFixed(1)} points ${cmp.gap >= 0 ? 'above' : 'below'} ${b.crop.name.toLowerCase()} here. The biggest single reason: ${FACTOR_INFO[main.key].label.toLowerCase()} (${signed(main.points, 1)})${against && against !== main ? ` - while ${FACTOR_INFO[against.key].label.toLowerCase()} pulls the other way (${signed(against.points, 1)})` : ''}.`
    : `${a.crop.name} and ${b.crop.name.toLowerCase()} are practically level here.`

  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><GitCompareArrows className="h-4 w-4 text-leaf" /> Why {a.crop.name.toLowerCase()} and not {b.crop.name.toLowerCase()}?</div>
        <div className="font-mono text-[11px] text-ink-3">exact Shapley attribution · adds up to the gap</div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-ink-4">compare with</span>
        {choices.map((e) => (
          <button
            key={e.crop.id}
            onClick={() => setB(e.crop.id)}
            aria-pressed={e.crop.id === b.crop.id}
            className={`flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-[12px] transition ${e.crop.id === b.crop.id ? 'border-white/40 bg-white/10 text-ink' : 'border-white/10 text-ink-3 hover:border-white/30 hover:text-ink'}`}
          >
            <CropTile crop={e.crop} size="xs" className="!h-6 !w-6 !rounded" />
            {e.crop.name}
          </button>
        ))}
        <button
          onClick={() => { setA(b.crop.id); setB(a.crop.id) }}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-ink-3 transition hover:border-white/30 hover:text-ink"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" /> swap
        </button>
      </div>

      <p className="mt-5 max-w-4xl text-lg leading-relaxed text-ink">{headline}</p>

      <div className="mt-6 grid gap-8 xl:grid-cols-[1.1fr_1fr]">
        <Waterfall a={a} b={b} parts={cmp.parts} />
        <div>
          <div className="kicker">The water story, from orbit to root</div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            Each step is a number you can check. The same NASA POWER months feed both crops - what differs is when they grow and how deep they root.
          </p>
          <div className="mt-4 space-y-4">
            {chains.map((c, i) => <ChainLane key={c.id} c={c} e={i === 0 ? a : b} lane={i} irrigated={ctx.irrigated} />)}
          </div>
        </div>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-ink-3">
        The score multiplies rotation health and local proof into everything else, so its parts can't simply be subtracted.
        The shares above are Shapley values - each factor's average effect over all 720 orders in which {b.crop.name.toLowerCase()}'s six inputs
        could be switched to {a.crop.name.toLowerCase()}'s. They add up exactly to the gap and give nothing to a factor that doesn't differ.
        Tags say what each factor rests on: a published model on measured data, an agronomic rule of thumb, an assumption to replace, or your input.
      </p>
    </div>
  )
}

function KindBadge({ kind }: { kind: Kind }) {
  const k = KIND[kind]
  return <span title={k.title} className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] ${k.cls}`}>{k.label}</span>
}

function Waterfall({ a, b, parts }: { a: Evaluation; b: Evaluation; parts: Attribution[] }) {
  const shown = parts.filter((p) => Math.abs(p.points) >= 0.05)
  let cum = b.score
  const steps = shown.map((p) => {
    const from = cum
    cum += p.points
    return { p, from, to: cum }
  })
  // the running total lands one step after each bar - once, when the breakdown scrolls into view
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const reduce = useReducedMotion()
  const pair = `${a.crop.id}-${b.crop.id}`
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (!inView) return
    if (reduce) {
      setStage(steps.length)
      return
    }
    setStage(0)
    const timers = steps.map((_, i) => setTimeout(() => setStage(i + 1), 120 * (i + 1) + 450))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, pair, steps.length])
  const landed = stage === 0 ? b.score : steps[Math.min(stage, steps.length) - 1].to
  const done = stage >= steps.length
  const total = done && Math.abs(a.score - landed) < 0.05 ? a.score : landed
  // zoom onto the steps: the two scores are long bars whose start is cut (marked with a break)
  const ends = [a.score, b.score, ...steps.flatMap((s) => [s.from, s.to])]
  const spread = Math.max(...ends) - Math.min(...ends)
  const pad = Math.max(1.5, spread * 0.25)
  const lo = Math.max(0, Math.min(...ends) - pad * 2.5)
  const hi = Math.max(...ends) + pad
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="kicker">Where the {Math.abs(a.score - b.score).toFixed(1)} points come from</div>
        {lo > 0 && <div className="font-mono text-[11px] text-ink-4">axis zoomed to {Math.round(lo)}-{Math.round(hi)}</div>}
      </div>
      {steps.length > 0 && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[12px] text-ink-3">
          <span>{b.crop.name}</span>
          <span className="num text-ink-2">{b.score.toFixed(1)}</span>
          {steps.map(({ p }, i) => (
            <span key={p.key} className={`num transition-opacity duration-300 ${i < stage ? 'opacity-100' : 'opacity-0'} ${p.points >= 0 ? 'text-leaf' : 'text-heat'}`}>
              {p.points >= 0 ? '+' : '−'} {Math.abs(p.points).toFixed(1)}
            </span>
          ))}
          <span>=</span>
          <Tally value={total} className={`num text-[13px] ${done ? 'text-leaf' : 'text-ink'}`} />
          <span className={`transition-opacity duration-300 ${done ? 'opacity-100' : 'opacity-0'}`}>{a.crop.name}</span>
        </div>
      )}
      <div className="mt-4 space-y-2">
        <Row x={x} i={0} left={lo} right={b.score} label={<span className="flex items-center gap-2 text-[13px] text-ink-2"><CropTile crop={b.crop} size="xs" /> {b.crop.name} <span className="num text-ink-3">{b.score.toFixed(1)}</span></span>}>
          <div className="h-full w-full rounded bg-white/15" style={lo > 0 ? { maskImage: 'linear-gradient(90deg, transparent, #000 18px)' } : undefined} />
        </Row>
        <AnimatePresence initial={false}>
          {steps.map(({ p, from, to }, i) => {
            const info = FACTOR_INFO[p.key]
            const up = p.points >= 0
            return (
              <motion.div key={`${a.crop.id}-${b.crop.id}-${p.key}`} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Row
                  x={x}
                  i={i + 1}
                  left={from}
                  right={to}
                  label={
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 text-[13px] text-ink">
                        <span className={`num w-11 shrink-0 text-right ${up ? 'text-leaf' : 'text-heat'}`}>{signed(p.points, 1)}</span>
                        <span className="min-w-0 leading-tight">{info.label}</span>
                      </span>
                    </span>
                  }
                >
                  <div className={`h-full w-full rounded ${up ? 'bg-leaf/80 shadow-[0_0_14px_-2px_var(--color-leaf)]' : 'bg-heat/80 shadow-[0_0_14px_-2px_var(--color-heat)]'}`} />
                </Row>
                <div className="mt-1 mb-1.5 flex flex-wrap items-center gap-1.5 pl-[58px] sm:pl-[58px]">
                  <KindBadge kind={info.kind} />
                  {info.data.map((d) => <span key={d} className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-ink-3">{d}</span>)}
                  {p.weight !== null && <span className="rounded-full border border-[#b8a8ff]/30 px-2 py-0.5 font-mono text-[11px] text-[#c9b8ff]">your weight {pct(p.weight)}</span>}
                  {p.reason && <span className="w-full text-[12px] leading-snug text-ink-3">{(p.reason.about === a.crop.id ? a.crop : p.reason.about === b.crop.id ? b.crop : CROP_BY_ID[p.reason.about]).name}: {p.reason.text}</span>}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        <Row x={x} i={steps.length + 1} left={lo} right={a.score} label={<span className="flex items-center gap-2 text-[13px] text-ink"><CropTile crop={a.crop} size="xs" glow /> {a.crop.name} <span className="num text-leaf">{a.score.toFixed(1)}</span></span>}>
          <div className="h-full w-full rounded" style={{ background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${a.crop.color} 50%, transparent) 18px, ${a.crop.color})` }} />
        </Row>
      </div>
    </div>
  )
}

/** One bar of the breakdown. Module-level: a component declared inside Waterfall would remount (and replay its
 *  entrance) on every re-render of the running total. */
function Row({ x, label, left, right, children, i }: { x: (v: number) => number; label: ReactNode; left: number; right: number; children?: ReactNode; i: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,168px)_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
      <div className="min-w-0 pt-0.5">{label}</div>
      <div>
        <div className="relative h-6 rounded-md bg-white/[0.025]">
          <motion.div
            className="absolute inset-y-1 rounded"
            style={{ left: `${x(Math.min(left, right))}%` }}
            initial={{ width: 0, opacity: 0 }}
            whileInView={{ width: `${Math.max(0.6, Math.abs(x(right) - x(left)))}%`, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.12 * i, ease: EASE }}
          >
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

/** A number that slides to its next value: the running total of the breakdown. */
function Tally({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const shown = useRef(value)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduce) {
      node.textContent = value.toFixed(1)
      shown.current = value
      return
    }
    const controls = animate(shown.current, value, {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = v.toFixed(1)
        shown.current = v
      },
    })
    return () => controls.stop()
  }, [value, reduce])
  return <span ref={ref} className={`tabular-nums ${className}`}>{value.toFixed(1)}</span>
}

/** One crop's chain: NASA rain & demand → soil tank → shortfall → yield loss, joined by flowing water. */
function ChainLane({ c, e, lane, irrigated }: { c: Chain; e: Evaluation; lane: number; irrigated: boolean }) {
  const dEt = c.et0 - c.et0Then
  const nodes: { icon: ReactNode; label: string; value: string; sub: string; tone?: string; flow: number }[] = [
    { icon: <CloudRain className="h-3.5 w-3.5 text-orbit" />, label: 'NASA rain', value: `${Math.round(c.rain)} mm`, sub: `${c.months} months · ${signed(c.rain - c.rainThen, 0, ' mm')} vs 1981-2010`, flow: c.rain },
    { icon: <TrendingDown className="h-3.5 w-3.5 text-heat" />, label: 'crop demand', value: `${Math.round(c.demand)} mm`, sub: `ET₀ ${signed(dEt, 0, ' mm')} since 1981-2010`, flow: c.demand },
    { icon: <Layers className="h-3.5 w-3.5 text-wheat" />, label: 'soil tank', value: `${Math.round(c.tank)} mm`, sub: `within ${c.rootDepth} m of roots`, flow: c.tank },
    {
      icon: <Droplets className="h-3.5 w-3.5 text-water" />,
      label: irrigated ? 'irrigation need' : 'shortfall',
      value: `${Math.round(c.shortfall)} mm`,
      sub: c.irrigation > 0 ? `after ${Math.round(c.irrigation)} mm irrigation` : 'unmet demand, typical season',
      flow: c.shortfall,
    },
    {
      icon: <Sprout className="h-3.5 w-3.5 text-leaf" />,
      label: irrigated ? 'water score' : 'yield loss',
      value: irrigated ? `${Math.round(e.sub.water * 100)}/100` : pct(c.loss),
      sub: irrigated ? 'from irrigation need' : `${pct(c.badLoss)} in drought years`,
      tone: !irrigated && c.loss >= 0.25 ? 'text-heat' : !irrigated && c.loss >= 0.1 ? 'text-wheat' : 'text-leaf',
      flow: 0,
    },
  ]
  const maxFlow = Math.max(...nodes.map((n) => n.flow), 1)
  return (
    <div className="rounded-2xl bg-white/[0.025] p-3">
      <div className="mb-2 flex items-center gap-2">
        <CropTile crop={e.crop} size="xs" glow={lane === 0} />
        <span className="text-[13px] text-ink">{e.crop.name}</span>
        <span className="num ml-auto text-[11px] text-ink-3">score {e.score.toFixed(1)}</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[repeat(5,minmax(0,1fr))] sm:gap-0">
        {nodes.map((n, i) => (
          <div key={n.label} className="flex items-stretch sm:flex-col">
            <div className="flex min-w-0 flex-1 items-start gap-2 sm:flex-col sm:gap-1 sm:px-1.5">
              <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-ink-4 uppercase sm:mt-0">{n.icon}{n.label}</span>
              <span className="ml-auto text-right sm:ml-0 sm:text-left">
                <span className={`num block text-[15px] ${n.tone ?? 'text-ink'}`}>{n.value}</span>
                <span className="block text-[11px] leading-tight text-ink-3">{n.sub}</span>
              </span>
            </div>
            {i < nodes.length - 1 && <Flow width={1 + 5 * (n.flow / maxFlow)} lane={lane} />}
          </div>
        ))}
      </div>
    </div>
  )
}

/** A short run of water between two chain steps; the dash drifts, thicker for more millimetres. */
function Flow({ width, lane }: { width: number; lane: number }) {
  return (
    <svg className="mt-2 hidden h-3 w-full sm:block" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden>
      <line x1="2" y1="6" x2="98" y2="6" stroke="rgb(95 208 243 / 0.15)" strokeWidth={width} strokeLinecap="round" />
      <line x1="2" y1="6" x2="98" y2="6" className="flow-dash" style={{ animationDelay: `${lane * -0.6}s` }} stroke="var(--color-water)" strokeWidth={Math.max(1, width * 0.6)} strokeLinecap="round" strokeDasharray="4 10" />
    </svg>
  )
}

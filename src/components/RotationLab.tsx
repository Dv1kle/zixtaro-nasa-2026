import { AlertTriangle, ArrowRight, Check, FlaskConical, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, CROPS, CROP_BY_ID, categoryOf, type CropId } from '../lib/crops'
import { euro, pct } from '../lib/format'
import { currentRotation, planReport, type PlanEnv, type PlanReport } from '../lib/planMetrics'
import type { FieldContext, Priorities, Strategy } from '../lib/rotation'
import { CropTile } from './ui'

const EASE = [0.16, 1, 0.3, 1] as const

type Metric = {
  key: string
  label: string
  get: (r: PlanReport) => number
  fmt: (v: number) => string
  better: 'high' | 'low'
  /** differences smaller than this count as a tie */
  tie: number
  hint: string
}

const lower1 = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)
// joined item by item: a label may hold a comma of its own ("Soil carbon, 20 years")
const list = (xs: string[]) => xs.map(lower1).reduce((a, x, i, all) => (i === 0 ? x : `${a}${i === all.length - 1 ? ' and ' : ', '}${x}`), '')
const signedT = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)} t C`

function metrics(ctx: FieldContext, hasCover: boolean): Metric[] {
  const water = ctx.irrigated || (ctx.budget ?? 0) > 0
  return [
    { key: 'score', label: 'Average score', get: (r) => r.score, fmt: (v) => v.toFixed(0), better: 'high', tie: 1, hint: 'your priorities, every rule' },
    { key: 'loss', label: 'Water-stress loss', get: (r) => r.loss, fmt: pct, better: 'low', tie: 0.01, hint: 'typical recent season' },
    { key: 'tail', label: '…in drought years', get: (r) => r.tail, fmt: pct, better: 'low', tie: 0.01, hint: 'driest 30 % of seasons' },
    ...(water ? [{ key: 'water', label: 'Irrigation water', get: (r: PlanReport) => r.water, fmt: (v: number) => `${Math.round(v)} mm`, better: 'low' as const, tie: 5, hint: 'per season' }] : []),
    { key: 'n', label: 'Fertiliser N', get: (r) => r.fertiliserN, fmt: (v) => `${Math.round(v)} kg`, better: 'low', tie: 10, hint: 'per ha, all seasons, after legume credits' },
    { key: 'margin', label: 'Gross margin', get: (r) => r.margin, fmt: (v) => `${euro(v)}`, better: 'high', tie: 25, hint: 'per ha and season, reference prices' },
    { key: 'soc', label: 'Soil carbon, 20 years', get: (r) => r.carbon.delta[r.carbon.delta.length - 1] ?? 0, fmt: signedT, better: 'high', tie: 0.3, hint: 'vs repeating your last seasons (ICBM)' },
    ...(hasCover ? [{ key: 'bare', label: 'Storm rain on bare soil', get: (r: PlanReport) => r.cover?.exposed ?? 0, fmt: pct, better: 'low' as const, tie: 0.02, hint: 'share of erosive NASA POWER rain' }] : []),
    { key: 'no3', label: 'Nitrate to groundwater', get: (r) => r.nitrate.mgNO3, fmt: (v) => `${Math.round(v)} mg/L`, better: 'low', tie: 2, hint: 'NO₃⁻ in winter drainage · EU limit 50' },
    { key: 'wp', label: 'Crop per drop', get: (r) => r.kgPerM3, fmt: (v) => `${v.toFixed(2)} kg/m³`, better: 'high', tie: 0.03, hint: 'harvest per m³ of water used' },
    { key: 'fam', label: 'Plant families', get: (r) => r.families, fmt: (v) => String(v), better: 'high', tie: 0.5, hint: 'pest & disease breaks' },
    { key: 'breaks', label: 'Rotation rules broken', get: (r) => r.breaks.length, fmt: (v) => String(v), better: 'low', tie: 0.5, hint: 'break intervals, disease bridges' },
  ]
}

/**
 * Build your own four seasons and see them judged by exactly the numbers Zixtaro judges its own plan by.
 * The comparison is one row per measure with a bar leaning toward whichever plan wins it - readable in seconds.
 */
export function RotationLab(props: {
  history: (CropId | null)[]
  ctx: FieldContext
  priorities: Priorities
  env: PlanEnv
  strategy: Strategy
  exclude: CropId[]
  start: number
  onChange?: (seq: CropId[]) => void
}) {
  const { history, ctx, priorities, env, strategy, exclude, start, onChange } = props
  const zixtaro = useMemo(() => strategy.seq.map((e) => e.crop.id), [strategy])
  const current = currentRotation(history)
  const [seq, setSeq] = useState<CropId[]>(() => current ?? zixtaro)
  const [picking, setPicking] = useState<number | null>(null)
  useEffect(() => onChange?.(seq), [seq, onChange])

  const ref = current
  const mine = useMemo(() => planReport(seq, history, ctx, priorities, env, ref), [seq, history, ctx, priorities, env, ref])
  const theirs = useMemo(() => planReport(zixtaro, history, ctx, priorities, env, ref), [zixtaro, history, ctx, priorities, env, ref])
  const rows = metrics(ctx, !!mine.cover)
  const verdicts = rows.map((m) => {
    const a = m.get(mine)
    const b = m.get(theirs)
    const d = a - b
    const win = Math.abs(d) <= m.tie ? 0 : (m.better === 'high' ? d > 0 : d < 0) ? 1 : -1
    return { m, a, b, win }
  })
  const wins = verdicts.filter((v) => v.win > 0)
  const losses = verdicts.filter((v) => v.win < 0)
  const same = seq.join() === zixtaro.join()

  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><FlaskConical className="h-4 w-4 text-wheat" /> Rotation sandbox - try your own four seasons</div>
        <div className="flex flex-wrap gap-2">
          {current && (
            <button onClick={() => setSeq(current)} className="rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] text-ink-3 transition hover:border-white/30 hover:text-ink">
              start from your last seasons
            </button>
          )}
          <button onClick={() => setSeq(zixtaro)} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] text-ink-3 transition hover:border-white/30 hover:text-ink">
            <RotateCcw className="h-3 w-3" /> copy Zixtaro's plan
          </button>
        </div>
      </div>
      <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-3">
        Tap a season to change its crop. Every number below is recomputed instantly with the same NASA climate, soil, water budget and rules
        as Zixtaro's “{strategy.label}” plan - switched-off crops are allowed here, so you can test them.
      </p>

      {/* the four seasons */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SeasonRow title="Your rotation" seq={seq} report={mine} start={start} onPick={setPicking} active={picking} editable />
        <SeasonRow title={`Zixtaro · ${strategy.label}`} seq={zixtaro} report={theirs} start={start} />
      </div>

      <AnimatePresence>
        {picking !== null && (
          <CropPicker
            key="picker"
            season={start + picking}
            value={seq[picking]}
            exclude={exclude}
            onPick={(id) => {
              setSeq((s) => s.map((x, i) => (i === picking ? id : x)))
              setPicking(null)
            }}
            onClose={() => setPicking(null)}
          />
        )}
      </AnimatePresence>

      {/* verdict */}
      <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display-soft text-2xl text-ink">
          {same ? 'Same plan as Zixtaro.' : wins.length > losses.length ? `Yours wins ${wins.length} of ${rows.length} measures.` : wins.length === losses.length ? `A draw: ${wins.length} each.` : `Zixtaro's plan wins ${losses.length} of ${rows.length} measures.`}
        </span>
        {!same && (
          <span className="text-[13.5px] text-ink-3">
            {wins.length > 0 && <>Yours is better on {list(wins.map((v) => v.m.label))}. </>}
            {losses.length > 0 && <>Zixtaro's is better on {list(losses.map((v) => v.m.label))}.</>}
          </span>
        )}
      </div>

      {/* one row per measure: yours ← bar → Zixtaro's */}
      <div className="mt-5 space-y-1" role="table" aria-label="Your rotation compared with Zixtaro's">
        <div className="grid grid-cols-[minmax(0,1.3fr)_70px_minmax(0,1fr)_70px] items-center gap-3 px-2 font-mono text-[11px] text-ink-4 sm:grid-cols-[220px_90px_minmax(0,1fr)_90px]" role="row">
          <span role="columnheader">measure</span>
          <span role="columnheader" className="text-right text-wheat">yours</span>
          <span role="columnheader" className="text-center">← better · better →</span>
          <span role="columnheader" className="text-leaf">Zixtaro</span>
        </div>
        {verdicts.map(({ m, a, b, win }, i) => {
          const scale = Math.max(Math.abs(a), Math.abs(b), m.tie * 4, 1e-9)
          const lean = win === 0 ? 0 : Math.min(1, Math.abs(a - b) / scale) * (win > 0 ? -1 : 1)
          return (
            <div key={m.key} role="row" className="grid grid-cols-[minmax(0,1.3fr)_70px_minmax(0,1fr)_70px] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.025] sm:grid-cols-[220px_90px_minmax(0,1fr)_90px]">
              <span role="cell" className="min-w-0">
                <span className="block truncate text-[13px] text-ink-2">{m.label}</span>
                <span className="hidden truncate text-[11px] text-ink-4 sm:block">{m.hint}</span>
              </span>
              <span role="cell" className={`num text-right text-[13px] ${win > 0 ? 'text-wheat' : 'text-ink-2'}`}>{m.fmt(a)}</span>
              <span role="cell" className="relative h-4">
                <span className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
                <motion.span
                  className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-full ${lean < 0 ? 'bg-wheat shadow-[0_0_10px_-1px_var(--color-wheat)]' : 'bg-leaf shadow-[0_0_10px_-1px_var(--color-leaf)]'}`}
                  initial={false}
                  animate={{ left: lean < 0 ? `${50 + lean * 50}%` : '50%', width: `${Math.abs(lean) * 50}%` }}
                  transition={{ duration: 0.5, delay: 0.02 * i, ease: EASE }}
                />
                {win === 0 && <span className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-4" title="about the same" />}
              </span>
              <span role="cell" className={`num text-[13px] ${win < 0 ? 'text-leaf' : 'text-ink-2'}`}>{m.fmt(b)}</span>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Bars lean toward the better plan and grow with the difference; a dot means about the same. Soil carbon uses ICBM with IPCC 2006 residues
        {env.strawRemoved ? ' (straw baled and removed)' : ' (straw left on the field)'}{env.catchCrops ? ', with catch crops in winter windows' : ''} - set both in the soil outlook below.
        Crop per drop is the FAO water-productivity measure: harvest per cubic metre of water the crop used.
      </p>
    </div>
  )
}

function SeasonRow({ title, seq, report, start, onPick, active, editable = false }: {
  title: string
  seq: CropId[]
  report: PlanReport
  start: number
  onPick?: (i: number) => void
  active?: number | null
  editable?: boolean
}) {
  return (
    <div className={`rounded-2xl p-4 ${editable ? 'bg-wheat/[0.05] ring-1 ring-wheat/20' : 'bg-white/[0.025]'}`}>
      <div className={`kicker ${editable ? '!text-wheat' : ''}`}>{title}</div>
      <div className="mt-3 flex items-start gap-1 sm:gap-2">
        {seq.map((id, i) => {
          const e = report.seq[i]
          const broke = report.breaks.some((b) => b.season === i)
          const Tile = (
            <motion.div layout className="relative" whileHover={editable ? { y: -3, scale: 1.04 } : undefined} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={id} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} style={{ transformPerspective: 600 }}>
                  <CropTile crop={CROP_BY_ID[id]} size="md" glow={active === i} />
                </motion.div>
              </AnimatePresence>
              {broke && <span className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-heat text-[#1a0a05]" title="breaks a rotation rule"><AlertTriangle className="h-3 w-3" /></span>}
            </motion.div>
          )
          return (
            <div key={i} className="flex items-start gap-1 sm:gap-2">
              <div className="flex w-16 flex-col items-center gap-1">
                {editable ? (
                  <button onClick={() => onPick?.(i)} aria-label={`Season ${start + i}: ${CROP_BY_ID[id].name}. Change crop`} className="rounded-xl">
                    {Tile}
                  </button>
                ) : Tile}
                <span className="num text-[11px] text-ink-4">{start + i}</span>
                <span className={`num text-[11px] ${e.score >= 60 ? 'text-leaf' : e.score >= 40 ? 'text-ink-2' : 'text-heat'}`}>{Math.round(e.score)}</span>
              </div>
              {i < seq.length - 1 && <ArrowRight className="mt-6 hidden h-3 w-3 shrink-0 text-ink-4 sm:block" />}
            </div>
          )
        })}
      </div>
      <ul className="mt-3 min-h-[2.5rem] space-y-1">
        {report.breaks.slice(0, 2).map((b, k) => (
          <li key={k} className="flex gap-1.5 text-[11.5px] leading-snug text-heat/90"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {start + b.season}: {b.text}</li>
        ))}
        {report.breaks.length === 0 && <li className="flex gap-1.5 text-[11.5px] text-leaf/80"><Check className="h-3 w-3" /> No rotation rule broken.</li>}
      </ul>
    </div>
  )
}

function CropPicker({ season, value, exclude, onPick, onClose }: { season: number; value: CropId; exclude: CropId[]; onPick: (id: CropId) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={`Choose the crop for ${season}`}
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="mt-4 overflow-hidden rounded-2xl border border-wheat/25 bg-[#0d120c]/90"
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-ink">Crop for {season}</span>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink-3 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 space-y-3">
          {CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <div className="kicker !text-[11px]">{cat.label}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CROPS.filter((c) => categoryOf(c) === cat.id).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onPick(c.id)}
                    aria-pressed={c.id === value}
                    className={`flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-[12px] transition ${c.id === value ? 'border-wheat/60 bg-wheat/10 text-ink' : 'border-white/10 text-ink-2 hover:border-white/30'} ${exclude.includes(c.id) ? 'opacity-60' : ''}`}
                    title={exclude.includes(c.id) ? `${c.name} is switched off in “What can you grow?” - allowed here to test it` : c.blurb}
                  >
                    <CropTile crop={c} size="xs" className="!h-6 !w-6" />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

import { CloudLightning, Layers, Sprout } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { CROP_BY_ID, type CropId } from '../lib/crops'
import { MONTHS_SHORT, pct } from '../lib/format'
import { currentRotation, HORIZON_YEARS, planReport, type PlanEnv, type PlanReport } from '../lib/planMetrics'
import { formIn, type FieldContext, type Priorities, type Strategy } from '../lib/rotation'
import { coverCycle, coverFigures, socStock30 } from '../lib/soilcarbon'
import { SoilMonolith } from './Solids'
import { Toggle } from './ui'

const EASE = [0.16, 1, 0.3, 1] as const
const LINE: Record<string, string> = { you: 'var(--color-leaf)', soil: '#6fd08c', water: 'var(--color-water)', profit: 'var(--color-wheat)', lab: '#ff9f5a' }

type Line = { key: string; label: string; seq: CropId[]; report: PlanReport; color: string; dashed?: boolean }

/**
 * Soil health over twenty years: organic carbon under each plan (ICBM with IPCC residues, NASA POWER climate) against
 * simply carrying on, the 4 per 1000 yardstick, the water it adds to the topsoil, and whether the soil is covered
 * in the months NASA POWER says the storms come.
 */
export function SoilHealthPanel(props: {
  strategies: Strategy[]
  history: (CropId | null)[]
  ctx: FieldContext
  priorities: Priorities
  env: PlanEnv
  setEnv: (e: PlanEnv) => void
  labSeq: CropId[] | null
  /** the plan the farmer goes on with: its line is the one read out, until another is tapped */
  planKey?: string
}) {
  const form = formIn(props.ctx) // crops as this field grows them
  const { strategies, history, ctx, priorities, env, setEnv, labSeq } = props
  const current = currentRotation(history)
  const ref = current ?? strategies[0]?.seq.map((e) => e.crop.id) ?? null
  const refLabel = current ? 'keep your last seasons' : `Zixtaro's ${strategies[0]?.label.toLowerCase()} plan`
  const lines: Line[] = useMemo(() => {
    const out: Line[] = strategies.map((s) => {
      const seq = s.seq.map((e) => e.crop.id)
      return { key: s.key, label: s.label, seq, report: planReport(seq, history, ctx, priorities, env, ref), color: LINE[s.key] }
    })
    if (labSeq && !out.some((l) => l.seq.join() === labSeq.join())) {
      out.push({ key: 'lab', label: 'Your sandbox rotation', seq: labSeq, report: planReport(labSeq, history, ctx, priorities, env, ref), color: LINE.lab, dashed: true })
    }
    return out
  }, [strategies, history, ctx, priorities, env, ref, labSeq])
  const [sel, setSel] = useState(props.planKey ?? 'you')
  useEffect(() => {
    if (props.planKey) setSel(props.planKey)
  }, [props.planKey])
  const chosen = lines.find((l) => l.key === sel) ?? lines[0]
  const stock = socStock30(ctx.soil)
  const refCover = useMemo(
    () => (ref && env.erosivity ? coverFigures(coverCycle(ref, env.climate.season.hemisphere, env.climate.monthly.recent, env.catchCrops, formIn(ctx)), env.erosivity) : null),
    [ref, env, ctx],
  )
  if (!chosen) return null

  // ---------- trajectory chart ----------
  const W = 640
  const H = 250
  const pad = { l: 44, r: 150, t: 16, b: 28 }
  const target = stock * 0.004 * HORIZON_YEARS // the 4 per 1000 initiative, if it were met every year
  const all = lines.flatMap((l) => l.report.carbon.delta)
  const yMax = Math.max(1, target, ...all) * 1.1
  const yMin = Math.min(-1, ...all) * 1.1
  const X = (t: number) => pad.l + (t / HORIZON_YEARS) * (W - pad.l - pad.r)
  const Y = (v: number) => pad.t + ((yMax - v) / (yMax - yMin)) * (H - pad.t - pad.b)
  const path = (d: number[]) => `M${X(0)},${Y(0)} ` + d.map((v, i) => `L${X(i + 1)},${Y(v)}`).join(' ')
  // end labels, nudged apart
  const ends = lines.map((l) => ({ l, y: Y(l.report.carbon.delta[HORIZON_YEARS - 1] ?? 0) })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15
  const ticks = niceTicks(yMin, yMax)

  const d20 = chosen.report.carbon.delta[HORIZON_YEARS - 1] ?? 0
  const zixtaro = lines.filter((l) => l.key !== 'lab')
  const allLose = current && zixtaro.length > 0 && zixtaro.every((l) => (l.report.carbon.delta[HORIZON_YEARS - 1] ?? 0) < -0.5)
  const allGain = current && zixtaro.length > 0 && zixtaro.every((l) => (l.report.carbon.delta[HORIZON_YEARS - 1] ?? 0) > 0.5)
  const takeaway = allLose
    ? `Honest trade-off: every Zixtaro plan returns less carbon than the rotation you farm now - its crops were chosen for water and resilience and leave less straw and root. ${env.strawRemoved ? 'Leaving the straw on the field' : env.catchCrops ? 'Raising the soil-health priority' : 'Catch crops in the winter windows'} would narrow the gap.`
    : allGain
      ? 'Every Zixtaro plan builds more soil carbon than carrying on as now.'
      : null
  const cover = chosen.report.cover
  const ero = env.erosivity
  const eroMax = ero ? Math.max(...ero, 1e-9) : 1
  const eroTotal = ero ? ero.reduce((a, b) => a + b, 0) : 0

  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><Layers className="h-4 w-4 text-wheat" /> Soil health over the next {HORIZON_YEARS} years</div>
        <div className="font-mono text-[11px] text-ink-3">ICBM soil carbon · IPCC 2006 residues · NASA POWER climate & storms</div>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
        <Toggle checked={!env.strawRemoved} onChange={(v) => setEnv({ ...env, strawRemoved: !v })} label="Leave cereal straw on the field" hint="baling takes ~70 % of it away" />
        <Toggle checked={env.catchCrops} onChange={(v) => setEnv({ ...env, catchCrops: v })} label="Catch crops in winter windows" hint="after early harvests, before spring crops" />
      </div>

      <div className="mt-6 grid gap-8 xl:grid-cols-[1.35fr_1fr]">
        <div>
          <div className="kicker">Soil organic carbon in the top 30 cm, change vs “{refLabel}”</div>
          {takeaway && <p className={`mt-2 text-[13.5px] leading-snug ${allLose ? 'text-wheat' : 'text-leaf'}`}>{takeaway}</p>}
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Soil carbon change after ${HORIZON_YEARS} years: ${lines.map((l) => `${l.label} ${(l.report.carbon.delta[HORIZON_YEARS - 1] ?? 0).toFixed(1)} t C per hectare`).join('; ')}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgb(255 255 255 / 0.06)" />
                <text x={pad.l - 8} y={Y(t) + 3.5} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">{t > 0 ? `+${t}` : t}</text>
              </g>
            ))}
            {[0, 5, 10, 15, 20].map((t) => (
              <text key={t} x={X(t)} y={H - 8} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">{t === 0 ? 'now' : `+${t} yr`}</text>
            ))}
            {/* 4 per 1000 */}
            <line x1={X(0)} y1={Y(0)} x2={X(HORIZON_YEARS)} y2={Y(target)} stroke="rgb(255 255 255 / 0.28)" strokeDasharray="2 5" />
            <text x={X(HORIZON_YEARS) + 6} y={Y(target) + 3} className="fill-ink-3 font-mono text-[10px]">4 per 1000</text>
            {/* ±30 % on residues and humification, around the chosen plan */}
            <motion.path
              key={`band-${chosen.key}-${chosen.seq.join()}-${env.strawRemoved}-${env.catchCrops}`}
              d={band(chosen.report.carbon.delta, X, Y)}
              fill={chosen.color}
              opacity={0.1}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.1 }}
              transition={{ duration: 0.8 }}
            />
            {/* carrying on */}
            <line x1={X(0)} y1={Y(0)} x2={X(HORIZON_YEARS)} y2={Y(0)} stroke="rgb(255 255 255 / 0.45)" strokeDasharray="6 5" />
            {lines.map((l, i) => (
              <motion.path
                key={`${l.key}-${l.seq.join()}-${env.strawRemoved}-${env.catchCrops}`}
                d={path(l.report.carbon.delta)}
                fill="none"
                stroke={l.color}
                strokeWidth={l.key === sel ? 3 : 1.6}
                strokeDasharray={l.dashed ? '5 4' : undefined}
                strokeLinecap="round"
                opacity={l.key === sel ? 1 : 0.55}
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.4, delay: 0.15 * i, ease: EASE }}
                style={{ filter: l.key === sel ? `drop-shadow(0 0 6px ${l.color})` : undefined, cursor: 'pointer' }}
                onClick={() => setSel(l.key)}
              />
            ))}
            {ends.map(({ l, y }) => (
              <g key={l.key} className="cursor-pointer" onClick={() => setSel(l.key)}>
                <circle cx={X(HORIZON_YEARS)} cy={Y(l.report.carbon.delta[HORIZON_YEARS - 1] ?? 0)} r={3} fill={l.color} />
                <text x={X(HORIZON_YEARS) + 8} y={y + 3.5} className="font-mono text-[10px]" fill={l.color}>
                  {fmtShort(l.report.carbon.delta[HORIZON_YEARS - 1] ?? 0)} · {l.label.replace('Your sandbox rotation', 'sandbox')}
                </text>
              </g>
            ))}
            <text x={X(HORIZON_YEARS) + 8} y={Y(0) + 14} className="fill-ink-3 font-mono text-[10px]">{current ? 'as now' : 'reference'}</text>
          </svg>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lines.map((l) => (
              <button
                key={l.key}
                onClick={() => setSel(l.key)}
                aria-pressed={l.key === sel}
                className={`flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-2 font-mono text-[11px] transition ${l.key === sel ? 'border-white/35 bg-white/10 text-ink' : 'border-white/10 text-ink-3 hover:text-ink'}`}
              >
                <i className="h-0.5 w-4 rounded-full" style={{ background: l.color }} />
                {l.label}
                <span className="num" style={{ color: l.color }}>{fmtShort(l.report.carbon.delta[HORIZON_YEARS - 1] ?? 0)}</span>
                <span className="flex gap-0.5">{l.seq.map((id, k) => <span key={k} className="text-[11px]" style={{ color: CROP_BY_ID[id].color }}>{CROP_BY_ID[id].symbol}</span>)}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="kicker">{chosen.label}</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Kpi label="carbon kept per season" value={`${chosen.report.carbon.humified.toFixed(2)} t C/ha`} sub="humus-building share of residues & roots" />
            <Kpi label={`in ${HORIZON_YEARS} years`} value={fmtT(d20)} sub={`${pct(Math.abs(d20) / (stock || 1))} of today's ${Math.round(stock)} t C/ha`} tone={d20 > 0.3 ? 'good' : d20 < -0.3 ? 'bad' : undefined} />
            <Kpi label="per year" value={`${chosen.report.carbon.perMille >= 0 ? '+' : '−'}${Math.abs(chosen.report.carbon.perMille).toFixed(1)} ‰`} sub={chosen.report.carbon.perMille >= 4 ? 'meets the 4 per 1000 target' : 'target: +4 ‰ a year'} tone={chosen.report.carbon.perMille >= 4 ? 'good' : undefined} />
            <Kpi label="topsoil water" value={`${chosen.report.carbon.waterGain >= 0 ? '+' : '−'}${Math.abs(chosen.report.carbon.waterGain).toFixed(1)} mm`} sub="plant-available, 0-30 cm (Saxton & Rawls)" />
            <Kpi
              label="nitrate in drainage"
              value={`${Math.round(chosen.report.nitrate.mgNO3)} mg NO₃/L`}
              sub={`${chosen.report.nitrate.kgN.toFixed(1)} kg N/ha a year · EU limit 50 mg/L`}
              tone={chosen.report.nitrate.mgNO3 >= 50 ? 'bad' : chosen.report.nitrate.mgNO3 < 25 ? 'good' : undefined}
            />
            <Kpi
              label="riskiest winter"
              value={chosen.report.nitrate.worst && chosen.report.nitrate.worst.kgN >= 1 ? `after ${form(chosen.report.nitrate.worst.after).name.toLowerCase()}` : 'none'}
              sub={chosen.report.nitrate.worst && chosen.report.nitrate.worst.kgN >= 1 ? `~${Math.round(chosen.report.nitrate.worst.kgN)} kg N/ha can wash out before ${form(chosen.report.nitrate.worst.before).name.toLowerCase()}` : `${Math.round(chosen.report.nitrate.drainage)} mm drain through in winter`}
            />
          </div>

          {cover && ero && (
            <div className="mt-6">
              <div className="flex items-center gap-2 text-[13px] text-ink"><CloudLightning className="h-4 w-4 text-orbit" /> Storms vs soil cover</div>
              <p className="mt-1 text-[12px] leading-snug text-ink-3">
                {pct(cover.exposed)} of this field's erosive rain falls on soil the crop doesn't cover under this plan
                {refCover ? <> - {pct(refCover.exposed)} {current ? 'as you farm now' : 'under the reference'}</> : null}; {cover.bareMonths.toFixed(1)} months a year below 30 % cover.
              </p>
              <div className="mt-3 grid grid-cols-12 gap-1" aria-hidden>
                {ero.map((v, m) => (
                  <div key={m} className="flex flex-col items-center gap-1">
                    <div className="relative flex h-16 w-full items-end overflow-hidden rounded bg-white/[0.03]">
                      <motion.div
                        className="w-full rounded-t bg-orbit/70"
                        initial={{ height: 0 }}
                        whileInView={{ height: `${(v / eroMax) * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: 0.03 * m, ease: EASE }}
                      />
                    </div>
                    <CoverCell f={cover.monthly[m]} />
                    {refCover && <CoverCell f={refCover.monthly[m]} faint />}
                    <span className="font-mono text-[11px] text-ink-4">{MONTHS_SHORT[(m + 12) % 12][0]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-ink-4">
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-orbit/70" /> erosive rain, NASA POWER daily ({pct(eroTotal ? Math.max(...ero) / eroTotal : 0)} in the stormiest month)</span>
                <span className="flex items-center gap-1.5"><Sprout className="h-3 w-3 text-leaf" /> cover: this plan{refCover ? ' / now (faint)' : ''}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 border-t border-white/[0.06] pt-6">
        <SoilMonolith key={chosen.key} stock={stock} delta={chosen.report.carbon.delta} color={chosen.color} label={chosen.label} />
      </div>

      <p className="mt-6 text-xs leading-relaxed text-ink-3">
        Carbon: residues and roots from IPCC 2006 (Vol. 4, Table 11.2) at the yield this field can expect, 45 % carbon, root exudates +65 %
        (Bolinder et al. 2007); ICBM two-pool model (Andrén & Kätterer 1997) with humification 0.125 for straw and 2.3× that for roots
        (Kätterer et al. 2011); decomposition speed from this field's NASA POWER temperature, rain and ET₀ (RothC temperature × IPCC 2019 water
        factor), relative to Ultuna. The shaded band is ±30 % on residue amounts and humification, the model's largest uncertainty. Like the IPCC Tier-2 method it assumes the soil has settled under the way you farm now, so the lines show
        what a change would do, not a forecast of the stock. Storms: daily rain ≥ 12.7 mm weighted by P^1.81 (Richardson et al. 1983); cover
        from each month's crop coefficient (FAO-56 eq. 76), residue mulch not counted. Nitrate: mineral N typically left at harvest,
        minus autumn uptake by the next crop or a catch crop, carried below 90 cm by the winter drainage of this soil (Burns 1974) - a risk
        index for comparing rotations, not a measurement. SoilGrids stock: {Math.round(stock)} t C/ha in 0-30 cm.
      </p>
    </div>
  )
}

/** The model's main uncertainty - residue amounts and humification - as ±30 % around a trajectory. */
function band(d: number[], X: (t: number) => number, Y: (v: number) => number): string {
  const hi = d.map((v, i) => `${X(i + 1)},${Y(v * (v >= 0 ? 1.3 : 0.7))}`)
  const lo = d.map((v, i) => `${X(i + 1)},${Y(v * (v >= 0 ? 0.7 : 1.3))}`).reverse()
  return `M${X(0)},${Y(0)} L${hi.join(' L')} L${lo.join(' L')} Z`
}

function CoverCell({ f, faint = false }: { f: number; faint?: boolean }) {
  return (
    <div
      className={`w-full rounded-sm ${faint ? 'h-1.5' : 'h-3'}`}
      title={`${Math.round(f * 100)} % cover`}
      style={{ background: f < 0.05 ? 'rgb(160 110 60 / 0.45)' : `color-mix(in oklab, var(--color-leaf) ${Math.round(20 + f * 80)}%, #1a1208)`, opacity: faint ? 0.55 : 1 }}
    />
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-white/[0.035] px-3 py-2.5">
      <div className="kicker !text-[11px]">{label}</div>
      <div className={`num mt-1 text-[16px] ${tone === 'good' ? 'text-leaf' : tone === 'bad' ? 'text-heat' : 'text-ink'}`}>{value}</div>
      <div className="text-[11px] leading-tight text-ink-3">{sub}</div>
    </div>
  )
}

const fmtShort = (v: number) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${Math.abs(v).toFixed(1)} t`
const fmtT = (v: number) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : '±'}${Math.abs(v).toFixed(1)} t C/ha`

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 8 ? 2 : 1
  const out: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t)
  return out
}


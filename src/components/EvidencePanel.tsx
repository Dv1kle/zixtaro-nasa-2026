import { ArrowDown, ScrollText } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, type ReactNode } from 'react'
import type { Causal } from '../lib/causal'
import type { ClimateAnalysis } from '../lib/climate'
import { CROP_BY_ID, type CropId } from '../lib/crops'
import { KIND_LABEL, PARAMS, SOURCES, type EvidenceKind } from '../lib/evidence'
import { compare, FACTOR_INFO } from '../lib/explain'
import { pct, signed } from '../lib/format'
import type { Confidence, Sensitivity } from '../lib/robust'
import { erodibilityOf, formIn, type Evaluation, type FieldContext, type Priorities } from '../lib/rotation'
import type { ScaleNote } from '../lib/scale'
import { openMethod } from '../lib/nav'
import { showPart } from '../lib/reveal'
import { fieldValidity } from '../lib/validity'
import { GAEZ_HEAT_GROUP, soilSuitability } from '../lib/gaez'
import { KindBadge } from './EvidenceRegistry'
import { CropTile } from './ui'

const EASE = [0.16, 1, 0.3, 1] as const
const jump = (tour: string) => showPart(tour)
const BAR: Record<string, string> = { literature: 'bg-leaf/70', heuristic: 'bg-wheat/70', assumption: 'bg-heat/70' }

/**
 * The ten questions a sceptical reader should be able to ask of any recommendation - answered for this one,
 * from the same numbers the rest of the page shows, each with the kind of evidence it rests on.
 */
export function EvidencePanel(props: {
  ranking: Evaluation[]
  ctx: FieldContext
  climate: ClimateAnalysis
  priorities: Priorities
  exclude: CropId[]
  confidence: Confidence | null
  sens: Sensitivity | null
  causal: Causal | null
  scale: ScaleNote
}) {
  const { ranking, ctx, climate, priorities, exclude, confidence, sens, causal, scale } = props
  const form = formIn(ctx) // crops as this field grows them
  const top = ranking[0]
  const second = ranking[1]
  const cmp = useMemo(() => (top && second ? compare(top, second, priorities) : null), [top, second, priorities])
  if (!top) return null
  const name = top.crop.name.toLowerCase()
  const W = priorities.soil + priorities.water + priorities.profit || 1

  // Q6: the pick's score by the kind of evidence behind each part
  const carbonShare = top.sub.soil > 0 ? Math.min(1, (0.35 * top.sub.carbon) / top.sub.soil) : 0
  // site fit: GAEZ soil ratings and heat units - published science (the four crops GAEZ does not rate keep a rule of thumb)
  const fitLit = GAEZ_HEAT_GROUP[top.crop.id] || top.crop.gddNeed <= 0 ? 1 : 0.5
  const byKind = [
    { k: 'literature', v: top.parts.water + top.parts.soil * carbonShare + top.parts.fit * fitLit },
    { k: 'heuristic', v: top.parts.fit * (1 - fitLit) + top.parts.soil * (1 - carbonShare) },
    { k: 'assumption', v: top.parts.profit },
  ]
  const total = byKind.reduce((s, x) => s + x.v, 0) || 1

  const share = confidence?.shares.find((s) => s.id === top.crop.id)?.share ?? null
  const flips = sens?.flips.filter((f) => f.top !== top.crop.id) ?? []
  const tip = sens?.tipping.find((t) => t.budget > 0 && t.id !== top.crop.id)
  const soilFlip = sens?.flips.filter((f) => f.source === 'SoilGrids' && f.top !== top.crop.id) ?? []
  const prioFlip = sens?.flips.filter((f) => f.source === 'your priorities' && f.top !== top.crop.id) ?? []
  const rotationNotes = top.notes.filter((n) => n.tag === 'rotation')
  const risk = ctx.risks[top.crop.id]
  const moved = causal?.movers.filter((m) => Math.abs(m.delta) >= 1).slice(0, 3) ?? []
  const tropics = climate.season.hemisphere === 'tropics'
  // daily data is not passed here: its own flag is shown in the validity panel
  const edges = fieldValidity({ climate, soil: ctx.soil, daily: null, scale }).filter((f) => f.level !== 'ok' && f.id !== 'nodaily')
  const water = ctx.irrigated ? 'unlimited irrigation' : (ctx.budget ?? 0) > 0 ? `${ctx.budget} mm of irrigation per season` : 'rainfed'
  const used = ['fao56', 'fao33', 'power', 'merra2', 'soilgrids', 'saxton', 'gaez', 'ipcc2006', 'icbm', 'renard1997', 'williams1995', 'mk', 'shapley']

  const Q: { q: string; a: ReactNode; kinds: EvidenceKind[]; to?: string }[] = [
    {
      q: 'What evidence caused this recommendation?',
      a: cmp && second ? (
        <>Against {second.crop.name.toLowerCase()} (#2): {cmp.parts.filter((p) => Math.abs(p.points) >= 0.3).slice(0, 3).map((p) => `${FACTOR_INFO[p.key].label.toLowerCase()} ${signed(p.points, 1)}`).join(', ')}. {top.notes.find((n) => n.tone === 'good')?.text}</>
      ) : top.notes.find((n) => n.tone === 'good')?.text,
      kinds: ['literature', 'heuristic'],
      to: 'why',
    },
    {
      q: 'Which NASA observation materially affected it?',
      a: causal ? (
        <>
          {causal.verdict}{' '}
          {moved.length > 0 && <>The shift NASA POWER recorded here ({signed(causal.shift.dT.reduce((a, b) => a + b, 0) / 12, 1)} °C on average since 1981-2010) {moved.map((m) => `${m.delta > 0 ? 'lifted' : 'lowered'} ${form(m.id).name.toLowerCase()} ${signed(m.delta, 1)}`).join(', ')}.</>}
        </>
      ) : 'Working it out…',
      kinds: ['modeled', 'literature'],
      to: 'why',
    },
    {
      q: 'Which local soil information affected it?',
      a: (
        <>
          {ctx.soil.texture}, {Math.round(ctx.soil.paw100)} mm of water in the top metre, {Math.round(risk.taw)} mm within {name}’s {top.crop.rootDepth} m roots
          {ctx.soil.lab?.length ? ` - with your lab ${ctx.soil.lab.join(', ')}` : ''}{ctx.soil.source === 'provisional' ? ' (a provisional typical loam)' : ''}. {soilFlip.length ? `If the soil held 20 % ${soilFlip[0].key === 'soil-' ? 'less' : 'more'} water, ${CROP_BY_ID[soilFlip[0].top].name.toLowerCase()} would lead.` : 'Soil water ±20 % does not change the pick.'}{' '}
          {(() => {
            const e = erodibilityOf(ctx)
            const g = soilSuitability(top.crop.id, ctx.soil)
            const gaez = `FAO GAEZ v4 rates this topsoil at ${pct(g.rating)} of ${name}’s yield potential${g.limiting ? ` (limited by its ${g.limiting === 'ph' ? `pH ${ctx.soil.top.ph.toFixed(1)}` : ctx.soil.texture})` : ''}.`
            return `${gaez} Bare, it could lose ~${e.potential < 1 ? '< 1' : Math.round(e.potential)} t/ha a year to rain on a ${e.slopePct.toFixed(1)} % slope${e.slopeKnown ? '' : ' (assumed)'} (RUSLE, order of magnitude); ${Math.round(e.ef * 100)} % of the topsoil is fine enough to blow.`
          })()}
        </>
      ),
      kinds: ctx.soil.lab?.length ? ['modeled', 'farmer', 'literature'] : ['modeled', 'literature'],
      to: 'sure',
    },
    {
      q: 'Which of your priorities or limits affected it?',
      a: (
        <>
          Weights soil {pct(priorities.soil / W)} · water {pct(priorities.water / W)} · profit {pct(priorities.profit / W)}; {water}; {exclude.length} crops switched off.{' '}
          {prioFlip.length ? prioFlip.map((f) => `${f.label} → ${form(f.top).name.toLowerCase()}`).join('; ') + '.' : 'Leaning harder on any one priority keeps the pick.'}
        </>
      ),
      kinds: ['farmer'],
      to: 'sure',
    },
    {
      q: 'Which agronomic rule affected it?',
      a: rotationNotes.length ? rotationNotes.map((n) => n.text).join(' ') : `No break-interval or disease rule touches ${name} after your last seasons.`,
      kinds: ['heuristic'],
      to: 'lab',
    },
    {
      q: 'Which parts are published science, which rules of thumb?',
      a: (
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-full">
            {byKind.map((x) => (
              <motion.i key={x.k} className={`block h-full ${BAR[x.k]}`} initial={{ width: 0 }} whileInView={{ width: `${(x.v / total) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-ink-3">
            {byKind.map((x) => <span key={x.k}>{KIND_LABEL[x.k as EvidenceKind]} {pct(x.v / total)}</span>)}
          </div>
          <div className="mt-1 text-[12px] text-ink-3">of the {top.score.toFixed(0)} points; all of them are scaled by rotation health (a rule of thumb) and local proof (whether the country harvests the crop).</div>
        </div>
      ),
      kinds: ['literature', 'heuristic', 'assumption'],
    },
    {
      q: 'How sensitive is it to uncertain inputs?',
      a: share !== null ? `First in ${pct(share)} of ${confidence!.runs} Monte Carlo variations; ${sens ? `${flips.length} of ${sens.flips.length} single inputs pushed to their limit hand first place to another crop` : ''}.` : 'Working it out…',
      kinds: ['heuristic'],
      to: 'sure',
    },
    {
      q: 'When would another crop become preferable?',
      a: (
        <>
          {flips.length ? flips.slice(0, 3).map((f) => `${f.label.toLowerCase()} → ${form(f.top).name.toLowerCase()}`).join('; ') + '. ' : ''}
          {tip ? `With ≥ ${tip.budget} mm of irrigation, ${form(tip.id).name.toLowerCase()} leads. ` : ''}
          {causal?.runs.filter((r) => r.pick !== top.crop.id).map((r) => `${r.label}: ${form(r.pick).name.toLowerCase()}`).join('; ')}
          {!flips.length && !tip && !causal?.runs.some((r) => r.pick !== top.crop.id) && 'None of the tested changes moves it - a robust pick.'}
        </>
      ),
      kinds: ['heuristic', 'modeled'],
      to: 'sure',
    },
    {
      q: 'What are the limits of this recommendation?',
      a: (
        <>
          {scale.title}{scale.scale === 'region' ? ' - a regional picture, not a field prescription' : ''}. Climate from a ≈ 50 km NASA POWER cell, soil modelled at 250 m, a monthly water model that ranks crops but does not forecast yields
          {tropics ? '; tropical sowing dates come from the monthly rainy season, and the real onset moves by weeks' : ''}; prices are placeholders.{' '}
          {edges.length ? `On this field ${edges.length} known failure mode${edges.length > 1 ? 's apply' : ' applies'}: ${edges.map((f) => f.title.toLowerCase()).join('; ')}.` : 'None of the checkable failure modes applies to this field.'}
        </>
      ),
      kinds: ['assumption'],
      to: 'validity',
    },
    {
      q: 'Which sources support the science?',
      a: (
        <div className="flex flex-wrap gap-1.5">
          {used.map((id) =>
            SOURCES[id].url ? (
              <a key={id} href={SOURCES[id].url} target="_blank" rel="noreferrer" title={SOURCES[id].full} className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-ink-2 transition hover:border-white/30 hover:text-ink">
                {SOURCES[id].short}
              </a>
            ) : (
              <button key={id} onClick={() => openMethod('registry')} title={SOURCES[id].full} className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] text-ink-2 transition hover:border-white/30 hover:text-ink">
                {SOURCES[id].short}
              </button>
            ),
          )}
          <button onClick={() => openMethod('registry')} className="rounded-full border border-leaf/30 px-2 py-0.5 font-mono text-[11px] text-leaf">all {PARAMS.length} parameters →</button>
        </div>
      ),
      kinds: ['literature'],
    },
  ]

  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink">
          <ScrollText className="h-4 w-4 text-leaf" /> What this recommendation rests on
          <CropTile crop={top.crop} size="xs" className="ml-1 !h-6 !w-6 !rounded" />
        </div>
        <div className="font-mono text-[11px] text-ink-3">ten questions a sceptic should ask - answered from this page’s own numbers</div>
      </div>
      <ol className="mt-5 grid gap-3 lg:grid-cols-2">
        {Q.map((x, i) => (
          <motion.li
            key={x.q}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.03 * i, ease: EASE }}
            className="rounded-xl bg-white/[0.025] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2.5">
                <span className="num mt-0.5 text-[11px] text-ink-4">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[13.5px] text-ink">{x.q}</span>
              </div>
              {x.to && (
                <button onClick={() => jump(x.to!)} aria-label={`Details for: ${x.q}`} className="shrink-0 rounded-full p-1 text-ink-4 transition hover:text-ink">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 pl-7 text-[13px] leading-relaxed text-ink-2">{x.a}</div>
            <div className="mt-2 flex flex-wrap gap-1 pl-7">{x.kinds.map((k) => <KindBadge key={k} kind={k} />)}</div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}

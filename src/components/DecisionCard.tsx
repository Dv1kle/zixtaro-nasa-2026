import { ArrowDown, ArrowRight, CloudSun, Columns2, Droplets, History, Layers, SlidersHorizontal, Tractor } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import { CROP_BY_ID, type CropId } from '../lib/crops'
import { compare, FACTOR_INFO } from '../lib/explain'
import { drillCheck, type Forecast } from '../lib/forecast'
import { pct, signed } from '../lib/format'
import type { Confidence, Sensitivity } from '../lib/robust'
import { formIn, nothingPays, type Evaluation, type FieldContext, type Priorities } from '../lib/rotation'
import { useLang } from '../lib/i18n'
import { dayLabel, sowCheckOf } from './LivePanels'
import { lazyPart } from './lazyPart'
import { CropTile, Tilt } from './ui'
import { MAP_NAME } from '../lib/cropMaps'

const ScenarioSplit = lazyPart(() => import('./ScenarioSplit').then((m) => m.ScenarioSplit))
import { showPart } from '../lib/reveal'

const EASE = [0.16, 1, 0.3, 1] as const
const jump = (tour: string) => showPart(tour)

/**
 * The decision on one screen: what the field is (NASA climate, soil, history, the farmer's limits) on the left,
 * the pick in the middle, and why - plus how sure - on the right. Every block links to its full panel below.
 */
export function DecisionCard(props: {
  ranking: Evaluation[]
  ctx: FieldContext
  climate: ClimateAnalysis
  history: (CropId | null)[]
  priorities: Priorities
  excluded: number
  confidence: Confidence | null
  sens: Sensitivity | null
  onScienceOnly?: (v: boolean) => void
  /** the farmer has chosen a plan that opens with another crop: the card is then the engine's own pick, and says so */
  other?: boolean
  /** an active what-if or replay ("+2 °C", "dry year 2018"): the pick is for that, not for the coming season */
  scenario?: string | null
  /** the pick without that scenario: shown beside it, so the card says whether the scenario changes the answer */
  baseline?: Evaluation | null
  /** say by how much the scenario moves the typical pick's score (off under warming, see ScenarioVersus) */
  scoreShift?: boolean
  /** the live 16-day forecast: when the pick's sowing month is in it, the days fit to drill */
  forecast?: Forecast | null
  /** the whole typical-decade ranking, for the side-by-side view of a scenario */
  baseRanking?: Evaluation[] | null
}) {
  const form = formIn(props.ctx) // crops as this field grows them (spring wheat, silage maize)
  const { ranking, ctx, climate, history, priorities, excluded, confidence, sens, onScienceOnly, scenario = null, baseline = null, scoreShift = true, forecast = null, baseRanking = null } = props
  const lang = useLang()
  const [split, setSplit] = useState(false)
  const top = ranking[0]
  const second = ranking[1]
  const cmp = useMemo(() => (top && second ? compare(top, second, priorities) : null), [top, second, priorities])
  if (!top) return null
  const dT = climate.means.recent.t - climate.means.baseline.t
  const dW = climate.means.recent.cwbGS - climate.means.baseline.cwbGS
  const known = history.filter((x): x is CropId => x !== null).slice(-3)
  const share = confidence?.shares.find((s) => s.id === top.crop.id)?.share ?? null
  const tip = sens?.tipping.find((t) => t.budget > 0 && t.id !== top.crop.id)
  const reasons = cmp ? cmp.parts.filter((p) => Math.abs(p.points) >= 0.3).slice(0, 3) : []
  const maxAbs = Math.max(1, ...reasons.map((r) => Math.abs(r.points)))
  const loss = nothingPays(ranking)
  const water = ctx.irrigationPrior != null ? `not set - scored as ${pct(ctx.irrigationPrior)} irrigated, like the cropland around` : ctx.irrigated ? 'unlimited irrigation' : (ctx.budget ?? 0) > 0 ? `${ctx.budget} mm irrigation / season` : 'rainfed'
  const watch = top.notes.find((n) => n.tone !== 'good')
  // sow in these days: the drill check of the forecast panel, for the pick in the form this field grows
  const sow = forecast && !scenario ? sowCheckOf(ctx.risks[top.crop.id]?.crop ?? top.crop, climate) : null
  const drill = sow && forecast ? drillCheck(forecast.days, sow.month, sow.minT, sow.tender) : null
  const day = (i: number) => dayLabel(forecast!.days[i].date, { weekday: 'short', day: 'numeric', month: 'short' }, lang)

  return (
    <div className="panel relative overflow-hidden p-5 sm:p-7">
      <div className="relative grid gap-6 lg:grid-cols-[1fr_auto_1.1fr] lg:gap-8">
        {/* ---- the field ---- */}
        <div className="order-2 space-y-3 lg:order-1">
          <div className="kicker">This field</div>
          <Line icon={<CloudSun className="h-4 w-4 text-heat" />} label="NASA climate" onClick={() => jump('stripes')}>
            <span className="text-heat">{signed(dT, 1, ' °C')}</span> since {climate.baseline.from}-{climate.baseline.to},{' '}
            <span className={dW < 0 ? 'text-wheat' : 'text-water'}>{signed(dW, 0, ' mm')}</span> season water balance
          </Line>
          <Line icon={<Layers className="h-4 w-4 text-wheat" />} label="soil" onClick={() => document.getElementById('roots')?.scrollIntoView({ behavior: 'smooth' })}>
            {ctx.soil.texture}, {Math.round(ctx.soil.paw100)} mm water in the top metre{ctx.soil.lab?.length ? ' · your lab test' : ''}
            {ctx.soil.source === 'provisional' && <span className="text-wheat"> · provisional</span>}
          </Line>
          <Line icon={<History className="h-4 w-4 text-orbit" />} label="last seasons" onClick={() => document.getElementById('field')?.scrollIntoView({ behavior: 'smooth' })}>
            <span className="inline-flex translate-y-1 gap-1">{known.length ? known.map((id, i) => <CropTile key={i} crop={CROP_BY_ID[id]} size="xs" className="!h-6 !w-6" />) : <span className="text-ink-3">not entered</span>}</span>
          </Line>
          <Line icon={<SlidersHorizontal className="h-4 w-4 text-[#b8a8ff]" />} label="your limits" onClick={() => document.getElementById('field')?.scrollIntoView({ behavior: 'smooth' })}>
            <Droplets className="mr-1 inline h-3.5 w-3.5 text-water" />{water}{excluded ? ` · ${excluded} crops off` : ''} · soil {Math.round(priorities.soil)} / water {Math.round(priorities.water)} / profit {Math.round(priorities.profit)}
          </Line>
        </div>

        {/* ---- the pick ---- */}
        <div className="order-1 flex flex-col items-center text-center lg:order-2 lg:px-4">
          <div className="kicker">{scenario ? 'Scenario' : props.other ? 'Zixtaro’s own pick' : 'Next season'}</div>
          {scenario && <span className="mt-2 rounded-full border border-heat/40 bg-heat/10 px-2.5 py-0.5 font-mono text-[11px] text-heat">{scenario}</span>}
          {scenario && baseline && <ScenarioVersus base={baseline} ranking={ranking} typical={`typical ${climate.recent.from}-${climate.recent.to}`} scenario={scenario} shift={scoreShift} onSplit={baseRanking ? () => setSplit(true) : undefined} />}
          {split && scenario && baseRanking && (
            <ScenarioSplit base={baseRanking} ranking={ranking} typical={`typical ${climate.recent.from}-${climate.recent.to}`} scenario={scenario} quantities={scoreShift} onClose={() => setSplit(false)} />
          )}
          <AnimatePresence mode="wait">
            <motion.div key={top.crop.id} className="mt-3" initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: 90, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} style={{ transformPerspective: 800 }}>
              <Tilt><CropTile crop={top.crop} size="hero" glow /></Tilt>
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 font-display-soft text-2xl leading-tight text-ink">{top.crop.name}</div>
          <div className="num mt-1 text-[12px] text-ink-3">score {top.score.toFixed(1)}{second ? ` · next ${second.crop.name.toLowerCase()} ${second.score.toFixed(1)}` : ''}</div>
          <div className="mt-2 max-w-xs text-[11.5px] leading-snug text-ink-3">
            {ctx.practice ? (
              <>Science × local practice{Math.abs(top.science - top.score) > 0.05 ? ` (science alone ${top.science.toFixed(1)})` : ''}: pushed toward what {ctx.practice.source === 'field' ? `this field and the fields around it sowed after the same crops in 2019-2023 (${MAP_NAME[ctx.practice.field!.map]}) and farms nearby sow after them` : ctx.practice.source === 'region' ? 'farms within about 250 km grow (CROPGRIDS 2020)' : 'this country harvests (FAOSTAT)'} - never past a crop the science rules out.</>
            ) : (
              <>Science alone - climate, soil, water and money, nothing about what farms grow.{top.proof < 1 ? ` This country hardly harvests ${top.crop.name.toLowerCase()} at scale (FAOSTAT).` : ''}</>
            )}
            {onScienceOnly && (
              <button onClick={() => onScienceOnly(!!ctx.practice)} className="ml-1 text-orbit underline decoration-dotted underline-offset-2 hover:text-ink">
                {ctx.practice ? 'show science only' : 'add local practice'}
              </button>
            )}
          </div>
          {drill && drill.inWindow > 0 && (
            <button onClick={() => document.getElementById('air')?.scrollIntoView({ behavior: 'smooth' })} className="mt-3 flex max-w-xs items-start gap-2 rounded-lg border border-leaf/30 bg-leaf/10 px-3 py-2 text-left text-[12.5px] leading-snug text-ink-2 transition hover:border-leaf/60">
              <Tractor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" aria-hidden />
              {drill.run ? (
                // the dates stay out of the sentence (translate="no"), so it has one key in every language
                <span>
                  <b className="text-leaf">Sow <span translate="no">{drill.run[0] === drill.run[1] ? day(drill.run[0]) : `${day(drill.run[0])} - ${day(drill.run[1])}`}</span></b>: {drill.workable} of the {drill.inWindow} forecast days in its sowing month are fit to drill.
                </span>
              ) : (
                <span>Its sowing month is in the 16-day forecast, but none of those days is fit to drill - wait for a better spell.</span>
              )}
            </button>
          )}
          {loss !== null && (
            <p className="mt-3 max-w-xs rounded-lg border border-heat/30 bg-heat/10 px-3 py-2 text-left text-[12.5px] leading-snug text-ink-2">
              <b className="text-heat">No crop pays here</b> as {water}: the best expected margin is −€{Math.round(Math.abs(loss) / 10) * 10}/ha. The order only ranks the losses - look at irrigation, grazing or a fallow before sowing.
            </p>
          )}
          {share !== null && (
            <button onClick={() => jump('sure')} className="mt-3 w-44 text-left">
              <span className="flex items-baseline justify-between font-mono text-[11px]">
                <span className="text-ink-3">holds in</span>
                <span className={share >= 0.8 ? 'text-leaf' : share >= 0.55 ? 'text-wheat' : 'text-heat'}>{pct(share)} of variations</span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.i className="block h-full rounded-full" style={{ background: top.crop.color }} initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.9, ease: EASE }} />
              </span>
            </button>
          )}
        </div>

        {/* ---- why, and what would change it ---- */}
        <div className="order-3 space-y-3">
          <div className="kicker">Why{second ? ` not ${second.crop.name.toLowerCase()}` : ''}</div>
          {reasons.length ? (
            <button onClick={() => jump('why')} className="block w-full space-y-2 text-left">
              {reasons.map((r) => (
                <span key={r.key} className="grid grid-cols-[minmax(0,1fr)_88px_44px] items-center gap-2">
                  <span className="min-w-0 text-[13px] leading-tight text-ink-2">{FACTOR_INFO[r.key].label}</span>
                  <span className="relative h-2 rounded-full bg-white/[0.05]">
                    <motion.i
                      className={`absolute inset-y-0 rounded-full ${r.points >= 0 ? 'left-1/2 bg-leaf' : 'right-1/2 bg-heat'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(Math.abs(r.points) / maxAbs) * 50}%` }}
                      transition={{ duration: 0.7, ease: EASE }}
                    />
                    <span className="absolute inset-y-[-2px] left-1/2 w-px bg-white/25" />
                  </span>
                  <span className={`num text-right text-[12px] ${r.points >= 0 ? 'text-leaf' : 'text-heat'}`}>{signed(r.points, 1)}</span>
                </span>
              ))}
            </button>
          ) : (
            <p className="text-[13px] text-ink-3">The two leaders are practically level.</p>
          )}
          {tip && (
            <button onClick={() => jump('sure')} className="block text-left text-[12.5px] leading-snug text-ink-3 hover:text-ink-2">
              <Droplets className="mr-1 inline h-3.5 w-3.5 text-water" />With ≥ {tip.budget} mm of irrigation, {form(tip.id).name.toLowerCase()} would take first place.
            </button>
          )}
          {watch && <p className="text-[12.5px] leading-snug text-wheat/90">Watch: {watch.text}</p>}
        </div>
      </div>
      <div className="relative mt-6 flex flex-wrap gap-2 border-t border-white/8 pt-4">
        {[
          ['why', 'Why this crop'],
          ['sure', 'How sure'],
          ['evidence', 'What it rests on'],
          ['lab', 'Try your own rotation'],
          ['soilhealth', 'Soil in 20 years'],
          ['backtest', 'Backtest'],
        ].map(([t, label]) => (
          <button key={t} onClick={() => jump(t)} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] text-ink-3 transition hover:border-white/30 hover:text-ink">
            {label} <ArrowDown className="h-3 w-3" />
          </button>
        ))}
      </div>
      <p className="relative mt-5 max-w-3xl border-t border-white/10 pt-4 text-[12.5px] leading-relaxed text-ink-3">
        Zixtaro knows this field’s record; you know the field. Before changing a rotation, check the plan against your own records and with an agronomist who knows the ground.
      </p>
    </div>
  )
}

function Line({ icon, label, children, onClick }: { icon: ReactNode; label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="group flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/[0.03]">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block font-mono text-[11px] tracking-wider text-ink-4 uppercase">{label}</span>
        <span className="block text-[13px] leading-snug text-ink-2">{children}</span>
      </span>
    </button>
  )
}

/** The typical-decade pick beside the scenario's: same crop or not, and what the scenario does to the typical pick. */
// Under warming a shorter grain fill now brings the median wheat and maize responses near the literature (-6 / -8 % at
// +1 °C), but on the development cells it was built on, with no held-out check; soybean and rice still respond at half
// the literature (no photoperiod), and a crop's form switch still moves it in a step. So a warming scenario says only
// whether the pick changes, not by how much (grain fill).
function ScenarioVersus({ base, ranking, typical, scenario, shift, onSplit }: { base: Evaluation; ranking: Evaluation[]; typical: string; scenario: string; shift: boolean; onSplit?: () => void }) {
  const top = ranking[0]
  const same = top.crop.id === base.crop.id
  const now = ranking.find((e) => e.crop.id === base.crop.id)
  const delta = now && shift ? now.score - base.score : null
  const side = (e: Evaluation, label: string) => (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <CropTile crop={e.crop} size="xs" className="!h-7 !w-7" />
      <span className="max-w-[7rem] text-[11px] leading-tight text-ink-2">{e.crop.name}</span>
      <span className="font-mono text-[10px] leading-tight text-ink-4">{label}</span>
    </div>
  )
  return (
    <div className="mt-3 w-full max-w-[16rem] rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-start justify-center gap-3">
        {side(base, typical)}
        <ArrowRight className="mt-2 h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />
        {side(top, scenario)}
      </div>
      <p className={`mt-2 text-[11.5px] leading-snug ${same ? 'text-leaf' : 'text-heat'}`}>
        {same
          ? `Same pick${delta !== null && Math.abs(delta) >= 0.1 ? `; its score ${delta < 0 ? 'drops' : 'rises'} ${Math.abs(delta).toFixed(1)} points` : ''}.`
          : `The pick changes${now && shift ? `: ${base.crop.name.toLowerCase()} scores ${now.score.toFixed(1)} here (${base.score.toFixed(1)} in a typical year)` : ''}.`}
      </p>
      {onSplit && (
        <button onClick={onSplit} className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-orbit underline decoration-dotted underline-offset-2 hover:text-ink">
          <Columns2 className="h-3.5 w-3.5" aria-hidden />
          Every crop, side by side
        </button>
      )}
    </div>
  )
}

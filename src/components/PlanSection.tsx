import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, BadgeCheck, Ban, CalendarDays, Check, ChevronDown, Droplets, Factory, Gauge, History, ListOrdered, Printer, Repeat, Scale, Sprout, Thermometer, Trees, XCircle } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { DUR, EASE_SETTLE } from '../lib/motion'
import { useEffect, useMemo, useState } from 'react'
import { backtest, BACKTEST_FROM_TODAY } from '../lib/backtest'
import type { ClimateAnalysis } from '../lib/climate'
import type { DailyAnalysis } from '../lib/daily'
import { CROPS, CROP_BY_ID, FAMILY_LABEL, type CropId, type FormOf } from '../lib/crops'
import { euro, pct } from '../lib/format'
import { formatArea } from '../lib/geo'
import { evaluate, flagSummary, formIn, nitrogenNeed, nothingPays, type Evaluation, type FieldContext, type Note, type Priorities, type Strategy } from '../lib/rotation'
import { riskAfter } from '../lib/water'
import { useLater } from '../lib/hooks'
import { whatIfExplain, whatIfSeason, whatIfShort, type Projection, type WhatIf } from '../lib/scenario'
import { Chip, CountUp, CropTile, RankDelta, Reveal, useRankDelta, SectionHeader, Seg, Toggle, WarmingSegs, WaterControl, type WaterApi } from './ui'
import { lastSeasonYear } from './FieldSection'
import type { Confidence, Sensitivity } from '../lib/robust'
import { SensitivityPanel } from './SensitivityPanel'
import { WhyPanel } from './WhyPanel'
import { DecisionCard } from './DecisionCard'
import { BucketCheckPanel } from './BucketCheckPanel'
import { SowingPanel } from './SowingPanel'
import { GroundwaterNote } from './GroundwaterNote'
import { EvidencePanel } from './EvidencePanel'
import { ValidityPanel } from './ValidityPanel'
import { LocalCropsPanel } from './LocalCropsPanel'
import { RiskFlags } from './RiskFlags'
import { LongTermPanel } from './LongTermPanel'
import { MODEL_VERSION } from '../lib/version'
import type { SobolGap } from '../lib/sobol'
import { DailyCheckCard, PestCard } from './ScienceCards'
import type { LocalCrops } from '../lib/localCrops'
import type { Causal } from '../lib/causal'
import type { SowAdvice } from '../lib/sowing'
import type { Forecast } from '../lib/forecast'
import { DataProvenance, type SourceItem } from './DataProvenance'
import type { ScaleNote } from '../lib/scale'
import { RotationLab } from './RotationLab'
import { StrategyBoard } from './StrategyBoard'
import { asNow, chosenPlan, type PlanKey } from '../lib/strategyReading'
import { SoilHealthPanel } from './SoilHealthPanel'
import { planScore, type PlanEnv } from '../lib/planMetrics'
import { GROWN_AROUND } from '../lib/presets'
import { inLithuania } from '../lib/staticmap'
import { ProofPanel } from './ProofPanel'
import { SeasonWheel } from './SeasonWheel'
import { DeepTabs } from './DeepTabs'
import { openLegal, openMethod } from '../lib/nav'
import { Instrument, usePlate, type Fact } from './Instrument'
import { PlanVitrine } from './PlanVitrine'

type Props = {
  /** switch between the labelled default (science × national practice, mode C) and the science alone (mode A) */
  onScienceOnly?: (v: boolean) => void
  /** the page's market chip, shown beside the water control */
  marketChip?: ReactNode
  ranking: Evaluation[]
  /** the ranking without the what-if or replay, while one is on */
  baseRanking?: Evaluation[] | null
  strategies: Strategy[]
  ctx: FieldContext
  climate: ClimateAnalysis
  replay: number | null
  setReplay: (y: number | null) => void
  irrigated: boolean
  water: WaterApi
  excludedCount: number
  warming: WhatIf
  setWarming: (w: WhatIf) => void
  projection: Projection | null
  history: (CropId | null)[]
  areaHa: number | null
  priorities: Priorities
  exclude: CropId[]
  daily: DailyAnalysis | null
  lat: number
  lon: number
  confidence: Confidence | null
  sens: Sensitivity | null
  sources: SourceItem[]
  scale: ScaleNote
  co2On: boolean
  setCo2On: (v: boolean) => void
  sowing: SowAdvice[] | null
  presetId: string | null
  causal: Causal | null
  /** field elevation from the terrain model, m */
  elevation: number | null
  /** what farms grow in the field's 0.5° cell (CROPGRIDS) */
  local: { here: LocalCrops | null; around?: Record<string, number> | null; source: string; url: string } | null
  /** reproducibility: a hash of every input and the model version */
  scenarioId: string
  sobol?: SobolGap | null
  /** the live 16-day forecast (the decision card's sowing days) */
  forecast?: Forecast | null
  /** the plan the farmer goes on with (the page's choice), and how it is changed */
  planKey: PlanKey
  onPlan: (key: PlanKey) => void
}

const PART_COLORS = { soil: 'var(--color-leaf)', water: 'var(--color-water)', profit: 'var(--color-wheat)', fit: '#b8a8ff' } as const
const PART_LABEL = { soil: 'soil health', water: 'water', profit: 'profit', fit: 'site fit' } as const

export function PlanSection(props: Props) {
  const { ranking, strategies, ctx, climate, replay, setReplay, irrigated, water, excludedCount, warming, setWarming, projection, history, areaHa, priorities, exclude, daily, lat, lon, confidence, sens, sources, scale, co2On, setCo2On, sowing, presetId, causal, elevation, local, scenarioId, sobol } = props
  const top = ranking[0]
  // The farmer's choice. `top` stays the engine's pick - the decision card and the workings explain that one;
  // `lead` is the crop the chosen plan opens with, which is what the plate names once another plan is chosen.
  const { planKey, onPlan } = props
  const plan = chosenPlan(strategies, history, planKey)
  const chosen = strategies.find((s) => s.key === plan?.key) ?? strategies[0]
  const own = !!plan && plan.key !== 'you'
  const lead = (own && ranking.find((e) => e.crop.id === plan.ids[0])) || top
  const plate = usePlate()
  // how the farm handles residues and winter windows - shared by the sandbox and the soil outlook
  const [soilOpts, setSoilOpts] = useState({ strawRemoved: false, catchCrops: false })
  const erosivity = daily?.erosivityByMonth.recent ?? null
  const env: PlanEnv = useMemo(() => ({ climate, erosivity, ...soilOpts }), [climate, erosivity, soilOpts])
  const [labSeq, setLabSeq] = useState<CropId[] | null>(null)
  const replayYears = climate.driest.slice(0, 3).map((d) => d.year).sort((a, b) => b - a)
  // the scenario the answer is for, carried onto the decision card so a changed pick never looks like the plan
  const scenario = [replay !== null ? `dry year ${replay}` : null, warming !== 0 ? whatIfShort(warming) : null].filter(Boolean).join(' + ') || null

  // The plate (story mode): the answer, the three numbers it stands on, what to watch - and the plant itself. The
  // decision card and the plain-words list are the first things in its instrument.
  const story = plate.story
  // The plans side by side on the plate itself, the rotation the field is on among them: the comparison the page is
  // for sat three steps into the workings, where a first visitor never met it. Scores only - the other measures
  // stay in the ledger (StrategyBoard), so the plate carries none of their weight.
  const plateRows = useMemo(() => {
    if (!story) return []
    const now = asNow(history, strategies[0]?.seq.length ?? 4)
    const rows: { key: PlanKey; label: string; ids: CropId[] }[] = [...(now ? [{ key: 'now' as const, label: 'As now', ids: now }] : []), ...strategies.map((s) => ({ key: s.key, label: s.label, ids: s.seq.map((e) => e.crop.id) }))]
    return rows.map((r) => ({ ...r, score: planScore(r.ids, history, ctx, priorities) }))
  }, [story, strategies, history, ctx, priorities])
  // Crops no farm around the field grows, which its climate, soil and prices would still carry (Lithuania: there the
  // field starts without them, presets.defaultExcludeFor). They stand apart: scored without the pull toward what the
  // region grows, and never in the answer or a plan - a thing to try on a strip, not a recommendation.
  const untried = useMemo(() => {
    const around = local?.around
    if (!story || !around || !inLithuania(lat, lon)) return []
    const off = new Set(exclude)
    return CROPS.filter((c) => off.has(c.id) && (around[c.id] ?? 0) < GROWN_AROUND && !['forage', 'cover', 'vegetable'].includes(c.group))
      .map((c) => evaluate(c, history, { ...ctx, practice: undefined }, priorities))
      .filter((e) => e.score >= UNTRIED_BAR)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }, [story, local, lat, lon, exclude, history, ctx, priorities])
  // the rotation the farm is on, when no plan found here beats it: the plate says so instead of leaving a lower-scoring
  // plan ticked with no word about it
  const nowRow = plateRows.find((r) => r.key === 'now')
  const nowBest = !!nowRow && plateRows.every((r) => r.key === 'now' || r.score <= nowRow.score + 0.5)
  const second = ranking[1]
  const share = lead === top ? confidence?.shares.find((s) => s.id === top.crop.id)?.share ?? null : null
  const loss = nothingPays(ranking)
  const why = lead.notes.find((n) => n.tone === 'good')?.text
  const watch = lead.notes.find((n) => n.tone !== 'good')
  const facts: Fact[] = [
    {
      value: lead.score.toFixed(0),
      unit: '/ 100',
      label: lead !== top ? `how well it suits this field - Zixtaro’s own pick, ${top.crop.name.toLowerCase()}: ${top.score.toFixed(0)}` : second ? `how well it suits this field - next best, ${second.crop.name.toLowerCase()}: ${second.score.toFixed(0)}` : 'score',
    },
    { value: euro(Math.round(lead.margin / 10) * 10), unit: '/ha', label: 'expected gross margin' },
    share !== null ? { value: pct(share), label: 'of the what-ifs tried (drier years, other prices) still pick it' } : { value: lead.harvest.toFixed(1), unit: 't/ha', label: 'expected harvest' },
  ]
  // the descent's turning point: the answer surfaces - the only block on the page that rises from below
  const decision = (
    <motion.div
      data-tour="decision"
      className={story ? 'mt-6 min-w-0' : 'mt-10 min-w-0'}
      initial={{ opacity: 0, y: 72 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: DUR.narrative, ease: EASE_SETTLE }}
    >
      <DecisionCard other={lead !== top} forecast={props.forecast} baseRanking={scenario ? props.baseRanking ?? null : null} scenario={scenario} baseline={scenario ? props.baseRanking?.[0] ?? null : null} scoreShift={warming === 0} onScienceOnly={props.onScienceOnly} ranking={ranking} ctx={ctx} climate={climate} history={history} priorities={priorities} excluded={excludedCount} confidence={confidence} sens={sens} />
    </motion.div>
  )
  const words = (
    <Reveal className="mt-4">
      <PlainWords ranking={ranking} ctx={ctx} climate={climate} other={lead !== top} />
    </Reveal>
  )

  return (
    <section id="plan" className={`paper sec-plan relative scroll-mt-16 px-5 pt-16 pb-16 sm:pt-24 sm:pb-20 sm:px-8 lg:pl-28 xl:pl-36 ${plate.root}`}>
      {story && <PlanVitrine crop={lead.crop} className="plan-vitrine-desk hidden lg:block" />}
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col">
        <div className={story ? 'lg:max-w-[54%]' : undefined}>
          <SectionHeader
            kicker="Resurface"
            altitude="▲ back to 0 m"
            step={story ? 'Step 4 of 4 · what to sow' : undefined}
            title={warming ? <>In {whatIfSeason(warming)}: <em className="text-leaf">{lead.crop.name.toLowerCase()}</em>.</> : <>Next season: <em className="text-leaf">{lead.crop.name.toLowerCase()}</em>.</>}
            dek={story ? why ?? 'The crop this field, its soil, its water and its last seasons point to.' : 'Every score below breaks down into soil, water, profit and site fit - and every point lost has a named reason. No black box, no ties.'}
          />
          {/* what the reader has to know before sowing stays on the plate, not a click deeper */}
          {story && (loss !== null || watch) && (
            <p className="mt-6 flex max-w-xl gap-2.5 text-[14px] leading-snug text-ink-2">
              <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${loss !== null ? 'text-heat' : 'text-wheat'}`} aria-hidden />
              <span>{loss !== null ? `No crop pays here: the best expected margin is ${euro(-Math.round(Math.abs(loss) / 10) * 10)}/ha. The order only ranks the losses.` : watch!.text}</span>
            </p>
          )}
          {/* another plan than the engine's was chosen: the plate says whose plan this is now, shows its four
              seasons, and keeps the way back */}
          {own && plan && (
            <div className="plan-choice mt-7 max-w-xl">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="kicker !text-leaf">Your plan · {plan.label}</span>
                <button onClick={() => onPlan('you')} className="font-mono text-[11px] tracking-[0.06em] text-ink-3 uppercase underline decoration-ink/25 underline-offset-4 transition hover:text-ink hover:decoration-ink/60">
                  Back to Zixtaro’s plan
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {plan.ids.map((id, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="flex flex-col items-center gap-1">
                      <CropTile crop={CROP_BY_ID[id]} size="sm" glow={i === 0} />
                      <span className="num text-[11px] text-ink-4">{lastSeasonYear() + 1 + i}</span>
                    </span>
                    {i < plan.ids.length - 1 && <ArrowRight className="mb-4 h-3 w-3 shrink-0 text-ink-4" aria-hidden />}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[13.5px] leading-snug text-ink-2">
                {lead !== top
                  ? `You chose it over Zixtaro’s own pick for your priorities, ${top.crop.name.toLowerCase()} (${top.score.toFixed(0)}). The page follows your plan from here on - the soil, the forecast, the elevator and the market.`
                  : 'The page follows your plan from here on - the soil outlook, nitrogen, the elevator and the market.'}
              </p>
            </div>
          )}
          {/* the tool supports the decision, it does not take it: said where the answer is, not only in the small print */}
          <p className="mt-6 flex max-w-xl flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px] tracking-[0.06em] text-ink-3 uppercase">
            <span>A suggestion to weigh - the decision is yours</span>
            <button onClick={() => openLegal('notice')} className="underline decoration-ink/25 underline-offset-4 transition hover:text-ink hover:decoration-ink/60">
              What it is not
            </button>
          </p>
          {/* and where the farmer's own knowledge has to come in: said by name, not as a general caution */}
          {story && (
            <p className="mt-3 max-w-xl text-[13px] leading-snug text-ink-3">
              What it cannot see and you can: your own soil test (this is a soil map), the weeds, pests and diseases of this field, your machinery, and the price your buyer pays. Check the plan against those, and with an agronomist who knows the ground.
            </p>
          )}
        </div>
        {story && <PlanVitrine crop={lead.crop} className="-mx-5 mt-8 h-[92vw] max-h-[64svh] sm:-mx-8 lg:hidden" />}

        {!story && decision}
        {!story && words}

        <Instrument paper title={<>Why {top.crop.name.toLowerCase()}, and what if</>} kicker="Instrument · the plan" label="Open the plan's workings" facts={facts}>
        {story && decision}
        {story && words}
        <Reveal tour="whatif" className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="kicker w-full shrink-0 whitespace-nowrap sm:w-44">Climate to plan for</span>
              <Seg on={replay === null} onClick={() => setReplay(null)}>
                Typical {climate.recent.from}-{climate.recent.to}
              </Seg>
              {replayYears.map((y) => (
                <span key={y} title={`Plans for ${y} again - one of the three driest seasons on record here`}>
                  <Seg on={replay === y} onClick={() => setReplay(y)} hot>
                    Dry year {y}
                  </Seg>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="kicker w-full shrink-0 whitespace-nowrap sm:w-44">What if</span>
              <WarmingSegs value={warming} onChange={setWarming} projection={projection} />
            </div>
            {typeof warming === 'string' && projection && (
              <div className="flex flex-wrap items-center gap-2 sm:pl-44">
                <Toggle checked={co2On} onChange={setCo2On} label="Count CO₂'s effect on the crops" hint="less transpiration (AquaCrop), more C3 yield (FACE experiments)" />
              </div>
            )}
          </div>
          <div className="min-w-0 lg:shrink-0 lg:pt-1">
            <div className="kicker mb-2">Irrigation water per season</div>
            <WaterControl {...water} compact />
            {props.marketChip && <div className="mt-4"><div className="kicker mb-2">Where it sells</div>{props.marketChip}</div>}
          </div>
        </Reveal>

        {warming !== 0 && (
          <Reveal className="mt-4">
            <div className="flex gap-3 rounded-xl border border-heat/30 bg-heat/[0.07] p-4 text-sm leading-relaxed text-ink-2">
              <Thermometer className="mt-0.5 h-4 w-4 shrink-0 text-heat" />
              <span>
                What-if scenario: {whatIfExplain(warming, projection, climate.recent, co2On)}. The climate record above is untouched, and plans saved on
                your farm are not overwritten.
              </span>
            </div>
          </Reveal>
        )}

        {(ctx.irrigated || (ctx.budget ?? 0) > 0) && (
          <Reveal className="mt-4">
            <GroundwaterNote lat={lat} lon={lon} presetId={presetId} budget={ctx.budget ?? 0} unlimited={ctx.irrigated} recharge={ctx.winterDrain} irrigationNeed={top.deficit} />
          </Reveal>
        )}

        <Reveal tour="pick" className="mt-6">
          <Recommendation e={top} runnerUp={ranking[1]} ctx={ctx} confidence={confidence} />
        </Reveal>

        <DeepTabs
          label="Dig deeper"
          intro={
            <div className="mb-4">
              <div className="kicker">Dig deeper</div>
              <p className="mt-1.5 max-w-2xl text-[14px] text-ink-3">Everything behind the pick, one topic at a time.</p>
            </div>
          }
          tabs={[
            {
              id: 'why',
              label: 'Why this crop',
              icon: Scale,
              holds: ['why', 'local'],
              render: () => (
                <>
                  <Reveal tour="why">
                    <WhyPanel ranking={ranking} ctx={ctx} climate={climate} priorities={priorities} />
                  </Reveal>
                  <Reveal tour="local" className="mt-4">
                    <LocalCropsPanel data={local} ranking={ranking} ctx={ctx} priorities={priorities} history={history} lat={lat} lon={lon} />
                  </Reveal>
                </>
              ),
            },
            {
              id: 'crops',
              label: 'All crops',
              icon: ListOrdered,
              badge: String(ranking.length),
              render: () => (
                <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
                  <Reveal className="panel p-4 sm:p-6">
                    <Leaderboard ranking={ranking} excludedCount={excludedCount} />
                  </Reveal>
                  <Reveal delay={0.08} className="panel p-5 sm:p-6">
                    <ShiftChart ranking={ranking} ctx={ctx} irrigated={irrigated} />
                  </Reveal>
                </div>
              ),
            },
            {
              id: 'sure',
              label: 'How sure',
              icon: Gauge,
              badge: confidence ? `${Math.round((confidence.shares.find((x) => x.id === top.crop.id)?.share ?? 0) * 100)} %` : undefined,
              holds: ['sure', 'evidence', 'validity'],
              render: () => (
                <>
                  <Reveal tour="sure">
                    {replay === null ? (
                      <SensitivityPanel sobol={sobol} confidence={confidence} sens={sens} water={water} form={formIn(ctx)} />
                    ) : (
                      <div className="panel p-5 text-sm text-ink-3">How sure the pick is, and what would change it, is worked out for typical seasons - switch the replay back to “Typical” to see it.</div>
                    )}
                  </Reveal>
                  <Reveal tour="evidence" className="mt-4">
                    <EvidencePanel ranking={ranking} ctx={ctx} climate={climate} priorities={priorities} exclude={exclude} confidence={confidence} sens={sens} causal={causal} scale={scale} />
                  </Reveal>
                  <Reveal tour="validity" className="mt-4">
                    <ValidityPanel ctx={ctx} climate={climate} daily={daily} scale={scale} elevation={elevation} ranking={ranking} />
                  </Reveal>
                </>
              ),
            },
            {
              id: 'season',
              label: 'The season',
              icon: CalendarDays,
              holds: ['dial', 'sowing'],
              render: () => (
                <>
                  <Reveal tour="dial" className="panel p-5 sm:p-6">
                    <div className="kicker">The next season on the dial</div>
                    <div className="mt-4">
                      <SeasonWheel crop={top.crop} climate={climate} daily={daily} risk={ctx.risks[top.crop.id]} warming={warming} />
                    </div>
                  </Reveal>
                  {sowing && sowing.length > 0 && (
                    <Reveal tour="sowing" className="mt-4">
                      <SowingPanel advice={sowing} south={climate.season.hemisphere === 'south'} />
                    </Reveal>
                  )}
                </>
              ),
            },
            {
              id: 'plans',
              label: 'Four seasons',
              icon: Repeat,
              holds: ['lab', 'soilhealth', 'strategies'],
              render: () => (
                <>
                  <Reveal tour="strategies">
                    <h3 className="font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-tight">
                      {asNow(history) ? 'Four ways forward - one of them is carrying on.' : 'Three ways forward - each starts differently.'}
                    </h3>
                    <p className="mt-3 max-w-2xl text-ink-2">
                      Searched over every sequence of available crops with the same explainable rules{asNow(history) ? ', and set beside the rotation this field is on' : ''}. {replay ? `Losses assume every season is a ${replay} replay.` : 'Pick a replay year above to stress-test them.'}
                    </p>
                  </Reveal>
                  {strategies.length > 0 && (
                    <Reveal className="mt-10">
                      <StrategyBoard strategies={strategies} history={history} ctx={ctx} priorities={priorities} env={env} replay={replay} start={lastSeasonYear() + 1} picked={plan?.key ?? 'you'} onPick={onPlan} />
                    </Reveal>
                  )}
                  {strategies[0] && (
                    <Reveal tour="lab" className="mt-6">
                      <RotationLab history={history} ctx={ctx} priorities={priorities} env={env} strategy={chosen} exclude={exclude} start={lastSeasonYear() + 1} onChange={setLabSeq} />
                    </Reveal>
                  )}
                  {strategies.length > 0 && (
                    <Reveal tour="soilhealth" className="mt-6">
                      <SoilHealthPanel strategies={strategies} history={history} ctx={ctx} priorities={priorities} env={env} setEnv={(e) => setSoilOpts({ strawRemoved: e.strawRemoved, catchCrops: e.catchCrops })} labSeq={labSeq} planKey={chosen.key} />
                    </Reveal>
                  )}
                  {strategies[0] && (
                    <Reveal className="mt-6">
                      <NitrogenPanel plan={chosen} history={history} areaHa={areaHa} ctx={ctx} />
                    </Reveal>
                  )}
                </>
              ),
            },
            {
              id: 'trees',
              label: 'Long term',
              icon: Trees,
              holds: ['trees'],
              render: () => (
                <Reveal tour="trees">
                  <LongTermPanel lat={lat} lon={lon} presetId={presetId} />
                </Reveal>
              ),
            },
            {
              id: 'proof',
              label: 'Proof',
              icon: BadgeCheck,
              holds: ['backtest', 'proof', 'bucket', 'sources'],
              render: () => (
                <>
                  <Reveal tour="backtest">
                    <BacktestPanel climate={climate} ctx={ctx} history={history} priorities={priorities} exclude={exclude} irrigated={irrigated} />
                  </Reveal>
                  <Reveal tour="proof" className="mt-6">
                    <ProofPanel lat={lat} lon={lon} climate={climate} soil={ctx.soil} />
                    <button onClick={() => openMethod('validation')} className="mt-3 flex items-center gap-2 text-[13px] text-orbit hover:underline">
                      <BadgeCheck className="h-4 w-4" aria-hidden /> How the model does on farmland it never saw <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </Reveal>
                  <Reveal tour="bucket" className="mt-6">
                    <BucketCheckPanel climate={climate} soil={ctx.soil} />
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <DailyCheckCard climate={climate} ctx={ctx} daily={daily} />
                      <PestCard climate={climate} />
                    </div>
                  </Reveal>
                  <Reveal tour="sources" className="mt-6">
                    <DataProvenance items={sources} scale={scale} />
                    <div className="mt-2 text-right font-mono text-[11px] text-ink-4" title="Same inputs and model version give the same ID - and, the engine being deterministic, the same recommendation">
                      {/* the ID and the version stay out of the sentence (translate="no"): one key for every scenario */}
                      scenario <span translate="no">{scenarioId}</span> · model <span translate="no">{MODEL_VERSION}</span>
                    </div>
                  </Reveal>
                </>
              ),
            },
          ]}
        />
        </Instrument>

        {story && plateRows.length > 1 && (
          <div className="mt-12 lg:max-w-[54%]">
            <div className="kicker">{plateRows[0].key === 'now' ? 'Four ways forward - one of them is carrying on.' : 'Three ways forward - each starts differently.'}</div>
            <div role="radiogroup" aria-label="The plans - choose the one to go on with" className="mt-3 border-b border-ink/15">
              {plateRows.map((r) => {
                const on = r.key === (plan?.key ?? 'you')
                return (
                  <button key={r.key} role="radio" aria-checked={on} onClick={() => onPlan(r.key)} className={`flex w-full items-center gap-3 border-t border-ink/15 px-2 py-2.5 text-left transition-colors sm:gap-4 sm:px-3 ${on ? 'bg-ink/[0.07]' : 'hover:bg-ink/[0.04]'}`}>
                    <span className={`w-[5.5rem] shrink-0 font-mono text-[11px] leading-snug tracking-[0.08em] uppercase sm:w-[8.5rem] ${on ? 'text-leaf' : 'text-ink-3'}`}>
                      {on && <Check className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px" aria-hidden />}
                      {r.label}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {r.ids.map((id, i) => (
                        <CropTile key={i} crop={CROP_BY_ID[id]} size="sm" />
                      ))}
                    </span>
                    <span className="font-display-soft text-[1.9rem] leading-none">{Math.round(r.score)}</span>
                  </button>
                )
              })}
            </div>
            <p className="mt-3 max-w-xl text-[13px] leading-snug text-ink-3">Each row is four years of crops, read left to right, with its points out of 100. “As now” is the rotation you are on. Tap a row to follow that plan; what each does for the soil, the water and the money is in the plan’s workings.</p>
            {nowBest && (
              <p className="mt-3 flex max-w-xl gap-2.5 text-[14px] leading-snug text-ink-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" aria-hidden />
                <span>The rotation you are on already does as well as anything found here. There is no reason to change it for the sake of change - keep an eye on the risks named above.</span>
              </p>
            )}
          </div>
        )}

        {untried.length > 0 && (
          <div className="mt-10 lg:max-w-[54%]">
            <div className="kicker">Not grown around here - but this field could carry them</div>
            <ul className="mt-3 border-b border-ink/15">
              {untried.map((e) => (
                <li key={e.crop.id} className="flex items-center gap-3 border-t border-ink/15 px-2 py-2.5 sm:gap-4 sm:px-3">
                  <CropTile crop={e.crop} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-ink">{e.crop.name}</span>
                    <span className="block text-[13px] text-ink-3">about {euro(Math.round(e.margin / 10) * 10)}/ha a year</span>
                  </span>
                  <span className="font-display-soft text-[1.9rem] leading-none">{Math.round(e.score)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 max-w-xl text-[13px] leading-snug text-ink-3">
              No farm within about 250 km grows these, so they are not in the answer or in the plans above. The weather, soil and prices of this field would suit them. Before sowing a whole field: find seed and a buyer first, and try a strip.
            </p>
          </div>
        )}

        <Reveal className={`mt-12 flex flex-wrap items-center gap-4 ${story ? 'lg:max-w-[54%]' : ''}`}>
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-full bg-leaf px-5 py-3 text-sm font-medium text-[#0a0b0e] transition hover:brightness-110">
            <Printer className="h-4 w-4" />
            Official report (print / PDF)
          </button>
          <span className="text-sm text-ink-3">A4 advisory report with report number, field map, climate & soil tables, references and a QR code back to this exact scenario.</span>
        </Reveal>
      </div>
    </section>
  )
}

/** the least score at which a crop nobody grows around the field is worth showing as one to try */
const UNTRIED_BAR = 55

function NoteLine({ n }: { n: Note }) {
  const Icon = n.tone === 'good' ? Check : n.tone === 'warn' ? AlertTriangle : XCircle
  const color = n.tone === 'good' ? 'text-leaf' : n.tone === 'warn' ? 'text-wheat' : 'text-heat'
  return (
    <li className="flex gap-2.5 text-[14px] leading-snug text-ink-2">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <span>{n.text}</span>
    </li>
  )
}

function ScoreRing({ score, size = 112 }: { score: number; size?: number }) {
  const r = size / 2 - 6
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={6} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-leaf)"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - score / 100) }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ filter: 'drop-shadow(0 0 8px rgb(201 176 122 / 0.5))' }}
      />
    </svg>
  )
}

function Recommendation({ e, runnerUp, ctx, confidence }: { e: Evaluation; runnerUp?: Evaluation; ctx: FieldContext; confidence: Confidence | null }) {
  const goods = e.notes.filter((n) => n.tone === 'good').slice(0, 4)
  const risks = e.notes.filter((n) => n.tone !== 'good').slice(0, 3)
  const maize = ctx.risks.maize ? riskAfter(ctx.risks.maize, false) : undefined
  // a pick that breaks its own break interval says so first, not in the margin next to a "solid pick"
  const rotation = flagSummary(e.flags)
  const highRisk = rotation?.level === 'high'
  return (
    <div className="panel relative overflow-hidden p-6 sm:p-8">
      {highRisk && <div className="relative mb-7"><RiskFlags flags={e.flags} /></div>}
      <div className="relative grid gap-8 lg:grid-cols-[auto_1fr_1fr]">
        {/* tile, score and how-sure wrap onto two lines on a phone instead of pushing the card wider than the screen */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-5 lg:flex-col lg:flex-nowrap lg:items-start">
          <AnimatePresence mode="wait">
            <motion.div key={e.crop.id} initial={{ opacity: 0, scale: 0.8, rotate: -6 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 180, damping: 18 }}>
              <CropTile crop={e.crop} size="xl" glow />
            </motion.div>
          </AnimatePresence>
          <div className="relative">
            <ScoreRing score={e.score} />
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="font-display-soft text-3xl leading-none tabular-nums">{Math.round(e.score)}</div>
                <div className="kicker mt-1 !text-[11px]">score</div>
              </div>
            </div>
          </div>
          {confidence && <Sureness c={confidence} pick={e.crop} form={formIn(ctx)} rotationRisk={highRisk} />}
        </div>
        <div className="min-w-0">
          <div className="kicker">Why {e.crop.name.toLowerCase()}</div>
          <p className="mt-3 text-[15px] text-ink-3 italic">{e.crop.blurb}</p>
          <ul className="mt-4 space-y-2.5">{goods.map((n, i) => <NoteLine key={i} n={n} />)}</ul>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <MiniStat label={ctx.irrigated ? 'irrigation need' : 'water-stress loss'} value={ctx.irrigated ? `${Math.round(e.deficit)} mm` : pct(e.loss)} sub={e.crop.id !== 'maize' && maize ? (ctx.irrigated ? `maize ${Math.round(maize.recent.deficit)} mm` : `maize ${pct(maize.recent.loss)}`) : undefined} />
            {/* a bare fallow has no roots: its depth is the soil whose water it stores for the next crop. In cm: a lone "m"
                has one letter, and the page translates only text with two (segments.ts LETTER) */}
            <MiniStat label={e.crop.family === 'none' ? 'stores water to' : 'root depth'} value={`${Math.round(e.crop.rootDepth * 100)} cm`} sub={`${Math.round(ctx.risks[e.crop.id].taw)} mm in reach`} />
            {e.crop.nFix ? <MiniStat label="leaves nitrogen" value={`${e.crop.nFix} kg N/ha`} /> : <MiniStat label="plant family" value={FAMILY_LABEL[e.crop.family]} />}
            {runnerUp && <MiniStat label="runner-up" value={runnerUp.crop.name} sub={`score ${Math.round(runnerUp.score)}`} />}
          </div>
        </div>
        <div className="min-w-0">
          <div className="kicker">Watch out</div>
          {e.flags.length > 0 && !highRisk && <div className="mt-4"><RiskFlags flags={e.flags} /></div>}
          <ul className="mt-4 space-y-2.5">
            {risks.length ? risks.map((n, i) => <NoteLine key={i} n={n} />) : <li className="text-sm text-ink-3">No red flags on this field.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** The share of re-runs (soil water ±20 %, recent seasons resampled) in which this pick stays first. */
function Sureness({ c, pick, form, rotationRisk = false }: { c: Confidence; pick: Evaluation['crop']; form: FormOf; rotationRisk?: boolean }) {
  const mine = c.shares.find((s) => s.id === pick.id)?.share ?? 0
  const others = c.shares.filter((s) => s.id !== pick.id).slice(0, 2)
  // the share measures how steady the ranking is when the data wobbles - not disease or rotation risk, which the
  // score leaves out. With a high rotation risk on the card, "a solid pick" would claim more than the number does.
  const word = mine >= 0.8 ? (rotationRisk ? 'steady in the data' : 'a solid pick') : mine >= 0.55 ? 'likely' : 'a close call'
  return (
    <div className="w-full min-w-[180px] lg:max-w-[210px]" title={`Re-ranked ${c.runs} times with ${c.varied.join(', ')}`}>
      <div className="kicker !text-[11px]">how sure · when the data varies</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display-soft text-3xl leading-none">{Math.round(mine * 100)}%</span>
        <span className="text-xs text-ink-3">{word}</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.i className="block h-full" style={{ background: pick.color }} initial={false} animate={{ width: `${mine * 100}%` }} transition={{ duration: 0.6 }} />
        {others.map((o) => (
          <motion.i key={o.id} className="block h-full" style={{ background: CROP_BY_ID[o.id].color, opacity: 0.5 }} initial={false} animate={{ width: `${o.share * 100}%` }} transition={{ duration: 0.6 }} />
        ))}
      </div>
      <div className="mt-1.5 text-[11px] leading-snug text-ink-3">
        {mine < 0.5 && others.length > 0
          ? `${pick.name}, ${others.map((o) => form(o.id).name.toLowerCase()).join(' and ')} trade first place - choose between them by market and machinery.`
          : `First in ${Math.round(mine * c.runs)} of ${c.runs} re-runs.`}{' '}
        <span className="text-ink-4">Re-ranked with soil water, seasons, drought response, prices and your priorities varied.</span>
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.035] px-3 py-2.5">
      <div className="kicker !text-[11px]">{label}</div>
      <div className="mt-1 line-clamp-2 text-[15px] leading-snug text-ink">{value}</div>
      {sub && <div className="truncate font-mono text-[11px] text-ink-3">{sub}</div>}
    </div>
  )
}

function Leaderboard({ ranking, excludedCount }: { ranking: Evaluation[]; excludedCount: number }) {
  const [open, setOpen] = useState<CropId | null>(null)
  const max = Math.max(...ranking.map((e) => e.score + e.parts.lost), 1)
  const moved = useRankDelta(ranking.map((e) => e.crop.id))
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
        <div className="text-[15px] text-ink">Every crop, scored</div>
        <div className="flex flex-wrap gap-3 font-mono text-[11px] text-ink-3">
          {(Object.keys(PART_COLORS) as (keyof typeof PART_COLORS)[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-sm" style={{ background: PART_COLORS[k] }} />
              {PART_LABEL[k]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-sm bg-[repeating-linear-gradient(45deg,var(--color-heat)_0_2px,transparent_2px_4px)]" />
            lost to rotation & crops unproven here
          </span>
        </div>
      </div>
      <LayoutGroup>
        <ul className="mt-4 space-y-1">
          {ranking.map((e, i) => (
            <motion.li layout key={e.crop.id} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
              <button
                onClick={() => setOpen(open === e.crop.id ? null : e.crop.id)}
                className={`grid w-full grid-cols-[22px_32px_minmax(0,1fr)_40px_16px] items-center gap-3 rounded-xl px-2 py-2 text-left transition sm:grid-cols-[22px_32px_130px_minmax(0,1fr)_40px_16px] ${open === e.crop.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.035]'}`}
                aria-expanded={open === e.crop.id}
              >
                <span className={`num text-xs ${i === 0 ? 'text-leaf' : 'text-ink-4'}`}>{i + 1}</span>
                <CropTile crop={e.crop} size="xs" />
                <span className="hidden min-w-0 items-center gap-1.5 text-sm text-ink-2 sm:flex"><span className="truncate">{e.crop.name}</span><RankDelta d={moved[e.crop.id]} /></span>
                <span className="flex h-3 overflow-hidden rounded-full bg-white/[0.04]">
                  {(Object.keys(PART_COLORS) as (keyof typeof PART_COLORS)[]).map((k) => (
                    <motion.i key={k} className="h-full" style={{ background: PART_COLORS[k] }} animate={{ width: `${(e.parts[k] / max) * 100}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
                  ))}
                  <motion.i
                    className="h-full bg-[repeating-linear-gradient(45deg,rgb(255_123_84/.7)_0_2px,transparent_2px_5px)]"
                    animate={{ width: `${(e.parts.lost / max) * 100}%` }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                </span>
                <CountUp value={e.score} className={`num text-right text-sm ${i === 0 ? 'text-leaf' : 'text-ink'}`} />
                <ChevronDown className={`h-4 w-4 text-ink-4 transition ${open === e.crop.id ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {open === e.crop.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="px-3 pt-2 pb-4 sm:pl-[64px]">
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        <Chip>rotation fit {pct(e.sub.rotation)}</Chip>
                        <Chip>soil {pct(e.sub.soil)}</Chip>
                        <Chip>water {pct(e.sub.water)}</Chip>
                        <Chip>profit {pct(e.sub.profit)}</Chip>
                        <Chip>site {pct(e.sub.fit)}</Chip>
                        <RiskFlags flags={e.flags} compact />
                        {e.kgPerM3 > 0 && <Chip tone="info" title="FAO water productivity: harvest per cubic metre of water the crop used">crop per drop {e.kgPerM3.toFixed(2)} kg/m³ · {euro(e.eurPerMm)}/mm</Chip>}
                      </div>
                      <ul className="space-y-2">{e.notes.map((n, k) => <NoteLine key={k} n={n} />)}</ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </ul>
      </LayoutGroup>
      {excludedCount > 0 && <div className="mt-3 px-2 text-xs text-ink-4">{excludedCount} crops switched off in “What can you grow?”</div>}
    </div>
  )
}

function ShiftChart({ ranking, ctx, irrigated }: { ranking: Evaluation[]; ctx: FieldContext; irrigated: boolean }) {
  const rows = ranking
    .filter((e) => e.crop.ky > 0)
    .map((e) => {
      const r = riskAfter(ctx.risks[e.crop.id], e.afterFallow)
      return { crop: e.crop, a: irrigated ? r.baseline.deficit : r.baseline.loss, b: irrigated ? r.recent.deficit : r.recent.loss }
    })
    .sort((x, y) => y.b - x.b)
  const max = Math.max(...rows.map((r) => Math.max(r.a, r.b))) * 1.08 || 1
  const fmtV = (v: number) => (irrigated ? `${Math.round(v)}` : pct(v))
  return (
    <div>
      <div className="text-[15px] text-ink">The shift, crop by crop</div>
      <div className="mt-1 text-xs text-ink-3">
        {irrigated ? 'Irrigation needed to avoid stress, mm per season' : 'Rainfed yield loss from water stress'} · ○ {ctx.baselineLabel} → ● {ctx.recentLabel}
      </div>
      <ul className="mt-5 space-y-2.5">
        {rows.map((r) => {
          const worse = r.b > r.a
          return (
            <li key={r.crop.id} className="grid grid-cols-[74px_minmax(0,1fr)_78px] items-center gap-3">
              <span className="truncate text-[13px] text-ink-2">{r.crop.name.replace('Winter ', 'W. ')}</span>
              <div className="relative h-5">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/8" />
                {/* transforms only: the bar grows from the old value, the dot travels in a track-wide layer (x % = track %) */}
                <motion.div
                  className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                  style={{ background: worse ? 'var(--color-heat)' : 'var(--color-water)', left: `${(Math.min(r.a, r.b) / max) * 100}%`, width: `${(Math.abs(r.b - r.a) / max) * 100}%`, transformOrigin: r.b >= r.a ? 'left' : 'right' }}
                  initial={{ scaleX: 0, opacity: 0 }}
                  whileInView={{ scaleX: 1, opacity: 0.8 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                />
                <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-void" style={{ left: `${(r.a / max) * 100}%` }} />
                <motion.div className="absolute inset-0" initial={{ x: `${((r.a - r.b) / max) * 100}%` }} whileInView={{ x: '0%' }} viewport={{ once: true }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}>
                  <span
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ left: `${(r.b / max) * 100}%`, background: worse ? 'var(--color-heat)' : 'var(--color-water)', boxShadow: `0 0 10px ${worse ? 'var(--color-heat)' : 'var(--color-water)'}` }}
                  />
                </motion.div>
              </div>
              <span className={`num text-right text-xs ${worse ? 'text-heat' : 'text-water'}`}>
                {fmtV(r.a)} → {fmtV(r.b)}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-5 text-xs leading-relaxed text-ink-3">
        Each crop was run through every season since {ctx.baselineLabel.slice(0, 4)} with a daily-demand root-zone water balance (FAO-56) and the FAO-33 yield response factor - on this field’s own rain, heat and soil.
      </p>
    </div>
  )
}

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

/** The whole analysis in four sentences a farmer would say out loud. */
function PlainWords({ ranking, ctx, climate, other }: { ranking: Evaluation[]; ctx: FieldContext; climate: ClimateAnalysis; /** the farmer's plan opens with another crop */ other?: boolean }) {
  const top = ranking[0]
  const worst = ranking.length > 1 ? ranking[ranking.length - 1] : null
  const dT = climate.means.recent.t - climate.means.baseline.t
  const dW = climate.means.recent.cwbGS - climate.means.baseline.cwbGS
  const peakEt = Math.max(...climate.monthly.recent.map((m) => m.pet / 30.4))
  const why = top.notes.find((n) => n.tone === 'good')?.text
  const avoid = worst?.notes.find((n) => n.tone === 'bad')?.text ?? worst?.notes.find((n) => n.tone === 'warn')?.text
  const lines = [
    { icon: Thermometer, tone: 'text-heat', text: `Since the 1980s this field has become ${Math.abs(dT).toFixed(1)} °C ${dT >= 0 ? 'warmer' : 'cooler'}, and each growing season now ends about ${Math.abs(Math.round(dW))} mm ${dW < 0 ? 'drier' : 'wetter'}.` },
    { icon: Droplets, tone: 'text-water', text: `The soil${ctx.soil.source === 'provisional' ? ' (estimated until SoilGrids answers)' : ''} is ${ctx.soil.texture}: it stores about ${Math.round(ctx.soil.paw100)} mm of water - roughly ${Math.round(ctx.soil.paw100 / peakEt)} hot summer days without rain.` },
    { icon: Sprout, tone: 'text-leaf', text: `${other ? 'Zixtaro’s own pick for next season is' : 'Next season, grow'} ${top.crop.name.toLowerCase()}${why ? ` - ${lowerFirst(why)}` : '.'}` },
    ...(worst && avoid ? [{ icon: Ban, tone: 'text-wheat', text: `Hold off on ${worst.crop.name.toLowerCase()} for now - ${lowerFirst(avoid)}` }] : []),
  ]
  return (
    <div className="panel p-6 sm:p-8">
      <div className="kicker !text-leaf">In plain words</div>
      <ul className="mt-5 space-y-4">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-4">
            <l.icon className={`mt-1 h-5 w-5 shrink-0 ${l.tone}`} />
            <span className="text-lg leading-relaxed text-ink sm:text-xl">{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- Nitrogen & carbon: the plan against repeating what the field just did ----------

const N_PRICE = 1.1 // € per kg N, illustrative (calcium ammonium nitrate)
// kg CO₂e per kg of synthetic N: direct field N₂O at the IPCC 2019 default (1 % of N × 44/28 × GWP 273 ≈ 4.3)
// plus ≈ 3.5 to manufacture European ammonium nitrate. Indirect N₂O and soil carbon are left out.
const N2O_PER_KG_N = 0.01 * (44 / 28) * 273
const MAKE_PER_KG_N = 3.5
const CO2E_PER_KG_N = N2O_PER_KG_N + MAKE_PER_KG_N

function NitrogenPanel({ plan, history, areaHa, ctx }: { plan: Strategy; history: (CropId | null)[]; areaHa: number | null; ctx: FieldContext }) {
  const seq = plan.seq.map((e) => e.crop.id)
  const before = history[history.length - 1] ?? null
  // the forms this field grows (spring wheat on the prairies needs less N than winter wheat), as the score charged them
  const mine = nitrogenNeed(seq, before, formIn(ctx))
  const known = history.filter((x): x is CropId => x !== null).slice(-4)
  const same = known.length >= 2 ? seq.map((_, i) => known[i % known.length]) : null
  const theirs = same ? nitrogenNeed(same, before, formIn(ctx)) : null
  const saved = theirs ? theirs.n - mine.n : null // kg N/ha over the four seasons
  const max = Math.max(mine.n, theirs?.n ?? 0, 1)
  const ha = areaHa ?? 1
  const rows = [
    ...(same && theirs ? [{ label: 'Repeat your last seasons', seq: same, n: theirs.n, tone: 'var(--color-ink-3)' }] : []),
    { label: `${plan.label} plan`, seq, n: mine.n, tone: 'var(--color-leaf)' },
  ]
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><Factory className="h-4 w-4 text-wheat" /> Nitrogen & carbon over four seasons</div>
        <div className="font-mono text-[11px] text-ink-3">synthetic N after legume credits, kg N/ha</div>
      </div>
      <div className="mt-5 space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[auto_minmax(0,1fr)_48px] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[150px_auto_minmax(0,1fr)_64px]">
            <span className="col-span-3 truncate text-[13px] text-ink-2 sm:col-span-1">{r.label}</span>
            <span className="flex gap-1">{r.seq.map((id, i) => <CropTile key={i} crop={CROP_BY_ID[id]} size="xs" />)}</span>
            <span className="h-3 overflow-hidden rounded-full bg-white/[0.04]">
              <motion.i className="block h-full rounded-full" style={{ background: r.tone }} initial={{ width: 0 }} whileInView={{ width: `${(r.n / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
            </span>
            <span className="num text-right text-sm text-ink">{Math.round(r.n)}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {mine.fixed > 0 && <Chip tone="good">legumes in the plan fix ~{Math.round(mine.fixed)} kg N/ha</Chip>}
        {saved !== null && saved > 0 && (
          <>
            <Chip tone="good">−{Math.round(saved)} kg N/ha{areaHa ? ` · ${((saved * ha) / 1000).toFixed(1)} t N on ${formatArea(areaHa)}` : ''}</Chip>
            <Chip tone="info">≈ {euro(saved * ha * N_PRICE)} fertiliser{areaHa ? '' : ' per ha'}</Chip>
            <Chip tone="info">≈ {areaHa ? `${((saved * ha * CO2E_PER_KG_N) / 1000).toFixed(1)} t` : `${Math.round(saved * CO2E_PER_KG_N)} kg`} CO₂e avoided{areaHa ? '' : ' per ha'}</Chip>
          </>
        )}
        {saved !== null && saved <= 0 && (
          <Chip tone="warn">the plan needs {Math.round(-saved)} kg N/ha more than repeating your last seasons</Chip>
        )}
        {saved === null && <Chip>enter at least two past seasons to compare with what you do now</Chip>}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        CO₂e per kg of synthetic N avoided: direct field N₂O at the IPCC 2019 default (1 % of applied N, GWP 273 → {N2O_PER_KG_N.toFixed(1)} kg) plus
        ≈ {MAKE_PER_KG_N} kg to manufacture it (European ammonium nitrate). N price €{N_PRICE.toFixed(2)}/kg is illustrative. Soil
        carbon is modelled separately in the soil-health outlook above.
      </p>
    </div>
  )
}

// ---------- Backtest: would Zixtaro have called the seasons this field actually had? ----------

function BacktestPanel(props: { climate: ClimateAnalysis; ctx: FieldContext; history: (CropId | null)[]; priorities: Priorities; exclude: CropId[]; irrigated: boolean }) {
  const { climate, ctx, history, priorities, exclude, irrigated } = props
  // The real record (never the what-if), the field's soil, the farmer's own history and priorities.
  const bt = useLater(
    () => backtest(climate, ctx.soil, history, lastSeasonYear(), priorities, new Set(exclude), irrigated, ctx.budget ?? 0),
    [climate, ctx.soil, history, priorities, exclude, irrigated, ctx.budget],
    300,
  )
  if (!bt) return <div className="panel h-64 animate-pulse" />
  const judged = bt.better + bt.same + bt.worse
  if (!bt.rows.length) return null
  const fmt = (v: number | null) => (v === null ? '-' : irrigated ? `${Math.round(v)} mm` : pct(v))
  const verdict = judged
    ? `In ${bt.better} of ${judged} seasons Zixtaro's pick would have lost less to drought than what was grown${bt.worse ? `, and more in ${bt.worse}` : ' - and never more'}.`
    : 'No season here can be compared yet (unknown or non-harvest crops).'
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><History className="h-4 w-4 text-orbit" /> Backtest on this field: would Zixtaro have called it?</div>
        <div className="font-mono text-[11px] text-ink-3">{irrigated ? 'irrigation needed to avoid stress' : 'yield lost to water stress'}, each season's observed weather</div>
      </div>
      <p className="mt-3 text-lg leading-relaxed text-ink">{verdict}</p>
      <table className="mt-4 w-full border-separate border-spacing-y-1.5 text-left text-sm">
        <thead>
          <tr className="font-mono text-[11px] text-ink-3">
            <th className="px-2 font-normal">season</th>
            <th className="px-2 font-normal">grown</th>
            <th className="px-2 font-normal">
              <span className="sm:hidden">pick</span>
              <span className="hidden sm:inline">Zixtaro's pick</span>
            </th>
            <th className="hidden px-2 font-normal sm:table-cell">deciding with data to</th>
            <th className="px-2 text-right font-normal">verdict</th>
          </tr>
        </thead>
        <tbody>
          {bt.rows.map((r) => (
            <tr key={r.year} className="bg-white/[0.025]">
              <td className="num rounded-l-xl px-2 py-2 text-ink-2">
                {r.year}
                <span className="block text-[11px] text-ink-4 sm:hidden">data to {r.dataTo}</span>
              </td>
              <td className="px-2 py-2">
                <span className="flex items-center gap-2">
                  <CropTile crop={r.grown ? CROP_BY_ID[r.grown] : null} size="xs" />
                  <span className="num text-ink-2">{fmt(r.grownValue)}</span>
                  {r.grownBrokeRotation && (
                    <Chip tone="warn" className="!px-1.5 sm:!px-2.5">
                      <AlertTriangle className="h-3 w-3 sm:hidden" aria-label="broke a rotation rule" />
                      <span className="hidden sm:inline">broke a rotation rule</span>
                    </Chip>
                  )}
                </span>
              </td>
              <td className="px-2 py-2">
                <span className="flex items-center gap-2">
                  <CropTile crop={CROP_BY_ID[r.pick]} size="xs" glow={r.verdict === 'better'} />
                  <span className="num text-ink">{fmt(r.pickValue)}</span>
                </span>
              </td>
              <td className="num hidden px-2 py-2 text-ink-3 sm:table-cell">{r.dataTo}</td>
              <td className="rounded-r-xl px-2 py-2 text-right">
                <Chip tone={r.verdict === 'better' ? 'good' : r.verdict === 'worse' ? 'bad' : 'neutral'}>
                  {r.verdict === 'n/a' ? (
                    <>
                      <span className="sm:hidden">n/a</span>
                      <span className="hidden sm:inline">not comparable</span>
                    </>
                  ) : (
                    r.verdict
                  )}
                </Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Each pick is re-run with only the complete NASA POWER years a farmer had when planning (up to two years before harvest) and the
        history before that season; a test changes every later year's weather and checks that no earlier pick moves. Taken from today, as
        no archive exists: {BACKTEST_FROM_TODAY.join(', ')}. Outcomes come from the same FAO-56/FAO-33 water model on each season's observed
        weather{(ctx.budget ?? 0) > 0 ? ` with your ${ctx.budget} mm budget` : ''} - one side of the decision; rotation rules, prices and workload matter too.
      </p>
    </div>
  )
}

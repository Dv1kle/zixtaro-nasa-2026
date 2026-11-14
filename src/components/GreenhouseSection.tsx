import { AlertTriangle, BadgeCheck, Droplets, Flame, Gauge, History, Lightbulb, Printer, Snowflake, Sprout, Sun, ThermometerSun, Warehouse } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import type { GhSnapshot } from '../lib/farm'
import { euro, MONTHS_SHORT, pct, signed, thousands } from '../lib/format'
import {
  carbonPerKg, co2On, COVERS, coldGain, insideByDay, planMargin, seasonSpan,
  type Cover, type GhCropId, type GhMonth, type GhPriorities, type GhResult, type GhYearPlan, type GreenhouseSpec, type Prices,
} from '../lib/greenhouse'
import { marketLabel, type EnergyPrices } from '../lib/ghMarket'
import { bestMargin, EnergyNote, GhBacktest, GhCropPicker, GhDecisionCard, GhPriceCurve, GhPriorityControls, GlassLocal, GlassProof, rankNote } from './GhPanels'
import { useWidth } from '../lib/hooks'
import { whatIfExplain, whatIfPeriod, type Projection, type WhatIf } from '../lib/scenario'
import { GhTrustPanel, useGhTrust } from './GhTrustPanel'
import { GreenhouseCutaway } from './GreenhouseCutaway'
import { ThingTile } from './ThingTile'
import type { ThingId } from '../lib/specimen'
import { DeepTabs } from './DeepTabs'
import { Chip, CropTile, NumberField, RankDelta, Reveal, SectionHeader, Seg, SiteSwitch, Skeleton, Toggle, useRankDelta, WarmingSegs } from './ui'
import { Instrument, usePlate } from './Instrument'

/** A field on the same farm that could take the roof's overflow. */
export type Neighbour = { name: string; areaHa: number; deficit: number | null; km: number }

type Props = {
  climate: ClimateAnalysis | null // real NASA POWER record
  plan: ClimateAnalysis | null // same, with the warming scenario applied
  spec: GreenhouseSpec
  setSpec: (s: GreenhouseSpec) => void
  prices: Prices
  setPrices: (p: Prices) => void
  warming: WhatIf
  setWarming: (w: WhatIf) => void
  projection: Projection | null
  areaFromOutline: number | null // m², when the house was drawn on the map
  neighbours: Neighbour[]
  onField: () => void // this spot is really an open field
  /** one run of the model shared with the printed report */
  report: { result: GhResult; ranking: GhResult[]; year: GhYearPlan | null } | null
  priorities: GhPriorities
  setPriorities: (p: GhPriorities) => void
  exclude: GhCropId[]
  setExclude: (x: GhCropId[]) => void
  country: string | null
  energy: EnergyPrices
  pricesEdited: boolean
  resetPrices: () => void
  /** a pinned crossing stands before the section: as a plate it rides up over that scene (story mode) */
  over?: boolean
}

const eur = euro
const eurM2 = (x: number) => `${x < 0 ? '−' : ''}€${Math.abs(x).toFixed(Math.abs(x) < 10 ? 1 : 0)}`
const SECTION = 'relative scroll-mt-16 px-5 pt-16 pb-16 sm:pt-24 sm:pb-20 sm:px-8 lg:pl-28 xl:pl-36'

export function GreenhouseSection(props: Props) {
  const { plan, report } = props
  const ranking = report?.ranking ?? []
  const result = report?.result ?? null

  if (!plan || !result || !props.climate) {
    return (
      <section id="house" className={`sec-field ${SECTION}`}>
        <div className="mx-auto max-w-[1240px]">
          <SectionHeader kicker="Under glass" altitude="0 m · inside" title="Reading the sky above your roof…" dek="The greenhouse model needs the NASA POWER record for this spot - usually a few seconds." />
          <div className="mt-10 space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>
        </div>
      </section>
    )
  }
  return (
    <>
      <HouseSection {...props} result={result} ranking={ranking} />
      <EnergySection {...props} result={result} />
      <GreenPlanSection {...props} result={result} ranking={ranking} />
    </>
  )
}

// ---------- 04 · the house and what to grow in it ----------

function HouseSection({ spec, setSpec, prices, setPrices, areaFromOutline, result, ranking, onField, plan, priorities, setPriorities, exclude, setExclude, energy, pricesEdited, resetPrices, over }: Props & { result: GhResult; ranking: GhResult[] }) {
  const cov = COVERS[spec.cover]
  const plate = usePlate(over)
  const set = (p: Partial<GreenhouseSpec>) => setSpec({ ...spec, ...p })
  const moved = useRankDelta(ranking.map((r) => r.crop.id))
  const [showLosers, setShowLosers] = useState(false)
  // crops with no paying run fold into one row; the house's own crop always stays in the list
  const shownRanking = showLosers ? ranking : ranking.filter((r) => !!r.plan.plant || r.crop.id === spec.crop)
  const folded = ranking.length - shownRanking.length
  return (
    <section id="house" className={`sec-field ${SECTION} ${plate.root}`}>
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col">
        <SectionHeader
          kicker="Under glass"
          altitude="0 m · inside"
          title={<>{cov.short} house, <em className="text-leaf">{result.crop.name.toLowerCase()}</em> inside.</>}
          dek="Inside, you set the climate. Outside, NASA POWER sets the bill: satellite sunlight decides how much the lamps must add, outdoor air decides the boiler, and rain on the roof can feed the drip lines."
        />
        <SiteSwitch to="field" onClick={onField} />

        <Instrument
          title="The house you describe"
          kicker="Instrument · under glass"
          label="Open the house's settings"
          facts={[
            { value: result.totals.activeMonths, unit: 'months', label: `of the year the house carries ${result.crop.name.toLowerCase()}` },
            ...(result.totals.shadeMonths ? [{ value: result.totals.shadeMonths, unit: 'months', label: 'that want shade or cooling' }] : []),
          ]}
        >
        <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-start">
          <Reveal className="panel space-y-6 p-5 sm:p-6">
            <div>
              <div className="kicker">Cover</div>
              {/* the covers as samples of the material itself: a glazed pane, twin-wall sheet, a blown double film, a tunnel */}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(COVERS) as Cover[]).map((c) => {
                  const on = spec.cover === c
                  return (
                    <button
                      key={c}
                      onClick={() => set({ cover: c })}
                      aria-pressed={on}
                      className={`group flex flex-col items-center gap-1 rounded-xl border px-2 pt-1.5 pb-2 transition ${on ? 'border-white/40 bg-white/[0.07]' : 'border-white/10 hover:border-white/30 hover:bg-white/[0.03]'}`}
                    >
                      <ThingTile id={c} dim={!on} className="h-[72px] w-full transition-transform duration-500 ease-out group-hover:scale-[1.05]" />
                      <span className={`font-mono text-[11px] ${on ? 'text-ink' : 'text-ink-3'}`}>{COVERS[c].short}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 font-mono text-[11px] text-ink-3">
                {cov.label} · lets through {pct(cov.tau)} of daylight · loses {cov.u} W per m² of cover per °C
              </div>
            </div>
            <div>
              <div className="kicker">Floor area</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <NumberField value={spec.floorM2} min={50} max={2_000_000} onCommit={(v) => set({ floorM2: v })} label="Floor area in square metres" className="w-32" />
                <span className="text-sm text-ink-3">m² = {(spec.floorM2 / 10_000).toFixed(spec.floorM2 < 100_000 ? 2 : 1)} ha</span>
                {areaFromOutline && Math.round(areaFromOutline) === spec.floorM2 && <span className="text-xs text-ink-4">from the outline you drew</span>}
                {areaFromOutline && Math.round(areaFromOutline) !== spec.floorM2 && (
                  <button onClick={() => set({ floorM2: Math.round(areaFromOutline) })} className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-ink-2 hover:text-ink">
                    use the drawn outline · {thousands(areaFromOutline)} m²
                  </button>
                )}
                {!areaFromOutline && <span className="text-xs text-ink-4">or draw the house outline on the globe</span>}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Kit id="heat" on={spec.heated}><Toggle checked={spec.heated} onChange={(v) => set({ heated: v, co2: spec.co2 === undefined ? undefined : spec.co2 && v })} label="Heated" hint={spec.heated ? `to ${result.crop.dayT}/${result.crop.nightT} °C · run like a north-European glasshouse` : 'run like a Mediterranean plastic house'} /></Kit>
              <Kit id="led" on={spec.lit}><Toggle checked={spec.lit} onChange={(v) => set({ lit: v })} label="LED top-light" hint="180 µmol/m²/s" /></Kit>
              <Kit id="screen" on={spec.screen}><Toggle checked={spec.screen} onChange={(v) => set({ screen: v })} label="Night screen" hint="cuts night loss ~50%" /></Kit>
              <Kit id="co2" on={co2On(spec)}><Toggle checked={co2On(spec)} onChange={(v) => set({ co2: v })} label="CO₂ dosing" hint="+15-20 % while the vents are shut" /></Kit>
              {spec.heated && prices.chp && (
                <Kit id="chp" on={!!spec.chp}><Toggle checked={!!spec.chp} onChange={(v) => set({ chp: v })} label="Combined heat and power" hint={`gas engine, 43 % power + 47 % heat · runs in the months it beats the boiler · power to the lamps, the rest sold at the ${prices.chp.year} day-ahead price`} /></Kit>
              )}
            </div>
            <div>
              <div className="kicker">Energy prices</div>
              <div className="mt-2 flex flex-wrap gap-4">
                <PriceInput label="heat (gas)" value={prices.heat} onChange={(v) => setPrices({ ...prices, heat: v })} />
                <PriceInput label="electricity" value={prices.power} onChange={(v) => setPrices({ ...prices, power: v })} />
              </div>
              <EnergyNote energy={energy} prices={prices} edited={pricesEdited} onReset={resetPrices} />
            </div>
            <div>
              <div className="kicker">Crop prices</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                <NumberField value={Math.round((prices.level ?? 1) * 100)} min={20} max={500} onCommit={(v) => setPrices({ ...prices, level: v / 100 })} label="Crop prices as a percentage of the EU market record" className="w-20 !px-2 !py-1.5" />
                % of the EU market record
              </div>
              <div className="mt-1.5 font-mono text-[11px] leading-relaxed text-ink-3">{marketLabel(plan!.lat)} · DG AGRI 2020-2024, month by month</div>
            </div>
            <HouseReadout result={result} area={spec.floorM2} />
          </Reveal>

          <Reveal delay={0.08} className="panel p-5 sm:p-6">
            <GhPriorityControls priorities={priorities} setPriorities={setPriorities} />
            <div className="mt-7 flex items-baseline justify-between gap-3 border-t border-white/8 pt-5">
              <div className="text-[15px] text-ink">Every crop you can sell, scored for this house</div>
              <div className="font-mono text-[11px] text-ink-3">score · tap a crop to plan it</div>
            </div>
            <ul className="mt-4 space-y-1">
              {ranking.length === 0 && <li className="py-3 text-sm text-ink-3">Every crop is switched off - turn some back on below.</li>}
              {shownRanking.map((r) => {
                const i = ranking.indexOf(r)
                const m = bestMargin(r)
                const pays = !!r.plan.plant
                const on = r.crop.id === spec.crop
                return (
                  <motion.li key={r.crop.id} layout transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
                    <button
                      onClick={() => set({ crop: r.crop.id })}
                      aria-pressed={on}
                      className={`grid w-full grid-cols-[22px_32px_minmax(0,1fr)_56px] items-center gap-3 rounded-xl px-2 py-2 text-left transition sm:grid-cols-[22px_32px_150px_minmax(0,1fr)_56px] ${on ? 'bg-white/[0.07] ring-1 ring-leaf/40' : 'hover:bg-white/[0.035]'}`}
                      aria-label={`${r.crop.name}: score ${Math.round(r.score.score)}, ${eurM2(m)} per m² after running costs`}
                    >
                      <span className={`num text-xs ${i === 0 ? 'text-leaf' : 'text-ink-4'}`}>{i + 1}</span>
                      <CropTile crop={r.crop} size="xs" glow={on} />
                      <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2"><span className="truncate">{r.crop.name}</span><RankDelta d={moved[r.crop.id]} /></span>
                      <span className="relative hidden h-3 overflow-hidden rounded-full bg-white/[0.04] sm:block">
                        <motion.i
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ background: pays ? (i === 0 ? 'var(--color-leaf)' : 'rgb(255 255 255 / 0.32)') : 'var(--color-heat)' }}
                          animate={{ width: `${Math.max(2, r.score.score)}%` }}
                          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </span>
                      <span className={`num text-right text-sm ${i === 0 ? 'text-leaf' : pays ? 'text-ink' : 'text-heat'}`}>{Math.round(r.score.score)}</span>
                    </button>
                    <div className={`px-2 pb-1 font-mono text-[11px] sm:pl-[88px] ${pays ? 'text-ink-4' : 'text-heat/80'}`}>{rankNote(r)}</div>
                    {on && (
                      <div className="flex flex-wrap gap-1.5 px-2 pt-1 pb-2 sm:pl-[88px]">
                        <Chip>{calendar(r)}</Chip>
                        <Chip>{r.plan.yieldKg.toFixed(r.plan.yieldKg < 10 ? 1 : 0)} kg/m²</Chip>
                        <Chip>energy {eurM2(r.plan.energyCost)}/m²</Chip>
                        <Chip>plants, substrate, picking {eurM2(r.plan.otherCost)}/m²</Chip>
                        {r.plan.co2Cost > 0 && <Chip>CO₂ {eurM2(r.plan.co2Cost)}/m²</Chip>}
                        {r.totals.shadeMonths > 0 && <Chip tone="warn">{r.totals.shadeMonths} months need shade</Chip>}
                      </div>
                    )}
                  </motion.li>
                )
              })}
              {(folded > 0 || showLosers) && ranking.some((r) => !r.plan.plant) && (
                <li>
                  <button onClick={() => setShowLosers((v) => !v)} className="w-full rounded-xl px-2 py-2 text-left font-mono text-[11px] text-heat/80 transition hover:bg-white/[0.035] hover:text-heat sm:pl-[88px]">
                    {showLosers ? 'hide the crops that do not pay' : `+ ${folded} more ${folded === 1 ? 'crop does' : 'crops do'} not pay for ${spec.heated || spec.lit ? 'their energy' : 'their place'} at these prices - show`}
                  </button>
                </li>
              )}
            </ul>
            <div className="mt-6 border-t border-white/8 pt-5">
              <GhCropPicker exclude={exclude} setExclude={setExclude} prices={prices} setPrices={setPrices} />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Yield from light-use efficiency calibrated on Dutch (heated) and Spanish (unheated) harvests; each month sells at that month’s EU market price;
              minus energy, CO₂, plants, substrate and picking from published budgets (Flemish and Dutch for heated glass, the Andalusian price observatory for
              plastic houses), with loss-making months left empty. The score weighs that margin, the house’s CO₂ and how many real years the plan paid.
              Capital, packing and selling are not included: a gross margin, not profit.
            </p>
          </Reveal>
        </div>
        </Instrument>
      </div>
    </section>
  )
}

/** A switch beside a small render of the kit it switches: lit when on, faded when off. */
function Kit({ id, on, children }: { id: ThingId; on: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <ThingTile id={id} dim={!on} className="-my-1 h-14 w-14" />
      {children}
    </div>
  )
}

/** What the settings above cost, updating as they change - the full plan is further down. */
function HouseReadout({ result, area }: { result: GhResult; area: number }) {
  const p = result.plan
  const margin = planMargin(result) * area
  const items = [
    { k: 'boiler heat', v: p.heatKwh > 0 ? `${thousands((p.heatKwh * area) / 1000)} MWh` : 'none', tone: 'text-heat' },
    { k: 'lamp power', v: p.lightKwh > 0 ? `${thousands((p.lightKwh * area) / 1000)} MWh` : 'off', tone: 'text-wheat' },
    { k: 'energy bill', v: eur(p.energyCost * area), tone: 'text-ink' },
    { k: 'left after running costs', v: eur(margin), tone: margin >= 0 ? 'text-leaf' : 'text-heat' },
  ]
  return (
    <div className="border-t border-white/8 pt-5">
      <div className="kicker !text-[11px]">This house, as set · per year</div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-2">
        {items.map((it) => (
          <div key={it.k} className="min-w-0">
            <div className="font-mono text-[11px] leading-tight text-ink-4">{it.k}</div>
            <motion.div key={it.v} initial={{ opacity: 0.35, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className={`num truncate text-lg ${it.tone}`}>
              {it.v}
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PriceInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <span className="flex items-center gap-2 text-sm text-ink-3">
      €
      <NumberField value={value} min={0} max={5} decimals={3} onCommit={onChange} label={`Price of ${label}, euro per kWh`} className="w-20 !px-2 !py-1.5" />
      / kWh {label}
    </span>
  )
}

// ---------- 05 · light and heat, month by month ----------

function EnergySection({ spec, result, plan, warming }: Props & { result: GhResult }) {
  const c = plan!
  const [month, setMonth] = useState(0)
  const change = result.baseline.heatKwh > 0 ? result.totals.heatKwh / result.baseline.heatKwh - 1 : 0
  const shadeThen = result.baselineMonths.filter((m) => m.shade !== 'none').length
  const shadeNow = result.totals.shadeMonths
  const activeThen = result.baselineMonths.filter((m) => m.active).length
  const now = whatIfPeriod(warming, c.recent)
  const title = spec.heated && result.baseline.heatKwh < 5
    ? <>Heating is barely needed here - <em className="text-heat">cooling</em> is the job.</>
    : spec.heated
    ? <>The boiler burns <em className={change < 0 ? 'text-water' : 'text-heat'}>{pct(Math.abs(change))} {change < 0 ? 'less' : 'more'}</em> than in the 1980s{shadeNow > shadeThen ? <> - the summer runs <em className="text-heat">hotter</em>.</> : '.'}</>
    : <>An unheated house now carries {result.crop.name.toLowerCase()} <em className="text-leaf">{result.totals.activeMonths} months</em>{result.totals.activeMonths !== activeThen ? <>, not {activeThen}</> : ''}.</>
  return (
    <section id="energy" className={`sec-soil ${SECTION}`}>
      <div className="mx-auto max-w-[1240px]">
        <SectionHeader
          kicker="Light & heat"
          altitude="roof · 4 m"
          title={title}
          dek={`Monthly NASA POWER sunlight (CERES) and air temperature for ${c.baseline.from}-${c.baseline.to} vs ${now}, run through the house you described: cover transmission, heat loss, night screen and lamps.`}
        />
        <Reveal tour="cutaway" className="panel mt-12 p-5 sm:p-6">
          <GreenhouseCutaway result={result} month={month} setMonth={setMonth} />
        </Reveal>
        <Instrument title="Light, heat and water, month by month" kicker="Instrument · the roof" label="Open the energy instruments">
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Reveal className="panel p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[15px] text-ink"><Sun className="h-4 w-4 text-wheat" /> Daylight reaching the crop</div>
            <div className="mt-1 text-xs text-ink-3">daily light integral, mol of photosynthetic light per m² per day · target for {result.crop.name.toLowerCase()}: {result.crop.dli}</div>
            <div className="mt-5"><LightChart result={result} month={month} /></div>
          </Reveal>
          <Reveal delay={0.08} className="panel p-5 sm:p-6">
            {spec.heated ? (
              <>
                <div className="flex items-center gap-2 text-[15px] text-ink"><Flame className="h-4 w-4 text-heat" /> Heat the boiler must add</div>
                <div className="mt-1 text-xs text-ink-3">kWh per m² of floor per month · set points {result.crop.dayT} °C day / {result.crop.nightT} °C night{spec.lit ? ' · lamp heat already counted' : ''}</div>
                <div className="mt-5"><HeatChart result={result} month={month} baselineLabel={`${c.baseline.from}-${c.baseline.to}`} nowLabel={now} /></div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[15px] text-ink"><Snowflake className="h-4 w-4 text-orbit" /> When nights are warm enough</div>
                <div className="mt-1 text-xs text-ink-3">mean night inside the {COVERS[spec.cover].short.toLowerCase()} vs the {result.crop.minT} °C the crop needs</div>
                <div className="mt-5"><SeasonCompare result={result} baselineLabel={`${c.baseline.from}-${c.baseline.to}`} nowLabel={now} /></div>
              </>
            )}
          </Reveal>
        </div>
        <Reveal className="panel mt-4 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[15px] text-ink"><ThermometerSun className="h-4 w-4 text-heat" /> Summer overheating</div>
          <div className="mt-1 text-xs text-ink-3">
            inside by day with full ventilation ≈ outdoor max + solar gain · above {result.crop.maxT} °C {result.crop.name.toLowerCase()} suffers - shade screens, whitewash or pad cooling
          </div>
          <div className="mt-5 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {result.months.map((m, i) => {
              const then = result.baselineMonths[i].shade
              const inCrop = m.state === 'establish' || m.state === 'harvest'
              const t = insideByDay(m, spec, result.crop)
              return (
                <div key={m.month} className={`rounded-lg px-1.5 py-2 text-center ${m.shade === 'month' ? 'bg-heat/20' : m.shade === 'peaks' ? 'bg-wheat/15' : 'bg-white/[0.03]'}`} title={inCrop ? `${MONTHS_SHORT[i]}: inside ≈ ${t.toFixed(0)} °C on an average afternoon` : `${MONTHS_SHORT[i]}: no crop in the house`}>
                  <div className="font-mono text-[11px] text-ink-3">{MONTHS_SHORT[i]}</div>
                  <div className={`num mt-1 text-sm ${m.shade === 'month' ? 'text-heat' : m.shade === 'peaks' ? 'text-wheat' : 'text-ink-3'}`}>{inCrop ? `${t.toFixed(0)}°` : '-'}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-ink-4">{m.shade === 'month' ? 'shade' : m.shade === 'peaks' ? 'hot days' : ''}{m.shade !== then && m.shade !== 'none' ? ' · new' : ''}</div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip tone={shadeNow > shadeThen ? 'bad' : 'neutral'}>{shadeThen} → {shadeNow} months needing shade or cooling</Chip>
            <Chip tone="info">warmer winters save heat, hotter summers cost yield</Chip>
          </div>
        </Reveal>
        </Instrument>
      </div>
    </section>
  )
}

function LightChart({ result, month }: { result: GhResult; month: number }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const height = 240
  const pad = { l: 34, r: 8, t: 12, b: 26 }
  const max = Math.max(...result.months.map((m) => m.dliOut), result.crop.dli) * 1.08
  const bw = (width - pad.l - pad.r) / 12
  const X = (i: number) => pad.l + i * bw
  const Y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b)
  const ticks = [10, 20, 30, 40, 50].filter((t) => t < max)
  return (
    <div ref={box} className="w-full min-w-0">
      <svg width={width} height={height} className="block overflow-visible" role="img" aria-label="Daily light integral by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgb(255 255 255 / 0.05)" />
            <text x={pad.l - 6} y={Y(t) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">{t}</text>
          </g>
        ))}
        {result.months.map((m, i) => {
          const lamps = m.state === 'establish' || m.state === 'harvest' ? m.supp : 0
          return (
          <g key={i}>
            <title>{`${MONTHS_SHORT[i]}: ${m.dliOut.toFixed(1)} outside → ${m.dliIn.toFixed(1)} inside${lamps ? ` + ${lamps.toFixed(1)} from lamps (${m.lampHours.toFixed(1)} h/day)` : ''} mol/m²/day`}</title>
            <rect x={X(i) + 1} width={bw - 2} y={pad.t} height={height - pad.t - pad.b} rx={6} fill={i === month ? 'rgb(255 255 255 / 0.05)' : 'transparent'} />
            <rect x={X(i) + bw * 0.18} width={bw * 0.64} y={Y(m.dliOut)} height={Y(0) - Y(m.dliOut)} fill="none" stroke="rgb(244 205 106 / 0.45)" strokeDasharray="2 2" rx={3} />
            <rect x={X(i) + bw * 0.28} width={bw * 0.44} y={Y(m.dliIn)} height={Y(0) - Y(m.dliIn)} fill="var(--color-wheat)" opacity={0.9} rx={3} />
            {lamps > 0 && <rect x={X(i) + bw * 0.28} width={bw * 0.44} y={Y(m.dliIn + lamps)} height={Math.max(0, Y(m.dliIn) - Y(m.dliIn + lamps) - 2)} fill="var(--color-leaf)" rx={3} />}
            <text x={X(i) + bw / 2} y={height - 8} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">{MONTHS_SHORT[i][0]}</text>
          </g>
          )
        })}
        <line x1={pad.l} x2={width - pad.r} y1={Y(result.crop.dli)} y2={Y(result.crop.dli)} stroke="var(--color-ink)" strokeOpacity={0.6} strokeDasharray="5 4" />
        <text x={width - pad.r} y={Y(result.crop.dli) - 5} textAnchor="end" className="fill-ink-2 font-mono text-[10px]">target {result.crop.dli}</text>
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-ink-3">
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm border border-dashed border-wheat/60" />outside (NASA CERES via POWER)</span>
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-wheat" />through the cover</span>
        {result.spec.lit && <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-leaf" />LED top-up</span>}
      </div>
    </div>
  )
}

function HeatChart({ result, month, baselineLabel, nowLabel }: { result: GhResult; month: number; baselineLabel: string; nowLabel: string }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const height = 240
  const pad = { l: 34, r: 8, t: 12, b: 26 }
  const max = Math.max(...result.months.map((m) => m.heatKwh), ...result.baselineMonths.map((m) => m.heatKwh), 10) * 1.1
  const bw = (width - pad.l - pad.r) / 12
  const X = (i: number) => pad.l + i * bw
  const Y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b)
  const step = max > 100 ? 25 : 10
  const ticks = Array.from({ length: Math.floor(max / step) }, (_, i) => (i + 1) * step)
  return (
    <div ref={box} className="w-full min-w-0">
      <svg width={width} height={height} className="block overflow-visible" role="img" aria-label="Heat demand by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgb(255 255 255 / 0.05)" />
            <text x={pad.l - 6} y={Y(t) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">{t}</text>
          </g>
        ))}
        {result.months.map((m, i) => {
          const b = result.baselineMonths[i]
          const skip = m.state === 'idle'
          return (
            <g key={i}>
              <title>{`${MONTHS_SHORT[i]}: ${m.heatKwh.toFixed(0)} kWh/m² if heated (${b.heatKwh.toFixed(0)} in ${baselineLabel})${skip ? ' - left cold in the plan' : ''}`}</title>
              <rect x={X(i) + 1} width={bw - 2} y={pad.t} height={height - pad.t - pad.b} rx={6} fill={i === month ? 'rgb(255 255 255 / 0.05)' : 'transparent'} />
              <rect x={X(i) + bw * 0.18} width={bw * 0.64} y={Y(b.heatKwh)} height={Y(0) - Y(b.heatKwh)} fill="none" stroke="rgb(255 123 84 / 0.5)" strokeDasharray="2 2" rx={3} />
              <rect x={X(i) + bw * 0.28} width={bw * 0.44} y={Y(m.heatKwh)} height={Y(0) - Y(m.heatKwh)} fill="var(--color-heat)" opacity={skip ? 0.35 : 0.9} rx={3} />
              <text x={X(i) + bw / 2} y={height - 8} textAnchor="middle" className={`font-mono text-[10px] ${skip ? 'fill-heat' : 'fill-ink-4'}`}>{MONTHS_SHORT[i][0]}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-ink-3">
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-heat" />{nowLabel}</span>
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm border border-dashed border-heat/60" />{baselineLabel}</span>
        {result.months.some((m) => m.state === 'idle') && <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-heat/35" />left cold in the plan</span>}
      </div>
    </div>
  )
}

function SeasonCompare({ result, baselineLabel, nowLabel }: { result: GhResult; baselineLabel: string; nowLabel: string }) {
  const rows: { label: string; months: GhMonth[] }[] = [
    { label: baselineLabel, months: result.baselineMonths },
    { label: nowLabel, months: result.months },
  ]
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1.5 font-mono text-[11px] text-ink-3">{r.label} · {r.months.filter((m) => m.active).length} months</div>
          <div className="grid grid-cols-12 gap-1">
            {r.months.map((m, i) => (
              <div key={i} className={`rounded-md py-2 text-center ${m.active ? 'bg-leaf/20' : 'bg-white/[0.03]'}`} title={`${MONTHS_SHORT[i]}: nights ≈ ${m.insideNight.toFixed(1)} °C inside`}>
                <div className="font-mono text-[11px] text-ink-4">{MONTHS_SHORT[i][0]}</div>
                <div className={`num text-[11px] ${m.active ? 'text-leaf' : 'text-ink-4'}`}>{m.insideNight.toFixed(0)}°</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-ink-3">Green = mean inside night at or above {result.crop.minT} °C, so the crop can stay in.</p>
    </div>
  )
}

// ---------- 06 · the plan: calendar, bill, water ----------

function GreenPlanSection({ spec, result, ranking, plan, climate, prices, warming, setWarming, projection, neighbours, report, priorities, exclude, country }: Props & { result: GhResult; ranking: GhResult[] }) {
  const c = plan!
  const opts = useMemo(() => ({ priorities, exclude, country }), [priorities, exclude, country])
  const trust = useGhTrust(c, spec, prices, opts)
  const A = spec.floorM2
  const best = ranking[0]
  const p = result.plan
  // All-year heat is the climate signal (same house, then vs now); the plan may leave cold months empty.
  const heatAllYearMWh = (result.totals.heatKwh * A) / 1000
  const heatMWh = (p.heatKwh * A) / 1000
  const lightMWh = (p.lightKwh * A) / 1000
  const bill = p.energyCost * A
  const margin = planMargin(result) * A
  const idle = result.months.filter((m) => m.state === 'idle').map((m) => m.month)
  const co2 = (p.carbonKg * A) / 1000
  const kgCo2 = carbonPerKg(p)
  const heatChange = result.baseline.heatKwh > 0 ? result.totals.heatKwh / result.baseline.heatKwh - 1 : 0
  const w = result.water
  const neighbour = neighbours.filter((n) => n.km <= 5).sort((a, b) => a.km - b.km)[0]
  const idleNames = idle.map((m) => MONTHS_SHORT[m - 1]).join(', ')
  const heatWord = spec.lit ? 'heat and light' : 'heat'
  const lines = [
    spec.heated
      ? heatAllYearMWh < 1
        ? { icon: Flame, tone: 'text-heat', text: 'This climate barely needs heating under glass - the job here is keeping the house cool.' }
        : { icon: Flame, tone: 'text-heat', text: `Heated all year, this ${A.toLocaleString('en-US')} m² house would need about ${thousands(heatAllYearMWh)} MWh of heat - ${pct(Math.abs(heatChange))} ${heatChange < 0 ? 'less' : 'more'} than the same house in ${c.baseline.from}-${c.baseline.to}.` }
      : { icon: Snowflake, tone: 'text-orbit', text: `Without heating, ${result.crop.name.toLowerCase()} can stay in from ${seasonSpan(result.months)}.` },
    !p.plant
      ? { icon: AlertTriangle, tone: 'text-heat', text: `At these prices no ${result.crop.name.toLowerCase()} run pays for its ${spec.heated || spec.lit ? heatWord : 'place'} here - leave the house empty or pick another crop.` }
      : {
        icon: Sprout, tone: 'text-leaf',
        text: `Plant in ${MONTHS_LONG[p.plant - 1]}, first harvest in ${MONTHS_LONG[p.firstHarvest! - 1]}, clear in ${MONTHS_LONG[p.clear! - 1]}.${
          spec.heated && idle.length
            ? ` Leave it cold in ${idleNames}: heating through them costs about ${eur(coldGain(result) * A)} a year more than the extra harvest earns.`
            : spec.heated ? ` Heating all year pays at your prices.` : ''}`,
      },
    { icon: ThermometerSun, tone: 'text-heat', text: result.totals.shadeMonths ? `Plan shade or cooling for ${result.totals.shadeMonths} summer months - the house runs above ${result.crop.maxT} °C on ${result.months.some((m) => m.shade === 'month') ? 'ordinary' : 'hot'} days.` : 'Summers stay below the heat-stress line with full ventilation.' },
    { icon: Droplets, tone: 'text-water', text: `The roof catches ${thousands(w.catchM3)} m³ of rain a year; a ${thousands(w.tankM3)} m³ tank covers ${pct(w.cover)} of the drip water${w.maxCover > w.cover + 0.02 ? ` (${pct(w.maxCover)} is the ceiling)` : ''}.` },
  ]
  return (
    <section id="plan" className={`sec-plan ${SECTION}`}>
      <div className="mx-auto max-w-[1240px]">
        <SectionHeader
          kicker="Resurface"
          altitude="▲ back to 0 m"
          title={<>Your year of <em className="text-leaf">{result.crop.name.toLowerCase()}</em> under {COVERS[spec.cover].short.toLowerCase()}.</>}
          dek={`Month by month: when to grow, when to leave the house cold, what the energy costs and how much rain the roof can bank${best.crop.id !== spec.crop ? ` - and ${best.crop.name.toLowerCase()} leaves the most after energy, labour and plants here` : ''}.`}
        />

        <Reveal className="mt-10 flex flex-wrap items-center gap-2">
          <span className="kicker mr-1">Climate to plan for</span>
          <Seg on={warming === 0} onClick={() => setWarming(0)}>Typical {c.recent.from}-{c.recent.to}</Seg>
          <WarmingSegs value={warming} onChange={setWarming} projection={projection} />
        </Reveal>

        <Reveal className="mt-6">
          <GhDecisionCard result={result} ranking={ranking} area={A} trust={trust} year={report?.year ?? null} />
        </Reveal>

        <Reveal className="panel mt-4 p-6 sm:p-8">
          <div className="kicker !text-leaf">In plain words</div>
          <ul className="mt-5 space-y-4">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-4">
                <l.icon className={`mt-1 h-5 w-5 shrink-0 ${l.tone}`} />
                <span className="text-lg leading-relaxed text-ink sm:text-xl">{l.text}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Instrument title={<>The year of {result.crop.name.toLowerCase()}, month by month</>} kicker="Instrument · the plan" label="Open the year's workings">
        <Reveal className="panel mt-4 p-5 sm:p-6">
          <div className="text-[15px] text-ink">The year, month by month</div>
          <div className="mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
            {result.months.map((m, i) => {
              const inCrop = m.state === 'harvest' || m.state === 'establish'
              const look = STATE_LOOK[m.state]
              return (
                <div key={i} className={`rounded-xl border p-2 ${look.box}`} title={inCrop ? `${MONTHS_SHORT[i]}: ${eurM2(m.net)}/m² after energy, labour and plants` : undefined}>
                  <div className="flex items-start justify-between gap-1">
                    <div className="font-mono text-[11px] text-ink-3">{MONTHS_SHORT[i]}</div>
                    {m.state === 'establish' && <ThingTile id="seedling" className="-mt-1.5 -mr-1 h-8 w-8" />}
                    {m.state === 'harvest' && <CropTile crop={result.crop} size="xs" className="-mt-1.5 -mr-1 !h-8 !w-8" />}
                  </div>
                  <div className={`mt-0.5 text-[12px] ${look.text}`}>{m.state === 'idle' ? (spec.heated ? 'leave cold' : 'empty') : look.label}</div>
                  <div className="mt-1.5 flex h-3 flex-wrap gap-1 text-ink-3">
                    {m.heatKwh > 1 && inCrop && spec.heated && <Flame className="h-3 w-3 text-heat" aria-label="heating" />}
                    {m.supp > 0 && inCrop && <Lightbulb className="h-3 w-3 text-leaf" aria-label="lamps" />}
                    {m.shade !== 'none' && inCrop && <ThermometerSun className="h-3 w-3 text-wheat" aria-label="shade" />}
                  </div>
                  {inCrop && <div className="num mt-1 text-[11px] text-ink-3">{eurM2(m.net)}/m²</div>}
                </div>
              )
            })}
          </div>
        </Reveal>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="energy bill" value={eur(bill)} sub={`${thousands(heatMWh)} MWh heat${lightMWh >= 1 ? ` · ${thousands(lightMWh)} MWh light` : ''}${p.chpSales > 0 ? ` · net of ${eur(p.chpSales * A)} of power sold` : ''} · as planned`} />
          <Stat label="left after running costs" value={eur(margin)} sub={`per year after energy and ${eur(p.otherCost * A)} of labour, plants and pots - before capital`} tone={margin >= 0 ? 'text-leaf' : 'text-heat'} />
          <Stat label="CO₂ from heat and light" value={`${co2.toFixed(0)} t`} sub={kgCo2 === null ? 'nothing harvested' : `${kgCo2.toFixed(kgCo2 < 1 ? 2 : 1)} kg per kg harvested · ${spec.chp && spec.heated ? 'boiler, gas engine' : 'gas boiler'} and grid power`} />
          <Stat label="rain tank" value={`${thousands(w.tankM3)} m³`} sub={`covers ${pct(w.cover)} of ${thousands(w.demandM3)} m³ drip water`} tone="text-water" />
        </div>

        {w.overflowM3 > 20 && (
          <Reveal className="panel mt-4 flex gap-3 p-5 text-[15px] text-ink-2">
            <Droplets className="mt-0.5 h-5 w-5 shrink-0 text-water" />
            <span>
              Even with the tank, ~{thousands(w.overflowM3)} m³ a year overflows in wet months.
              {neighbour ? ` ${overflowNote(w.overflowM3, neighbour)}` : ' A field pond on the same farm could store it for irrigation.'}
            </span>
          </Reveal>
        )}

        <DeepTabs
          label="Dig deeper"
          intro={
            <div className="mb-4">
              <div className="kicker">Dig deeper</div>
              <p className="mt-1.5 max-w-2xl text-[14px] text-ink-3">Prices, real years, real glasshouses and how sure the plan is - one topic at a time.</p>
            </div>
          }
          tabs={[
            {
              id: 'prices',
              label: 'Prices & real years',
              icon: Sprout,
              render: () => (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Reveal className="panel p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-[15px] text-ink"><Sprout className="h-4 w-4 text-wheat" /> When the market pays for {result.crop.name.toLowerCase()}</div>
                    <div className="mt-1 text-xs text-ink-3">farm-gate € per kg by month · the plan harvests where the months are green</div>
                    <div className="mt-5"><GhPriceCurve result={result} lat={c.lat} /></div>
                  </Reveal>
                  <Reveal delay={0.08} className="panel p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-[15px] text-ink"><History className="h-4 w-4 text-water" /> This plan in the real years</div>
                    <div className="mt-1 text-xs text-ink-3">€ per m² after running costs, each year with that year’s weather, crop prices and energy prices</div>
                    <div className="mt-5"><GhBacktest result={result} country={country} /></div>
                  </Reveal>
                </div>
              ),
            },
            {
              id: 'glass',
              label: 'Real glasshouses',
              icon: Warehouse,
              render: () => (
                <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
                  <Reveal className="panel p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-[15px] text-ink"><Warehouse className="h-4 w-4 text-ink-3" /> What glasshouses grow in this country</div>
                    <div className="mt-1 mb-4 text-xs text-ink-3">area under glass or high cover, by crop</div>
                    <GlassLocal country={country} pick={result.crop.id} />
                  </Reveal>
                  <Reveal delay={0.08} className="panel p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-[15px] text-ink"><BadgeCheck className="h-4 w-4 text-leaf" /> Checked against real glasshouses</div>
                    <div className="mt-1 mb-4 text-xs text-ink-3">the model’s kilos in each country’s glasshouse heartland vs what the country reports to Eurostat</div>
                    <GlassProof country={country} />
                  </Reveal>
                </div>
              ),
            },
            {
              id: 'ghsure',
              label: 'How sure',
              icon: Gauge,
              holds: ['ghsure'],
              render: () => (
                <Reveal tour="ghsure">
                  <GhTrustPanel climate={climate!} plan={c} spec={spec} prices={prices} result={result} ranking={ranking} trust={trust} />
                </Reveal>
              ),
            },
          ]}
        />
        </Instrument>

        <Reveal className="mt-12 flex flex-wrap items-center gap-4">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-full bg-leaf px-5 py-3 text-sm font-medium text-[#0a0b0e] transition hover:brightness-110">
            <Printer className="h-4 w-4" />
            Greenhouse report (print / PDF)
          </button>
          <span className="text-sm text-ink-3">A4 report: climate shift, month-by-month light and heat, planting calendar, energy, rain tank, methods and a QR code back to this scenario.</span>
        </Reveal>

        <p className="mt-8 max-w-3xl font-mono text-[11px] leading-relaxed text-ink-4">
          Steady-state monthly model on NASA POWER normals: PAR = 48 % of CERES shortwave × 4.57 mol/MJ × cover transmission; heat loss U × cover/floor ratio × ΔT
          hour by hour + air leakage + 12 % for venting humid air, minus half the solar gain and the lamps’ heat; drip water ≈ 65 % of inside radiation + 15 % drain;
          roof runoff 85 %. Yields calibrated on Dutch heated glass (Eurostat; tomato on round and truss farms) and Spanish plastic (Eurostat); prices from the DG AGRI market record, month by month;
          energy prices from Eurostat. Check them against your own before investing.{warming ? ` What-if: ${whatIfExplain(warming, projection, c.recent)}.` : ''}
        </p>
      </div>
    </section>
  )
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const STATE_LOOK = {
  establish: { label: 'planted', box: 'border-leaf/25 bg-leaf/[0.03]', text: 'text-leaf/80' },
  harvest: { label: 'harvest', box: 'border-leaf/35 bg-leaf/[0.09]', text: 'text-leaf' },
  idle: { label: 'empty', box: 'border-wheat/30 bg-wheat/[0.06]', text: 'text-wheat' },
  closed: { label: 'too cold', box: 'border-white/8 bg-white/[0.02]', text: 'text-ink-4' },
} as const

/** "plant Feb · harvest Apr-Nov" */
function calendar(r: GhResult): string {
  const p = r.plan
  if (!p.plant || !p.firstHarvest || !p.clear) return 'no run pays for its energy'
  return `plant ${MONTHS_SHORT[p.plant - 1]} · harvest ${MONTHS_SHORT[p.firstHarvest - 1]}-${MONTHS_SHORT[p.clear - 1]}`
}

/** Roof overflow against a neighbouring field's irrigation need - usually a drop, and we say so. */
function overflowNote(overflowM3: number, n: Neighbour): string {
  const mm = overflowM3 / (n.areaHa * 10)
  const share = n.deficit ? mm / n.deficit : null
  // the house can stand on that very field: then the overflow goes on the rest of it, not "0.0 km away"
  const where = n.km < 0.1 ? `${n.name} around the house (${n.areaHa.toFixed(1)} ha)` : `${n.name} (${n.areaHa.toFixed(1)} ha, ${n.km.toFixed(1)} km away)`
  if (share !== null && share < 0.05) {
    return `Spread on ${where} that is only ${mm.toFixed(1)} mm against the ~${Math.round(n.deficit!)} mm its next crop is short - better kept for the house in a bigger tank.`
  }
  return `Piped to ${where}, that is ${mm.toFixed(1)} mm of irrigation${share !== null ? ` - ${pct(share)} of what its next crop is short in a typical season` : ''}.`
}

function Stat({ label, value, sub, tone = 'text-ink' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <Reveal className="panel p-5">
      <div className="kicker">{label}</div>
      <div className={`font-display-soft mt-2 text-4xl leading-none tabular-nums ${tone}`}>{value}</div>
      <div className="mt-2 text-xs text-ink-3">{sub}</div>
    </Reveal>
  )
}

/** One-line greenhouse summary for the farm drawer. */
export function ghLine(s: GhSnapshot): string {
  const heat = s.heated && s.heatMWh >= 1 ? `${thousands(s.heatMWh)} MWh heat/yr (${signed(s.heatChange * 100, 0, ' %')} vs 1980s)` : 'unheated'
  return `${heat} · tank ${thousands(s.tankM3)} m³ · ${pct(s.rainCover)} rain-fed`
}


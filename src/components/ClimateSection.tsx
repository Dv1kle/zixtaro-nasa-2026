import { CalendarRange, CloudSun, Droplets, Pause, Play, Satellite, Snowflake } from 'lucide-react'
import { useInView, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { memo, useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { type Crop } from '../lib/crops'
import type { ClimateAnalysis } from '../lib/climate'
import type { DailyAnalysis } from '../lib/daily'
import type { Forecast } from '../lib/forecast'
import { pValue, signed } from '../lib/format'
import { useMedia, type Loadable } from '../lib/hooks'
import { useScrollSpan, type Edges } from '../lib/scrollSpan'
import type { Trend } from '../lib/stats'
import { Stripes, WaterCalendar, WetnessChart } from './ClimateCharts'
import { ForecastPanel, FrostPanel, sowCheckOf, type SowCheck } from './LivePanels'
import { HeatWavePanel } from './HeatWavePanel'
import { RainTwoPanel } from './RainTwoPanel'
import { DeepTabs } from './DeepTabs'
import { Chip, CountUp, ErrorBox, Reveal, SectionHeader, Skeleton } from './ui'
import { Instrument, useStory } from './Instrument'

function headline(c: ClimateAnalysis): { title: React.ReactNode; dek: string } {
  const { signal, trends, means } = c
  const rainFlat = !trends.pGS.significant
  const cwb = Math.abs(trends.cwbGS.perDecade).toFixed(0)
  if (signal.warming && signal.drying && rainFlat) {
    const et = trends.petGS
    const soilDry = trends.wGS.significant && trends.wGS.perDecade < 0
    return {
      title: <>The heat is <em className="text-heat">drinking</em> your field.</>,
      dek: `Growing-season rain shows no significant trend since ${c.firstYear} - but evaporative demand ${et.significant ? `is up ${Math.round(et.perDecade)} mm per decade (${pValue(et.p)})` : 'has crept up'}. The water balance now sits ${Math.abs(Math.round(means.recent.cwbGS - means.baseline.cwbGS))} mm below the ${c.baseline.from}-${c.baseline.to} normal${soilDry ? `, and the root zone is measurably drying (${pValue(trends.wGS.p)})` : ''}.`,
    }
  }
  if (signal.warming && signal.drying) {
    return { title: <>Hotter <em className="text-heat">and</em> drier.</>, dek: `Less rain and more evaporative demand: the growing-season water balance is falling ~${cwb} mm per decade at this field.` }
  }
  if (signal.warming && signal.wetting) {
    return { title: <>Warmer - and <em className="text-water">wetter</em>.</>, dek: 'Temperatures are rising, but so is the water available to crops. Heat, not drought, is the risk to plan for.' }
  }
  if (signal.warming) {
    return {
      title: <>Warmer, not <em className="text-wheat">yet</em> drier.</>,
      dek: `The field is ${signed(means.recent.t - means.baseline.t, 1, ' °C')} warmer than ${c.baseline.from}-${c.baseline.to}. Water trends are not statistically significant - yet heat raises every crop's thirst.`,
    }
  }
  if (signal.drying) return { title: <>The seasons are <em className="text-heat">drying</em>.</>, dek: 'The growing-season water balance shows a significant downward trend.' }
  if (signal.wetting) return { title: <>Wetter than it <em className="text-water">used</em> to be.</>, dek: 'The growing-season water balance is trending up at this field.' }
  return {
    title: <>No significant shift - <em className="text-wheat">yet</em>.</>,
    dek: `${c.lastYear - c.firstYear + 1} years of NASA POWER data show no statistically significant trend here. The plan still uses the latest decade, not a stale average.`,
  }
}

/**
 * The headline's sentence for a farmer, not a statistician (the story; the workbench keeps the figures): the test's
 * p-value goes, and the terms of art are said as what they are.
 */
function plainWords(dek: string): string {
  return dek
    .replace(/\s*\(p\s*[<=][^)]*\)/g, '')
    .replace(/shows no significant trend/g, 'has hardly changed')
    .replace(/evaporative demand/g, 'what sun and wind take out of the field')
    .replace(/the growing-season water balance/g, 'the water left for crops over the season')
    .replace(/The growing-season water balance/g, 'The water left for crops over the season')
    .replace(/The water balance now sits/g, 'A season now leaves crops')
    .replace(/mm below the (\d+-\d+) normal/g, 'mm less water than in $1')
    .replace(/the root zone is measurably drying/g, 'the soil around the roots is drying')
    .replace(/Water trends are not statistically significant - yet/g, 'The water has not clearly changed - yet')
    .replace(/shows a significant downward trend/g, 'is clearly falling')
    .replace(/show no statistically significant trend here/g, 'show no clear change here')
}

function TrendChip({ t, unit, digits = 1 }: { t: Trend; unit: string; digits?: number }) {
  return (
    <Chip tone={t.significant ? 'info' : 'neutral'} className={t.significant ? '' : 'opacity-70'}>
      {signed(t.perDecade, digits, unit)}/decade · {t.significant ? pValue(t.p) : 'not significant'}
    </Chip>
  )
}

type Props = { state: Loadable<ClimateAnalysis>; daily: Loadable<DailyAnalysis | null>; forecast: Loadable<Forecast>; onRetry: () => void; pick?: Crop | null }

// memo: the page's own state (sliders, the greenhouse switch) re-rendered every Air chart - ~2 s of a mode switch
export const ClimateSection = memo(function ClimateSection({ state, daily, forecast, onRetry, pick = null }: Props) {
  return (
    <section id="air" className="sec-air relative scroll-mt-16 overflow-clip px-5 pt-16 pb-16 sm:pt-24 sm:pb-20 sm:px-8 lg:pl-28 xl:pl-36">
      <div className="relative mx-auto max-w-[1240px]">
        {state.status === 'loading' && (
          <>
            <SectionHeader kicker="Atmosphere" altitude="2 m above ground" title="Reading 45 years of sky…" />
            <div className="mt-12 space-y-4">
              <Skeleton className="h-36" />
              <Skeleton className="h-20" />
            </div>
          </>
        )}
        {state.status === 'error' && (
          <>
            <SectionHeader kicker="Atmosphere" altitude="2 m above ground" title="NASA POWER is unreachable." />
            <div className="mt-10">
              <ErrorBox title="Could not load climate data" error={`${state.error}. Try again, or pick one of the demo fields - their data is bundled.`} onRetry={onRetry} />
            </div>
          </>
        )}
        {state.status === 'ready' && <ClimateBody c={state.data} from={state.from} daily={daily} forecast={forecast} pick={pick} />}
      </div>
    </section>
  )
})

/**
 * The year the charts point at: under the pointer, in the sweep, or under the scroll through the stripes (in that
 * order). Kept outside React state - it changes with every step of the scroll and every tick of the sweep, and only
 * the three charts that draw it should render again, not the whole section around them.
 */
type YearCursor = { hover: number | null; sweep: number | null; scrub: number | null }
function createYearCursor() {
  let state: YearCursor = { hover: null, sweep: null, scrub: null }
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(patch: Partial<YearCursor>) {
      const next = { ...state, ...patch }
      if (next.hover === state.hover && next.sweep === state.sweep && next.scrub === state.scrub) return
      state = next
      subs.forEach((f) => f())
    },
    subscribe(f: () => void) {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
  }
}
type YearStore = ReturnType<typeof createYearCursor>
const useYears = (store: YearStore) => useSyncExternalStore(store.subscribe, store.get)

/** Renders its child with the year under the cursor, and again whenever that year changes. */
function AtYear({ store, children }: { store: YearStore; children: (year: number | null) => ReactNode }) {
  const s = useYears(store)
  return <>{children(s.hover ?? s.sweep ?? s.scrub)}</>
}

/** Sweeps the year cursor across the record - stripes, wetness and frost charts follow it. */
function useTimeMachine(store: YearStore, first: number, last: number) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stop = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    store.set({ sweep: null })
  }
  const play = () => {
    if (timer.current) return stop()
    let y = first
    store.set({ sweep: y })
    timer.current = setInterval(() => {
      y += 1
      if (y > last) stop()
      else store.set({ sweep: y })
    }, 140)
  }
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
  }, [])
  return { play, playing: () => timer.current !== null }
}

/** The sweep's button: its straw fill is how far the casting has gone. */
function SweepButton({ store, first, last, onPlay }: { store: YearStore; first: number; last: number; onPlay: () => void }) {
  const year = useYears(store).sweep
  const playing = year !== null
  return (
    <button
      onClick={onPlay}
      aria-pressed={playing}
      className="relative flex shrink-0 items-center gap-2 overflow-hidden border border-ink/20 px-3.5 py-2 font-mono text-xs text-ink-2 transition hover:border-leaf/60 hover:text-ink"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 bg-leaf/15 transition-[width] duration-150 ease-linear" style={{ width: playing ? `${((year - first) / Math.max(1, last - first)) * 100}%` : '0%' }} />
      {playing ? <Pause className="relative h-3.5 w-3.5 text-leaf" /> : <Play className="relative h-3.5 w-3.5" />}
      <span className="relative tabular-nums">{playing ? `casting ${year}` : `Play ${first} → ${last}`}</span>
    </button>
  )
}

/** the stripes' runway: from its top reaching the bar under the header to its end reaching the bottom of the screen */
const STRIPES_RUN: Edges = [(s) => s.top - 96, (s, vh) => s.bottom - vh]

function ClimateBody({ c, from, daily, forecast, pick }: { c: ClimateAnalysis; from: string; daily: Loadable<DailyAnalysis | null>; forecast: Loadable<Forecast>; pick: Crop | null }) {
  // the sowing month the season dial shows for this crop; spring-sown forms wait for warmth, frost-tender ones for no frost
  const sow = useMemo<SowCheck | null>(() => (pick ? sowCheckOf(pick, c) : null), [pick, c])
  const h = headline(c)
  const { means, trends } = c
  const driest5 = c.driest.slice(0, 5)
  const recentDriest = driest5.filter((d) => d.year >= c.recent.from)
  const years = useMemo(createYearCursor, [])
  const tm = useTimeMachine(years, c.firstYear, c.lastYear)
  // a year under the pointer in any of the charts: the others follow it. A tap keeps it on touch screens,
  // so starting the sweep clears it - otherwise the tapped year would hide the sweep.
  const setHoverYear = useCallback((y: number | null) => years.set({ hover: y }), [years])
  const play = () => {
    years.set({ hover: null })
    tm.play()
  }
  const stripesRef = useRef<HTMLDivElement>(null)
  const seen = useInView(stripesRef, { once: true, margin: '-25% 0px' })
  const autoplayed = useRef(false)
  // the guided tour asks for the sweep through the years
  useEffect(() => {
    const on = () => {
      autoplayed.current = true
      if (!tm.playing()) play()
    }
    window.addEventListener('zixtaro:sweep', on)
    return () => window.removeEventListener('zixtaro:sweep', on)
  })
  // Desktop: the stripes hold still for half a screen while the scroll runs the years - 1981 to today, the warmth
  // accumulating stripe by stripe. The tour's sweep and the Play button still win; phones keep the one autoplay.
  const desktop = useMedia('(min-width: 1024px)')
  const reduce = useReducedMotion()
  // The story's plate has no resin core: a farmer read it as decoration - two colour scales and a cylinder for what
  // four numbers and a sentence already say. It stays in the workbench, where the years can be run and read one by one.
  const story = useStory()
  const scrub = desktop && !reduce && !story
  const runway = useRef<HTMLDivElement>(null)
  const scrollYProgress = useScrollSpan(runway, STRIPES_RUN)
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    // before the pin takes hold the stripes stand whole; once it does, the years run from 1981 to today
    if (scrub) years.set({ scrub: v <= 0.02 ? null : c.firstYear + Math.round(Math.min(1, Math.max(0, (v - 0.02) / 0.83)) * (c.lastYear - c.firstYear)) })
  })
  useEffect(() => {
    if (!scrub) years.set({ scrub: null })
  }, [scrub, years])
  useEffect(() => {
    if (seen && !scrub && !autoplayed.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      autoplayed.current = true
      const t = setTimeout(play, 900) // let the stripes draw in first
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen])

  // The story's plate reads the four numbers and their words. The per-decade slope and its p-value under each are
  // the workbench's (and the report's): four framed lines of statistics under four figures was nine boxes for one
  // sentence, and the sentence above already says which trends are significant.
  const tiles = [
    { value: means.recent.t - means.baseline.t, digits: 1, unit: '°C', label: `warmer than ${c.baseline.from}-${c.baseline.to}`, sub: story ? `the average of ${c.recent.from}-${c.recent.to}` : `mean of ${c.recent.from}-${c.recent.to}, air at 2 m`, chip: <TrendChip t={trends.t} unit=" °C" digits={2} />, color: 'text-heat' },
    { value: means.recent.cwbGS - means.baseline.cwbGS, digits: 0, unit: 'mm', label: story ? 'water left for crops in a season' : 'growing-season water balance', sub: story ? `rain minus what sun and wind take, ${c.season.label}` : `rain − FAO-56 evaporative demand, ${c.season.label}`, chip: <TrendChip t={trends.cwbGS} unit=" mm" digits={0} />, color: means.recent.cwbGS < means.baseline.cwbGS ? 'text-wheat' : 'text-water' },
    { value: means.recent.gdd - means.baseline.gdd, digits: 0, unit: story ? 'degree-days' : '°C·d', label: 'more growing warmth per season', sub: story ? 'the warmth above 10 °C that crops grow on, added up' : 'growing degree days above 10 °C', chip: <TrendChip t={trends.gdd} unit="" digits={0} />, color: 'text-leaf' },
  ]

  return (
    <>
      <SectionHeader kicker="Atmosphere" altitude="2 m above ground" title={h.title} dek={story ? plainWords(h.dek) : h.dek} step={story ? 'Step 3 of 4 · the weather over this field' : undefined} />

      <div ref={runway} className={scrub ? 'relative h-[150svh]' : ''}>
      {!story && (
      <div className={scrub ? 'sticky top-24' : ''}>
      <Reveal className="mt-14">
        <div ref={stripesRef} data-tour="stripes">
          <div className="mb-5 flex items-end justify-between gap-4">
            <p className="max-w-md font-voice text-[19px] leading-snug text-ink-2 italic">
              {c.lastYear - c.firstYear + 1} years of the sky over this field, cast in resin - one layer a year.
            </p>
            {/* the sweep casts the core year by year; the straw fill is how far it has gone */}
            <SweepButton store={years} first={c.firstYear} last={c.lastYear} onPlay={play} />
          </div>
          {/* the stripes' own readout already names the year under the cursor and its two numbers */}
          <AtYear store={years}>{(year) => <Stripes climate={c} activeYear={year} onHover={setHoverYear} />}</AtYear>
        </div>
      </Reveal>
      </div>
      )}
      </div>

      {/* the three numbers that matter, read straight off the sky - telemetry on the ground, not four boxes */}
      <dl className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Reveal key={t.label} delay={i * 0.06} className="flex flex-col border-t border-white/12 pt-5">
            <dt className="order-2 mt-3 text-[15px] text-pretty text-ink">{t.label}</dt>
            <dd className="order-1 font-display-soft text-5xl leading-none text-ink">
              <CountUp value={t.value} decimals={t.digits} signed />
              <span className="ml-1.5 font-mono text-base text-ink-3">{t.unit}</span>
            </dd>
            <dd className="order-3 mt-1 text-xs text-ink-3">{t.sub}</dd>
            {!story && <dd className="order-4 mt-auto pt-4">{t.chip}</dd>}
          </Reveal>
        ))}
        <Reveal delay={0.18} className="flex flex-col border-t border-white/12 pt-5">
          <dt className="order-2 mt-3 text-[15px] text-pretty text-ink">{story ? 'driest seasons for the soil came in the last ten years' : 'driest root-zone seasons fell in the last decade'}</dt>
          <dd className="order-1 font-display-soft text-5xl leading-none text-ink">
            <CountUp value={recentDriest.length} />
            <span className="ml-2 font-mono text-base text-ink-3">of 5</span>
          </dd>
          <dd className="order-3 mt-1 text-xs text-ink-3">{story ? `of the ${c.lastYear - c.firstYear + 1} seasons on NASA’s record, by how dry the soil was` : `ranked over ${c.lastYear - c.firstYear + 1} seasons of MERRA-2 soil wetness`}</dd>
          {story ? (
            <dd className="num order-4 mt-2 text-xs text-ink-3">{driest5.map((d) => d.year).join(' · ')}</dd>
          ) : (
            <dd className="order-4 mt-auto flex flex-wrap gap-1 pt-4">
              {driest5.map((d) => (
                <Chip key={d.year} tone={d.year >= c.recent.from ? 'bad' : 'neutral'} className="!px-1.5">{d.year}</Chip>
              ))}
            </dd>
          )}
        </Reveal>
      </dl>

      {/* the instruments behind those numbers: one at a time, the next 16 days first */}
      <Instrument title="45 years of sky, instrument by instrument" kicker="Instrument · 2 m" label="Open the climate instruments">
      <DeepTabs
        label="Atmosphere instruments"
        tabs={[
          {
            id: 'forecast',
            label: 'Next 16 days',
            icon: CloudSun,
            render: () => (
              <div className="panel p-5 sm:p-6">
                <ForecastPanel state={forecast} sow={sow} />
              </div>
            ),
          },
          {
            id: 'wetness',
            label: 'Soil wetness',
            icon: Droplets,
            render: () => (
              <div className="panel p-5 sm:p-6">
                <div className="text-[15px] text-ink">Root-zone soil wetness, {c.season.label}</div>
                <div className="mt-1 text-xs text-ink-3">NASA MERRA-2 GWETROOT (0 = bone dry, 1 = saturated) · dashed = Sen’s trend</div>
                <div className="mt-5">
                  <AtYear store={years}>{(year) => <WetnessChart climate={c} activeYear={year} onHover={setHoverYear} />}</AtYear>
                </div>
              </div>
            ),
          },
          {
            id: 'rain2',
            label: 'Rain, twice',
            icon: Satellite,
            render: () => <RainTwoPanel climate={c} />,
          },
          {
            id: 'water',
            label: 'Rain vs demand',
            icon: CalendarRange,
            render: () => (
              <div className="panel p-5 sm:p-6">
                <div className="text-[15px] text-ink">Rain vs evaporative demand, month by month</div>
                <div className="mt-1 text-xs text-ink-3">mm per month · Penman-Monteith ET₀ from NASA POWER radiation, humidity & wind</div>
                <div className="mt-5">
                  <WaterCalendar climate={c} />
                </div>
              </div>
            ),
          },
          {
            id: 'frost',
            label: 'Frost & heat',
            icon: Snowflake,
            render: () => (
              <div className="panel p-5 sm:p-6">
                <AtYear store={years}>{(year) => <FrostPanel state={daily} activeYear={year} onHover={setHoverYear} />}</AtYear>
                {daily.status === 'ready' && daily.data && (
                  <div className="mt-10 border-t border-white/10 pt-8">
                    <HeatWavePanel climate={c} daily={daily.data} />
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
      </Instrument>

      {story ? (
        // where the numbers come from, and the one thing about them a farmer has to know
        <p className="mt-8 max-w-2xl text-[13px] leading-snug text-ink-3">
          From NASA’s weather record for this place, {c.firstYear}-{c.lastYear}. It describes an area about 50 km across, not this one field: a frost hollow or a sheltered slope will differ, and you know yours.
        </p>
      ) : (
        <p className="mt-8 font-mono text-[11px] leading-relaxed text-ink-4">
          NASA POWER monthly & daily point data (MERRA-2 meteorology, CERES/SRB radiation) · grid cell ≈ 50 km · {c.firstYear}-{c.lastYear} ·
          trends: Sen’s slope + Mann-Kendall test, α = 0.05 · {from === 'live' ? 'fetched live' : from === 'cache' ? 'from local cache' : 'bundled snapshot for offline demo'} ·
          forecast: Open-Meteo
        </p>
      )}
    </>
  )
}

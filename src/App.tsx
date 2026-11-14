import { AnimatePresence, motion } from 'motion/react'
import { cityHours } from './lib/access'
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Altimeter, AltimeterBar, STOPS, TopBar, type TopAnswer, FLOW_STOPS } from './components/Chrome'
import { Atmosphere } from './components/Atmosphere'
// the descent's 3D objects: three.js loads only when their crossing comes near
const SoilCore = lazy(() => import('./components/objects/SoilCore'))
const CanopyField = lazy(() => import('./components/objects/CanopyField'))
const CloudDeck = lazy(() => import('./components/objects/CloudDeck'))
const GlassHouse = lazy(() => import('./components/objects/GlassHouse'))
const MarketYard = lazy(() => import('./components/objects/MarketYard'))
import { ClimateSection } from './components/ClimateSection'
import { Cursor } from './components/Cursor'
import { FarmDrawer } from './components/FarmDrawer'
import { FieldSection } from './components/FieldSection'
import type { Neighbour } from './components/GreenhouseSection'
import { GroundSection } from './components/GroundSection'
import { Hero } from './components/Hero'
import { DescentBand, type ObjectSlot } from './components/DescentBands'
import { PlanSection } from './components/PlanSection'
import { SoilSection } from './components/SoilSection'
import type { TourStep } from './components/Tour'
import { Ascent } from './components/Ascent'
import { lazyPart } from './components/lazyPart'
import { useEngine } from './lib/useEngine'
import { scenarioId } from './lib/version'
// below the fold, print-only or greenhouse-only: their own chunks, loaded when first rendered
// while its chunk loads the house keeps a screen of room, so switching from the field doesn't flash the footer
const GreenhouseSection = lazyPart(() => import('./components/GreenhouseSection').then((m) => m.GreenhouseSection), <section id="house" aria-busy="true" className="min-h-[100svh] scroll-mt-16" />)
const GreenhouseReport = lazyPart(() => import('./components/GreenhouseReport').then((m) => m.GreenhouseReport))
const MethodPage = lazyPart(() => import('./components/MethodPage').then((m) => m.MethodPage))
const LegalPage = lazyPart(() => import('./components/LegalPage').then((m) => m.LegalPage))
const PrintReport = lazyPart(() => import('./components/PrintReport').then((m) => m.PrintReport))
const Tour = lazyPart(() => import('./components/Tour').then((m) => m.Tour))
import { Boundary, SectionHeader, Skeleton, type WaterApi } from './components/ui'
import type { SourceItem, SourceState } from './components/DataProvenance'
import type { Provenance } from './lib/api'
import { scaleNote } from './lib/scale'
import { LAB_LABEL } from './components/SoilLabForm'
import { CROPS, CROP_BY_ID, type Crop, type CropId } from './lib/crops'

import { signed } from './lib/format'
import { greenhouseSnapshot, kindOf, loadFarm, saveFarm, summarize, summarizeGreenhouse, uid, type Farm, type FarmField, type SiteKind } from './lib/farm'
import { distanceM, fieldKey, samplePoints, type Field } from './lib/geo'
import { DEFAULT_GH, DEFAULT_GH_PRIORITIES, DEFAULT_PRICES, GH_CROP_BY_ID, greenhouseModel, rankGreenhouseCrops, yearPlan, type GhCropId, type GhPriorities, type GreenhouseSpec, type Prices } from './lib/greenhouse'
import { chpFor, countryOf, latestEnergy } from './lib/ghMarket'
import { useAfterIntro, useFieldData, useLater, usePlaceName, useStaged } from './lib/hooks'
import { setMode, useMode } from './lib/mode'
import { DEFAULT_EXCLUDE, DEFAULT_PRESET, defaultExcludeFor, presetFor, type Preset, initialHistory, noHistory } from './lib/presets'
import { inLithuania } from './lib/staticmap'
import { buildStrategies, IRRIGATION_COST, rankNext, type FieldContext, type Priorities } from './lib/rotation'
import { chosenPlan, chosenSeasons, type PlanKey } from './lib/strategyReading'
import { fuseLab, manualProfile, type LabSoil, type TextureClass } from './lib/soil'
import { pickConfidence, sensitivity } from './lib/robust'
import { co2Effect, projectionFor, warmClimate, whatIfExplain, whatIfPeriod, whatIfWarming, type Projection, type WhatIf } from './lib/scenario'
import { readScenario, scenarioHash, writeScenario, type Scenario } from './lib/urlState'
import { useMarket } from './lib/useMarket'
import { SiteFooter } from './components/SiteFooter'
import { MarketSection, type MarketCrop } from './components/MarketSection'
import { MarketChip } from './components/MarketChip'
import { irrigatedShare, irrigationCostFor, loadGroundwater, loadIrrigation, MOSTLY_IRRIGATED } from './lib/irrigation'
import type { MarketMode } from './lib/marketProfit'
import { observedYields, type CropKey } from './lib/markets'
import { allCropRisks, riskAfter } from './lib/water'
import { useCropRisks } from './lib/cropRisks'
import { withDailyExtremes } from './lib/extremes'
import { winterDrainage } from './lib/nitrate'
import { rFactor } from './lib/erosion'
import { localCrops } from './lib/localCrops'
import { nationalShares, practiceFor } from './lib/practice'
import { MAP_SOURCE } from './lib/cropMaps'
import { fieldWindow } from './lib/fieldWindow'
import { transitions, type FieldPractice } from './lib/fieldPractice'
import { loadRotations } from './lib/rotationPrior'
import { sowingAdvice } from './lib/sowing'
import { traceNasa } from './lib/causal'
import { onOpenLegal, onOpenMethod, pageFromUrl, urlFor, type LegalTab, type MethodTab, type Route } from './lib/nav'

/**
 * The page below the hero mounts part by part while the intro still covers the screen (useStaged):
 * 1 ground · 2 air · 3 field or greenhouse · 4 roots · 5 plan · 6 market · 7 the print reports.
 * The intro waits for the plan (PAGE_READY); the market and the hidden reports follow while the globe descends.
 * The Method page is not part of it: it opens over the page from the top bar (?page=method).
 */
const PARTS = 7
const PAGE_READY = 5
const SECTION_IDS = [...new Set([...STOPS.field, ...STOPS.greenhouse].map((s) => s.id))]
/** Stands in for a section that has not mounted yet, so its anchor already exists. */
const Pending = ({ id }: { id: string }) => <section id={id} aria-busy="true" className="min-h-[100svh] scroll-mt-16" />

function initialScenario(): Scenario & { fromUrlWater: boolean; fromUrlExclude: boolean; ghPriorities: GhPriorities; ghExclude: GhCropId[]; ghLevel: number } {
  const fromUrl = readScenario()
  const p = DEFAULT_PRESET
  const preset = fromUrl.field ? presetFor(fromUrl.field) : p
  return {
    field: fromUrl.field ?? p.field,
    history: initialHistory(fromUrl),
    priorities: fromUrl.priorities ?? preset?.priorities ?? p.priorities,
    exclude: fromUrl.exclude ?? preset?.exclude ?? DEFAULT_EXCLUDE,
    fromUrlExclude: !!fromUrl.exclude,
    irrigated: fromUrl.irrigated ?? preset?.irrigated ?? false,
    fromUrlWater: fromUrl.irrigated !== undefined,
    budget: fromUrl.budget ?? 0,
    replay: fromUrl.replay ?? null,
    texture: fromUrl.texture ?? null,
    lab: fromUrl.lab ?? {},
    site: fromUrl.site ?? 'field',
    gh: fromUrl.gh ?? DEFAULT_GH,
    ghPriorities: fromUrl.ghPriorities ?? DEFAULT_GH_PRIORITIES,
    ghExclude: fromUrl.ghExclude ?? [],
    ghLevel: fromUrl.ghLevel ?? 1,
    ghOwn: fromUrl.ghOwn ?? {},
    warming: fromUrl.warming ?? 0,
    co2: fromUrl.co2 ?? true,
    market: fromUrl.market ?? { kind: 'auto' },
    marketOwn: fromUrl.marketOwn ?? {},
  }
}

export default function App() {
  const init = useMemo(initialScenario, [])
  const [field, setField] = useState<Field>(init.field)
  const [history, setHistory] = useState<(CropId | null)[]>(init.history)
  const [priorities, setPriorities] = useState<Priorities>(init.priorities)
  const [exclude, setExcludeRaw] = useState<CropId[]>(init.exclude)
  // a freshly picked field takes its crop list from local practice until the farmer edits it
  const [autoExclude, setAutoExclude] = useState(!init.fromUrlExclude && !presetFor(init.field))
  const setExclude = (x: CropId[]) => {
    setAutoExclude(false)
    setExcludeRaw(x)
  }
  const [irrigated, setIrrigatedRaw] = useState(init.irrigated)
  const [budget, setBudgetRaw] = useState(init.budget)
  // one water setting: rainfed, a limited budget (mm per season) or unlimited irrigation
  const setIrrigated = (v: boolean) => {
    setIrrigatedRaw(v)
    if (v) setBudgetRaw(0)
  }
  const setBudget = (mm: number) => {
    setIrrigatedRaw(false)
    setBudgetRaw(Math.max(0, Math.round(mm)))
  }
  const waterBudget = irrigated ? 0 : budget
  // a freshly picked field starts the way most cropland around it is watered (FAO GMIA) until the farmer chooses
  const [autoWater, setAutoWater] = useState(!init.fromUrlWater && !presetFor(init.field))
  const [irrShare, setIrrShare] = useState<number | null>(null)
  // where the irrigation water around the field comes from (FAO GMIA): wells are pumped, canals mostly charge a fee
  const [groundwater, setGroundwater] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    loadGroundwater().then((g) => live && setGroundwater(g ? irrigatedShare(g, field.lat, field.lon) : null))
    return () => {
      live = false
    }
  }, [field.lat, field.lon])
  // travel time to the nearest city of 50 000+ (Nelson 2019): fresh produce needs a market within reach (access.ts)
  const [toCity, setToCity] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    setToCity(null)
    cityHours(field.lat, field.lon).then((h) => live && setToCity(h))
    return () => {
      live = false
    }
  }, [field.lat, field.lon])
  useEffect(() => {
    let live = true
    loadIrrigation().then((g) => live && setIrrShare(g ? irrigatedShare(g, field.lat, field.lon) : null))
    return () => {
      live = false
    }
  }, [field.lat, field.lon])
  useEffect(() => {
    if (!autoWater || irrShare === null) return
    setIrrigatedRaw(irrShare >= MOSTLY_IRRIGATED)
    setBudgetRaw(0)
  }, [autoWater, irrShare])
  const water: WaterApi = {
    value: { irrigated, budget: waterBudget },
    onRainfed: () => {
      setAutoWater(false)
      setBudget(0)
    },
    onBudget: (mm) => {
      setAutoWater(false)
      setBudget(mm)
    },
    onUnlimited: () => {
      setAutoWater(false)
      setIrrigated(true)
    },
    note: irrShare === null ? undefined : `${Math.round(irrShare * 100)} % of the cropland around here is irrigated (FAO GMIA)${autoWater ? `; until you choose, every crop is scored as ${Math.round(irrShare * 100)} % irrigated, ${100 - Math.round(irrShare * 100)} % rainfed` : ''}.`,
  }
  const [replay, setReplay] = useState<number | null>(init.replay)
  // mode C (science × national proof) is the page's labelled default; "science only" shows mode A
  const [scienceOnly, setScienceOnly] = useState(false)
  const [texture, setTexture] = useState<TextureClass | null>(init.texture)
  const [lab, setLab] = useState<LabSoil>(init.lab)
  const [site, setSite] = useState<SiteKind>(init.site)
  const [ghSpec, setGhSpec] = useState<GreenhouseSpec>(init.gh)
  // Until the grower taps a crop, the house plans the best crop for its climate (old links and farm entries
  // still say "tomato" from the former default, so they don't count as a choice).
  const [ghCropPicked, setGhCropPicked] = useState(false)
  const setGhSpecByUser = (s: GreenhouseSpec) => {
    if (s.crop !== ghSpec.crop) setGhCropPicked(true)
    setGhSpec(s)
  }
  const [prices, setPricesRaw] = useState<Prices>({ ...DEFAULT_PRICES, level: init.ghLevel, own: init.ghOwn })
  // energy prices follow the site's country (Eurostat, latest year) until the grower types their own
  const [pricesEdited, setPricesEdited] = useState(false)
  const setPrices = ({ market: _market, chp: _chp, ...p }: Prices) => {
    if (p.heat !== prices.heat || p.power !== prices.power) setPricesEdited(true)
    setPricesRaw(p)
  }
  // where the harvest is sold: one choice for the whole page, shared through the URL
  const [market, setMarket] = useState<MarketMode>(init.market ?? { kind: 'auto' })
  const [marketOwn, setMarketOwn] = useState<Partial<Record<CropKey, number>>>(init.marketOwn ?? {})
  const [ghPriorities, setGhPriorities] = useState<GhPriorities>(init.ghPriorities)
  const [ghExclude, setGhExclude] = useState<GhCropId[]>(init.ghExclude)
  const [warming, setWarming] = useState<WhatIf>(init.warming)
  const [co2On, setCo2On] = useState(init.co2)
  const [projection, setProjection] = useState<Projection | null>(null)
  const [farm, setFarm] = useState<Farm>(loadFarm)
  const [farmOpen, setFarmOpen] = useState(false)
  useEffect(() => saveFarm(farm), [farm])

  // ---------- The Method page: ?page=method over the main page; the browser's Back closes it ----------
  const [route, setRoute] = useState(pageFromUrl)
  useEffect(() => {
    const onPop = () => setRoute(pageFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // (the legal pages open the same way, at ?page=legal; from one over-page to the other the history entry is
  // replaced, so Back always lands on the field)
  const openPage = useCallback((next: Exclude<Route, { page: 'main' }>) => {
    if (pageFromUrl().page !== 'main') window.history.replaceState(window.history.state, '', urlFor(next))
    else window.history.pushState({ zixtaro: 'page' }, '', urlFor(next))
    setRoute(next)
  }, [])
  const openMethod = useCallback((tab: MethodTab = 'how') => openPage({ page: 'method', tab }), [openPage])
  const openLegal = useCallback((tab: LegalTab = 'notice') => openPage({ page: 'legal', tab }), [openPage])
  useEffect(() => onOpenMethod(openMethod), [openMethod])
  useEffect(() => onOpenLegal(openLegal), [openLegal])
  const closeMethod = useCallback(() => {
    if ((window.history.state as { zixtaro?: string } | null)?.zixtaro) return window.history.back()
    window.history.replaceState(null, '', urlFor({ page: 'main' }))
    setRoute({ page: 'main' })
  }, [])

  const preset = presetFor(field)
  const place = usePlaceName(field.lat, field.lon, field.label ?? (preset ? `${preset.name}, ${preset.region}` : undefined))
  const country = useMemo(() => countryOf(place), [place])
  const energy = useMemo(() => latestEnergy(country), [country])
  useEffect(() => {
    if (!pricesEdited) setPricesRaw((p) => ({ ...p, heat: energy.heat, power: energy.power }))
  }, [energy, pricesEdited])
  const { climate, soil: soilState, soilProgress, daily, terrain, forecast, retry } = useFieldData(field)
  const mk = useMarket({ lat: field.lat, lon: field.lon, mode: market, own: marketOwn })
  // greenhouse prices at the chosen market (the grower's own € per kg still overrides)
  // and the day-ahead power a combined heat and power engine would sell at, where it is kept
  const ghPrices = useMemo<Prices>(() => ({ ...prices, market: mk.ghMarket ?? undefined, chp: chpFor(country, energy.year) ?? undefined }), [prices, mk.ghMarket, country, energy.year])

  const climateData = climate.status === 'ready' ? climate.data : null
  const soil = useMemo(() => {
    const base = texture ? manualProfile(texture, soilState.status === 'ready' ? soilState.data.top.ph : 6.5) : soilState.status === 'ready' ? soilState.data : null
    return base ? fuseLab(base, lab) : null
  }, [texture, soilState, lab])
  const slopePct = terrain.status === 'ready' ? terrain.data.slopePct : null

  // what farms actually grow in the field's 0.5° cell (CROPGRIDS 2020, bundled - works anywhere, offline)
  const [local, setLocal] = useState<Awaited<ReturnType<typeof localCrops>>>(null)
  useEffect(() => {
    let live = true
    localCrops(field.lat, field.lon).then((d) => live && setLocal(d))
    return () => {
      live = false
    }
  }, [field.lat, field.lon])
  // the crop maps of the field and the fields around it, where its country has them (fieldWindow.ts): mode C then reads
  // the practice H8 judged on new fields (fieldPractice.ts) - until they are in, and where they fail, the region's
  const [fieldMaps, setFieldMaps] = useState<FieldPractice | null>(null)
  useEffect(() => {
    setFieldMaps(null)
    const home = mk.home
    if (!home || !MAP_SOURCE[home]) return
    const abort = new AbortController()
    const { lat, lon } = field
    Promise.all([fieldWindow(home, lat, lon, abort.signal), loadRotations()])
      .then(([win, rot]) => {
        if (win && rot && !abort.signal.aborted) setFieldMaps({ map: win.source, rot, lat, lon, national: nationalShares(home), t: transitions(win.histories) })
      })
      .catch(() => {})
    return () => abort.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.lat, field.lon, mk.home])
  useEffect(() => {
    if (autoExclude && local) setExcludeRaw(defaultExcludeFor(local.here, inLithuania(field.lat, field.lon) ? local.around : null))
  }, [local, autoExclude])
  // NASA CMIP6 2050s projections exist for the 0.25° cells of the demo fields (any field inside them gets one).
  useEffect(() => {
    let live = true
    projectionFor(field.lat, field.lon).then((p) => live && setProjection(p))
    return () => {
      live = false
    }
  }, [field.lat, field.lon])
  // The plan can be stress-tested against a warmer climate; the Atmosphere section always shows the real record.
  // A projection chosen where none exists (another field) falls back to the observed decade.
  const whatIf: WhatIf = whatIfWarming(warming, projection) ? warming : 0
  const planClimate = useMemo(() => {
    const w = whatIfWarming(warming, projection)
    return climateData && w ? warmClimate(climateData, w) : climateData
  }, [climateData, warming, projection])
  const areaFromOutline = field.kind === 'area' ? field.areaHa * 10_000 : null
  const gh = ghSpec
  const isGh = site === 'greenhouse'
  // A drawn outline suggests the floor area (once); what the grower types afterwards wins.
  const outlineFloor = (f: Field) => (f.kind === 'area' ? Math.min(2_000_000, Math.max(50, Math.round(f.areaHa * 10_000))) : null)
  const switchSite = (k: SiteKind) => {
    setSite(k)
    const a = outlineFloor(field)
    if (k === 'greenhouse' && a) setGhSpec((s) => ({ ...s, floorM2: a }))
  }

  const deferredBudget = useDeferredValue(waterBudget)
  // 2050s scenarios also change the air the crops breathe: less transpiration, more C3 yield
  const co2 = useMemo(() => co2Effect(whatIf, co2On), [whatIf, co2On])
  // (in a worker - lib/cropRisks: on the main thread they were half a second of a first visit, under the loader)
  const waterRisks = useCropRisks(isGh ? null : planClimate, soil, deferredBudget, co2?.transpiration ?? 1)
  // heat at flowering and frost after emergence, day by day, once NASA POWER daily data is in
  const dailyData = daily.status === 'ready' ? daily.data : null
  const risks = useMemo(() => {
    if (!waterRisks || !planClimate || !dailyData) return waterRisks
    return withDailyExtremes(waterRisks, dailyData.raw, planClimate, whatIfWarming(warming, projection)?.dT)
  }, [waterRisks, planClimate, dailyData, warming, projection])
  // the greenhouse section and its report share one run of the model
  const ghOpts = useMemo(() => ({ priorities: ghPriorities, exclude: ghExclude, country }), [ghPriorities, ghExclude, country])
  const ghReport = useMemo(() => {
    // waits for the market records, so the house is never priced at the EU default first and then repriced
    if (!isGh || !planClimate || !mk.ghMarket) return null
    const ranking = rankGreenhouseCrops(planClimate, gh, ghPrices, ghOpts)
    return { result: greenhouseModel(planClimate, gh, ghPrices, ghOpts), ranking, year: yearPlan(ranking) }
  }, [isGh, planClimate, gh, ghPrices, ghOpts, mk.ghMarket])
  useEffect(() => {
    const best = ghReport?.ranking[0]?.crop.id
    if (!ghCropPicked && best && best !== ghSpec.crop) setGhSpec((sp) => ({ ...sp, crop: best }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghReport, ghCropPicked])
  const weights = useDeferredValue(priorities)
  const excludeSet = useMemo(() => new Set(exclude), [exclude])
  // what farms in this country really harvest (FAOSTAT 2019-2023): the expected harvest starts from it, and a crop
  // nobody here grows keeps less of its standing (LOCAL_PROOF) - the setting the evaluations in SCIENCE.md §6 use
  const yieldRef = useMemo(() => (mk.ctx ? observedYields(mk.home) : null), [mk.ctx, mk.home])
  const ctx = useMemo<FieldContext | null>(
    () =>
      risks && climateData && soil && mk.ctx && yieldRef
        ? {
          risks,
          soil,
          stressYear: replay,
          irrigated,
          // until the farmer says how the field is watered, scores are the expectation over the share irrigated around it
          irrigationPrior: autoWater && irrShare !== null ? irrShare : null,
          // mode C (default, labelled): the science pushed toward what farms around grow (prior.ts); "science only"
          // drops it. The national-proof multiplier of the old mode C is not used any more.
          nationalProof: false,
          practice: scienceOnly ? undefined : fieldMaps ? { ...practiceFor(local?.region, field.lat, mk.home), source: 'field', field: fieldMaps } : practiceFor(local?.region, field.lat, mk.home),
          irrigationCost: irrigationCostFor(groundwater, IRRIGATION_COST),
          budget: deferredBudget,
          winterDrain: winterDrainage(planClimate ?? climateData, soil),
          erosivity: rFactor((planClimate ?? climateData).monthly.recent),
          co2,
          drying: climateData.signal.drying,
          slopePct,
          recentLabel: whatIfPeriod(whatIf, climateData.recent),
          baselineLabel: `${climateData.baseline.from}-${climateData.baseline.to}`,
          market: mk.ctx,
          yieldRef,
          cityHours: toCity,
        }
        : null,
    [risks, soil, climateData, planClimate, replay, irrigated, autoWater, irrShare, scienceOnly, groundwater, deferredBudget, slopePct, whatIf, co2, mk.ctx, yieldRef, toCity, local, field.lat, mk.home, fieldMaps],
  )
  const ranking = useMemo(() => (ctx ? rankNext(history, ctx, weights, excludeSet) : []), [ctx, history, weights, excludeSet])
  // the same answer without the what-if or the replayed year: the decision card says whether the scenario changes it
  const baseRanking = useMemo(() => {
    if (!ctx || !climateData || !soil || isGh || (!whatIf && replay === null)) return null
    let base = ctx.risks
    if (whatIf) {
      const r = allCropRisks(climateData, soil, deferredBudget, 1)
      base = dailyData ? withDailyExtremes(r, dailyData.raw, climateData) : r
    }
    const plain = { ...ctx, risks: base, stressYear: null, co2: null, winterDrain: winterDrainage(climateData, soil), erosivity: rFactor(climateData.monthly.recent), recentLabel: whatIfPeriod(0, climateData.recent) }
    return rankNext(history, plain, weights, excludeSet)
  }, [ctx, climateData, soil, isGh, whatIf, replay, deferredBudget, dailyData, history, weights, excludeSet])
  // dev only: the live engine inputs, for audits in the browser console (scripts and Playwright read them)
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __zixtaroEngine: ctx ? { ctx, history, weights, exclude: [...excludeSet] } : null })
  }, [ctx, history, weights, excludeSet])
  // ---------- The farmer's choice: the plan the page is built around from the Plan section on ----------
  // The engine's own plan until another is chosen on the plans' ledger (the rotation the farm is on, or a strategy
  // that leans another way). What follows it: the plate's season, the roots the soil core measures, the sowing
  // check of the forecast, the sandbox, nitrogen and soil outlook, the elevator's load and the market's crops. The
  // decision card and the workings keep explaining the engine's own pick. The printed report states both: the
  // engine's recommendation, and the plan the farmer chose. "My farm" keeps the engine's plan.
  const [planKey, setPlanKey] = useState<PlanKey>('you')
  const strategies = useMemo(
    () => (ctx && ranking.length ? buildStrategies(history, ctx, weights, excludeSet) : []),
    [ctx, history, weights, excludeSet, ranking.length],
  )
  // the heavy analyses (Monte Carlo, sensitivity, NASA counterfactual, sowing windows) run in a Web Worker
  const engineJob = useMemo(
    () => (ctx && planClimate && soil && ranking.length && !isGh
      ? { history, ctx: { ...ctx, co2: undefined }, whatIf, co2On, w: weights, exclude, climate: planClimate, soil, daily: dailyData?.raw ?? null, irrigated, budget: deferredBudget }
      : null),
    [ctx, planClimate, soil, ranking.length, isGh, history, whatIf, co2On, weights, exclude, dailyData, irrigated, deferredBudget],
  )
  const { confidence, sens, sobol, causal, sowing } = useEngine(engineJob)

  // what the plan is built on, source by source (shown above the plan)
  const sources: SourceItem[] = useMemo(() => {
    const st = (l: { status: string; from?: Provenance }): SourceState =>
      l.status === 'ready' ? (l.from ?? 'live') : l.status === 'error' ? 'error' : 'loading'
    const soilSt: SourceState = texture ? 'manual' : soil?.source === 'provisional' ? 'provisional' : st(soilState as { status: string; from?: Provenance })
    const labNote = soil?.lab?.length ? `your lab test for ${soil.lab.map((k) => LAB_LABEL[k]).join(', ')}` : undefined
    const n = soil?.variability?.samples.length ?? 1
    return [
      { key: 'power', label: 'Climate since 1981', tech: 'NASA POWER monthly · MERRA-2 + CERES/SRB', res: '≈ 50 km cell · monthly', state: st(climate), nasa: true, url: climate.status === 'ready' ? climate.url : undefined },
      { key: 'daily', label: 'Daily weather (frost, heat, storms)', tech: 'NASA POWER daily', res: '≈ 50 km cell · daily', state: st(daily), nasa: true, url: daily.status === 'ready' ? daily.url : undefined },
      {
        key: 'soil', label: 'Soil under the field', tech: texture ? `your texture: ${texture}` : 'ISRIC SoilGrids 2.0', res: `250 m · ${n} sample${n > 1 ? 's' : ''} · 0-200 cm`, state: soilSt,
        note: [soilSt === 'provisional' ? 'a typical loam until SoilGrids answers' : undefined, labNote].filter(Boolean).join(' · ') || undefined, url: soilState.status === 'ready' ? soilState.url : undefined,
      },
      { key: 'terrain', label: 'Slope & drainage', tech: 'AWS Terrain Tiles (SRTM)', res: '≈ 30 m', state: st(terrain) },
      { key: 'cmip6', label: '2050s climate projections', tech: 'NASA NEX-GDDP-CMIP6 · 3 models', res: '0.25° · monthly change', state: projection ? 'bundled' : 'none', nasa: true, note: projection ? undefined : 'pre-baked for the demo fields only' },
      { key: 'forecast', label: 'Next 16 days', tech: 'Open-Meteo forecast', res: '1-11 km models', state: st(forecast) },
    ]
  }, [climate, daily, soilState, soil, texture, terrain, projection, forecast])


  // the page mounts in parts (see PARTS); a jump to a section or printing needs all of it at once
  const [parts, mountAll] = useStaged(PARTS, SECTION_IDS.includes(window.location.hash.slice(1)), PAGE_READY)
  // the print reports are for a printer: they are made once the loader has left
  const reportsDue = useAfterIntro(2500, 2500, true)
  useEffect(() => {
    if (parts >= PARTS) return
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('a[href^="#"]')) mountAll()
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeprint', mountAll)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeprint', mountAll)
    }
  }, [parts, mountAll])

  const plan = useMemo(() => chosenPlan(strategies, history, planKey), [strategies, history, planKey])
  // (the printed report carries the farmer's plan when it is not the engine's own; null leaves the report as it was)
  const reportPlan = useMemo(() => (plan && plan.key !== 'you' && ctx ? chosenSeasons(plan, strategies, history, ctx, weights) : null), [plan, strategies, history, ctx, weights])
  // the season the chosen plan opens with, as the ranking scored it (the engine's pick where the plan is its own)
  const lead = useMemo(() => (plan && ranking.find((e) => e.crop.id === plan.ids[0])) || ranking[0] || null, [plan, ranking])
  // the crops the Market section prices: the chosen plan's own, in the order they are sown, then the best of the
  // rest up to five - or the greenhouse's
  const marketCrops = useMemo<MarketCrop[]>(() => {
    if (isGh) return (ghReport?.ranking ?? []).slice(0, 5).map((r) => ({ id: r.crop.id, name: r.crop.name }))
    const sells = ranking.filter((e) => e.crop.econ.yield > 0)
    const mine = [...new Set(plan?.ids ?? [])].map((id) => sells.find((e) => e.crop.id === id)).filter((e): e is (typeof sells)[number] => !!e)
    return [...mine, ...sells.filter((e) => !mine.includes(e))].slice(0, 5).map((e) => ({ id: e.crop.id, name: e.crop.name, harvest: e.harvest }))
  }, [isGh, ghReport, ranking, plan])
  // the answer the top bar keeps in view: the season the plan opens with (under its plan's name once the farmer
  // has chosen one), or the crop in the house
  const topAnswer = useMemo<TopAnswer | null>(
    () =>
      isGh
        ? ghReport ? { label: 'In the house', name: ghReport.result.crop.name, color: ghReport.result.crop.color } : null
        : lead ? { label: whatIf ? 'What-if' : plan && plan.key !== 'you' ? plan.label : 'Next season', name: lead.crop.name, color: lead.crop.color } : null,
    [isGh, ghReport, lead, plan, whatIf],
  )

  const scenario: Scenario = {
    field, history, priorities, exclude, irrigated, budget: waterBudget, replay, texture, lab, site, gh, warming, co2: co2On,
    ghPriorities, ghExclude, ghLevel: prices.level, ghOwn: prices.own, market, marketOwn,
  }
  // same inputs + same model version → same ID → the same recommendation
  const scenarioKey = useMemo(() => scenarioId({ ...scenario, gh: site === 'greenhouse' ? gh : undefined, ghPriorities: isGh ? ghPriorities : undefined, ghExclude: isGh ? ghExclude : undefined, ghLevel: isGh ? prices.level : undefined, ghOwn: isGh ? prices.own : undefined, ghEnergy: isGh ? [prices.heat, prices.power] : undefined }), [field, history, priorities, exclude, irrigated, waterBudget, replay, texture, lab, site, gh, warming, co2On, ghPriorities, ghExclude, prices, market, marketOwn]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    writeScenario(scenario)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, history, priorities, exclude, irrigated, waterBudget, replay, texture, lab, site, gh, warming, co2On, ghPriorities, ghExclude, prices.level, prices.own, market, marketOwn])

  const choosePreset = (p: Preset) => {
    setField(p.field)
    setHistory(p.history)
    setPriorities(p.priorities)
    setExclude(p.exclude)
    setAutoWater(false)
    setIrrigated(p.irrigated)
    setBudgetRaw(0)
    setTexture(null)
    setLab({})
    setReplay(null)
    setSite('field')
  }
  const chooseField = (f: Field) => {
    setField(f)
    // a new field starts with unknown seasons: the previous field's rotation is not this one's (experiment H)
    setHistory(noHistory())
    setAutoExclude(true)
    setAutoWater(true)
    setExcludeRaw(defaultExcludeFor(null))
    setTexture(null)
    setLab({})
    setReplay(null)
    const a = outlineFloor(f)
    if (isGh && a) setGhSpec((s) => ({ ...s, floorM2: a }))
  }

  // Where the soil is (or will be) sampled - shown on the globe while SoilGrids answers.
  const samples = useMemo(() => {
    if (isGh) return []
    if (soil?.variability) return soil.variability.samples
    return field.kind === 'area' ? samplePoints(field.ring, field.areaHa) : []
  }, [soil, field, isGh])

  const roots: Crop[] = useMemo(() => {
    const ids = [...ranking.slice(0, 3).map((e) => e.crop.id)]
    const last = history[history.length - 1]
    if (last && !ids.includes(last)) ids.push(last)
    return ids.slice(0, 4).map((id) => ranking.find((e) => e.crop.id === id)?.crop ?? ctx?.risks[id]?.crop ?? CROP_BY_ID[id]) // as grown here
  }, [ranking, history, ctx])

  // My farm: fill missing snapshots (the demo farm is bundled, so this is instant)…
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (const ff of farm.fields) {
        if (kindOf(ff) === 'greenhouse') {
          if (ff.ghSnapshot) continue
          const snap = await summarizeGreenhouse(ff)
          if (cancelled || !snap) continue
          setFarm((f) => ({ ...f, fields: f.fields.map((x) => (x.id === ff.id ? { ...x, ghSnapshot: x.ghSnapshot ?? snap } : x)) }))
          continue
        }
        if (ff.snapshot) continue
        const snap = await summarize(ff)
        if (cancelled || !snap) continue
        setFarm((f) => ({ ...f, fields: f.fields.map((x) => (x.id === ff.id ? { ...x, snapshot: x.snapshot ?? snap } : x)) }))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm.fields.length])
  // …and keep the open field's snapshot in step with what is on screen.
  // (Scenario runs are what-ifs: they never overwrite the saved plan.)
  const currentKey = fieldKey(field)
  // another field, another choice to make: the plan chosen for the last one is not carried over
  useEffect(() => setPlanKey('you'), [currentKey, site])
  const isCurrent = (x: FarmField) => fieldKey(x.field) === currentKey && kindOf(x) === site
  useEffect(() => {
    if (isGh || whatIf || !ranking[0] || !soil || !climateData || !ctx) return
    setFarm((f) => {
      const i = f.fields.findIndex(isCurrent)
      if (i < 0) return f
      const fields = [...f.fields]
      fields[i] = {
        ...fields[i], history, priorities, exclude, irrigated,
        snapshot: {
          next: ranking[0].crop.id, nextName: ranking[0].crop.name, score: ranking[0].score, plan: strategies[0]?.seq.map((e) => e.crop.id) ?? [ranking[0].crop.id],
          planNames: strategies[0]?.seq.map((e) => e.crop.name) ?? [ranking[0].crop.name], texture: soil.texture, paw100: soil.paw100,
          signal: climateData.signal.label, deficit: riskAfter(ctx.risks[ranking[0].crop.id], ranking[0].afterFallow).recent.deficit, at: new Date().toISOString(),
        },
      }
      return { ...f, fields }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranking, strategies, currentKey, farm.fields.length])
  useEffect(() => {
    if (!isGh || whatIf || !climateData) return
    const snap = greenhouseSnapshot(climateData, gh)
    setFarm((f) => {
      const i = f.fields.findIndex(isCurrent)
      if (i < 0) return f
      const fields = [...f.fields]
      fields[i] = { ...fields[i], gh, ghSnapshot: snap }
      return { ...f, fields }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGh, whatIf, climateData, gh, currentKey, farm.fields.length])
  const openFarmField = (ff: FarmField) => {
    setField(ff.field)
    setHistory(ff.history)
    setPriorities(ff.priorities)
    setExclude(ff.exclude)
    setAutoWater(false)
    setIrrigated(ff.irrigated)
    setBudgetRaw(0)
    setTexture(null)
    setLab({})
    setReplay(null)
    setSite(kindOf(ff))
    if (ff.gh) setGhSpec(ff.gh)
    setFarmOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const addCurrentToFarm = () =>
    setFarm((f) => {
      const n = f.fields.filter((x) => kindOf(x) === site).length + 1
      const name = field.label ?? (isGh ? `Greenhouse ${n}` : place?.split(',')[0] ?? `Field ${n}`)
      const base = { id: uid(), name, field, history, priorities, exclude, irrigated }
      return { ...f, fields: [...f.fields, isGh ? { ...base, kind: 'greenhouse' as const, gh } : base] }
    })

  // Fields on the same farm that could take a greenhouse roof's overflow.
  const neighbours: Neighbour[] = useMemo(
    () =>
      farm.fields
        .filter((x) => kindOf(x) === 'field' && x.field.kind === 'area')
        .map((x) => ({
          name: x.name,
          areaHa: x.field.kind === 'area' ? x.field.areaHa : 0,
          deficit: x.snapshot?.deficit ?? null,
          km: distanceM(x.field, field) / 1000,
        })),
    [farm.fields, field],
  )

  // ---------- The guided tour (≈ 3 minutes; ?demo starts it on its own) ----------
  const [touring, setTouring] = useState(false)
  // story: every height is a plate over its scene, its instrument one click deeper; work: the instruments lie open
  const story = useMode() === 'story'
  const before = useRef<{ site: SiteKind; warming: WhatIf } | null>(null)
  const startTour = () => {
    // the tour points at the instruments themselves: they have to be on the table
    setMode('work')
    mountAll()
    void import('./components/GreenhouseSection') // the tour opens the greenhouse later: its chunk is there by then
    before.current = { site, warming }
    setWarming(0)
    if (isGh) setSite('field')
    setTouring(true)
  }
  const endTour = () => {
    setTouring(false)
    if (before.current) {
      setSite(before.current.site)
      setWarming(before.current.warming)
      before.current = null
    }
  }
  // ?demo: the guided demo starts on its own once the recommendation is ready (for judges and kiosks)
  const demoAsked = useRef(new URLSearchParams(window.location.search).has('demo'))
  useEffect(() => {
    if (!demoAsked.current || !ranking[0] || !confidence) return
    demoAsked.current = false
    const t = setTimeout(startTour, 1500)
    return () => clearTimeout(t)
  }, [ranking, confidence]) // eslint-disable-line react-hooks/exhaustive-deps
  // phones keep the globe in a window below the intro - that is what the tour should show
  const globe = window.matchMedia('(min-width: 1024px)').matches ? { target: '#orbit' } : { target: '[data-tour="globe"]', block: 'center' as const }
  const tourSteps: TourStep[] = [
    { voice: 'orbit', ...globe, ms: 5000, vars: { place: field.label ?? place ?? 'your field' } },
    { voice: 'stripes', target: '[data-tour="stripes"]', block: 'center', ms: 8000, enter: () => window.dispatchEvent(new Event('zixtaro:sweep')) },
    { voice: 'field', target: '#field', ms: 5000 },
    { voice: 'roots', target: '#roots', ms: 5000 },
    { voice: 'decision', target: '[data-tour="decision"]', block: 'center', ms: 8000 },
    { voice: 'local', target: '[data-tour="local"]', block: 'center', ms: 9000 },
    { voice: 'pick', target: '[data-tour="pick"]', block: 'center', ms: 6000, vars: { crop: ranking[0]?.crop.name.toLowerCase() ?? '' } },
    { voice: 'sure', target: '[data-tour="sure"]', block: 'start', ms: 10000 },
    { voice: 'evidence', target: '[data-tour="evidence"]', block: 'start', ms: 10000 },
    { voice: 'validity', target: '[data-tour="validity"]', block: 'start', ms: 8000 },
    { voice: 'dial', target: '[data-tour="dial"]', block: 'center', ms: 5500 },
    projection
      ? { voice: 'future', target: '[data-tour="whatif"]', block: 'center', ms: 6500, enter: () => setWarming('ssp245') }
      : { voice: 'warmer', target: '[data-tour="whatif"]', block: 'center', ms: 6500, enter: () => setWarming(2) },
    { voice: 'soilhealth', target: '[data-tour="soilhealth"]', block: 'start', ms: 8000 },
    { voice: 'backtest', target: '[data-tour="backtest"]', block: 'center', ms: 6500, enter: () => setWarming(0) },
    { voice: 'greenhouse', target: '[data-tour="cutaway"]', block: 'center', ms: 9000, delay: 700, enter: () => setSite('greenhouse') },
    { voice: 'ghsure', target: '[data-tour="ghsure"]', block: 'start', ms: 9000 },
    { voice: 'end', ...globe, ms: 4500, delay: 500, enter: () => setSite('field') },
  ]

  const signal = climateData ? `${climateData.signal.label} · ${signed(climateData.means.recent.t - climateData.means.baseline.t, 1, ' °C')} since the 1980s` : null

  // The crossings' sentences: one idea each, in this field's own numbers once they are in (neutral lines until then).
  const placeShort = (field.label ?? place ?? '').split(',')[0] || 'this field'
  const cloudLines: ReactNode[] = climateData
    ? (() => {
        const dT = climateData.means.recent.t - climateData.means.baseline.t
        const dW = climateData.means.recent.cwbGS - climateData.means.baseline.cwbGS
        return [
          <>{climateData.lastYear - climateData.firstYear + 1} years of NASA sky over {placeShort}:</>,
          <>the air <em>{signed(dT, 1, ' °C')}</em> warmer,</>,
          <>each season <em>{Math.round(Math.abs(dW))} mm</em> {dW < 0 ? 'drier' : 'wetter'}.</>,
        ]
      })()
    : [<>Forty-five years of NASA sky</>, <>over {placeShort}.</>]
  const grown = history.filter((id): id is CropId => !!id).slice(-3).map((id, i) => (i === 0 ? CROP_BY_ID[id].name : CROP_BY_ID[id].name.toLowerCase()))
  const canopyLines: ReactNode[] = grown.length
    ? [<>The field itself.</>, <>The last seasons here:</>, <em>{grown.join(', ')}.</em>]
    : [<>The field itself,</>, <>and what it grew.</>]
  const pick = lead?.crop ?? null
  const reach = pick && ctx ? ctx.risks[pick.id]?.taw : undefined
  const soilLines: ReactNode[] =
    pick && reach !== undefined && pick.family !== 'none'
      ? [<><em>{Math.round(reach)} mm</em> of water within reach</>, <>of {pick.name.toLowerCase()}’s roots,</>, <><em>{pick.rootDepth.toFixed(1)} m</em> down.</>]
      : [<>Below the surface:</>, <>the water the roots can reach.</>]
  // the crossings' objects: the crop that stood here last, and a two-metre core of this field's soil
  const lastId = [...history].reverse().find((id): id is CropId => !!id)
  const lastCrop = lastId ? CROP_BY_ID[lastId] : null
  const canopyObject: ObjectSlot | undefined = lastCrop
    ? (p) => (
        <Suspense fallback={null}>
          <CanopyField progress={p} reduce={false} crop={{ id: lastCrop.id, name: lastCrop.name, color: lastCrop.color, family: lastCrop.family }} />
        </Suspense>
      )
    : undefined
  const soilObject: ObjectSlot | undefined =
    soil && pick && reach !== undefined
      ? (p) => (
          <Suspense fallback={null}>
            <SoilCore progress={p} reduce={false} layers={soil.layers} rootDepthM={pick.rootDepth} crop={{ name: pick.name, color: pick.color, family: pick.family }} pawMm={reach} />
          </Suspense>
        )
      : undefined
  // under glass: the house at dusk, lit from inside; the camera comes down through its roof into a crop row
  const ghCrop = GH_CROP_BY_ID[gh.crop]
  const ghPlan = ghReport?.result.plan
  const coverWord = ({ glass: 'glass', poly: 'polycarbonate', film2: 'double film', film: 'film' } as const)[gh.cover] ?? 'glass'
  const glassLines: ReactNode[] =
    ghPlan && ghPlan.plant !== null && ghPlan.yieldKg > 0
      ? [<>Under {coverWord},</>, <><em>{ghPlan.yieldKg.toFixed(ghPlan.yieldKg < 10 ? 1 : 0)} kg</em> of {ghCrop.name.toLowerCase()}</>, <>to the square metre.</>]
      : [<>Under {coverWord},</>, <>a climate</>, <>made by hand.</>]
  const glassObject: ObjectSlot = (p) => (
    <Suspense fallback={null}>
      <GlassHouse progress={p} reduce={false} crop={{ id: ghCrop.id, name: ghCrop.name }} lit={gh.lit} cover={gh.cover} />
    </Suspense>
  )
  // the market: the elevator the harvest is tipped at (the field's crops; a glasshouse's crates go another way)
  const sold = !isGh && mk.ctx ? marketCrops[0] : undefined
  const soldCrop = sold ? (CROP_BY_ID as Record<string, (typeof CROP_BY_ID)[CropId] | undefined>)[sold.id] : undefined
  const soldQuote = sold && mk.ctx ? mk.ctx.quotes[sold.id] : undefined
  const marketObject: ObjectSlot | undefined = soldCrop
    ? (p) => (
        <Suspense fallback={null}>
          <MarketYard progress={p} reduce={false} crop={{ id: soldCrop.id, name: soldCrop.name, color: soldCrop.color, group: soldCrop.group }} />
        </Suspense>
      )
    : undefined
  const marketLines: ReactNode[] = !soldCrop
    ? []
    : soldQuote && soldQuote.route.mode !== 'local' && soldQuote.market !== mk.ctx?.home
      ? [<>The harvest leaves the field:</>, <><em>{(Math.round(soldQuote.route.km / 10) * 10).toLocaleString('en-US')} km</em> {soldQuote.route.mode === 'sea' ? 'by sea' : soldQuote.route.mode === 'air' ? 'by air' : 'by road'}</>, <>to its buyer.</>]
      : [<>The harvest leaves the field</>, <>for the <em>home market</em>.</>]
  // the deck the camera sinks through on its way down to the field
  const cloudObject: ObjectSlot = (p) => (
    <Suspense fallback={null}>
      <CloudDeck progress={p} reduce={false} />
    </Suspense>
  )
  const scenarioUrl = `${window.location.origin}${window.location.pathname}${scenarioHash(scenario)}`

  // The story is laid out in the order a farmer works in: choose the field (the hero), say what grew on it and what
  // matters, see what the weather and the soil are doing, get the answer. The descent "by altitude" - ground, air,
  // field, roots, with a pinned scene between each - put the farmer's own inputs fourth and the answer on the first
  // screen. Ground and market are off this path; the workbench (?view=workbench) and the greenhouse keep the old order.
  const linear = story && !isGh
  const groundEl = parts >= 1 ? <GroundSection over={!linear && !!cloudLines?.length} field={field} terrain={terrain} forecast={forecast} /> : <Pending id="ground" />
  const airEl = parts >= 2 ? <ClimateSection state={climate} daily={daily} forecast={forecast} onRetry={retry} pick={isGh ? null : lead?.crop ?? null} /> : <Pending id="air" />
  const fieldEl = parts < 3 ? <Pending id="field" /> : <FieldSection
              over={!linear && !!canopyLines?.length}
              history={history}
              setHistory={setHistory}
              priorities={priorities}
              setPriorities={setPriorities}
              exclude={exclude}
              setExclude={setExclude}
              water={water}
              next={lead}
              ranking={ranking}
              onGreenhouse={() => switchSite('greenhouse')}
              lat={field.lat}
              lon={field.lon}
              hemisphere={climateData?.season.hemisphere ?? null}
            />
  const soilEl = parts < 4 ? <Pending id="roots" /> : <SoilSection over={!linear && soilLines.length > 0} field={field} progress={soilProgress} state={soilState} soil={soil} texture={texture} setTexture={setTexture} lab={lab} setLab={setLab} climate={climateData} roots={roots} presetId={preset?.id ?? null} />
  const planEl = parts < 5 ? <Pending id="plan" /> : ctx && climateData && ranking.length > 0 ? (
              <PlanSection
                onScienceOnly={setScienceOnly}
                marketChip={mk.ctx && <MarketChip ctx={mk.ctx} mode={market} onMode={setMarket} guessed={mk.guessed} />}
                ranking={ranking}
                baseRanking={baseRanking}
                strategies={strategies}
                planKey={planKey}
                onPlan={setPlanKey}
                ctx={ctx}
                climate={climateData}
                replay={replay}
                setReplay={setReplay}
                irrigated={irrigated}
                water={water}
                excludedCount={exclude.length}
                warming={whatIf}
                setWarming={setWarming}
                projection={projection}
                history={history}
                areaHa={field.kind === 'area' ? field.areaHa : null}
                priorities={weights}
                exclude={exclude}
                daily={daily.status === 'ready' ? daily.data : null}
                lat={field.lat}
                lon={field.lon}
                confidence={confidence}
                sens={sens}
                sources={sources}
                co2On={co2On}
                sowing={sowing}
                forecast={forecast.status === 'ready' ? forecast.data : null}
                causal={causal}
                presetId={preset?.id ?? null}
                setCo2On={setCo2On}
                scale={scaleNote(field, soil)}
                elevation={terrain.status === 'ready' ? terrain.data.elevation : null}
                local={local}
                scenarioId={scenarioKey}
                sobol={sobol}
              />
            ) : (
              <section id="plan" className="sec-plan scroll-mt-16 px-5 pt-16 pb-16 sm:pt-24 sm:pb-20 sm:px-8 lg:pl-28 xl:pl-36">
                <div className="mx-auto max-w-[1240px]">
                  <SectionHeader
                    kicker="Resurface"
                    altitude="▲ back to 0 m"
                    title={ranking.length === 0 && ctx ? 'Switch at least one crop back on.' : 'Putting your plan together…'}
                    dek={ranking.length === 0 && ctx ? 'Every crop is switched off in “What can you grow?”.' : 'Usually a few seconds. If the soil service is slow, the plan starts from a typical soil and refines itself.'}
                  />
                  {!ctx && (
                    <div className="panel mt-10 max-w-xl space-y-3 p-5">
                      {[
                        { label: '45 years of NASA climate for this field', st: climate.status },
                        { label: soilProgress.total > 1 ? `Soil under the field (${soilProgress.done}/${soilProgress.total} samples)` : 'Soil under the field', st: soil ? 'ready' : 'loading' },
                      ].map((s) => (
                        <div key={s.label} className="flex items-center gap-3 text-[15px]">
                          <span className={`h-2.5 w-2.5 rounded-full ${s.st === 'ready' ? 'bg-leaf' : s.st === 'error' ? 'bg-heat' : 'animate-pulse bg-wheat'}`} />
                          <span className={s.st === 'ready' ? 'text-ink' : 'text-ink-2'}>{s.label}</span>
                          <span className="ml-auto font-mono text-xs text-ink-3">{s.st === 'ready' ? 'done' : s.st === 'error' ? 'failed' : 'loading…'}</span>
                        </div>
                      ))}
                      {climate.status === 'error' && (
                        <button onClick={retry} className="mt-2 rounded-full border border-white/20 px-4 py-2 text-sm text-ink hover:border-white/40">
                          Try NASA POWER again
                        </button>
                      )}
                      <Skeleton className="h-2" />
                    </div>
                  )}
                </div>
              </section>
            )
  const stops = linear ? FLOW_STOPS : STOPS[site]

  return (
    <div className="grain min-h-screen">
      <Atmosphere />
      <Ascent />
      <Cursor />
      <a href="#plan" className="sr-only z-[100] rounded-full bg-leaf px-4 py-2 text-sm text-[#0a0b0e] focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to the recommendation</a>
      <TopBar stops={stops} place={field.label ?? place} lat={field.lat} lon={field.lon} farmCount={farm.fields.length} onFarm={() => setFarmOpen(true)} onMethod={() => openMethod()} canPrint={isGh ? !!ghReport : !!ctx} answer={topAnswer} />
      {route.page === 'method' && <MethodPage site={site} place={field.label ?? place} tab={route.tab} onTab={openMethod} onClose={closeMethod} />}
      {route.page === 'legal' && <LegalPage site={site} place={field.label ?? place} tab={route.tab} onTab={openLegal} onClose={closeMethod} />}
      <FarmDrawer open={farmOpen} onClose={() => setFarmOpen(false)} farm={farm} setFarm={setFarm} isCurrent={isCurrent} site={site} onOpenField={openFarmField} onAddCurrent={addCurrentToFarm} />
      <Altimeter stops={stops} />
      <AltimeterBar stops={stops} hidden={touring || route.page !== 'main'} />
      {touring && <Tour steps={tourSteps} onExit={endTour} />}
      <main className="screen-only">
        <Hero
          field={field}
          place={place}
          presetId={preset?.id ?? null}
          signal={signal}
          weather={forecast.status === 'ready' ? forecast.data.now : null}
          samples={samples}
          soilProgress={soilProgress}
          onField={chooseField}
          onPreset={choosePreset}
          site={site}
          onSite={switchSite}
          onTour={startTour}
          answer={topAnswer}
        />
        {linear ? (
          <>
            {fieldEl}
            {airEl}
            {soilEl}
            {planEl}
          </>
        ) : (
        <>
        <Boundary fallback={null}><DescentBand kind="clouds" lines={cloudLines} object={cloudObject} tail={story && parts >= 1} /></Boundary>
        {groundEl}
        {airEl}
        <AnimatePresence mode="wait" initial={false}>
        <motion.div key={site} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
        {isGh ? (
          <>
          <Boundary fallback={null}><DescentBand kind="glass" lines={glassLines} object={glassObject} tail={story && parts >= 3} /></Boundary>
          {parts < 3 ? <Pending id="house" /> : <GreenhouseSection
            over={glassLines.length > 0}
            climate={climateData}
            plan={planClimate}
            spec={gh}
            setSpec={setGhSpecByUser}
            prices={ghPrices}
            setPrices={setPrices}
            report={ghReport}
            priorities={ghPriorities}
            setPriorities={setGhPriorities}
            exclude={ghExclude}
            setExclude={setGhExclude}
            country={country}
            energy={energy}
            pricesEdited={pricesEdited}
            resetPrices={() => {
              setPricesEdited(false)
              setPricesRaw((p) => ({ ...p, heat: energy.heat, power: energy.power }))
            }}
            warming={whatIf}
            setWarming={setWarming}
            projection={projection}
            areaFromOutline={areaFromOutline}
            neighbours={neighbours}
            onField={() => switchSite('field')}
          />}
          </>
        ) : (
          <>
            <Boundary fallback={null}><DescentBand kind="canopy" lines={canopyLines} object={canopyObject} tail={story && parts >= 3} /></Boundary>
            {fieldEl}
            <Boundary fallback={null}><DescentBand kind="soil" lines={soilLines} object={soilObject} tail={story && parts >= 4} /></Boundary>
            {soilEl}
            {planEl}
          </>
        )}
        </motion.div>
        </AnimatePresence>
        {marketObject && <Boundary fallback={null}><DescentBand kind="market" lines={marketLines} object={marketObject} tail={story && parts >= 6} /></Boundary>}
        {parts >= 6 && mk.ctx ? (
          <MarketSection
            over={!!marketObject && marketLines.length > 0}
            site={isGh ? 'greenhouse' : 'field'}
            ctx={mk.ctx}
            mode={market}
            setMode={setMarket}
            own={marketOwn}
            setOwn={setMarketOwn}
            sea={mk.sea}
            origin={[field.lon, field.lat]}
            crops={marketCrops}
            guessed={mk.guessed}
            toCity={toCity}
          />
        ) : <Pending id="market" />}
        </>
        )}
      </main>
      {parts >= 6 && <SiteFooter />}
      {parts >= 7 && reportsDue && isGh && ghReport && climateData && (
        <GreenhouseReport
          field={field}
          place={place}
          climate={climateData}
          plan={planClimate ?? climateData}
          scenarioId={scenarioKey}
          result={ghReport.result}
          ranking={ghReport.ranking}
          opts={ghOpts}
          prices={ghPrices}
          whatIf={whatIf ? whatIfExplain(whatIf, projection, climateData.recent) : ''}
          scenarioUrl={scenarioUrl}
        />
      )}
      {parts >= 7 && reportsDue && !isGh && ctx && climateData && soil && ranking[0] && (
        <PrintReport
          field={field}
          place={place}
          climate={climateData}
          daily={daily.status === 'ready' ? daily.data : null}
          soil={soil}
          terrain={terrain.status === 'ready' ? terrain.data : null}
          forecast={forecast.status === 'ready' ? forecast.data : null}
          ranking={ranking}
          strategies={strategies}
          plan={reportPlan}
          ctx={ctx}
          replay={replay}
          whatIf={whatIf && climateData ? whatIfExplain(whatIf, projection, climateData.recent, co2On) : ''}
          scenarioUrl={scenarioUrl}

          confidence={confidence}
          local={local?.here ?? null}
          scenarioId={scenarioKey}
        />
      )}
    </div>
  )
}

// "Method" is its own page, opened from the top bar (?page=method): how Zixtaro turns NASA data into advice,
// every data set, the honest limits, the full parameter registry and what farmers told the design. It lies over
// the main page, which keeps its scroll position underneath, so "Back" returns exactly where the reader was.
//
// Its one idea is the site's own: THE RECEIPT CORE. The chain from satellite to advice is drawn as a core drilled
// down through its strata - orbit, air, soil, harvest, rotation, you - and the drill follows the reader's scroll,
// lighting the stratum being read; each stratum names the data sets it is made of. The data sets are laid on a ruler
// of scale, from a 300 km satellite footprint down to a street-level panorama. Every figure on the page is read from
// the registry and the validation record, never typed in.
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import raw from '../data/validation.json'
import { PARAMS } from '../lib/evidence'
import { useEdgeFade } from '../lib/hooks'
import { NOT_USED, ORBIT_AND_GROUND, ORBIT_WORDS, SOIL_WORDS, WATER_WORDS, type Word } from '../lib/glossary'
import { EvidenceRegistry } from './EvidenceRegistry'
import { MethodFilmstrip } from './MethodFilmstrip'
import { FarmerEvidence } from './ScienceCards'
import { MethodHead } from './MethodHead'
import { ValidationPage } from './ValidationPage'
import { Logo } from './ui'
import { openLegal, type MethodTab } from '../lib/nav'

/** a step of the greenhouse chain (the field's chain is the filmstrip) */
type Step = { k: string; v: string; col: string; feeds: string[] }

const GH_CHAIN: Step[] = [
  { k: 'NASA POWER', v: 'Sunlight (CERES) and air temperature over the roof, every month since 1981', col: 'var(--color-orbit)', feeds: ['NASA POWER (monthly & daily)'] },
  { k: 'Light', v: 'Sunlight through the cover → daily light for the crop; lamps top up what is missing', col: 'var(--color-wheat)', feeds: ['NASA POWER (monthly & daily)'] },
  { k: 'Heat', v: 'Heat lost through the cover hour by hour on a typical day → boiler kWh, minus sun and lamp heat', col: 'var(--color-heat)', feeds: ['NASA POWER (monthly & daily)'] },
  { k: 'Calendar', v: 'Every planting month and season length is tried; the best run wins, or the house stays empty', col: 'var(--color-leaf)', feeds: [] },
  { k: 'Money', v: 'EU monthly prices (DG AGRI), national energy prices (Eurostat), picking labour and CO₂', col: 'var(--color-water)', feeds: ['DG AGRI & Eurostat'] },
  { k: 'Your priorities', v: 'Profit, climate and steady income → one score you can take apart', col: 'var(--color-ink)', feeds: [] },
]

/** The same NASA record, used more ways. */
const EXTRAS: { k: string; v: string }[] = [
  { k: 'What-if & 2050s', v: 'The recent decade re-run 1-3 °C warmer, or with NASA NEX-GDDP-CMIP6 monthly changes for 2046-2055 (SSP2-4.5 / SSP5-8.5)' },
  { k: 'Nitrogen & CO₂e', v: 'Legume credits → fertiliser saved → field N₂O (IPCC 2019 default) plus the emissions of making the fertiliser' },
  { k: 'Backtest', v: 'Every past season re-run with only the NASA data a farmer had two years before harvest, then scored on the weather that came' },
  { k: 'Soil carbon & cover', v: 'IPCC 2006 residues → ICBM soil carbon at this field’s NASA POWER pace; crop cover against heavy daily rain' },
  { k: 'Nitrate & water', v: 'Winter drainage from the bucket → nitrate leaching (Burns 1974); GRACE-FO regional water store against the irrigation budget' },
  { k: 'Heat & frost, daily', v: 'NASA POWER daily highs at flowering against each crop’s critical temperature; frost after emergence; sowing dates re-run' },
  { k: 'Markets', v: 'FAOSTAT farm-gate prices country by country, freight by road, sea or air, import duty and spoilage on the way' },
  { k: 'Trust', v: 'Seeded Monte Carlo, Shapley and Sobol attribution, a MERRA-2 cross-check, a leakage-free backtest and a registry of every parameter’s source' },
]

/**
 * `km`: the ground size of one cell or pixel, for the ruler of scale - an approximation (≈) of the resolution beside
 * it, and only for gridded data; country tables, EU series and panoramas have none.
 */
const SOURCES: { name: string; what: string; res: string; link: string; km?: number; short: string }[] = [
  { name: 'NASA POWER (monthly & daily)', short: 'POWER', what: 'Rain, temperature, radiation, humidity, wind; frost dates, hot days, dry spells; greenhouse light and heat', res: '0.5° × 0.625° · 1981→', link: 'https://power.larc.nasa.gov', km: 50 },
  { name: 'NASA MERRA-2 GWETROOT', short: 'MERRA-2', what: 'Root-zone soil wetness, via POWER: the drought signal', res: '≈ 50 km · monthly', link: 'https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/', km: 50 },
  { name: 'NASA GPM IMERG', short: 'IMERG', what: 'Rain measured from orbit since 2001: a second rain record beside POWER’s, and the rain layer on the globe', res: '0.1° · 2001→', link: 'https://gpm.nasa.gov/data/imerg', km: 10 },
  { name: 'NASA SMAP L4 (GIBS)', short: 'SMAP', what: 'Root-zone soil moisture map layer and time-lapse', res: '9 km · daily · 2015→', link: 'https://smap.jpl.nasa.gov', km: 9 },
  { name: 'NASA MODIS NDVI & LST (GIBS)', short: 'MODIS', what: 'Vegetation greenness and land-surface temperature layers; past seasons read from space', res: '250 m / 1 km', link: 'https://earthdata.nasa.gov/gibs', km: 0.25 },
  { name: 'NASA VIIRS true colour (GIBS)', short: 'VIIRS', what: 'Yesterday’s view from orbit, clouds and all', res: '375 m · daily', link: 'https://earthdata.nasa.gov/gibs', km: 0.375 },
  { name: 'NASA GRACE / GRACE-FO', short: 'GRACE-FO', what: 'Regional total water storage since 2002: is the region losing groundwater?', res: '≈ 300 km · monthly', link: 'https://grace.jpl.nasa.gov', km: 300 },
  { name: 'NASA NEX-GDDP-CMIP6', short: 'NEX-GDDP', what: '2050s month-by-month temperature and rain changes, 3 models, SSP2-4.5 / SSP5-8.5 (pre-baked for the demo fields)', res: '0.25° · daily', link: 'https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6', km: 25 },
  { name: 'ISRIC SoilGrids 2.0', short: 'SoilGrids', what: 'Sand, silt, clay, organic carbon, pH and bulk density to 2 m (1-5 samples per field)', res: '250 m', link: 'https://soilgrids.org', km: 0.25 },
  { name: 'FAOSTAT & CROPGRIDS', short: 'CROPGRIDS', what: 'Farm-gate prices and yields by country; what farms grow in each 0.5° cell', res: 'country · 0.5°', link: 'https://www.fao.org/faostat/', km: 55 },
  { name: 'DG AGRI & Eurostat', short: 'DG AGRI', what: 'Monthly EU greenhouse vegetable prices; glasshouse yields and areas; gas and electricity prices', res: 'EU · monthly', link: 'https://agridata.ec.europa.eu' },
  { name: 'Open-Meteo', short: 'Open-Meteo', what: 'Weather now and the 16-day outlook, with FAO ET₀ and soil moisture', res: '1-11 km models', link: 'https://open-meteo.com', km: 4 },
  { name: 'AWS Terrain Tiles (SRTM)', short: 'SRTM', what: 'Elevation, slope and aspect of the field; 3D relief', res: '≈ 30 m', link: 'https://registry.opendata.aws/terrain-tiles/', km: 0.03 },
  { name: 'Google Street View', short: 'Street View', what: 'Roadside ground truth, aimed at the field', res: 'panoramas', link: 'https://www.google.com/streetview/' },
  { name: 'Sentinel-2 cloudless (ESA Copernicus, EOX) · OSM Nominatim', short: 'Sentinel-2', what: 'Basemap imagery (Lithuania: the national orthophoto); place search and boundaries', res: '10 m', link: 'https://s2maps.eu', km: 0.01 },
]

const FIELD_LIMITS = [
  'The climate signal is regional (a ~50 km NASA POWER cell), not a measurement on your field; the soil is modelled at 250 m.',
  'The water model runs in 10-day steps on monthly data. It ranks crops against each other well; absolute yields need local calibration.',
  'Crop calendars are temperate (shifted six months south of the equator) or follow the rains in the tropics and the monsoon belt. The plan has one main crop a year.',
  'Prices are national farm-gate records (FAOSTAT) and costs are rounded typical values: a yardstick to compare crops. Put in your own prices (Market → your own prices) before real decisions.',
  'Soil carbon shows what a change of rotation would do compared with farming as now (ICBM, calibrated in Sweden, ±30 % on residues) - not a measured or forecast stock.',
  'Nitrate leaching, bare-soil storm exposure and winter kill are risk indices for comparing rotations, built on typical values, not field measurements.',
  'Heat at flowering uses a fixed critical temperature per crop; the variety, humidity and irrigation cooling shift it.',
  'Rotation rules follow common agronomic guidance; your agronomist and your own field records outrank them.',
]

const GH_LIMITS = [
  'The greenhouse model is a monthly estimate with an hourly heat balance on a typical day: heating, lamps, venting, CO₂ dosing and picking labour are in; heat storage, disease and fine climate control are not.',
  'Greenhouse yields are calibrated on Dutch and Spanish records; check its kilos per m² against your own house before investing.',
  'Herbs have no open market price: the model needs the price your buyer pays.',
]

const SHARED_LIMITS = [
  'The +1…+3 °C runs shift observed seasons: stress tests, not forecasts. The 2050s runs add NEX-GDDP-CMIP6 changes (mean of three models, spread shown) to today’s weather pattern and exist only for the demo fields.',
  'Markets: freight, duty and spoilage are typical rates; quotas, plant-health bans, currency risk and quality premiums are not modelled.',
  'Street View coverage of farmland is patchy and the panorama may be years old; the forecast is a model, not a promise.',
]

const TABS: { id: MethodTab; label: string }[] = [
  { id: 'how', label: 'How it works' },
  { id: 'data', label: 'Data' },
  { id: 'limits', label: 'Limits' },
  { id: 'validation', label: 'Validation' },
  { id: 'registry', label: 'Every number' },
  { id: 'farmers', label: 'Farmers' },
  { id: 'words', label: 'Words' },
]

// the validation record's headline draw - the same one the Validation tab leads with
type Head = { label: string; date: string; cells: number; top3: number; meanRank: number; chance?: number }
const VR = raw as unknown as { tests: (Head & { id: string })[]; pooled: Head | null }
const HEAD: Head = VR.tests.find((t) => t.id === 'checkE') ?? VR.tests.find((t) => t.id === 'checkD') ?? VR.pooled ?? VR.tests[VR.tests.length - 1]
const TESTED = PARAMS.filter((p) => p.checked === 'tested').length

function ModelSwitch({ kind, setKind }: { kind: 'field' | 'greenhouse'; setKind: (k: 'field' | 'greenhouse') => void }) {
  return (
    <div className="flex items-center border border-ink/15" role="group" aria-label="Which model">
      {(['field', 'greenhouse'] as const).map((k) => (
        <button
          key={k}
          onClick={() => setKind(k)}
          aria-pressed={kind === k}
          className={`px-4 py-2 font-mono text-xs tracking-wide uppercase transition ${kind === k ? 'bg-leaf text-void' : 'text-ink-3 hover:text-ink'}`}
        >
          {k === 'field' ? 'Fields' : 'Greenhouses'}
        </button>
      ))}
    </div>
  )
}

/** the data sets on a ruler of scale: one cell of each, from a satellite's 300 km to a sub-metre photograph */
function ScaleRuler() {
  const gridded = SOURCES.filter((s) => s.km !== undefined).sort((a, b) => (b.km ?? 0) - (a.km ?? 0))
  const lo = Math.log10(0.0004)
  const hi = Math.log10(500)
  const x = (km: number) => ((hi - Math.log10(km)) / (hi - lo)) * 100
  const ticks: [number, string][] = [[300, '300 km'], [30, '30 km'], [3, '3 km'], [0.3, '300 m'], [0.03, '30 m'], [0.003, '3 m']]
  const RULE = 84
  // four label lanes, two above the rule and two below, taken in turn: neighbours never share a lane
  const LANES = [{ y: 6, up: true }, { y: RULE + 40, up: false }, { y: 30, up: true }, { y: RULE + 62, up: false }]
  return (
    <figure className="mt-12">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-voice text-[22px] text-ink-2 italic">One cell of each, coarse to fine.</span>
        <span className="font-mono text-[11px] text-ink-4">ground size of one grid cell or pixel · log scale · ≈</span>
      </figcaption>
      <div className="mt-6 overflow-x-auto [scrollbar-width:none]">
        <div className="relative min-w-[680px]" style={{ height: RULE + 102 }} role="img" aria-label={gridded.map((s) => `${s.name}: ${s.res}`).join('; ')}>
          <div className="absolute inset-x-0 h-px bg-ink/30" style={{ top: RULE }} />
          {ticks.map(([km, l]) => (
            <span key={l}>
              <span className="absolute w-px bg-ink/[0.08]" style={{ left: `${x(km)}%`, top: 0, height: RULE + 82 }} />
              <span className="absolute h-[9px] w-px bg-ink/40" style={{ left: `${x(km)}%`, top: RULE - 4 }} />
              <span className="absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap text-ink-4" style={{ left: `${x(km)}%`, top: RULE + 86 }}>{l}</span>
            </span>
          ))}
          {gridded.map((s, i) => {
            const lane = LANES[i % 4]
            const px = x(s.km ?? 1)
            const stemTop = lane.up ? lane.y + 17 : RULE
            const stemH = lane.up ? RULE - lane.y - 17 : lane.y - RULE - 3
            return (
              <span key={s.name}>
                <span className="absolute w-px bg-leaf/45" style={{ left: `${px}%`, top: stemTop, height: stemH }} />
                <span className="absolute h-[7px] w-[7px] -translate-x-[3px] bg-leaf" style={{ left: `${px}%`, top: RULE - 3 }} />
                <span className={`absolute font-mono text-[11px] whitespace-nowrap text-ink-2 ${px > 82 ? '-translate-x-full' : px > 6 ? '-translate-x-1/2' : ''}`} style={{ left: `${px}%`, top: lane.y }}>
                  {s.short}
                </span>
              </span>
            )
          })}
        </div>
      </div>
    </figure>
  )
}

/** dictionary entries on hairlines: the word, what it means, and where the page uses it */
function Words({ items }: { items: Word[] }) {
  return (
    <dl className="mt-8 grid border-t border-ink/15 lg:grid-cols-2 lg:gap-x-12">
      {items.map((w) => (
        <div key={w.term} className="border-b border-ink/10 py-6">
          <dt className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[17px] text-ink">{w.term}</span>
            {w.from && <span translate="no" className="notranslate font-mono text-[10px] tracking-[0.08em] text-orbit uppercase">{w.from}</span>}
          </dt>
          <dd className="mt-2">
            <p className="max-w-[62ch] text-[14.5px] leading-relaxed text-pretty text-ink-2">{w.means}</p>
            <p className="mt-2.5 flex max-w-[62ch] gap-2 text-[13px] leading-relaxed text-ink-3">
              <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-4 uppercase">here</span>
              <span>{w.here}</span>
            </p>
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function MethodPage({ site, place, tab, onTab, onClose }: { site: 'field' | 'greenhouse'; place: string | null; tab: MethodTab; onTab: (t: MethodTab) => void; onClose: () => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const navFade = useEdgeFade<HTMLElement>()
  const [kind, setKind] = useState<'field' | 'greenhouse'>(site)

  // the page under it stays where it was; only this one scrolls
  useEffect(() => {
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    // the app under the dialog leaves the tab order and the accessibility tree: Tab and a screen reader stay here,
    // not in 250 controls the reader cannot see
    const behind = [...(scroller.current?.parentElement?.children ?? [])].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== scroller.current && !el.inert)
    behind.forEach((el) => (el.inert = true))
    back.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      html.style.overflow = prev
      behind.forEach((el) => (el.inert = false))
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [tab])

  const limits = [...(kind === 'greenhouse' ? GH_LIMITS : FIELD_LIMITS), ...SHARED_LIMITS]
  const backTo = site === 'greenhouse' ? 'Back to the greenhouse' : 'Back to the field'
  const figures: { v: string; unit?: string; l: string }[] = [
    { v: String(SOURCES.length), l: 'open data sets, NASA’s first - each named, each linked' },
    { v: '1981', unit: '→', l: 'every season since is re-run for the field, month by month' },
    { v: String(PARAMS.length), l: `numbers in the registry, each with its source; ${TESTED} held to it by a test` },
    { v: String(Math.round(HEAD.top3 * 100)), unit: '%', l: `top-3 on ${HEAD.cells} farming regions it never saw (${HEAD.date})` },
  ]

  return (
    <div ref={scroller} role="dialog" aria-modal="true" aria-label="Method" className="grain fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-void" data-lenis-prevent>
      <header className="sticky top-0 z-20 border-b border-ink/10 bg-void">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-8">
          <button ref={back} onClick={onClose} className="flex min-h-[40px] min-w-0 items-center gap-2 border border-ink/15 px-3.5 py-2 text-sm text-ink-2 transition hover:border-ink/40 hover:text-ink">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{backTo}</span>
            {place && <span className="hidden truncate text-ink-3 md:inline">· {place}</span>}
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 text-sm text-ink-2 sm:flex">
              <Logo className="h-6 w-6" />
              <span translate="no" className="notranslate font-display-soft text-[19px] leading-none text-ink">Zixtaro</span>
              <span className="text-ink-4">/</span>
              <span>Method</span>
            </span>
          </div>
        </div>
        <nav ref={navFade} aria-label="Method sections" className="edge-fade mx-auto flex max-w-[1240px] gap-6 overflow-x-auto px-4 [scrollbar-width:none] sm:px-8">
          {TABS.map((t, i) => {
            const on = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`relative flex shrink-0 items-baseline gap-2 py-3 text-sm whitespace-nowrap transition ${on ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}
              >
                <span className={`font-mono text-[10px] ${on ? 'text-leaf' : 'text-ink-4'}`}>0{i + 1}</span>
                {t.label}
                {on && <motion.span layoutId="method-tab" className="absolute inset-x-0 -bottom-px h-[2px] bg-leaf" />}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pt-12 pb-24 sm:px-8 sm:pt-20">
        {tab === 'how' && (
          <>
            <MethodHead thing="satellite" label="The satellite" note="where the chain starts">
              <div className="font-mono text-xs tracking-[0.18em] text-ink-3 uppercase">Method · how the advice is made</div>
              <h1 className="font-display-soft mt-5 max-w-[14ch] text-[clamp(3rem,6.8vw,7rem)] leading-[0.86] uppercase">
                Every number has a <em className="font-voice text-leaf normal-case">receipt.</em>
              </h1>
              <p className="mt-8 max-w-[52ch] font-voice text-[clamp(1.25rem,2vw,1.6rem)] leading-snug text-ink-2 italic">
                Zixtaro is deliberately not a black box. Here is the whole chain, from the satellite down to the advice - and, under Limits, what it cannot do.
              </p>
            </MethodHead>

            {/* the record, in four figures - each read from the registry and the validation record */}
            <dl className="mt-14 grid grid-cols-2 border-t border-ink/15 lg:grid-cols-4">
              {figures.map((f, i) => (
                <div key={f.l} className={`relative py-6 pr-6 ${i % 2 ? 'pl-6' : ''} ${i > 1 ? 'border-t border-ink/15 lg:border-t-0' : ''} ${i ? 'lg:border-l lg:border-ink/15 lg:pl-6' : ''} ${i % 2 ? 'border-l border-ink/15' : ''}`}>
                  {i === figures.length - 1 && (
                    <span aria-hidden className="pointer-events-none absolute -inset-x-10 -inset-y-8" style={{ background: 'radial-gradient(50% 55% at 38% 42%, color-mix(in oklab, var(--color-wheat) 22%, transparent), transparent 72%)' }} />
                  )}
                  <dd className={`relative font-display-soft text-[clamp(3rem,6vw,5.2rem)] leading-[0.85] tabular-nums ${i === figures.length - 1 ? 'text-ink' : 'text-ink-2'}`}>
                    {f.v}
                    {f.unit && <span className="ml-1 font-mono text-lg text-leaf">{f.unit}</span>}
                  </dd>
                  <dt className="relative mt-3 max-w-[26ch] font-mono text-[11px] leading-relaxed text-ink-3">{f.l}</dt>
                </div>
              ))}
            </dl>

            <h2 className="mt-28 font-display-soft text-[clamp(2rem,4.4vw,4rem)] leading-[0.9] uppercase">
              From orbit <em className="font-voice text-leaf normal-case">to the pick</em>
            </h2>
            <MethodFilmstrip scroller={scroller} />

            {/* the greenhouse runs the same record through its own chain */}
            <h2 className="mt-24 font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase">
              Under glass, <em className="font-voice text-leaf normal-case">the same record</em>
            </h2>
            <ol className="mt-8 grid border-t border-ink/15 sm:grid-cols-2 lg:grid-cols-3">
              {GH_CHAIN.map((s, i) => (
                <li key={s.k} className="border-b border-ink/10 py-6 sm:pr-8">
                  <div className="font-mono text-[10px] text-ink-4">{String(i + 1).padStart(2, '0')}</div>
                  <div className="mt-2 text-[16px] text-ink">{s.k}</div>
                  <div className="mt-2 max-w-[44ch] text-[13.5px] leading-relaxed text-pretty text-ink-2">{s.v}</div>
                </li>
              ))}
            </ol>

            <h2 className="mt-24 font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase">
              The same record, <em className="font-voice text-leaf normal-case">used more ways</em>
            </h2>
            <ol className="mt-8 grid border-t border-ink/15 sm:grid-cols-2 xl:grid-cols-4">
              {EXTRAS.map((s, i) => (
                <li key={s.k} className="border-b border-ink/10 py-6 sm:pr-6 [&:nth-child(even)]:sm:border-l [&:nth-child(even)]:sm:border-ink/10 [&:nth-child(even)]:sm:pl-6 xl:[&:not(:nth-child(4n+1))]:border-l xl:[&:not(:nth-child(4n+1))]:border-ink/10 xl:[&:not(:nth-child(4n+1))]:pl-6">
                  <div className="font-mono text-[10px] text-leaf">{String.fromCharCode(65 + i)}</div>
                  <div className="mt-2 text-[16px] text-ink">{s.k}</div>
                  <div className="mt-2 text-[13.5px] leading-relaxed text-pretty text-ink-2">{s.v}</div>
                </li>
              ))}
            </ol>
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs">
              {([['data', 'All data sets'], ['limits', 'What it cannot do'], ['validation', 'How it was tested']] as [MethodTab, string][]).map(([t, l]) => (
                <button key={t} onClick={() => onTab(t)} className="group flex items-center gap-2 border-b border-ink/25 pb-1 text-ink-2 transition hover:border-leaf hover:text-ink">
                  {l} <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-leaf" aria-hidden />
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'data' && (
          <>
            <MethodHead thing="layers" label="One field" note="as the layers known about it">
              <div className="font-mono text-xs tracking-[0.18em] text-ink-3 uppercase">Method · data</div>
              <h1 className="font-display-soft mt-5 max-w-[16ch] text-[clamp(2.6rem,6.4vw,6rem)] leading-[0.88] uppercase">
                Where the data <em className="font-voice text-leaf normal-case">comes from</em>
              </h1>
              <p className="mt-6 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">NASA records first; every other source is open and named. Tap a name to open it.</p>
            </MethodHead>
            <ScaleRuler />
            <ol className="mt-12 border-t border-ink/15">
              {SOURCES.map((s, i) => (
                <li key={s.name} className="grid gap-x-8 gap-y-1 border-b border-ink/10 py-5 sm:grid-cols-[2.2rem_minmax(0,1fr)_minmax(0,1.5fr)_10rem]">
                  <span className="font-mono text-[11px] text-ink-4">{String(i + 1).padStart(2, '0')}</span>
                  <a href={s.link} target="_blank" rel="noreferrer" className="group flex items-start gap-1.5 text-[15px] text-ink underline decoration-ink/15 underline-offset-4 hover:text-leaf hover:decoration-leaf/60">
                    {s.name}
                    <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-4 transition group-hover:text-leaf" aria-hidden />
                  </a>
                  <span className="text-[14px] leading-relaxed text-ink-2">{s.what}</span>
                  <span className="font-mono text-xs text-ink-3 sm:text-right">{s.res}</span>
                </li>
              ))}
            </ol>

            <h2 className="mt-24 font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase">
              Named in the challenge, <em className="font-voice text-wheat normal-case">not used here</em>
            </h2>
            <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-ink-2">A record left out is a gap in the picture. These are the ones, and the reason for each.</p>
            <ol className="mt-8 grid border-t border-ink/15 lg:grid-cols-2 lg:gap-x-12">
              {NOT_USED.map((n, i) => (
                <li key={n.name} className="flex gap-5 border-b border-ink/10 py-6">
                  <span className="font-mono text-[11px] text-wheat">N{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <div translate="no" className="notranslate text-[16px] text-ink">{n.name}</div>
                    <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed text-pretty text-ink-2">{n.why}</p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        {tab === 'limits' && (
          <>
            <MethodHead thing="rule" label="A folding rule" note="a measure has an end">
              <div className="font-mono text-xs tracking-[0.18em] text-ink-3 uppercase">Method · limits</div>
              <h1 className="font-display-soft mt-5 max-w-[14ch] text-[clamp(2.6rem,6.4vw,6rem)] leading-[0.88] uppercase">
                What it <em className="font-voice text-wheat normal-case">cannot</em> do
              </h1>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-[52ch] font-voice text-[22px] leading-snug text-ink-2 italic">
                  Honest limits of the {kind === 'greenhouse' ? 'greenhouse' : 'field'} model. Read them before you act on a number.
                </p>
                <ModelSwitch kind={kind} setKind={setKind} />
              </div>
            </MethodHead>
            <ol className="mt-10 grid border-t border-ink/15 lg:grid-cols-2 lg:gap-x-12">
              {limits.map((l, i) => (
                <li key={l} className="flex gap-5 border-b border-ink/10 py-6">
                  <span className="font-mono text-[11px] text-wheat">L{String(i + 1).padStart(2, '0')}</span>
                  <span className="max-w-[62ch] text-[15px] leading-relaxed text-pretty text-ink-2">{l}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {tab === 'validation' && <ValidationPage />}

        {tab === 'registry' && (
          <>
            <MethodHead thing="spike" label="The bill spike" note="a slip for every number">
              <div className="font-mono text-xs tracking-[0.18em] text-ink-3 uppercase">Method · every number</div>
              <h1 className="font-display-soft mt-5 max-w-[15ch] text-[clamp(2.6rem,6.4vw,6rem)] leading-[0.88] uppercase">
                Every number, and <em className="font-voice text-leaf normal-case">where it is from</em>
              </h1>
              <p className="mt-6 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
                {PARAMS.length} parameters stand behind the advice. Each is labelled for what it is - a measurement, published science, a rule of thumb - and {TESTED} of them are held to their source by a test.
              </p>
            </MethodHead>
            <div className="mt-12">
              <EvidenceRegistry />
            </div>
          </>
        )}

        {tab === 'farmers' && (
          <>
            <MethodHead thing="spade" label="A spade" note="the hand the advice is for">
              <div className="font-mono text-xs tracking-[0.18em] text-ink-3 uppercase">Method · farmers</div>
              <h1 className="font-display-soft mt-5 max-w-[15ch] text-[clamp(2.6rem,6.4vw,6rem)] leading-[0.88] uppercase">
                How farmers <em className="font-voice text-leaf normal-case">really</em> decide
              </h1>
              <p className="mt-6 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
                What published studies say about how a rotation is chosen on a farm - and what was changed in Zixtaro because of it.
              </p>
            </MethodHead>
            <div className="mt-12">
              <FarmerEvidence />
            </div>
          </>
        )}

        {tab === 'words' && (
          <>
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)] lg:items-stretch lg:gap-14">
              <div className="min-w-0 lg:py-4">
                <div className="font-mono text-xs tracking-[0.18em] text-ink-3 uppercase">Method · words</div>
                <h1 className="font-display-soft mt-5 max-w-[15ch] text-[clamp(2.6rem,6.4vw,6rem)] leading-[0.88] uppercase">
                  The words, <em className="font-voice text-leaf normal-case">said plainly</em>
                </h1>
                <p className="mt-6 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
                  You know the field. Nobody owes it to you to know what a reanalysis is. Here is every term the page leans on: what it means, and where you meet it.
                </p>
              </div>
              {/* the chapter's object is a word: one entry, set as large as the other chapters set their thing */}
              <div className="plan-vitrine method-vitrine mt-10 lg:mt-0" aria-hidden>
                <div className="absolute inset-0 flex flex-col justify-center px-7 pb-16 sm:px-9">
                  <div className="font-mono text-[11px] tracking-[0.16em] text-[#ece8e0]/55 uppercase">entry · water</div>
                  <div translate="no" className="notranslate mt-4 font-display-soft text-[clamp(5rem,10vw,8.5rem)] leading-[0.8] text-[#ece8e0]">
                    ET<span className="ml-1 font-mono text-[0.32em] text-[#c9b07a]">0</span>
                  </div>
                  <div className="mt-6 font-voice text-[24px] leading-tight text-[#ece8e0]/90 italic">the thirst of the air</div>
                  <div className="mt-3 max-w-[30ch] text-[13px] leading-relaxed text-[#ece8e0]/60">what a short, well-watered grass would use in this weather</div>
                </div>
                <div className="plan-vitrine-label font-mono">
                  <span>A word</span>
                  <i className="font-voice">and what stands behind it</i>
                </div>
              </div>
            </div>

            <h2 className="mt-24 font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase">
              Seen <em className="font-voice text-leaf normal-case">from orbit</em>
            </h2>
            <Words items={ORBIT_WORDS} />
            <h2 className="mt-24 font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase">
              The field’s <em className="font-voice text-leaf normal-case">water and weather</em>
            </h2>
            <Words items={WATER_WORDS} />
            <h2 className="mt-24 font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase">
              The rotation <em className="font-voice text-leaf normal-case">and the soil</em>
            </h2>
            <Words items={SOIL_WORDS} />

            <h2 className="mt-24 font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase">
              From orbit, <em className="font-voice text-leaf normal-case">and from the ground</em>
            </h2>
            <ol className="mt-8 grid border-t border-ink/15 lg:grid-cols-2 lg:gap-x-12">
              {ORBIT_AND_GROUND.map((c, i) => (
                <li key={c.k} className="flex gap-5 border-b border-ink/10 py-6">
                  <span className="font-mono text-[11px] text-leaf">{String.fromCharCode(65 + i)}</span>
                  <div className="min-w-0">
                    <div className="text-[16px] text-ink">{c.k}</div>
                    <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed text-pretty text-ink-2">{c.v}</p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        <footer className="mt-24 flex flex-col gap-3 border-t border-ink/10 pt-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Zixtaro · a NASA Space Apps Challenge 2026 prototype for “Field Shift: Adapting Farms with NASA Data”.</span>
          <span className="font-mono text-xs">
            NASA data is used under NASA’s open data policy; not affiliated with or endorsed by NASA.{' '}
            <button onClick={() => openLegal('sources')} className="underline decoration-ink/25 underline-offset-4 hover:text-ink">Sources and licences</button>
          </span>
        </footer>
      </main>
    </div>
  )
}

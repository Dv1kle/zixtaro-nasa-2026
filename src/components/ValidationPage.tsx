// Method → Validation: how the field ranking was tested - blind, on farmland it never saw - and every layer against
// its own, independent truth. The numbers come from src/data/validation.json,
// from the blind tests and the level audit; each carries the seed and date it came from.
import { BadgeCheck, CircleSlash, Lock, Table2, TriangleAlert, Wrench } from 'lucide-react'
import { useState } from 'react'
import { MethodHead } from './MethodHead'
import raw from '../data/validation.json'

type Test = {
  id: string; date: string; label: string; look?: string; seed: string; changed: string; source: string
  cells: number; meanRank: number; median?: number; ci?: [number, number]; top1: number; top3: number; top3ci?: [number, number]
  catastrophic: number; country: number; practice?: number; chance?: number; candidates?: number
  /** the science alone (mode A) */
  science?: { meanRank: number; top1: number; top3: number; catastrophic: number }
}
type Validation = {
  built: string; engine: string; harness: string; model?: string; tests: Test[]; pooled: (Test & { cells: number }) | null
  dev: { cells: number; meanRank: number; top1: number; top3: number; catastrophic: number; country: number; rho: number; model?: string; science?: { meanRank: number; top3: number; catastrophic: number } } | null
  levels: {
    cells: number; coverage: { unmodelledMedian: number; largest: string[] }
    calendar: { sowErrMedianDays: number; over45: number }; wheatForm: { n: number; wrong: number }
    water: { rhoMedian: number; rainPetRhoMedian: number; wetnessRhoMedian: number; dryShortfallModel: number; dryShortfallGdhy: number }
    yield: { n: number; ratioMedian: number; within30: number; aridTemperate: { model: number; gdhy: number } }
    price: { off15x: number }
  } | null
  inputs: { powerVsGauges: { over25: number; over40: number }; era5VsGauges: { over25: number }; irrawaddy: { power: number; gauges: number; era5: number } | null } | null
  oracle: { cells: number; model: { meanRank: number }; truth: Record<string, { meanRank: number; up: number; down: number }> } | null
  preregistration: { doc: string; commit: string; criteria: { meanRank: number; top3: number; catastrophic: number }; runs: { id: string; minute: string; engine: string; status: string; science?: string; seed: number | null }[] }
  /** experiments H and H2 on real fields, and the v3 re-runs of their fields (development) */
  history?: { id: string; label: string; kind: 'test' | 'development'; model: string; off: number; on: number; better: number; worse: number; same: number; p: number; prior: number | null; priorTop1: number | null; twoBack: number; twoBackTop1: number }[]
}
const V = raw as unknown as Validation

const pct = (x: number) => `${Math.round(100 * x)} %`
const f1 = (x: number) => x.toFixed(1)
const f2 = (x: number) => x.toFixed(2)

type Verdict = 'holds' | 'flagged' | 'fixed' | 'open'
const VERDICT: Record<Verdict, { label: string; cls: string; bar: string; icon: typeof BadgeCheck }> = {
  holds: { label: 'holds', cls: 'border-leaf/45 text-leaf', bar: 'bg-leaf', icon: BadgeCheck },
  flagged: { label: 'flagged on the field', cls: 'border-orbit/45 text-orbit', bar: 'bg-orbit', icon: TriangleAlert },
  fixed: { label: 'fixed in part', cls: 'border-wheat/45 text-wheat', bar: 'bg-wheat', icon: Wrench },
  open: { label: 'open', cls: 'border-heat/50 text-heat', bar: 'bg-heat', icon: CircleSlash },
}

/** one figure of the record: the number large, what it is, and the honest small print under it */
function Figure({ value, unit, label, note, tone = 'text-ink' }: { value: string; unit?: string; label: string; note: string; tone?: string }) {
  return (
    <div className="border-t border-ink/15 py-6 pr-6">
      <div className={`font-display-soft text-[clamp(3.2rem,6vw,5.4rem)] leading-[0.85] tabular-nums ${tone}`}>
        {value}
        {unit && <span className="ml-1.5 font-mono text-base text-ink-3">{unit}</span>}
      </div>
      <div className="mt-3 text-[15px] text-ink">{label}</div>
      <div className="mt-1.5 max-w-[34ch] font-mono text-[11px] leading-relaxed text-ink-3">{note}</div>
    </div>
  )
}

/** Handing the model the truth: each layer swapped for its observed truth, the mean rank moving (lower is better) */
function OracleChart({ rows, cells }: { rows: { label: string; v: number }[]; cells: number }) {
  const base = rows[0].v
  const vals = rows.map((r) => r.v)
  const lo = Math.floor((Math.min(...vals) - 0.25) * 4) / 4
  const hi = Math.ceil((Math.max(...vals) + 0.25) * 4) / 4
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100
  const ticks = Array.from({ length: Math.round((hi - lo) / 0.25) + 1 }, (_, i) => lo + i * 0.25)
  return (
    <figure className="mt-6">
      <div className="space-y-4">
        {rows.map((r, i) => {
          const d = r.v - base
          // a swap that moves the mean rank by a tenth or more is called out; smaller moves are noise on 145 cells
          const worse = d >= 0.1
          return (
            <div key={r.label} className="grid items-center gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,17rem)_1fr_4.5rem]">
              <div className={`text-[14px] ${i ? 'text-ink-2' : 'text-ink'}`}>{r.label}</div>
              <div className="relative h-6" aria-hidden>
                {ticks.map((t) => <span key={t} className="absolute inset-y-0 w-px bg-ink/[0.07]" style={{ left: `${x(t)}%` }} />)}
                <span className="absolute inset-y-1 w-px bg-ink/40" style={{ left: `${x(base)}%` }} />
                {i > 0 && (
                  <span
                    className={`absolute top-1/2 h-[3px] -translate-y-1/2 ${worse ? 'bg-heat/70' : 'bg-ink/30'}`}
                    style={{ left: `${x(Math.min(base, r.v))}%`, width: `${Math.abs(x(r.v) - x(base))}%` }}
                  />
                )}
                <span className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 ${i ? (worse ? 'bg-heat' : 'bg-ink-2') : 'bg-orbit'}`} style={{ left: `${x(r.v)}%` }} />
              </div>
              <div className="num text-right text-[13px] text-ink">
                {f2(r.v)}
                {i > 0 && (
                  <span className={`block text-[11px] ${worse ? 'text-heat' : 'text-ink-4'}`}>
                    {d >= 0 ? '+' : '−'}
                    {Math.abs(d).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 grid sm:grid-cols-[minmax(0,17rem)_1fr_4.5rem] sm:gap-x-6">
        <div className="hidden sm:block" />
        <div className="relative h-5 font-mono text-[10px] text-ink-4">
          {ticks.filter((_, i) => i % 2 === 0).map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${x(t)}%` }}>{t.toFixed(1)}</span>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 font-mono text-[11px] leading-relaxed text-ink-4">mean rank of the crop grown most on {cells} cells · ← better · worse →</figcaption>
    </figure>
  )
}

/** a section heading in the page's grammar: condensed caps with the voice's italic */
function H2({ children, voice }: { children: React.ReactNode; voice?: string }) {
  return (
    <h2 className="font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase">
      {children}
      {voice && <em className="font-voice text-leaf normal-case"> {voice}</em>}
    </h2>
  )
}

/** One row per blind test: mean rank with its bootstrap 95 % interval, the country's crop mix as a reference tick. */
function TestsChart({ tests }: { tests: Test[] }) {
  const lo = 1
  const hi = 14
  const x = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100
  const ticks = [1, 3, 5, 7, 9, 11, 13]
  return (
    <div>
      <ol className="space-y-3">
        {tests.map((t) => {
          const repeat = !!t.look && t.look !== '1st look'
          const tip = `${t.label}${t.look ? ` (${t.look})` : ''}, ${t.date}: mean rank ${f2(t.meanRank)}${t.ci ? ` (95 % CI ${t.ci[0]}-${t.ci[1]})` : ''}, top-3 ${pct(t.top3)}, ${t.catastrophic} catastrophic of ${t.cells} cells; the country's crop mix ${f2(t.country)}`
          return (
            <li key={t.id} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[210px_1fr]" tabIndex={0} aria-label={tip} title={tip}>
              <div className="text-[13px] leading-tight">
                <div className="text-ink">{t.label}{t.look && <span className="text-ink-3"> · {t.look}</span>}</div>
                <div className="num text-[11px] text-ink-4">{t.date} · seed {t.seed} · {t.cells} cells</div>
              </div>
              <div className="relative h-7" aria-hidden>
                {ticks.map((v) => <span key={v} className="absolute inset-y-0 w-px bg-ink/[0.07]" style={{ left: `${x(v)}%` }} />)}
                {/* where picking crops at random lands */}
                <span className="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,rgb(233_226_210/0.08)_0_2px,transparent_2px_6px)]" style={{ left: `${x(t.chance ?? 13.4)}%` }} />
                {/* the country's crop mix: a reference tick, not a competing series */}
                <span className="absolute inset-y-1 w-0.5 -translate-x-1/2 bg-ink-3" style={{ left: `${x(t.country)}%` }} />
                {t.ci && <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-orbit" style={{ left: `${x(t.ci[0])}%`, width: `${x(t.ci[1]) - x(t.ci[0])}%` }} />}
                <span
                  className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 ring-2 ring-void ${repeat ? 'border-2 border-orbit bg-void' : 'bg-orbit'}`}
                  style={{ left: `${x(t.meanRank)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ol>
      <div className="mt-2 grid sm:grid-cols-[210px_1fr] sm:gap-x-4">
        <div className="hidden sm:block" />
        <div className="relative h-5">
          {ticks.map((v) => (
            <span key={v} className="num absolute -translate-x-1/2 text-[11px] text-ink-4" style={{ left: `${x(v)}%` }}>{v}</span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-ink-3">
        <span className="flex items-center gap-2"><span className="h-3 w-3 bg-orbit" />model, first look at the cells</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 border-2 border-orbit" />the same cells looked at again</span>
        <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-orbit" />95 % interval (bootstrap over cells)</span>
        <span className="flex items-center gap-2"><span className="h-3 w-0.5 bg-ink-3" />ranking by the country’s crop mix alone</span>
        <span className="flex items-center gap-2"><span className="h-3 w-5 bg-[repeating-linear-gradient(135deg,rgb(233_226_210/0.2)_0_2px,transparent_2px_6px)]" />random picking</span>
      </div>
      <p className="mt-2 text-[12px] text-ink-4">Mean rank of the crop farms grow most among the model’s candidate crops (about 26 before the added crops, about 32 after) - 1 means the model named it first; picking at random gives 13.4-16.4.</p>
      <p className="mt-5 max-w-[78ch] border-l-2 border-wheat/60 py-1 pl-4 text-[13px] leading-relaxed text-ink-2">
        <b className="text-wheat">What these runs measure.</b> Every run above scored the science × national practice - a crop
        its country hardly harvests keeps 0.5-0.8 of its score - which is the page’s labelled default. The science alone
        (climate, soil, water, money; nothing about what farms grow) does clearly worse
        {V.dev?.science ? <>: on the {V.dev.cells} development cells mean rank {f2(V.dev.science.meanRank)} against {f2(V.dev.meanRank)}, with
        the crop farms grow most ranked 15th or lower in {V.dev.science.catastrophic} cells instead of {V.dev.catastrophic} (model {V.dev.model})</> : null}; checks D and E report both. Part of the agreement above is national practice, and it is labelled as such.
      </p>
    </div>
  )
}

function TestsTable({ tests }: { tests: Test[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-white/8 text-ink-3">
            {['Test', 'Cells', 'Mean rank (95 % CI)', 'Top-1', 'Top-3', 'Catastrophic', 'Science alone', 'Country’s mix', 'With practice prior'].map((h) => <th key={h} className="px-2 py-2 font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => (
            <tr key={t.id} className="border-b border-white/5 align-top last:border-0">
              <td className="px-2 py-2 text-ink">{t.label}{t.look ? ` · ${t.look}` : ''}<div className="text-[11px] text-ink-4">{t.date} · seed {t.seed}</div></td>
              <td className="num px-2 py-2 text-ink-2">{t.cells}</td>
              <td className="num px-2 py-2 text-ink-2">{f2(t.meanRank)}{t.ci ? ` (${t.ci[0]}-${t.ci[1]})` : ''}</td>
              <td className="num px-2 py-2 text-ink-2">{pct(t.top1)}</td>
              <td className="num px-2 py-2 text-ink-2">{pct(t.top3)}</td>
              <td className="num px-2 py-2 text-ink-2">{t.catastrophic}</td>
              <td className="num px-2 py-2 text-ink-2">{t.science ? `${f2(t.science.meanRank)} · ${pct(t.science.top3)} · ${t.science.catastrophic}` : '-'}</td>
              <td className="num px-2 py-2 text-ink-2">{f2(t.country)}</td>
              <td className="num px-2 py-2 text-ink-2">{t.practice !== undefined ? f2(t.practice) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const FIXED: { was: string; now: string; evidence: string }[] = [
  { was: 'Winter forms killed across the spring-wheat belt', now: 'Spring forms where most recent winters kill the winter form', evidence: 'Canadian prairies, Kazakh steppe: winter wheat had been judged dead' },
  { was: 'Drought counted three times (yield, water axis and a viability gate)', now: 'Priced once in the harvest and once in the dry-year water axis', evidence: 'Kenyan and Bahian maize had lost 12 points to the gate alone' },
  { was: 'Heat read over the whole flowering month', now: 'A 21-day flowering window from FAO-56 stages', evidence: 'spring rapeseed had been checked in its ripening August' },
  { was: 'Buyers abroad out of reach of any trade', now: 'The law of one price: a buyer above 1.3× the home price is ignored', evidence: 'Kazakh rice had been “sold” in Kyrgyzstan at 4.9×' },
  { was: 'Niche crops ranked as if grown at scale', now: 'Under 1 % of a country’s cropland counts as the neighbours’ record (0.8)', evidence: 'development cells: mean rank 5.58 → 4.13, catastrophic failures 7 → 1' },
  { was: 'Warm-winter wheat on the European calendar', now: 'Spring types sown in late autumn where the coldest month averages 10 °C or more', evidence: 'Punjab, Egypt, Morocco: false heat at flowering in every season → none' },
  { was: 'Farm-gate prices that fell with a devaluation', now: 'Chained FAOSTAT price-years that drift off the world are dropped', evidence: '920 price-years in 66 countries (Argentina 2019-2022, Nigeria 2020-2024)' },
  { was: 'NASA POWER rain taken on trust', now: 'Checked against rain gauges on every field; flagged beyond 1.6×', evidence: 'the Irrawaddy delta: 365 mm a year against 2 381 mm measured' },
]
const OPEN: { what: string; why: string }[] = [
  { what: 'Soybean picked across West and East Africa', why: 'Reference prices and costs make it pay more than maize and sorghum, which farms grow as food; local costs are missing, and local price ratios made rankings worse.' },
  { what: 'Rice picked on land without paddies', why: 'Rice is assumed bunded wherever the rains flood the field; terrain and drainage are not checked.' },
  { what: 'National yields on irrigated fields', why: 'A country’s yield mixes rainfed and irrigated farms: Georgia’s irrigated cotton is judged with a US average pulled down by dryland Texas.' },
  { what: 'Day length', why: 'Autumn-sown crops ripen about a month earlier in the model than in the GGCMI calendars where winter days are short.' },
  { what: 'Niche rule in large countries', why: 'US groundnut and rapeseed are national niches but regional staples: 7 of 435 crops grown on ≥ 5 % of a cell are marked down.' },
]

export function ValidationPage() {
  const [table, setTable] = useState(false)
  // the latest pre-registered draw of the engine on the page; the older pooled result if it is missing
  const head = V.tests.find((t) => t.id === 'checkE') ?? V.tests.find((t) => t.id === 'checkD') ?? V.pooled ?? V.tests[V.tests.length - 1]
  const candidates = head.candidates ?? 26
  const L = V.levels
  const I = V.inputs
  const O = V.oracle
  const layers: { name: string; truth: string; result: string; verdict: Verdict }[] = []
  if (I) layers.push({ name: 'Rain (input)', truth: 'rain gauges (WorldClim 2.1) and ERA5', result: `NASA POWER is within 25 % of the gauges on ${pct(1 - I.powerVsGauges.over25)} of farming cells (ERA5 on ${pct(1 - I.era5VsGauges.over25)}); off by more than 40 % on ${pct(I.powerVsGauges.over40)}${I.irrawaddy ? ` - the Irrawaddy delta ${Math.round(I.irrawaddy.power)} mm against ${Math.round(I.irrawaddy.gauges).toLocaleString('en')} mm` : ''}.`, verdict: 'flagged' })
  if (L) {
    layers.push({ name: 'Crop calendar', truth: 'GGCMI Phase 3 crop calendars', result: `Sowing within a median ${L.calendar.sowErrMedianDays} days of the observed calendar; more than 45 days off in ${pct(L.calendar.over45)} - mostly the equator’s two rainy seasons.`, verdict: 'fixed' })
    layers.push({ name: 'Wheat’s form', truth: 'GDHY winter and spring seasons', result: `Winter, spring or autumn-sown spring type right in ${L.wheatForm.n - L.wheatForm.wrong} of ${L.wheatForm.n} wheat cells.`, verdict: 'holds' })
    layers.push({ name: 'Water, year to year', truth: 'GDHY yields 1981-2016, detrended', result: `Rank correlation ${f2(L.water.rhoMedian)} with good and bad years - weak, but above rain / evaporation alone (${f2(L.water.rainPetRhoMedian)}); dry-year shortfall ${pct(L.water.dryShortfallModel)} against ${pct(L.water.dryShortfallGdhy)} observed.`, verdict: 'holds' })
    layers.push({ name: 'Yield level', truth: 'GDHY 2012-2016', result: `Model / observed median ${f2(L.yield.ratioMedian)}, within ± 30 % on ${pct(L.yield.within30)} of ${L.yield.n} crop-cells; arid temperate fields still marked down a little too far (${f2(L.yield.aridTemperate.model)} vs ${f2(L.yield.aridTemperate.gdhy)}).`, verdict: 'fixed' })
    layers.push({ name: 'Prices', truth: 'FAOSTAT official price levels', result: `Currency artefacts dropped; reference price ratios between crops differ from a country’s own by more than 1.5× in ${pct(L.price.off15x)} of pairs.`, verdict: 'open' })
    layers.push({ name: 'Crops covered', truth: 'CROPGRIDS harvested area', result: `A median ${pct(L.coverage.unmodelledMedian)} of a cell’s cropland grows crops the engine does not model: ${L.coverage.largest.slice(0, 5).join(', ')}.`, verdict: 'open' })
  }
  const prereg = V.preregistration
  const oracleRows = O
    ? ([['The model as it is', O.model.meanRank], ['… with the observed crop calendars', O.truth.calendar?.meanRank], ['… with rain scaled to the gauges', O.truth.rain?.meanRank], ['… with the country’s own price ratios', O.truth.price?.meanRank]] as [string, number | undefined][])
        .filter((r): r is [string, number] => r[1] !== undefined)
        .map(([label, v]) => ({ label, v }))
    : []
  return (
    <>
      <MethodHead thing="balance" label="A balance" note="the answer against what farms grow">
      <div className="font-mono text-xs tracking-[0.18em] text-ink-3 uppercase">Method · validation</div>
      <h1 className="font-display-soft mt-5 max-w-[15ch] text-[clamp(2.8rem,6.2vw,6.2rem)] leading-[0.86] uppercase">
        Tested blind, on farmland it <em className="font-voice text-leaf normal-case">never saw.</em>
      </h1>
      <p className="mt-8 max-w-[60ch] text-[17px] leading-relaxed text-ink-2">
        Random farming regions of the world, drawn after the model was fixed: for each, the crop farms grow most (CROPGRIDS 2020) against the model’s ranking of about {Math.round(candidates)} crops. And, before that, every layer of the model against its own independent truth.
      </p>
      </MethodHead>

      <div className="mt-12 grid sm:grid-cols-2 sm:gap-x-8 xl:grid-cols-4">
        <Figure value={String(Math.round(100 * head.top3))} unit="%" label="named in the top 3" tone="text-leaf" note={`on ${head.cells} regions it never saw (${head.label.charAt(0).toLowerCase()}${head.label.slice(1)}, ${head.date}); random picking gives about ${pct(3 / candidates)}`} />
        <Figure value={f1(head.meanRank)} label="mean rank of the crop farms grow most" note={`${head.ci ? `95 % interval ${head.ci[0]}-${head.ci[1]}; ` : ''}random picking gives ${head.chance ? f1(head.chance) : '13.4'}${head.science ? `; the science alone ${f1(head.science.meanRank)}` : ''}`} />
        <Figure value={String(head.catastrophic)} unit={`of ${head.cells}`} label="catastrophic misses" tone={head.catastrophic ? 'text-heat' : 'text-ink'} note={`the crop grown most ranked 15th or lower${head.science ? `; ${head.science.catastrophic} for the science alone` : ''}`} />
        <Figure value={f1(head.country)} label="the country’s crop mix alone" tone="text-ink-2" note="ranks the main crop better - it is where the map comes from. Zixtaro answers a different question: what pays and holds under this field’s climate." />
      </div>

      <section className="mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <H2 voice="in the order they were run">Blind tests,</H2>
          <button onClick={() => setTable(!table)} aria-pressed={table} className="flex items-center gap-2 border border-ink/15 px-3 py-1.5 font-mono text-[11px] text-ink-2 hover:border-ink/40 hover:text-ink">
            <Table2 className="h-3.5 w-3.5" aria-hidden /> {table ? 'show as chart' : 'show as table'}
          </button>
        </div>
        <p className="mt-4 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-2">Each set of cells is judged once; the model is tuned only on development cells. The locked test was looked at three times, each time after changes found elsewhere - it is marked as such, and a new draw followed.</p>
        <div className="mt-6 border-y border-ink/15 py-6">{table ? <TestsTable tests={V.tests} /> : <TestsChart tests={V.tests} />}</div>
        <ol className="mt-5 grid gap-x-10 gap-y-2.5 text-[13px] leading-relaxed text-ink-3 lg:grid-cols-2">
          {V.tests.map((t, i) => (
            <li key={t.id} className="flex gap-3">
              <span className="font-mono text-[10px] leading-[1.9] text-ink-4">{String(i + 1).padStart(2, '0')}</span>
              <span><span className="text-ink-2">{t.label}{t.look ? ` · ${t.look}` : ''}:</span> {t.changed}</span>
            </li>
          ))}
        </ol>
      </section>

      {V.history && V.history.length > 0 && (
        <section className="mt-20">
          <H2 voice="on real fields">A field’s history,</H2>
          <p className="mt-4 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-2">
            Truth: the crop each field actually sowed (USDA CDL, AAFC ACI, French RPG). Twice, reading the field’s past crops through the
            rotation rules moved the ranking away from what was sown. The rules without a measured yield figure were the cause - they
            are now risks on show, not points. What farms around sow after the same crops predicts the next crop best, and is shown
            beside the ranking, never inside it. Rank of the crop sown, lower is better.
          </p>
          <div className="mt-6 overflow-x-auto border-y border-ink/15 py-4">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="font-mono text-[11px] uppercase tracking-wide text-ink-3">
                <tr><th className="py-1 pr-3 font-normal">run</th><th className="py-1 pr-3 font-normal">without → with history</th><th className="py-1 pr-3 font-normal">up / down / same</th><th className="py-1 pr-3 font-normal">observed rotations alone</th><th className="py-1 font-normal">“two seasons before”</th></tr>
              </thead>
              <tbody>
                {V.history.map((h) => (
                  <tr key={h.id} className="border-t border-ink/[0.08]">
                    <td className="py-2.5 pr-3 text-ink-2">{h.label}{h.kind === 'development' && <span className="ml-2 border border-wheat/40 px-1.5 font-mono text-[10px] text-wheat uppercase">development</span>}</td>
                    <td className={`num py-2.5 pr-3 ${h.on > h.off ? 'text-heat' : 'text-leaf'}`}>{f2(h.off)} → {f2(h.on)}</td>
                    <td className="num py-2.5 pr-3 text-ink-2">{h.better} / {h.worse} / {h.same} <span className="text-ink-4">p {f2(h.p)}</span></td>
                    <td className="num py-2.5 pr-3 text-ink-2">{h.prior === null ? '-' : `${f2(h.prior)} · first on ${pct(h.priorTop1 ?? 0)}`}</td>
                    <td className="num py-2.5 text-ink-2">{f2(h.twoBack)} · first on {pct(h.twoBackTop1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-20">
        <H2 voice="against its own truth">Every layer,</H2>
        <p className="mt-4 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-2">A crop falling in the ranking proves nothing - sorghum should beat maize on drought in the Sahel. A layer is wrong when it misses independent data that play no part in the model. Checked on {L?.cells ?? 145} development cells.</p>
        {/* the model's strata, logged one by one: what it was checked against, what came out, and the stamp */}
        <ol className="mt-8 border-t border-ink/15">
          {layers.map((l) => {
            const v = VERDICT[l.verdict]
            const Icon = v.icon
            return (
              <li key={l.name} className="relative grid gap-x-8 gap-y-2 border-b border-ink/10 py-6 pl-5 md:grid-cols-[minmax(0,15rem)_1fr_auto]">
                <span aria-hidden className={`absolute inset-y-6 left-0 w-[3px] ${v.bar}`} />
                <div>
                  <div className="font-display-soft text-[22px] leading-none uppercase">{l.name}</div>
                  <div className="mt-2 font-mono text-[11px] text-ink-4">against {l.truth}</div>
                </div>
                <p className="max-w-[68ch] text-[14px] leading-relaxed text-ink-2">{l.result}</p>
                <span className={`flex h-fit w-fit items-center gap-1.5 self-start justify-self-start border px-2 py-1 font-mono text-[10.5px] tracking-wide whitespace-nowrap uppercase md:justify-self-end ${v.cls}`}><Icon className="h-3 w-3" aria-hidden />{v.label}</span>
              </li>
            )
          })}
        </ol>
        {O && oracleRows.length > 0 && (
          <div className="mt-14">
            <div className="text-[17px] text-ink">Handing the model the truth</div>
            <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-ink-2">Swap one layer for its observed truth and rank again. If the ranking barely moves, that layer is not where the model loses the crop farms grow.</p>
            <OracleChart rows={oracleRows} cells={O.cells} />
            <p className="mt-4 font-voice text-[22px] text-ink-2 italic">The physics is not the bottleneck; the economics is.</p>
          </div>
        )}
      </section>

      <section className="mt-20 grid gap-x-12 gap-y-14 lg:grid-cols-2">
        <div>
          <H2 voice="because the evidence said so">Fixed</H2>
          <ol className="mt-6 border-t border-ink/15">
            {FIXED.map((f) => (
              <li key={f.was} className="border-b border-ink/10 py-5 text-[14px] leading-relaxed">
                <div className="text-ink-3 line-through decoration-heat/40">{f.was}</div>
                <div className="mt-1.5 flex gap-2 text-ink"><span aria-hidden className="text-leaf">→</span>{f.now}</div>
                <div className="mt-1.5 font-mono text-[11px] leading-relaxed text-ink-4">{f.evidence}</div>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <H2 voice="still fails">Where it</H2>
          <ol className="mt-6 border-t border-heat/30">
            {OPEN.map((o) => (
              <li key={o.what} className="border-b border-ink/10 py-5 text-[14px] leading-relaxed">
                <div className="flex gap-2 text-ink"><span aria-hidden className="text-heat">×</span>{o.what}</div>
                <div className="mt-1.5 text-ink-2">{o.why}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-20">
        <h2 className="flex items-center gap-3 font-display-soft text-[clamp(1.6rem,3vw,2.4rem)] leading-none uppercase"><Lock className="h-6 w-6 text-orbit" aria-hidden /> Pre-registered</h2>
        <p className="mt-4 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-2">
          The next tests were fixed in writing before their cells existed: the seed is the first 32 bits of the NIST Randomness Beacon’s pulse at a stated minute, so nobody - us included - could tune on them, and anyone can re-draw them. A run passes with a mean rank ≤ {prereg.criteria.meanRank.toFixed(1)}, top-3 ≥ {pct(prereg.criteria.top3)} and at most {prereg.criteria.catastrophic} catastrophic misses; it is published either way.
        </p>
        <ol className="mt-6 grid border-t border-ink/15 md:grid-cols-2 md:gap-x-10">
          {prereg.runs.map((r) => (
            <li key={r.id} className="border-b border-ink/10 py-5 text-[14px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink">Run {r.id} · {r.engine}</span>
                <span className="flex flex-wrap justify-end gap-1.5">
                  {(r.science ? [['science × practice', r.status], ['science alone', r.science]] : [[null, r.status]]).map(([what, st]) => (
                    <span key={what ?? 'one'} className={`border px-2 py-0.5 font-mono text-[10.5px] tracking-wide uppercase ${st === 'passed' ? 'border-leaf/45 text-leaf' : st === 'failed' ? 'border-heat/50 text-heat' : 'border-ink/20 text-ink-3'}`}>{what ? `${what}: ${st}` : st}</span>
                  ))}
                </span>
              </div>
              <div className="num mt-1.5 text-[12px] text-ink-3">NIST pulse {r.minute.replace('T', ' ').replace(':00Z', ' UTC')}{r.seed !== null ? ` · seed ${r.seed}` : ''}</div>
            </li>
          ))}
        </ol>
        <p className="mt-3 font-mono text-[11px] text-ink-4">Protocol: each run’s section was committed before its pulse ({prereg.commit}).</p>
      </section>
    </>
  )
}

// The greenhouse's decision tools, on a par with the field's: what matters to the grower, which crops they can sell,
// the whole decision on one card, when the market pays, what the plan would have earned in each real year, a second
// crop in the months the first leaves, what the country really grows under glass, and how the model's kilos compare
// with the harvests countries report.

import { BadgeCheck, CalendarRange, Coins, Factory, Leaf, Scale, ShieldCheck, Sprout, TrendingDown } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import validation from '../data/ghvalidation.json'
import { euro, MONTHS_SHORT, pct, thousands } from '../lib/format'
import { countryName, energyFor, GH_DATA, glassAreas, marketLabel, PRICE_YEARS, yearPrices, type EnergyPrices, type GlassCrop } from '../lib/ghMarket'
import { carbonPerKg, GH_CROP_BY_ID, GH_CROPS, type GhCropId, type GhPriorities, type GhResult, type GhYearPlan, type Prices } from '../lib/greenhouse'
import type { GhTrust } from '../lib/ghTrust'
import { useWidth } from '../lib/hooks'
import { Chip, CropTile, NumberField } from './ui'

const EASE = [0.16, 1, 0.3, 1] as const
const eurM2 = (x: number) => `${x < 0 ? '−' : ''}€${Math.abs(x).toFixed(Math.abs(x) < 10 ? 1 : 0)}`
/** What a crop's best run leaves, even when it loses money. */
export const bestMargin = (r: GhResult) => (r.plan.plant ? r.plan.margin : (r.bestRun?.margin ?? 0))

// ---------- what matters most ----------

const FADERS: { key: keyof GhPriorities; label: string; hint: string; color: string; icon: typeof Coins }[] = [
  { key: 'profit', label: 'Margin', hint: 'what is left after running costs', color: 'var(--color-wheat)', icon: Coins },
  { key: 'climate', label: 'Low CO₂', hint: 'gas and grid power per m²', color: 'var(--color-leaf)', icon: Leaf },
  { key: 'steady', label: 'Steady years', hint: 'paid in most real years', color: 'var(--color-water)', icon: ShieldCheck },
]
const MIXES: { label: string; p: GhPriorities }[] = [
  { label: 'Balanced', p: { profit: 60, climate: 20, steady: 20 } },
  { label: 'Margin first', p: { profit: 100, climate: 0, steady: 0 } },
  { label: 'Low carbon', p: { profit: 40, climate: 60, steady: 0 } },
  { label: 'Safe bet', p: { profit: 40, climate: 0, steady: 60 } },
]

export function GhPriorityControls({ priorities, setPriorities }: { priorities: GhPriorities; setPriorities: (p: GhPriorities) => void }) {
  const total = priorities.profit + priorities.climate + priorities.steady || 1
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[15px] text-ink">What matters most?</div>
        <div className="flex flex-wrap gap-1.5">
          {MIXES.map((m) => {
            const on = m.p.profit === priorities.profit && m.p.climate === priorities.climate && m.p.steady === priorities.steady
            return (
              <button key={m.label} onClick={() => setPriorities(m.p)} aria-pressed={on} className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-white/40 bg-white/10 text-ink' : 'border-white/10 text-ink-3 hover:text-ink'}`}>
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-4 space-y-3.5">
        {FADERS.map((f) => (
          <label key={f.key} className="block">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5">
                <f.icon className="h-4 w-4" style={{ color: f.color }} />
                <span className="text-sm text-ink">{f.label}</span>
                <span className="hidden text-xs text-ink-3 sm:inline">{f.hint}</span>
              </span>
              <span className="num text-base" style={{ color: f.color }}>{priorities[f.key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={priorities[f.key]}
              onChange={(e) => setPriorities({ ...priorities, [f.key]: Number(e.target.value) })}
              className="fader mt-1"
              style={{ ['--fader' as string]: f.color, ['--val' as string]: `${priorities[f.key]}%` }}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full">
        {FADERS.map((f) => <motion.i key={f.key} layout className="h-full" style={{ width: `${(priorities[f.key] / total) * 100}%`, background: f.color }} />)}
      </div>
    </div>
  )
}

// ---------- which crops the grower can sell ----------

export function GhCropPicker({ exclude, setExclude, prices, setPrices }: { exclude: GhCropId[]; setExclude: (x: GhCropId[]) => void; prices: Prices; setPrices: (p: Prices) => void }) {
  const [asking, setAsking] = useState<GhCropId | null>(null)
  const setOwn = (id: GhCropId, v: number | null) => {
    const own = { ...(prices.own ?? {}) }
    if (v && v > 0) own[id] = v
    else delete own[id]
    setPrices({ ...prices, own })
  }
  return (
    <div>
      <div className="text-[15px] text-ink">What will you grow and sell?</div>
      <p className="mt-1 text-xs leading-relaxed text-ink-3">Prices are the EU market record month by month. Pot herbs have none: they count once you enter what your buyer pays.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {GH_CROPS.map((c) => {
          const own = prices.own?.[c.id]
          const needsPrice = !c.market && !own
          const off = exclude.includes(c.id) || needsPrice
          return (
            <span key={c.id} className="flex items-center gap-1">
              <button
                onClick={() => (needsPrice ? setAsking(asking === c.id ? null : c.id) : setExclude(off ? exclude.filter((x) => x !== c.id) : [...exclude, c.id]))}
                aria-pressed={!off}
                className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5 text-[13px] transition ${off ? 'border-white/8 text-ink-4' : 'border-white/15 bg-white/[0.04] text-ink-2 hover:border-white/35'} ${exclude.includes(c.id) ? 'line-through' : ''}`}
                title={needsPrice ? 'No open market price: enter your buyer’s price to include it' : undefined}
              >
                <CropTile crop={c} size="xs" dim={off} className="!h-7 !w-7" />
                {c.name}
                {needsPrice && <span className="font-mono text-[11px] text-wheat">+ your price</span>}
                {own ? <span className="font-mono text-[11px] text-ink-3">€{own.toFixed(2)}/kg</span> : null}
              </button>
            </span>
          )
        })}
      </div>
      {asking && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-3">
          {GH_CROP_BY_ID[asking].name}: your buyer pays €
          <NumberField value={prices.own?.[asking] ?? GH_CROP_BY_ID[asking].price} min={0.1} max={100} decimals={2} onCommit={(v) => { setOwn(asking, v); setAsking(null) }} label={`Your price for ${GH_CROP_BY_ID[asking].name}, euro per kg`} className="w-20 !px-2 !py-1" />
          per kg
          <span className="text-xs text-ink-4">(published pot-herb budgets suggest ≈ €{GH_CROP_BY_ID[asking].price} per kg of fresh herb; check it)</span>
        </div>
      )}
      {Object.entries(prices.own ?? {}).some(([id]) => GH_CROP_BY_ID[id as GhCropId]?.market) && (
        <button onClick={() => setPrices({ ...prices, own: Object.fromEntries(Object.entries(prices.own ?? {}).filter(([id]) => !GH_CROP_BY_ID[id as GhCropId]?.market)) })} className="mt-2 font-mono text-[11px] text-ink-3 hover:text-ink">
          back to market prices for the others
        </button>
      )}
    </div>
  )
}

// ---------- the whole decision on one card ----------

export function GhDecisionCard({ result, ranking, area, trust, year }: { result: GhResult; ranking: GhResult[]; area: number; trust: GhTrust | null; year: GhYearPlan | null }) {
  const p = result.plan
  const top = ranking[0]
  const runner = ranking.find((r) => r.crop.id !== result.crop.id)
  const kgCo2 = carbonPerKg(p)
  const pos = result.years.filter((y) => y.margin > 0).length
  const worst = result.years.length ? result.years.reduce((a, b) => (b.margin < a.margin ? b : a)) : null
  const conf = trust ? trust.conf.shares.find((s) => s.id === result.crop.id)?.share ?? 0 : null
  const isTop = top?.crop.id === result.crop.id
  const items = [
    { k: 'left after running costs', v: p.plant ? eurM2(p.margin) + '/m²' : 'does not pay', sub: p.plant ? `${euro(p.margin * area)} for the house` : `best run ${eurM2(result.bestRun?.margin ?? 0)}/m²`, tone: p.plant && p.margin > 0 ? 'text-leaf' : 'text-heat' },
    { k: 'real years in profit', v: result.years.length ? `${pos} of ${result.years.length}` : '-', sub: worst ? `worst ${worst.year}: ${eurM2(worst.margin)}/m²` : 'no replay', tone: result.years.length && pos / result.years.length >= 0.7 ? 'text-water' : 'text-wheat' },
    { k: 'CO₂ per kg', v: kgCo2 === null ? '-' : `${kgCo2.toFixed(kgCo2 < 1 ? 2 : 1)} kg`, sub: `${thousands(p.carbonKg)} kg per m² a year`, tone: kgCo2 !== null && kgCo2 < 0.5 ? 'text-leaf' : 'text-heat' },
    { k: 'how sure', v: conf === null ? '…' : pct(conf), sub: trust ? `first in ${Math.round((conf ?? 0) * trust.conf.runs)} of ${trust.conf.runs} re-runs` : 'running the re-runs', tone: 'text-ink' },
  ]
  return (
    <div className="panel p-5 sm:p-7" data-tour="ghdecision">
      <div className="flex flex-wrap items-center gap-4">
        <CropTile crop={result.crop} size="md" glow />
        <div className="min-w-0 flex-1">
          <div className="kicker !text-leaf">{isTop ? 'The pick for this house' : 'Your choice'} · score {Math.round(result.score.score)}</div>
          <div className="font-display-soft mt-1 text-3xl text-ink sm:text-4xl">{result.crop.name}</div>
          <div className="mt-1 text-sm text-ink-3">
            {p.plant ? `plant ${MONTHS_SHORT[p.plant - 1]} · harvest ${MONTHS_SHORT[p.firstHarvest! - 1]}-${MONTHS_SHORT[p.clear! - 1]} · ${p.yieldKg.toFixed(p.yieldKg < 10 ? 1 : 0)} kg/m²` : 'no run pays for itself at these prices'}
            {!isTop && top ? ` · ${top.crop.name.toLowerCase()} scores higher here` : ''}
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.k} className="min-w-0">
            <div className="font-mono text-[11px] text-ink-4">{it.k}</div>
            <div className={`num mt-1 text-2xl ${it.tone}`}>{it.v}</div>
            <div className="mt-0.5 text-xs leading-snug text-ink-3">{it.sub}</div>
          </div>
        ))}
      </div>
      <ScoreParts result={result} />
      {runner && <WhyNot a={result} b={runner} />}
      {year && (
        <div className="mt-5 flex gap-3 border-t border-white/8 pt-4 text-sm text-ink-2">
          <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
          <span>
            Two crops a year pay more here: {year.runs.map((r) => `${r.crop.name.toLowerCase()} ${MONTHS_SHORT[r.plan.plant! - 1]}-${MONTHS_SHORT[r.plan.clear! - 1]}`).join(', then ')} leave{' '}
            <b className="text-ink">{eurM2(year.margin)}/m²</b>, {eurM2(year.gain)} more than the best single crop.
          </span>
        </div>
      )}
    </div>
  )
}

/** The score's three parts for the chosen crop, as the faders weigh them. */
function ScoreParts({ result }: { result: GhResult }) {
  const parts = [
    { k: 'margin', v: result.score.profit, c: 'var(--color-wheat)' },
    { k: 'low CO₂', v: result.score.climate, c: 'var(--color-leaf)' },
    { k: 'steady years', v: result.score.steady, c: 'var(--color-water)' },
  ]
  return (
    <div className="mt-5 grid grid-cols-3 gap-3">
      {parts.map((x) => (
        <div key={x.k}>
          <div className="flex items-baseline justify-between font-mono text-[11px] text-ink-4"><span>{x.k}</span><span>{Math.round(x.v * 100)}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.i className="block h-full rounded-full" style={{ background: x.c }} initial={false} animate={{ width: `${Math.max(2, x.v * 100)}%` }} transition={{ duration: 0.5, ease: EASE }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Why this crop and not the next one: the money, line by line. */
function WhyNot({ a, b }: { a: GhResult; b: GhResult }) {
  const pa = a.plan.plant ? a.plan : a.bestRun
  const pb = b.plan.plant ? b.plan : b.bestRun
  if (!pa || !pb) return null
  const rows = [
    { k: 'harvest sells for', d: pa.revenue - pb.revenue },
    { k: 'energy', d: -(pa.energyCost - pb.energyCost) },
    { k: 'plants, substrate, picking', d: -(pa.otherCost - pb.otherCost) },
    { k: 'CO₂ dosing', d: -(pa.co2Cost - pb.co2Cost) },
  ].filter((r) => Math.abs(r.d) >= 0.05)
  const max = Math.max(...rows.map((r) => Math.abs(r.d)), 1)
  return (
    <div className="mt-5 border-t border-white/8 pt-4">
      <div className="flex items-center gap-2 text-sm text-ink"><Scale className="h-4 w-4 text-ink-3" /> {a.crop.name} against {b.crop.name.toLowerCase()}, € per m² a year</div>
      <div className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div key={r.k} className="grid grid-cols-[7.5rem_minmax(0,1fr)_56px] items-center gap-3 text-xs sm:grid-cols-[11rem_minmax(0,1fr)_56px]">
            <span className="leading-tight text-ink-3">{r.k}</span>
            <span className="relative h-2.5">
              <i className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <motion.i className="absolute inset-y-0 rounded-full" style={{ background: r.d >= 0 ? 'var(--color-leaf)' : 'var(--color-heat)', left: r.d >= 0 ? '50%' : undefined, right: r.d < 0 ? '50%' : undefined }} initial={false} animate={{ width: `${(Math.abs(r.d) / max) * 50}%` }} transition={{ duration: 0.5, ease: EASE }} />
            </span>
            <span className={`num text-right ${r.d >= 0 ? 'text-leaf' : 'text-heat'}`}>{r.d >= 0 ? '+' : '−'}{Math.abs(r.d).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- when the market pays ----------

export function GhPriceCurve({ result, lat }: { result: GhResult; lat: number }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const crop = result.crop
  const years = useMemo(() => (crop.market ? PRICE_YEARS.map((y) => yearPrices(crop.market!, lat, y)).filter((x): x is (number | null)[] => !!x) : []), [crop.market, lat])
  const level = result.prices.find((x) => x !== null) === undefined ? null : 1
  const lo = Array.from({ length: 12 }, (_, m) => Math.min(...years.map((y) => y[m] ?? Infinity)))
  const hi = Array.from({ length: 12 }, (_, m) => Math.max(...years.map((y) => y[m] ?? -Infinity)))
  const typical = result.prices
  const max = Math.max(...typical.map((x) => x ?? 0), ...hi.filter(Number.isFinite), 0.1) * 1.1
  const height = 200
  const pad = { l: 36, r: 8, t: 10, b: 24 }
  const bw = (width - pad.l - pad.r) / 12
  const X = (i: number) => pad.l + i * bw + bw / 2
  const Y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b)
  const inHarvest = (m: number) => result.months[m].state === 'harvest'
  const line = typical.map((v, i) => (v === null ? null : `${X(i)},${Y(v)}`))
  const path = line.reduce((acc, pt, i) => (pt ? `${acc}${acc && line[i - 1] ? ' L' : ' M'}${pt}` : acc), '')
  const step = max > 4 ? 1 : max > 2 ? 0.5 : 0.25
  const ticks = Array.from({ length: Math.floor(max / step) }, (_, i) => (i + 1) * step)
  return (
    <div ref={box} className="w-full min-w-0">
      <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={`${crop.name} farm-gate price by month`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgb(255 255 255 / 0.05)" />
            <text x={pad.l - 6} y={Y(t) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">€{t.toFixed(t < 1 ? 2 : 1)}</text>
          </g>
        ))}
        {typical.map((_, i) => (
          <g key={i}>
            {inHarvest(i) && <rect x={X(i) - bw / 2 + 1} width={bw - 2} y={pad.t} height={height - pad.t - pad.b} rx={5} fill="rgb(201 176 122 / 0.07)" />}
            {Number.isFinite(lo[i]) && Number.isFinite(hi[i]) && <rect x={X(i) - bw * 0.18} width={bw * 0.36} y={Y(hi[i])} height={Math.max(1, Y(lo[i]) - Y(hi[i]))} rx={3} fill="rgb(244 205 106 / 0.18)" />}
            <text x={X(i)} y={height - 7} textAnchor="middle" className={`font-mono text-[10px] ${inHarvest(i) ? 'fill-leaf' : 'fill-ink-4'}`}>{MONTHS_SHORT[i][0]}</text>
            {typical[i] === null && <text x={X(i)} y={Y(max * 0.1)} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">-</text>}
          </g>
        ))}
        {path && <path d={path} fill="none" stroke="var(--color-wheat)" strokeWidth={2} />}
        {typical.map((v, i) => (v === null ? null : <circle key={i} cx={X(i)} cy={Y(v)} r={2.6} fill="var(--color-wheat)"><title>{`${MONTHS_SHORT[i]}: €${v.toFixed(2)}/kg typical${Number.isFinite(lo[i]) ? `, €${lo[i].toFixed(2)}-${hi[i].toFixed(2)} over ${years.length} years` : ''}`}</title></circle>))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-ink-3">
        <span className="flex items-center gap-2"><i className="h-0.5 w-4 bg-wheat" />{result.ownPrice ? 'your price' : 'typical 2020-2024, farm gate'}</span>
        {years.length > 0 && !result.ownPrice && <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-wheat/25" />range {PRICE_YEARS[0]}-{PRICE_YEARS.at(-1)}</span>}
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-leaf/20" />harvest months in the plan</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        {result.ownPrice
          ? 'Your own price, the same every month.'
          : level === null
            ? 'No market record for this crop.'
            : <>Source: DG AGRI fruit & vegetable prices - {marketLabel(lat)}. A dash means no market reported that month: the plan does not sell then.</>}
      </p>
    </div>
  )
}

// ---------- the plan on real years ----------

export function GhBacktest({ result, country }: { result: GhResult; country: string | null }) {
  const ys = result.years
  const [box, width] = useWidth<HTMLDivElement>()
  if (!ys.length) return <p className="text-sm text-ink-3">No year to replay: the plan grows nothing, or the record lacks prices for these years.</p>
  const max = Math.max(...ys.map((y) => Math.abs(y.margin)), 1) * 1.15
  const height = 190
  const pad = { l: 34, r: 8, t: 10, b: 24 }
  const bw = (width - pad.l - pad.r) / ys.length
  const zero = pad.t + (height - pad.t - pad.b) / 2
  const H = (v: number) => (v / max) * ((height - pad.t - pad.b) / 2)
  const pos = ys.filter((y) => y.margin > 0).length
  const gasPeak = ys.reduce((a, b) => (b.heat > a.heat ? b : a))
  return (
    <div ref={box} className="w-full min-w-0">
      <svg width={width} height={height} className="block overflow-visible" role="img" aria-label="The plan replayed on real years">
        <line x1={pad.l} x2={width - pad.r} y1={zero} y2={zero} stroke="rgb(255 255 255 / 0.18)" />
        <text x={pad.l - 6} y={zero + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">€0</text>
        {ys.map((y, i) => {
          const h = H(y.margin)
          return (
            <g key={y.year}>
              <title>{`${y.year}: ${eurM2(y.margin)}/m² after running costs · crop sold for ${eurM2(y.revenue)}/m² · gas €${y.heat.toFixed(3)}, power €${y.power.toFixed(3)} per kWh`}</title>
              <motion.rect x={pad.l + i * bw + bw * 0.2} width={bw * 0.6} rx={3} fill={y.margin >= 0 ? 'var(--color-leaf)' : 'var(--color-heat)'} initial={false} animate={{ y: h >= 0 ? zero - h : zero, height: Math.max(1, Math.abs(h)) }} transition={{ duration: 0.5, ease: EASE }} />
              <text x={pad.l + i * bw + bw / 2} y={height - 7} textAnchor="middle" className={`font-mono text-[10px] ${y.year === gasPeak.year && gasPeak.heat > 0.06 ? 'fill-heat' : 'fill-ink-4'}`}>{`’${String(y.year).slice(2)}`}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip tone={pos / ys.length >= 0.7 ? 'good' : pos / ys.length >= 0.4 ? 'warn' : 'bad'}>in profit {pos} of {ys.length} years</Chip>
        {gasPeak.heat > 0.06 && result.spec.heated && <Chip tone="bad"><TrendingDown className="mr-1 inline h-3 w-3" />{gasPeak.year}: gas €{gasPeak.heat.toFixed(3)}/kWh</Chip>}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        The same calendar, each year with that year’s NASA POWER weather, that year’s market prices for the crop (DG AGRI) and that year’s business gas and electricity prices
        (Eurostat, {country ? countryName(country) : 'European median'}). This is what following the plan would have earned - before capital.
      </p>
    </div>
  )
}

// ---------- what the country grows under glass ----------

const GLASS_NAME: Record<GlassCrop, string> = { tomato: 'Tomatoes', cucumber: 'Cucumbers', pepper: 'Sweet peppers', lettuce: 'Lettuce', strawberry: 'Strawberries' }

export function GlassLocal({ country, pick }: { country: string | null; pick: GhCropId }) {
  const a = glassAreas(country)
  if (!a || !country) {
    return <p className="text-sm text-ink-3">Eurostat reports crops under glass for EU countries only{country ? ` - ${countryName(country)} is not among them` : ''}. Here the ranking stands on the model alone.</p>
  }
  const total = a.crops.reduce((s, c) => s + c.ha, 0)
  const max = Math.max(...a.crops.map((c) => c.ha))
  const pickGlass = (['tomato', 'cucumber', 'pepper', 'lettuce', 'strawberry'] as GlassCrop[]).find((g) => g === pick || (pick === 'cherry' && g === 'tomato'))
  const rank = pickGlass ? a.crops.findIndex((c) => c.crop === pickGlass) : -1
  return (
    <div>
      <div className="space-y-2">
        {a.crops.map((c) => (
          <div key={c.crop} className="grid grid-cols-[110px_minmax(0,1fr)_70px] items-center gap-3 text-sm">
            <span className={c.crop === pickGlass ? 'text-leaf' : 'text-ink-2'}>{GLASS_NAME[c.crop]}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <motion.i className="block h-full rounded-full" style={{ background: c.crop === pickGlass ? 'var(--color-leaf)' : 'rgb(255 255 255 / 0.28)' }} initial={false} animate={{ width: `${(c.ha / max) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
            </span>
            <span className="num text-right text-xs text-ink-3">{thousands(c.ha)} ha</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        {countryName(country)}, {a.year}: {thousands(total)} ha of these five crops under glass or high cover (Eurostat apro_cpsh1).{' '}
        {rank === 0 ? 'The pick is what most glass here already grows.' : rank > 0 ? `The pick is the country’s number ${rank + 1} under glass.` : 'The pick is not one of the crops Eurostat splits out under glass.'}
      </p>
    </div>
  )
}

// ---------- checked against real glasshouses ----------

type Check = { crop: string; house: string; model: number; reported: number; ratio: number; source?: string }
type Site = { country: string; name: string; role: string; house: string; checks: Check[] }
const V = validation as unknown as { sites: Site[]; summary: { tests: number; medianRatio: number; within25: number; within50: number } }

export function GlassProof({ country }: { country: string | null }) {
  const tone = (r: number) => (r >= 0.75 && r <= 1.33 ? 'text-leaf' : r >= 0.5 && r <= 2 ? 'text-wheat' : 'text-heat')
  const ROLE: Record<string, string> = { dev: 'calibration', test: 'test', mixed: 'glass + tunnels' }
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="font-mono text-[11px] text-ink-4">
              <th className="py-1.5 pr-3 font-normal">where</th>
              <th className="py-1.5 pr-3 font-normal">house</th>
              <th className="py-1.5 font-normal">model / reported kg per m² a year</th>
            </tr>
          </thead>
          <tbody>
            {V.sites.map((s) => (
              <tr key={s.country} className={`border-t border-white/6 ${s.country === country ? 'bg-white/[0.04]' : ''}`}>
                <td className="py-2 pr-3 align-top">
                  <div className="text-ink-2">{countryName(s.country)}</div>
                  <div className="font-mono text-[11px] text-ink-4">{s.name} · {ROLE[s.role] ?? s.role}</div>
                </td>
                <td className="py-2 pr-3 align-top text-xs text-ink-3">{s.house}</td>
                <td className="py-2 align-top">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {s.checks.map((c) => (
                      <span key={c.crop} className="text-xs" title={c.source ?? `Eurostat, median of the reported years; ×${c.ratio}`}>
                        <span className="text-ink-3">{GH_CROP_BY_ID[c.crop as GhCropId]?.name ?? c.crop} </span>
                        <span className="num text-ink-2">{c.model}</span>
                        <span className="text-ink-4">/{c.reported}</span>
                        <span className={`num ml-1 ${tone(c.ratio)}`}>×{c.ratio}</span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip tone="info"><BadgeCheck className="mr-1 inline h-3 w-3" />{V.summary.tests} test comparisons: median ×{V.summary.medianRatio}</Chip>
        <Chip tone={V.summary.within50 >= V.summary.tests / 2 ? 'warn' : 'bad'}>{V.summary.within25} within ±25 %, {V.summary.within50} within ±50 %</Chip>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        Heated glass is calibrated on the Netherlands and holds in Belgium within 3 % for pepper; tomato is calibrated on Dutch round and truss farms (60-65 kg/m²), so Eurostat’s tomato, which counts cherry and cocktail types too, reads lower in both countries. Germany, Poland and France report glasshouses and simple tunnels
        together, so a heated house is only an upper bound there. Unheated plastic is calibrated on Spain; in Italy, Greece and Portugal the model gives more kilos than
        reported (typically 1.3-2.5 ×): more sun there does not become proportionally more fruit in simple houses. Read the southern yields as what a well-run house can do.
      </p>
    </div>
  )
}

// ---------- energy prices behind the plan ----------

export function EnergyNote({ energy, prices, edited, onReset }: { energy: EnergyPrices; prices: Prices; edited: boolean; onReset: () => void }) {
  const hist = energy.country ? GH_DATA.gas[energy.country] : null
  const years = hist ? Object.keys(hist).map(Number).filter((y) => y >= 2015).sort() : []
  // what the grower pays (Dutch boiler gas at the glasshouse tariff)
  const vals = years.map((y) => energyFor(energy.country, y)?.heat ?? hist![String(y)])
  const max = Math.max(...vals, 0.001)
  return (
    <div className="mt-2 space-y-2">
      <div className="font-mono text-[11px] leading-relaxed text-ink-3">
        {edited ? 'your prices' : `Eurostat business prices, ${energy.country ? countryName(energy.country) : 'European median'} ${energy.year}, excl. VAT${energy.country === 'NL' ? ' · gas at the glasshouse energy tax' : ''}`}
        {edited && <button onClick={onReset} className="ml-2 underline decoration-white/20 underline-offset-2 hover:text-ink">back to Eurostat ({energy.country ? countryName(energy.country) : 'EU'} {energy.year})</button>}
        {!edited && energy.heat !== prices.heat && ' · edited'}
      </div>
      {vals.length > 3 && (
        <div className="flex items-end gap-[3px]" title="Business gas price per year, € per kWh (Eurostat nrg_pc_203)">
          {vals.map((v, i) => (
            <span key={years[i]} className="flex flex-col items-center gap-1">
              <i className={`block w-4 rounded-sm ${v > 0.06 ? 'bg-heat/70' : 'bg-white/20'}`} style={{ height: `${6 + (v / max) * 26}px` }} />
              <span className="font-mono text-[11px] text-ink-4">{`’${String(years[i]).slice(2)}`}</span>
            </span>
          ))}
          <span className="ml-2 self-center font-mono text-[11px] text-ink-4">gas, € {vals[0].toFixed(3)} → {vals.at(-1)!.toFixed(3)}</span>
        </div>
      )}
    </div>
  )
}

/** A compact line for the ranking: why a crop sits where it does. */
export function rankNote(r: GhResult): string {
  if (!r.plan.plant) return r.bestRun ? `does not pay: best run ${eurM2(r.bestRun.margin)}/m²` : 'cannot be carried in this house'
  const pos = r.years.filter((y) => y.margin > 0).length
  return `${eurM2(r.plan.margin)}/m² · ${r.years.length ? `${pos}/${r.years.length} years in profit` : 'no replay'} · ${carbonPerKg(r.plan)?.toFixed(2) ?? '-'} kg CO₂/kg`
}

export const GH_ICONS = { Factory, Sprout }

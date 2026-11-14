import { BadgeCheck, ExternalLink } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import { CROP_BY_ID, type CropId } from '../lib/crops'
import { pValue } from '../lib/format'
import { useWidth } from '../lib/hooks'
import type { SoilProfile } from '../lib/soil'
import { checkAll, yieldsFor, type CropCheck, type YieldData } from '../lib/validation'
import { cropRisk } from '../lib/water'
import { Chip, CropTile } from './ui'

type Summary = {
  sites: { id: string; label: string; checks: { crop: CropId; n: number; rho: number; p: number; hits: number }[] }[]
  series: number
  seasons: number
  medianRho: number
  significant: number
  hits: number
  worst: number
  chance: number
}

let summaryPromise: Promise<Summary | null> | null = null
const loadSummary = () =>
  (summaryPromise ??= fetch(`${import.meta.env.BASE_URL}data/yields/summary.json`).then((r) => (r.ok ? (r.json() as Promise<Summary>) : null)).catch(() => null))

const signedPct = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(Math.round(x * 100))}%`

/** Does the model's drought signal move with the harvests farmers actually brought in? */
export function ProofPanel({ lat, lon, climate, soil }: { lat: number; lon: number; climate: ClimateAnalysis; soil: SoilProfile }) {
  const [data, setData] = useState<YieldData | null | undefined>(undefined)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [pick, setPick] = useState<CropId | null>(null)
  useEffect(() => {
    let live = true
    setData(undefined)
    yieldsFor(lat, lon).then((d) => live && setData(d))
    loadSummary().then((s) => live && setSummary(s))
    return () => {
      live = false
    }
  }, [lat, lon])
  // always the observed climate and this field's soil - never a what-if
  const checks = useMemo(() => {
    if (!data) return []
    const risks = Object.fromEntries((Object.keys(data.crops) as CropId[]).map((id) => [id, cropRisk(CROP_BY_ID[id], climate, soil)]))
    return checkAll(data, risks)
  }, [data, climate, soil])
  const check = checks.find((c) => c.crop === pick) ?? checks[0]

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink">
          <BadgeCheck className="h-4 w-4 text-leaf" /> Checked against real harvests
        </div>
        <div className="font-mono text-[11px] text-ink-3">the same water model · reported yields it never saw</div>
      </div>

      {check ? (
        <>
          <p className="mt-3 max-w-4xl text-lg leading-relaxed text-ink">
            {headline(check)}
          </p>
          {checks.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Crop">
              {checks.map((c) => (
                <button
                  key={c.crop}
                  role="tab"
                  aria-selected={c === check}
                  onClick={() => setPick(c.crop)}
                  className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-[13px] transition ${c === check ? 'border-leaf/50 bg-leaf/10 text-ink' : 'border-white/10 text-ink-3 hover:text-ink'}`}
                >
                  <CropTile crop={CROP_BY_ID[c.crop]} size="xs" />
                  {CROP_BY_ID[c.crop].name}
                  <span className={`num text-[11px] ${c.rho >= 0.3 ? 'text-leaf' : 'text-ink-4'}`}>ρ {c.rho.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
          <HarvestChart check={check} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip tone={check.rho >= 0.3 && check.p < 0.05 ? 'good' : 'neutral'}>Spearman ρ {check.rho.toFixed(2)} · {pValue(check.p)}</Chip>
            <Chip tone="info">{check.rows.length} seasons</Chip>
            <Chip tone={check.hits >= 2 ? 'good' : 'neutral'}>{check.hits} of the 5 worst harvests flagged</Chip>
            <a href={check.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 font-mono text-[11px] text-ink-2 hover:text-ink">
              {check.source.name} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="mt-2 font-mono text-[11px] text-ink-4">{check.source.scale}</p>
        </>
      ) : data === undefined ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-white/[0.04]" />
      ) : (
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2">
          Reported yields are pre-baked for the demo regions, so this field is judged by the scoreboard below: the same model, run where
          harvest records exist.
        </p>
      )}

      {summary && <Scoreboard s={summary} here={data?.id ?? null} />}

      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Each harvest is compared with the median of the ten seasons around it, so better seed and machinery don’t count as weather. Harvests
        also fall for reasons a water balance cannot see - floods (Iowa 1993), frost and winter kill, pests, prices - and regional yields mix
        irrigated with rainfed fields, so a perfect match is impossible. What matters: in drought years the model and the harvests fall together.
      </p>
    </div>
  )
}

function headline(c: CropCheck): string {
  const name = CROP_BY_ID[c.crop].name.toLowerCase()
  const worst = c.rows.reduce((a, b) => (b.anomaly < a.anomaly ? b : a))
  const strong = c.rho >= 0.3 && c.p < 0.05
  const lead = strong
    ? `The model’s drought signal moves with the real ${name} harvest here`
    : `For ${name} here the drought signal explains little of the harvest`
  const w = c.flagged.includes(worst.year)
    ? ` The worst harvest, ${worst.year} (${signedPct(worst.anomaly)}), was one of the five seasons the model calls driest.`
    : ` The worst harvest, ${worst.year} (${signedPct(worst.anomaly)}), was not a dry season in the model - something else hit it.`
  return `${lead}: ρ = ${c.rho.toFixed(2)} over ${c.rows.length} seasons.${w}`
}

/** Two rows on one time axis: what was harvested vs its decade, and what the weather should have cost. */
function HarvestChart({ check }: { check: CropCheck }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const rows = check.rows
  const n = rows.length
  const padL = 34
  const bw = (width - padL - 4) / n
  const x = (i: number) => padL + bw * i
  const A = Math.max(0.25, ...rows.map((r) => Math.abs(r.anomaly)))
  const L = Math.max(0.2, ...rows.map((r) => r.loss))
  const top = { mid: 74, h: 50 } // harvest row: anomaly around a mid line
  const bot = { y0: 156, h: 62 } // model row: loss hangs down from y0
  const H = 244
  const worst = new Set(check.worst)
  const flagged = new Set(check.flagged)
  const h = hover !== null ? rows[hover] : null
  return (
    <div ref={box} className="mt-5 w-full min-w-0">
      <svg width={width} height={H} className="block overflow-visible" role="img" aria-label="Reported harvest anomaly and modelled water-stress loss by season">
        <text x={0} y={9} className="fill-ink-3 font-mono text-[10px]">reported harvest vs the surrounding decade</text>
        <text x={0} y={bot.y0 - 14} className="fill-ink-3 font-mono text-[10px]">model: yield the season’s water should have cost</text>
        <line x1={padL} x2={width - 4} y1={top.mid} y2={top.mid} stroke="rgb(255 255 255 / 0.15)" />
        <line x1={padL} x2={width - 4} y1={bot.y0} y2={bot.y0} stroke="rgb(255 255 255 / 0.15)" />
        <text x={padL - 5} y={top.mid - top.h + 8} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">+{Math.round(A * 100)}%</text>
        <text x={padL - 5} y={top.mid + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">0</text>
        <text x={padL - 5} y={top.mid + top.h} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">−{Math.round(A * 100)}%</text>
        <text x={padL - 5} y={bot.y0 + bot.h} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">{Math.round(L * 100)}%</text>
        {rows.map((r, i) => {
          const hit = worst.has(r.year) && flagged.has(r.year)
          const ah = (Math.abs(r.anomaly) / A) * top.h
          const lh = (r.loss / L) * bot.h
          return (
            <g key={r.year} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onClick={() => setHover(i)}>
              {hit && <rect x={x(i) + 0.5} y={top.mid - top.h - 4} width={bw - 1} height={bot.y0 + bot.h - top.mid + top.h + 8} rx={3} fill="rgb(201 176 122 / 0.1)" />}
              {hover === i && <rect x={x(i)} y={top.mid - top.h - 4} width={bw} height={bot.y0 + bot.h - top.mid + top.h + 8} rx={3} fill="rgb(255 255 255 / 0.06)" />}
              <motion.rect
                x={x(i) + bw * 0.18}
                width={bw * 0.64}
                rx={Math.min(2, bw * 0.2)}
                fill={r.anomaly < 0 ? 'var(--color-heat)' : 'var(--color-leaf)'}
                opacity={worst.has(r.year) ? 1 : 0.55}
                initial={{ y: top.mid, height: 0 }}
                whileInView={{ y: r.anomaly < 0 ? top.mid : top.mid - ah, height: Math.max(1, ah) }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.012 }}
              />
              <motion.rect
                x={x(i) + bw * 0.18}
                width={bw * 0.64}
                y={bot.y0}
                rx={Math.min(2, bw * 0.2)}
                fill="var(--color-wheat)"
                opacity={flagged.has(r.year) ? 1 : 0.45}
                initial={{ height: 0 }}
                whileInView={{ height: Math.max(1, lh) }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.012 }}
              />
              {(r.year % 5 === 0 || worst.has(r.year)) && (
                <text x={x(i) + bw / 2} y={H - 6} textAnchor="middle" className={`font-mono text-[10px] ${worst.has(r.year) ? (hit ? 'fill-leaf' : 'fill-heat') : 'fill-ink-4'}`}>
                  {bw < 16 ? `’${String(r.year).slice(2)}` : r.year}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-3">
        {h ? (
          <>
            <span className="text-ink">{h.year}</span>
            <span className={h.anomaly < 0 ? 'text-heat' : 'text-leaf'}>harvest {signedPct(h.anomaly)} vs its decade</span>
            <span className="text-wheat">model: −{Math.round(h.loss * 100)}% from water stress</span>
            {worst.has(h.year) && flagged.has(h.year) && <span className="text-leaf">✓ called</span>}
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-heat" />bright = one of the 5 worst harvests</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-wheat" />bright = one of the model’s 5 driest seasons</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-3 rounded-sm bg-leaf/30" />both - a drought the model called</span>
          </>
        )}
      </div>
    </div>
  )
}

function Scoreboard({ s, here }: { s: Summary; here: string | null }) {
  return (
    <div className="mt-6 border-t border-white/8 pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="kicker !text-[11px]">The whole check · every demo region</span>
        <span className="font-mono text-[11px] text-ink-4">{s.series} crop series · {s.seasons} seasons</span>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        Median ρ <span className="num text-ink">{s.medianRho.toFixed(2)}</span>, significant in <span className="num text-ink">{s.significant} of {s.series}</span> series. Of the{' '}
        {s.worst} worst harvests, the model had flagged <span className="num text-leaf">{s.hits}</span> as one of its five driest seasons - picking seasons at
        random would catch about <span className="num text-ink">{Math.round(s.chance)}</span>.
      </p>
      <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {s.sites.map((site) => (
          <div key={site.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 ${site.id === here ? 'bg-leaf/[0.07]' : ''}`}>
            <span className="w-40 truncate text-[13px] text-ink-2">{site.label.split(',').slice(0, 2).join(',')}</span>
            {site.checks.map((c) => (
              <span key={c.crop} className="flex items-center gap-1 font-mono text-[11px]" title={`${CROP_BY_ID[c.crop].name}: ρ ${c.rho}, ${c.n} seasons, ${c.hits}/5 worst harvests flagged`}>
                <span className="text-ink-3">{CROP_BY_ID[c.crop].symbol}</span>
                <span className={c.rho >= 0.3 && c.p < 0.05 ? 'text-leaf' : c.rho > 0 ? 'text-ink-2' : 'text-heat'}>{c.rho.toFixed(2)}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

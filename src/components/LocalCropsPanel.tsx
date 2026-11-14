import { ArrowRight, MapPin, Repeat, Scale, Trees } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { CROP_BY_ID, isCropId, type CropId } from '../lib/crops'
import { FACTOR_INFO } from '../lib/explain'
import { pct } from '../lib/format'
import { OTHER_NAMES, type LocalCrops } from '../lib/localCrops'
import { COUNTRY } from '../lib/markets'
import { disagreement, localShares, PRACTICE_WEIGHT, practiceInformed, verdictKind, verdictText, whyDifferent, type Disagreement } from '../lib/practice'
import type { Evaluation, FieldContext, Priorities } from '../lib/rotation'
import { loadRotations, PRIOR_CHECK, REACH_KM, rotationPrior, rotationShares, type RotationPrior, type RotationWindow, type RotationWindows } from '../lib/rotationPrior'
import { showPart } from '../lib/reveal'
import { Toggle } from './ui'

const EASE = [0.16, 1, 0.3, 1] as const
/** CROPGRIDS groups that map onto a Zixtaro crop under another id */
const ALIAS: Record<string, string> = { bean: 'drybean' }
const OTHER_TONE = ['#8a93a6', '#6f7788', '#5a6171', '#4a505d']

/**
 * What farms around the field actually grow (CROPGRIDS 2020, 0.5° cell) next to the ranking - the reality check a
 * recommendation should always be read against: local markets, machinery, know-how and pests are invisible to a model.
 */
export function LocalCropsPanel({ data, ranking, ctx, priorities, history, lat, lon }: { data: { here: LocalCrops | null; source: string; url: string } | null; ranking: Evaluation[]; ctx: FieldContext; priorities: Priorities; history: (CropId | null)[]; lat: number; lon: number }) {
  const here = data?.here ?? null
  const [withPractice, setWithPractice] = useState(false)
  const shares = useMemo(() => localShares(here), [here])
  const why = useMemo(() => (here ? disagreement(ranking, shares, ctx, priorities) : null), [here, ranking, shares, ctx, priorities])
  // what farms around sow after this field's last crops (field records of the USA, Canada and France, loaded on demand)
  const [rotations, setRotations] = useState<RotationWindows | null>(null)
  useEffect(() => {
    let live = true
    loadRotations().then((d) => live && setRotations(d))
    return () => {
      live = false
    }
  }, [])
  const prior = useMemo(() => (rotations ? rotationPrior(rotations, lat, lon, history) : null), [rotations, lat, lon, history])
  const rotation = rotationShares(prior)
  const informed = useMemo(() => practiceInformed(ranking, shares, PRACTICE_WEIGHT, rotation), [ranking, shares, rotation])
  const whyNext = useMemo(() => whyDifferent(ranking, rotation, ctx, priorities), [ranking, rotation, ctx, priorities])
  // the model and the farms agree when the crop sown most after these crops, among the ranked, is the model's #1
  const agree = !!rotation && !whyNext && ranking.some((e) => (rotation[e.crop.id] ?? 0) > 0)
  const rows = useMemo(() => {
    if (!here) return []
    const seen = new Map<string, number>()
    // CROPGRIDS "millet" is pearl millet in the tropics and subtropics, proso millet in the temperate north
    const alias = (id: string) => (id === 'millet' && Math.abs(here.cell.lat) < 30 ? 'pearlmillet' : ALIAS[id] ?? id)
    return here.crops.slice(0, 8).map((c, i) => {
      const id = alias(c.id)
      const modelled = isCropId(id)
      const rank = modelled ? ranking.findIndex((e) => e.crop.id === id) + 1 : 0
      return {
        key: c.id, id, share: c.share, rank, modelled,
        // the form this field grows (spring wheat on the steppe), as the ranking names it
        name: modelled ? (ranking.find((e) => e.crop.id === id)?.crop.name ?? CROP_BY_ID[id].name) : OTHER_NAMES[c.id] ?? c.id,
        color: (() => {
          const base = modelled ? CROP_BY_ID[id].color : OTHER_TONE[i % OTHER_TONE.length]
          // crops of one family share a colour: darken each repeat so the bar segments stay apart
          const k = seen.get(base) ?? 0
          seen.set(base, k + 1)
          return k ? `color-mix(in oklab, ${base} ${100 - 22 * k}%, #05080d)` : base
        })(),
      }
    })
  }, [here, ranking])
  if (!data) {
    // the CROPGRIDS grid loads on demand: hold the panel's place so the page below does not jump
    return (
      <div className="panel p-5 sm:p-6" aria-busy="true" aria-label="Loading what farms grow around here">
        <div className="flex items-center gap-2 text-[15px] text-ink-3"><MapPin className="h-4 w-4 text-ink-4" /> What farms grow around here</div>
        <div className="mt-4 h-3 animate-pulse rounded-full bg-white/[0.05]" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-white/[0.04]" style={{ animationDelay: `${i * 120}ms` }} />)}
        </div>
      </div>
    )
  }
  if (!here) {
    return (
      <div className="panel flex items-center gap-3 p-5 text-[13.5px] text-ink-3">
        <MapPin className="h-4 w-4 text-ink-4" /> No cropland recorded within ~100 km in CROPGRIDS 2020 - there is no local practice to compare the plan with.
      </div>
    )
  }
  const top = ranking[0]
  const pickShare = top ? rows.find((r) => r.id === top.crop.id)?.share ?? here.crops.find((c) => (ALIAS[c.id] ?? c.id) === top.crop.id)?.share ?? 0 : 0
  const listed = here.crops.reduce((a, c) => a + c.share, 0)
  const biggest = rows.filter((r) => r.modelled).slice(0, 3)
  const inTop5 = biggest.filter((r) => r.rank >= 1 && r.rank <= 5).length
  // tree and bush crops (CROPGRIDS: oil palm, coffee, cocoa and the pooled orchards) have a long-term view of their own
  const treeShare = here.crops.filter((c) => ['trees', 'oilpalm', 'coffee', 'cocoa'].includes(c.id)).reduce((a, c) => a + c.share, 0)
  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><MapPin className="h-4 w-4 text-wheat" /> What farms grow around here</div>
        <a href={data.url} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-ink-3 hover:text-ink">
          CROPGRIDS 2020 · {here.offset ? 'nearest farmed ' : ''}0.5° cell · {here.areaKm2.toLocaleString('en')} km² harvested
        </a>
      </div>

      {/* the cell's harvested area as one bar */}
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/[0.05]">
        {rows.map((r, i) => (
          <motion.i
            key={r.key}
            className="block h-full"
            style={{ background: r.color }}
            initial={{ width: 0 }}
            whileInView={{ width: `${r.share * 100}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.05 * i, ease: EASE }}
            title={`${r.name} ${pct(r.share)}`}
          />
        ))}
      </div>
      <div className="mt-1 text-right font-mono text-[11px] text-ink-4">{pct(Math.max(0, 1 - listed))} other crops</div>

      <div className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5 text-[13px]">
            <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{r.name}</span>
            <span className="num text-ink-3">{pct(r.share)}</span>
            <span className={`w-24 text-right font-mono text-[11px] ${r.modelled ? (r.rank && r.rank <= 5 ? 'text-leaf' : 'text-ink-3') : 'text-ink-4'}`}>
              {r.modelled ? (r.rank ? `our #${r.rank}` : 'switched off') : 'not modelled'}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
        {/* a cover crop or a bare fallow is not sold, so the harvested-area map says nothing about it */}
        {top && (top.crop.econ.yield === 0
          ? `${top.crop.name} sells nothing - it is a season for the soil and the next crop, which crop maps do not record.`
          : pickShare >= 0.05
          ? `${top.crop.name} is already grown on ${pct(pickShare)} of the farmland here - markets, machinery and know-how exist.`
          : pickShare > 0
            ? `${top.crop.name} is grown here, but on only ${pct(pickShare)} of the farmland - check buyers and storage before you switch.`
            : `Hardly anyone grows ${top.crop.name.toLowerCase()} around here: the climate and soil may suit it, but a buyer, storage and know-how may not exist yet.`)}{' '}
        {biggest.length > 0 && `Of the region’s ${biggest.length} biggest modelled crops, ${inTop5} ${inTop5 === 1 ? 'is' : 'are'} in our top five.`}
      </p>

      {why && <WhyNotLocal d={why} country={COUNTRY[ctx.market?.home ?? '']?.name ?? 'this country'} />}

      {rotations && <RotationNext prior={prior} history={history} ranking={ranking} years={rotations.years} why={whyNext} agree={agree} />}

      {treeShare >= 0.03 && (
        <button onClick={() => showPart('trees')} className="mt-4 flex items-center gap-2 text-left text-[13px] text-orbit hover:underline">
          <Trees className="h-4 w-4 shrink-0" aria-hidden />
          Orchards and plantations cover {pct(treeShare)} of the harvested land here - they are not ranked with the season’s crops; see how FAO rates them for the decades ahead
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
      )}

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <Toggle
          checked={withPractice}
          onChange={setWithPractice}
          label="Consider local practice"
          hint="Re-ranks with what farms around here actually grow - evidence of markets and know-how, not the answer. The science-only ranking above stays as it is."
        />
        {/* the formula is Method material: one click away, not the switch's hint */}
        <details className="mt-2 text-[12px] leading-relaxed text-ink-4">
          <summary className="cursor-pointer text-ink-3 transition hover:text-ink">How the prior is computed</summary>
          <p className="mt-1.5">
            score × national proof (1 if the country harvests the crop at scale, 0.8 for a niche or a crop only its neighbours grow, 0.5 if only the world does) × (1 + {PRACTICE_WEIGHT} × √share of the land around - or, where field records show what farms here sow after this field’s last crops, of that share).
          </p>
        </details>
        {withPractice && <PracticeMoves informed={informed} byRotation={!!rotation} />}
      </div>
    </div>
  )
}

/** Why the model does not pick what farms around grow most - in its own numbers. */
function WhyNotLocal({ d, country }: { d: Disagreement; country: string }) {
  const name = d.grown.crop.name
  const pick = d.cmp.a.crop.name
  const lead = d.cmp.parts.find((p) => p.points > 0.5)
  const failNote = d.grown.notes.find((n) => n.tone === 'bad' && (n.tag === 'water' || n.tag === 'fit'))
  const verdict = verdictText(d) + (verdictKind(d) === 'physics' && failNote ? ` ${failNote.text}` : '')
  return (
    <div className="mt-5 rounded-xl border border-wheat/20 bg-wheat/[0.04] p-4">
      <div className="flex items-center gap-2 text-[13.5px] text-ink"><Scale className="h-4 w-4 text-wheat" /> Why the model differs from local practice</div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
        Farms here grow {name.toLowerCase()} most ({pct(d.share)} of the harvested land); Zixtaro ranks it #{d.ourRank}. {verdict}
        {lead && ` ${pick} leads it by ${d.cmp.gap.toFixed(1)} points, most of them on ${FACTOR_INFO[lead.key].label.toLowerCase()} (+${lead.points.toFixed(1)}).`}
      </p>
      {d.observed !== null && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          The model expects ~{d.harvest.toFixed(1)} t/ha of {name.toLowerCase()} on this field; farms in {country} harvest {d.observed.toFixed(1)} t/ha on average (FAOSTAT).
          {d.harvest < 0.7 * d.observed ? ' If yours are nearer the national figure, the model underrates it here - tell it your yield or price.' : ''}
        </p>
      )}
    </div>
  )
}

const SOURCE_NAME: Record<RotationWindow['source'], string> = { cdl: 'USDA Cropland Data Layer', aci: 'AAFC Annual Crop Inventory', rpg: 'French RPG parcels' }

/** What farms around sow after this field's last crops - observed field by field (rotationPrior.ts); practice, not advice. */
function RotationNext({ prior, history, ranking, years, why, agree }: { prior: RotationPrior | null; history: (CropId | null)[]; ranking: Evaluation[]; years: number[]; why: ReturnType<typeof whyDifferent>; agree: boolean }) {
  const pick = ranking[0]
  // the largest part of the gap in the pick's favour (parts come largest first by size, either sign)
  const lead = why?.cmp.parts.find((p) => p.points > 0.5)
  const last = history[history.length - 1] ?? null
  const nameOf = (id: CropId) => ranking.find((e) => e.crop.id === id)?.crop.name ?? CROP_BY_ID[id].name
  const span = `${years[0]}-${years[years.length - 1]}`
  if (!last || !prior || prior.level === 'region') {
    const say = !prior
      ? last && 'What farms sow after given crops is known only where field-by-field records exist: the USA, Canada and France.'
      : !last
        ? <>Fill in <a href="#field" className="text-orbit hover:underline">this field’s last seasons</a> to see what farms around here sow after the same crops (field records, {span}).</>
        : `Too few fields around here grew ${nameOf(last).toLowerCase()} last season to say what farms sow after it.`
    return say ? <p className="mt-4 flex gap-2 text-[12.5px] leading-relaxed text-ink-3"><Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden /><span>{say}</span></p> : null
  }
  const seq = (prior.level === 'two' ? history.slice(-2) : [last]) as CropId[]
  const top = (Object.entries(prior.probs) as [CropId, number][]).filter(([, p]) => p >= 0.005).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const shown = top.reduce((a, [, p]) => a + p, 0)
  return (
    <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-[13.5px] text-ink">
        <Repeat className="h-4 w-4 shrink-0 text-wheat" aria-hidden /> After {seq.map(nameOf).join(' → ')}, farms around here sow
      </div>
      <div className="mt-3 space-y-2 sm:space-y-1.5">
        {top.map(([id, p], i) => {
          const rank = ranking.findIndex((e) => e.crop.id === id) + 1
          // a phone puts the bar on a line of its own under the crop's name
          return (
            <div key={id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-1 text-[13px] sm:grid-cols-[8rem_minmax(0,1fr)_2.5rem_4.5rem]">
              <span className="truncate text-ink-2">{nameOf(id)}</span>
              <span className="order-last col-span-3 h-1.5 overflow-hidden rounded-full bg-white/[0.05] sm:order-none sm:col-span-1 sm:h-2">
                {/* the width is the share itself; only the growth is animated, so a skipped animation still draws it right
                    (Beauce: with the width animated, an animation that never ran left every bar full) */}
                <motion.i
                  className="block h-full origin-left rounded-full"
                  style={{ background: CROP_BY_ID[id].color, width: `${p * 100}%` }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.05 * i, ease: EASE }}
                />
              </span>
              <span className="num text-right text-ink-3">{pct(p)}</span>
              <span className={`text-right font-mono text-[11px] ${rank && rank <= 5 ? 'text-leaf' : 'text-ink-3'}`}>{rank ? `our #${rank}` : 'switched off'}</span>
            </div>
          )
        })}
      </div>
      {shown < 0.98 && <div className="mt-1 text-right font-mono text-[11px] text-ink-4">{pct(1 - shown)} other crops</div>}
      {pick && (why || agree) && (
        <dl className="mt-4 grid gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-3 text-[12.5px] sm:grid-cols-[9rem_1fr]">
          <dt className="text-ink-3">Recommended</dt>
          <dd className="text-ink">{pick.crop.name} <span className="num text-ink-3">· score {pick.score.toFixed(1)}</span></dd>
          <dt className="text-ink-3">Currently common</dt>
          <dd className="text-ink">{why ? <>{why.grown.crop.name} <span className="num text-ink-3">· {pct(why.share)} of these fields · our #{why.ourRank}</span></> : <>{pick.crop.name} - the model and the farms here agree</>}</dd>
          {why && (
            <>
              <dt className="text-ink-3">Why different</dt>
              <dd className="leading-relaxed text-ink-2">
                {verdictText(why)}
                {lead && ` ${pick.crop.name} leads it by ${why.cmp.gap.toFixed(1)} points, most of them on ${FACTOR_INFO[lead.key].label.toLowerCase()} (+${lead.points.toFixed(1)}).`}
                {why.flags.length > 0 && ` Its rotation carries a risk the model shows but does not price: ${why.flags.map((f) => f.text.charAt(0).toLowerCase() + f.text.slice(1)).join('; ')}.`}
              </dd>
            </>
          )}
        </dl>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
        Observed, not advised: {Math.round(prior.n).toLocaleString('en')} sample points on fields within {REACH_KM} km that grew {prior.level === 'two' ? 'the same two crops in this order' : `${nameOf(last).toLowerCase()} last season`}, the nearer counting more ({prior.sources.map((s) => SOURCE_NAME[s]).join(', ')}, {span}).
        On areas held out of the data it named the next crop first on {pct(PRIOR_CHECK.top1)} of rotating fields; “the crop of two seasons before” did on {pct(PRIOR_CHECK.twoBack)}.
      </p>
    </div>
  )
}

/** How the order moves with the practice prior: each moving crop's scientific score, its prior and the product. */
function PracticeMoves({ informed, byRotation }: { informed: ReturnType<typeof practiceInformed>; byRotation: boolean }) {
  // the leading crops that move, and always the crops farms around really grow
  const moved = informed.filter((x) => x.rank !== x.was && (x.rank <= 8 || x.was <= 8 || x.share >= 0.05)).slice(0, 10)
  if (!moved.length) return <p className="mt-3 text-[12.5px] text-ink-3">Nothing moves: none of the leading crops is grown around here, or the science already puts them first.</p>
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-[12px] sm:text-[12.5px]">
        <thead>
          <tr className="text-left font-mono text-[11px] uppercase tracking-wide text-ink-3">
            <th className="py-1 pr-1 sm:pr-2 font-normal">crop</th>
            <th className="py-1 pr-1 sm:pr-2 text-right font-normal">{byRotation ? 'sown next' : 'around'}</th>
            <th className="py-1 pr-1 sm:pr-2 text-right font-normal">science</th>
            <th className="py-1 pr-1 sm:pr-2 text-right font-normal">× prior</th>
            <th className="py-1 pr-1 sm:pr-2 text-right font-normal">= total</th>
            <th className="py-1 text-right font-normal">rank</th>
          </tr>
        </thead>
        <tbody>
          {moved.map((x) => (
            <tr key={x.e.crop.id} className="border-t border-white/[0.05]">
              <td className="max-w-[5.5rem] truncate py-1 pr-1 sm:pr-2 text-ink-2 sm:max-w-[9rem]">{x.e.crop.name}</td>
              <td className="num py-1 pr-1 sm:pr-2 text-right text-ink-3">{x.share > 0 ? pct(x.share) : '-'}</td>
              <td className="num py-1 pr-1 sm:pr-2 text-right text-ink-2">{x.e.score.toFixed(1)}</td>
              <td className="num py-1 pr-1 sm:pr-2 text-right text-ink-3" title={`national proof ${x.proof.toFixed(2)} × local ${(x.prior / x.proof).toFixed(2)}`}>{x.prior.toFixed(2)}</td>
              <td className="num py-1 pr-1 sm:pr-2 text-right text-ink">{x.score.toFixed(1)}</td>
              <td className={`whitespace-nowrap py-1 text-right font-mono text-[11px] ${x.rank < x.was ? 'text-leaf' : 'text-ink-3'}`}>#{x.was} → #{x.rank}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

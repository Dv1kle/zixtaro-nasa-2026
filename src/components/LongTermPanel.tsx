import { RotateCw, Trees } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { pct } from '../lib/format'
import { GAEZ_AGREEMENT, GAEZ_CLASSES, GAEZ_LAYERS, GAEZ_SOURCE, gaezAt, longTerm, presetGaez, siClass, TREE_NAMES, treesAround, UNRATED, type LongTermRow, type TreeId } from '../lib/perennials'

const EASE = [0.16, 1, 0.3, 1] as const
/** the two 2050s scenarios: validated as a pair on the dark panel (dataviz validate_palette: CVD ΔE 26.8, contrast >= 3:1) */
const RCP45 = '#3987e5'
const RCP85 = '#d95926'
/** class boundaries drawn on every track (GAEZ v4 suitability index) */
const TICKS = [10, 25, 40, 55, 70, 85]

type Around = { here: Partial<Record<TreeId, number>>; source: string; url: string } | null

/**
 * Orchards and plantations for this spot: planted once and kept for decades, so never ranked with the season's crops.
 * FAO GAEZ v4's suitability of the cell's cropland now and in the 2050s, beside what the farmland around grows.
 */
export function LongTermPanel({ lat, lon, presetId }: { lat: number; lon: number; presetId: string | null }) {
  const baked = presetGaez(presetId)
  const [values, setValues] = useState<number[] | null>(baked)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [around, setAround] = useState<Around | undefined>(undefined)

  useEffect(() => {
    if (baked) {
      setValues(baked)
      setError(null)
      return
    }
    setValues(null)
    setError(null)
    const ac = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ac.abort()
    }, 20_000)
    gaezAt(lat, lon, ac.signal)
      .then((v) => setValues(v))
      .catch((e: unknown) => {
        if (ac.signal.aborted && !timedOut) return // the field changed or the panel closed
        setError(timedOut ? 'FAO’s GAEZ server did not answer within 20 seconds.' : `FAO’s GAEZ server could not be read (${e instanceof Error ? e.message : String(e)}).`)
      })
      .finally(() => clearTimeout(timer))
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `baked` follows presetId
  }, [lat, lon, presetId, attempt])

  useEffect(() => {
    let live = true
    setAround(undefined)
    treesAround(lat, lon).then((a) => live && setAround(a))
    return () => {
      live = false
    }
  }, [lat, lon])

  const rows = useMemo(() => (values ? longTerm(values, GAEZ_LAYERS, around?.here ?? null) : null), [values, around])

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink">
          <Trees className="h-4 w-4 text-leaf" aria-hidden /> Orchards & plantations - planted once, kept for decades
        </div>
        <a href={GAEZ_SOURCE.portal} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-ink-3 hover:text-ink">
          FAO GAEZ v4 · rain-fed, high inputs · 5′ cell (~9 km)
        </a>
      </div>
      <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-3">
        A tree crop is not a next-season choice, so none of these is ranked with the season’s crops. FAO’s GAEZ v4 rates the cropland of this
        spot for nine of them, in today’s climate (1981-2010) and in the 2050s’ (2041-2070: four climate models, moderate and high emissions,
        no CO₂ fertilisation) - a direction for a planting that will still stand then, not a forecast.
      </p>

      {error ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-ink-2">
          {error}
          <button onClick={() => setAttempt((a) => a + 1)} className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-[12.5px] text-ink hover:bg-white/[0.06]">
            <RotateCw className="h-3.5 w-3.5" aria-hidden /> Try again
          </button>
        </div>
      ) : !rows ? (
        <div className="mt-4 space-y-2.5" aria-busy="true" aria-label="Reading FAO GAEZ v4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-white/[0.04]" style={{ animationDelay: `${i * 120}ms` }} />)}
        </div>
      ) : (
        <Ratings rows={rows} around={around} />
      )}

      <p className="mt-4 text-[12px] leading-relaxed text-ink-4">
        GAEZ rates climate, soil and terrain for rain-fed growing with modern inputs, on the current cropland of a ~9 km grid cell - not this
        field, and not establishment cost, years to the first harvest, buyers or irrigation. Planting needs a local nursery and advice.{' '}
        <a href={GAEZ_SOURCE.portal} target="_blank" rel="noreferrer" className="text-ink-3 underline decoration-white/20 underline-offset-2 hover:text-ink">GAEZ v4 data portal</a>
        {around?.url && (
          <>
            {' · '}
            <a href={around.url} target="_blank" rel="noreferrer" className="text-ink-3 underline decoration-white/20 underline-offset-2 hover:text-ink">CROPGRIDS 2020</a>
          </>
        )}
      </p>
    </div>
  )
}

const any = (r: LongTermRow) => r.now > 0 || r.rcp45 > 0 || r.rcp85 > 0
const worse = (r: LongTermRow) => Math.min(r.rcp45, r.rcp85)

function Ratings({ rows, around }: { rows: LongTermRow[]; around: Around | undefined }) {
  const shown = rows.filter((r) => any(r) || (r.around ?? 0) >= 0.01 || r.otherLand !== null)
  const none = rows.filter((r) => !shown.includes(r))
  const best = rows[0]
  const gainer = [...rows].sort((a, b) => Math.max(b.rcp45, b.rcp85) - Math.max(a.rcp45, a.rcp85))[0]
  // farms grow it although GAEZ rates the cropland unsuitable, or GAEZ rates it well and nobody around grows it - said
  // only once what farms grow around is known (around null: still loading, or the grid could not be read)
  const grownAnyway = shown.filter((r) => r.now === 0 && (r.around ?? 0) >= 0.03)
  const unplanted = shown.filter((r) => r.now > 55 && r.around !== null && r.around < 0.01)
  // a cell with little cropland swings with GAEZ's temperature limits; all its land moves less
  const step = (a: number, b: number) => Math.abs(siClass(a).n - siClass(b).n)
  const swings = shown.filter((r) => r.land === 'cropland' && step(r.now, worse(r)) >= 3 && step(r.allLand.now, Math.min(r.allLand.rcp45, r.allLand.rcp85)) < step(r.now, worse(r)))
  const unrated = around ? UNRATED.filter((id) => (around.here[id] ?? 0) >= 0.01) : []
  if (rows.every((r) => Number.isNaN(r.now))) {
    return <p className="mt-4 text-[13.5px] text-ink-3">GAEZ has no rating for this spot: its 5′ cell is water or ice in GAEZ’s land mask.</p>
  }

  return (
    <div className="mt-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[14px] leading-relaxed text-ink-2">
        {best.now > 0 ? (
          <>
            Best rated here: <span className="text-ink">{TREE_NAMES[best.id]}</span> - {siClass(best.now).label.toLowerCase()} now; in the 2050s{' '}
            {siClass(best.rcp45).label.toLowerCase()} with moderate emissions, {siClass(best.rcp85).label.toLowerCase()} with high.
          </>
        ) : Math.max(gainer.rcp45, gainer.rcp85) > 0 ? (
          <>
            None of the nine is suitable on this cropland now. By the 2050s <span className="text-ink">{TREE_NAMES[gainer.id]}</span> becomes{' '}
            {siClass(Math.max(gainer.rcp45, gainer.rcp85)).label.toLowerCase()} - a planting started today would grow into that climate.
          </>
        ) : (
          <>None of the nine is suitable on this cropland - now or in the 2050s. Here the long-term choices are the season’s crops.</>
        )}
      </div>

      {shown.length > 0 && (
        <>
          <Legend />
          <ul className="mt-2 divide-y divide-white/[0.05]">
            {shown.map((r, i) => (
              <Row key={r.id} r={r} i={i} />
            ))}
          </ul>
          <Scale />
          <Trust ids={shown.map((r) => r.id)} />
        </>
      )}

      {rows[0].land === 'all' && (
        <p className="mt-3 text-[12.5px] text-ink-3">GAEZ’s 5′ cell holds no current cropland, so these ratings are for all its land.</p>
      )}
      {none.length > 0 && (
        <p className="mt-3 text-[12.5px] text-ink-3">
          Not suitable here now or in the 2050s, and not grown around: {none.map((r) => TREE_NAMES[r.id].toLowerCase()).join(', ')}.
        </p>
      )}
      {grownAnyway.length > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          Farms around grow {grownAnyway.map((r) => TREE_NAMES[r.id].toLowerCase()).join(' and ')} although GAEZ rates this cropland unsuitable
          for {grownAnyway.length > 1 ? 'them' : 'it'} rain-fed - irrigation, local cultivars or a slope GAEZ’s 9 km cell cannot see. The farms are the stronger evidence.
        </p>
      )}
      {unplanted.length > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          Nobody around grows {unplanted.map((r) => TREE_NAMES[r.id].toLowerCase()).join(' or ')}, though GAEZ rates {unplanted.length > 1 ? 'them' : 'it'} well:
          climate and soil allow it, but a buyer, a processing plant or the bad years may not.
        </p>
      )}
      {swings.length > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          {swings.map((r, i) => `${i ? TREE_NAMES[r.id].toLowerCase() : TREE_NAMES[r.id]} moves from ${siClass(r.now).label.toLowerCase()} to ${siClass(worse(r)).label.toLowerCase()} on the cell’s cropland but from ${siClass(r.allLand.now).label.toLowerCase()} to ${siClass(Math.min(r.allLand.rcp45, r.allLand.rcp85)).label.toLowerCase()} on all its land`).join('; ')}:
          where a cell holds little cropland, a degree or two can carry all of it across one of GAEZ’s temperature limits. Read the jump as a direction.
        </p>
      )}
      {unrated.length > 0 && around && (
        <p className="mt-2 text-[12.5px] text-ink-3">
          GAEZ does not rate {unrated.map((id) => TREE_NAMES[id].toLowerCase()).join(', ')}; around here they cover{' '}
          {unrated.map((id) => `${TREE_NAMES[id].toLowerCase()} ${pct(around.here[id] ?? 0)}`).join(', ')} of the harvested area.
        </p>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-3" aria-hidden>
      <span className="flex items-center gap-1.5"><Mark kind="now" /> now (1981-2010)</span>
      <span className="flex items-center gap-1.5"><Mark kind="45" /> 2050s, moderate emissions (RCP 4.5)</span>
      <span className="flex items-center gap-1.5"><Mark kind="85" /> 2050s, high emissions (RCP 8.5)</span>
    </div>
  )
}

function Mark({ kind, className = '' }: { kind: 'now' | '45' | '85'; className?: string }) {
  if (kind === 'now') return <span className={`inline-block h-[10px] w-[10px] rounded-full bg-ink ring-2 ring-[#0a111c] ${className}`} />
  if (kind === '45') return <span className={`inline-block h-[10px] w-[10px] rounded-full border-2 bg-[#0a111c] ${className}`} style={{ borderColor: RCP45 }} />
  return <span className={`inline-block h-[9px] w-[9px] rotate-45 ring-2 ring-[#0a111c] ${className}`} style={{ background: RCP85 }} />
}

function Row({ r, i }: { r: LongTermRow; i: number }) {
  const lo = Math.min(r.now, r.rcp45, r.rcp85)
  const hi = Math.max(r.now, r.rcp45, r.rcp85)
  const now = siClass(r.now)
  const later = siClass(worse(r))
  const tip =
    `${TREE_NAMES[r.id]}: now ${Math.round(r.now)} (${now.label.toLowerCase()}) · 2050s ${Math.round(r.rcp45)} with moderate emissions, ` +
    `${Math.round(r.rcp85)} with high${r.land === 'all' ? ' (all the cell’s land: it holds no cropland)' : ` · on all the cell’s land ${Math.round(r.allLand.now)} now, ${Math.round(r.allLand.rcp45)} / ${Math.round(r.allLand.rcp85)} in the 2050s`}` +
    (r.around === null ? '' : ` · grown on ${pct(r.around)} of the harvested area around`)
  return (
    <li className="grid grid-cols-[minmax(6.5rem,9rem)_1fr] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[9rem_1fr_11rem]" title={tip}>
      <div className="text-[13.5px] text-ink">
        {TREE_NAMES[r.id]}
        {r.around !== null && r.around >= 0.01 && <span className="ml-1.5 font-mono text-[11px] text-wheat">· {pct(r.around)} around</span>}
      </div>
      <div className="relative h-7" role="img" aria-label={tip}>
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-white/[0.07]" />
        {TICKS.map((t) => (
          <div key={t} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/[0.12]" style={{ left: `${t}%` }} />
        ))}
        {hi > lo && (
          <motion.div
            className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-white/30"
            initial={{ left: `${r.now}%`, width: 0 }}
            whileInView={{ left: `${lo}%`, width: `${hi - lo}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.1 + i * 0.05 }}
          />
        )}
        {(['45', '85'] as const).map((k) => (
          <motion.span
            key={k}
            // moderate above the track, high below: equal values stay visible side by side
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ top: `calc(50% ${k === '45' ? '-' : '+'} 6px)` }}
            initial={{ left: `${r.now}%`, opacity: 0 }}
            whileInView={{ left: `${k === '45' ? r.rcp45 : r.rcp85}%`, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.1 + i * 0.05 }}
          >
            <Mark kind={k} className="block" />
          </motion.span>
        ))}
        <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${r.now}%` }}>
          <Mark kind="now" className="block" />
        </span>
      </div>
      <div className="col-span-2 font-mono text-[11px] text-ink-3 sm:col-span-1 sm:text-right">
        {r.otherLand !== null ? (
          <>not on cropland · {siClass(r.otherLand).label.toLowerCase()} on other land</>
        ) : now.n === later.n ? (
          <>{now.label.toLowerCase()}, holds</>
        ) : (
          <>
            {now.label.toLowerCase()} → <span className={later.n > now.n ? 'text-heat' : 'text-leaf'}>{later.label.toLowerCase()}</span>
          </>
        )}
      </div>
    </li>
  )
}

/** How far GAEZ's rating matched the farms for these crops, worldwide - the weaker the match, the less a low rating means. */
function Trust({ ids }: { ids: LongTermRow['id'][] }) {
  const known = ids.filter((id) => GAEZ_AGREEMENT[id])
  if (!known.length) return null
  return (
    <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
      How far to trust these ratings: of the world’s harvested area, GAEZ rates the cropland suitable for{' '}
      {known.map((id, i) => (
        <span key={id}>
          {i > 0 && (i === known.length - 1 ? ' and ' : ', ')}
          {pct(GAEZ_AGREEMENT[id]!.suitable)} of {TREE_NAMES[id].toLowerCase()}
        </span>
      ))}
      {' '}(CROPGRIDS 2020).
      {known.some((id) => id === 'olive' || id === 'citrus') && ' Much of the world’s olive and citrus is irrigated - a rain-fed rating misses it.'}
    </p>
  )
}

/** The class scale under the tracks: GAEZ's class limits as ticks, each class named in the middle of its band. */
function Scale() {
  const bands = GAEZ_CLASSES.slice(0, 7).map((c, i, all) => ({ n: c.n, label: c.label, from: Math.max(0, c.above), to: i === 0 ? 100 : all[i - 1].above }))
  return (
    <div className="grid grid-cols-[minmax(6.5rem,9rem)_1fr] gap-x-3 sm:grid-cols-[9rem_1fr_11rem]" aria-hidden>
      <div />
      <div className="relative mt-1 h-9 font-mono text-[11px] text-ink-4">
        {TICKS.map((t) => (
          <span key={t} className="absolute top-0 -translate-x-1/2" style={{ left: `${t}%` }}>
            {t}
          </span>
        ))}
        {bands.map((b) => (
          <span
            key={b.n}
            className={`absolute top-4 -translate-x-1/2 text-center leading-tight ${b.to - b.from < 15 ? 'max-lg:hidden' : 'max-sm:hidden'}`}
            style={{ left: `${(b.from + b.to) / 2}%`, width: `${b.to - b.from}%` }}
          >
            {b.label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

import { AlertTriangle, CheckCircle2, ChevronDown, CircleSlash, History, Scale, ShieldQuestion } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import { pct } from '../lib/format'
import { GH_CROP_BY_ID, type GhResult, type GreenhouseSpec, type Prices } from '../lib/greenhouse'
import { GH_FAILURE_MODES, ghTrust, ghValidity, type GhLevel, type GhTrust } from '../lib/ghTrust'
import type { GhRankOptions } from '../lib/greenhouse'
import { CropTile } from './ui'

const EASE = [0.16, 1, 0.3, 1] as const
const TONE: Record<GhLevel, { icon: typeof CheckCircle2; cls: string; bar: string }> = {
  out: { icon: CircleSlash, cls: 'text-heat', bar: 'bg-heat' },
  stretch: { icon: AlertTriangle, cls: 'text-wheat', bar: 'bg-wheat' },
  ok: { icon: CheckCircle2, cls: 'text-leaf', bar: 'bg-leaf' },
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const kwh = (x: number) => `€${x.toFixed(x < 0.1 ? 3 : 2)}/kWh`
const name = (id: keyof typeof GH_CROP_BY_ID | null) => (id ? GH_CROP_BY_ID[id].name : 'no crop')

// The re-runs block a page for about three seconds: they run in a worker, one job per distinct input however many
// parts of the page ask for it (the section and the print report ask for the same one).
const jobs = new WeakMap<ClimateAnalysis, Map<string, Promise<GhTrust>>>()
let worker: Worker | null | undefined
let seq = 0

function inWorker(...args: Parameters<typeof ghTrust>): Promise<GhTrust> {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL('../lib/ghTrust.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      worker = null // no module workers: compute here
    }
  }
  const w = worker
  if (!w) return Promise.resolve(ghTrust(...args))
  const id = ++seq
  return new Promise((resolve) => {
    const settle = (value: GhTrust | null) => {
      w.removeEventListener('message', onMsg)
      w.removeEventListener('error', onErr)
      resolve(value ?? ghTrust(...args))
    }
    const onMsg = (e: MessageEvent<{ id: number; value: GhTrust | null }>) => e.data.id === id && settle(e.data.value)
    const onErr = () => {
      worker = null // the worker failed to load: compute here from now on
      settle(null)
    }
    w.addEventListener('message', onMsg)
    w.addEventListener('error', onErr)
    try {
      w.postMessage({ id, args })
    } catch {
      settle(null)
    }
  })
}

function trustOf(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices, opts: GhRankOptions): Promise<GhTrust> {
  let byKey = jobs.get(climate)
  if (!byKey) jobs.set(climate, (byKey = new Map()))
  const key = JSON.stringify([spec, prices, opts.exclude ?? [], opts.priorities ?? null, opts.country ?? null])
  let job = byKey.get(key)
  if (!job) {
    job = inWorker(climate, spec, prices, opts)
    if (byKey.size > 20) byKey.clear()
    byKey.set(key, job)
  }
  return job
}

/** Runs the ~200 re-runs once the controls have been still for a moment, so dragging a slider stays smooth. */
export function useGhTrust(climate: ClimateAnalysis, spec: GreenhouseSpec, prices: Prices, opts: GhRankOptions = {}, enabled = true): GhTrust | null {
  const [t, setT] = useState<GhTrust | null>(null)
  useEffect(() => {
    setT(null)
    if (!enabled) return
    let live = true
    const id = window.setTimeout(() => void trustOf(climate, spec, prices, opts).then((v) => live && setT(v)), 300)
    return () => {
      live = false
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, climate, spec, prices, opts.priorities, opts.exclude, opts.country])
  return t
}

/**
 * The greenhouse counterpart of the field's "how sure" and "where the model stops": which crop leaves the most after
 * energy across uncertain prices, light response, heat loss and years; the prices at which that changes; whether
 * NASA's record of the shift changed the advice; and the failure modes this house and climate trigger.
 */
export function GhTrustPanel({ climate, plan, spec, prices, result, ranking, trust }: {
  climate: ClimateAnalysis // observed record (the what-if is not resampled)
  plan: ClimateAnalysis // with the what-if applied - the one the advice is for
  spec: GreenhouseSpec
  prices: Prices
  result: GhResult
  ranking: GhResult[]
  /** computed by the section (the decision card shows it too); the panel computes its own without it */
  trust?: GhTrust | null
}) {
  // the section hands its own re-runs down: computing them again here doubled the wait
  const own = useGhTrust(plan, spec, prices, {}, trust === undefined)
  const t = trust === undefined ? own : trust
  const [open, setOpen] = useState(false)
  const flags = ghValidity(climate, result, ranking)
  const problems = flags.filter((f) => f.level !== 'ok')
  const holds = flags.filter((f) => f.level === 'ok')
  const pick = ranking[0]

  return (
    <div className="panel p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink"><ShieldQuestion className="h-4 w-4 text-orbit" /> How sure - and where the greenhouse model stops</div>
        <div className="font-mono text-[11px] text-ink-3">{t ? `${t.conf.runs} seeded re-runs` : 'computing…'}</div>
      </div>

      {!t ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-white/[0.04]" style={{ animationDelay: `${i * 150}ms` }} />)}
        </div>
      ) : (
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          {/* ---- confidence ---- */}
          <div>
            <div className="kicker">Leaves the most after running costs</div>
            {t.conf.topShare > 0 ? (
              <>
                <div className="mt-2 flex items-center gap-3">
                  <CropTile crop={GH_CROP_BY_ID[t.conf.top]} size="sm" glow />
                  <div>
                    <div className="font-display-soft text-3xl text-ink">{pct(t.conf.topShare)}</div>
                    <div className="text-[12.5px] text-ink-3">of re-runs · {GH_CROP_BY_ID[t.conf.top].name}</div>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {t.conf.shares.filter((s) => s.share > 0).slice(0, 4).map((s, i) => (
                    <li key={s.id} className="grid grid-cols-[110px_minmax(0,1fr)_40px] items-center gap-3 text-[12.5px]">
                      <span className="truncate text-ink-2">{GH_CROP_BY_ID[s.id].name}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                        <motion.i className="block h-full rounded-full" style={{ background: GH_CROP_BY_ID[s.id].color }} initial={{ width: 0 }} animate={{ width: `${s.share * 100}%` }} transition={{ duration: 0.7, delay: 0.05 * i, ease: EASE }} />
                      </span>
                      <span className="num text-right text-ink-3">{pct(s.share)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-[13.5px] text-heat">In no re-run does any crop pay for its energy here.</p>
            )}
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">Varied: {t.conf.varied.join(', ')}. The share says how settled the ranking is - not the chance of a profit: capital, packing and selling are not in the numbers.</p>
          </div>

          {/* ---- what would change it ---- */}
          <div>
            <div className="kicker">What would change the pick</div>
            <ul className="mt-3 space-y-2.5 text-[13.5px] leading-snug text-ink-2">
              {t.tip.ownPrice && pick && (
                <li className="flex gap-2.5"><Scale className="mt-0.5 h-4 w-4 shrink-0 text-wheat" /><span>
                  {pick.crop.name} stays first until its price falls <b className="text-ink">{pct(t.tip.ownPrice.drop)}</b> (to €{((pick.plan.yieldKg > 0 ? pick.plan.revenue / pick.plan.yieldKg : 0) * (1 - t.tip.ownPrice.drop)).toFixed(2)}/kg on average) - then {name(t.tip.ownPrice.to).toLowerCase()} leads.
                  {t.tip.ownPrice.drop >= 0.3 ? ' Its lead rests on the price assumption: check it with your buyer.' : ' A close call: small price moves swap the order.'}
                </span></li>
              )}
              {t.tip.heat && (
                <li className="flex gap-2.5"><Scale className="mt-0.5 h-4 w-4 shrink-0 text-heat" /><span>
                  {t.tip.heat.low === null && t.tip.heat.high === null
                    ? <>No gas price from {kwh(prices.heat / 4)} to {kwh(prices.heat * 4)} changes the pick.</>
                    : <>
                      {t.tip.heat.high !== null && <>Above <b className="text-ink">{kwh(t.tip.heat.high)}</b> gas, {t.tip.heat.highTo ? `${name(t.tip.heat.highTo).toLowerCase()} leads` : 'no crop pays for its heat'}. </>}
                      {t.tip.heat.low !== null && <>Below <b className="text-ink">{kwh(t.tip.heat.low)}</b>, {name(t.tip.heat.lowTo).toLowerCase()} leads.</>}
                    </>}
                </span></li>
              )}
              {t.tip.power && (t.tip.power.low !== null || t.tip.power.high !== null) && (
                <li className="flex gap-2.5"><Scale className="mt-0.5 h-4 w-4 shrink-0 text-leaf" /><span>
                  {t.tip.power.high !== null && <>Above <b className="text-ink">{kwh(t.tip.power.high)}</b> electricity, {t.tip.power.highTo ? `${name(t.tip.power.highTo).toLowerCase()} leads` : 'no crop pays for its light'}. </>}
                  {t.tip.power.low !== null && <>Below {kwh(t.tip.power.low)}, {name(t.tip.power.lowTo).toLowerCase()} leads.</>}
                </span></li>
              )}
              {t.tip.gasShock && pick && (
                <li className="flex gap-2.5"><Scale className="mt-0.5 h-4 w-4 shrink-0 text-heat" /><span>
                  At three times today’s gas price, as in 2022: {t.tip.gasShock.top === pick.crop.id ? `${pick.crop.name.toLowerCase()} still leads` : `${name(t.tip.gasShock.top).toLowerCase()} would lead`}, leaving €{t.tip.gasShock.margin.toFixed(0)}/m² after running costs.
                </span></li>
              )}
              <li className="flex gap-2.5"><History className="mt-0.5 h-4 w-4 shrink-0 text-orbit" /><span>
                {t.thenNow.topThen === t.thenNow.topNow
                  ? <>On the {climate.baseline.from}-{climate.baseline.to} climate the same house would have picked the same crop</>
                  : <>On the {climate.baseline.from}-{climate.baseline.to} climate the same house would have picked <b className="text-ink">{name(t.thenNow.topThen).toLowerCase()}</b> - NASA’s record of the shift changed the pick</>}
                {t.thenNow.plantThen !== t.thenNow.plantNow && t.thenNow.plantNow && t.thenNow.plantThen
                  ? `; ${result.crop.name.toLowerCase()} is now planted in ${MONTHS[t.thenNow.plantNow - 1]} instead of ${MONTHS[t.thenNow.plantThen - 1]}.`
                  : '.'}
              </span></li>
            </ul>
          </div>
        </div>
      )}

      {/* ---- validity ---- */}
      <div className="mt-7 border-t border-white/[0.06] pt-5">
        <div className="kicker">Where this house and climate sit in the model</div>
        {problems.length > 0 && (
          <ul className="mt-3 grid gap-2.5 md:grid-cols-2">
            {problems.map((f, i) => {
              const T = TONE[f.level]
              return (
                <motion.li key={f.id} initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }} className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] py-3 pr-3 pl-4">
                  <i className={`absolute inset-y-0 left-0 w-[3px] ${T.bar}`} />
                  <div className={`flex items-center gap-2 text-[13.5px] ${T.cls}`}><T.icon className="h-3.5 w-3.5 shrink-0" />{f.title}</div>
                  <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{f.detail}</div>
                </motion.li>
              )
            })}
          </ul>
        )}
        {holds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {holds.map((f) => (
              <span key={f.id} title={f.detail} className="flex items-center gap-1.5 rounded-full border border-leaf/20 bg-leaf/[0.05] px-3 py-1 text-[12px] text-leaf/90"><CheckCircle2 className="h-3.5 w-3.5" />{f.title}</span>
            ))}
          </div>
        )}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-4 flex items-center gap-1.5 text-[12.5px] text-ink-3 transition hover:text-ink">
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} /> All {GH_FAILURE_MODES.length} known limits of the greenhouse model
        </button>
        <AnimatePresence>
          {open && (
            <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 grid gap-x-6 gap-y-2 overflow-hidden md:grid-cols-2">
              {GH_FAILURE_MODES.map((m) => (
                <li key={m.id} className="text-[12.5px] leading-snug">
                  <span className="text-ink-2">{m.title}</span>
                  <span className={`ml-2 rounded-full border px-1.5 py-px font-mono text-[11px] ${m.detect ? 'border-leaf/30 text-leaf' : 'border-white/15 text-ink-3'}`}>{m.detect ? 'checked here' : 'not modelled'}</span>
                  <div className="text-ink-4">{m.detail}</div>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-4">
          The spreads are not calibrated; the margin level is checked against Dutch and Flemish farm accounts, which it stays below (no combined heat and power, the general gas tariff). What tests do hold: a heated glass tomato house with one screen on the Torgau record needs more heat than measured Dutch practice (38.9 m³ a.e./m² a year) and less than an unscreened house (63.6), and yields within the Dutch range (47-73 kg/m²).
        </p>
      </div>
    </div>
  )
}

import { Satellite } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { CROP_BY_ID, isCropId, type CropId } from '../lib/crops'
import { classifySeason, fetchSeasons, TYPE_GUESS, TYPE_LABEL, type SeasonRead } from '../lib/ndviHistory'

const EASE = [0.16, 1, 0.3, 1] as const
const TYPE_TONE: Record<SeasonRead['type'], string> = {
  winter: 'var(--color-wheat)', summer: 'var(--color-leaf)', double: 'var(--color-orbit)', perennial: '#6fbf8a', bare: 'var(--color-ink-4)', unclear: 'var(--color-ink-4)',
}

/** Greenness through one season as a small area chart (October → September, or April → March in the south). */
function Spark({ curve, color }: { curve: (number | null)[]; color: string }) {
  const pts = curve.map((g, i) => (g === null ? null : [(i / (curve.length - 1)) * 100, 30 - g * 28] as const))
  const d = pts.reduce((s, p, i) => (p ? `${s}${s && pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : s), '')
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-full" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * "Read these seasons from space": the MODIS 16-day greenness of the field's pixel, one small curve per season, with
 * the crop type its shape suggests. The farmer names the crop - a 300 m greenness curve cannot tell wheat from barley.
 */
export function SpaceHistory({ lat, lon, hemisphere, years, history, setHistory }: {
  lat: number
  lon: number
  hemisphere: 'north' | 'south' | 'tropics' | null
  years: number[]
  history: (CropId | null)[]
  setHistory: (h: (CropId | null)[]) => void
}) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; progress: number; reads: SeasonRead[] }>({ status: 'idle', progress: 0, reads: [] })
  const abort = useRef<AbortController | null>(null)
  const tropics = hemisphere === 'tropics'
  const south = hemisphere === 'south'

  const read = async () => {
    abort.current?.abort()
    const ac = (abort.current = new AbortController())
    setState({ status: 'loading', progress: 0, reads: [] })
    try {
      const obs = await fetchSeasons(lat, lon, years, (d, t) => setState((s) => ({ ...s, progress: d / t })), ac.signal)
      if (ac.signal.aborted) return
      if (obs.length < 12) return setState({ status: 'error', progress: 1, reads: [] })
      setState({ status: 'done', progress: 1, reads: years.map((y) => classifySeason(obs, y, south)) })
    } catch {
      if (!ac.signal.aborted) setState({ status: 'error', progress: 1, reads: [] })
    }
  }

  const guesses = state.reads.map((r) => (tropics ? undefined : TYPE_GUESS[r.type]))
  const canFill = guesses.some((g, i) => g && !history[i])
  const fill = () => setHistory(history.map((h, i) => h ?? (guesses[i] && isCropId(guesses[i]!) ? (guesses[i] as CropId) : null)))

  return (
    <div className="panel mt-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] text-ink">
          <Satellite className="h-4 w-4 text-orbit" /> Seasons seen from space
          <span className="font-mono text-[11px] text-ink-3">how green the field was, season by season - from NASA’s MODIS satellite</span>
        </div>
        {state.status !== 'loading' && (
          <button onClick={read} className="rounded-full border border-orbit/40 px-3.5 py-1.5 text-[12.5px] text-orbit transition hover:bg-orbit/10">
            {state.status === 'done' ? 'Read again' : 'Read these seasons from MODIS'}
          </button>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="mt-4" aria-busy="true">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <motion.i className="block h-full bg-orbit" animate={{ width: `${Math.round(state.progress * 100)}%` }} transition={{ ease: EASE }} />
          </div>
          <div className="mt-2 font-mono text-[11px] text-ink-3">{Math.round(state.progress * 100)}% of the composites · a few requests at a time to the shared NASA service</div>
        </div>
      )}
      {state.status === 'error' && <p className="mt-3 text-[13px] text-ink-3">NASA GIBS did not answer with enough clear composites for this pixel. Enter the seasons by hand above.</p>}

      {state.status === 'done' && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {state.reads.map((r, i) => (
              <motion.div key={r.season} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, ease: EASE }} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5">
                <div className="flex items-baseline justify-between"><span className="num text-[11px] text-ink-3">{r.season}</span><span className="font-mono text-[11px] text-ink-4">{r.n} clear</span></div>
                <Spark curve={r.curve} color={TYPE_TONE[r.type]} />
                <div className="text-[12px]" style={{ color: TYPE_TONE[r.type] }}>{tropics ? 'see curve' : TYPE_LABEL[r.type]}</div>
                {history[i] && <div className="truncate text-[11px] text-ink-4">you said: {CROP_BY_ID[history[i]!].name}</div>}
              </motion.div>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            {tropics
              ? 'In the tropics rainy seasons make the timing ambiguous, so the curves are shown without a crop type. '
              : `Curves run ${south ? 'April → March' : 'October → September'}. Green in spring and brown by midsummer reads as a winter crop; a peak in ${south ? 'January-February' : 'July-August'} as a summer crop. `}
            The index is read from GIBS map colours (a stand-in for NDVI), and a 300 m pixel mixes in neighbours and hedges: it suggests a crop type - you name the crop.
          </p>
          {canFill && (
            <button onClick={fill} className="mt-3 rounded-full bg-orbit/15 px-3.5 py-1.5 text-[12.5px] text-orbit transition hover:bg-orbit/25">
              Fill the unknown seasons with a first guess (winter crop → wheat, summer crop → maize, ley → clover)
            </button>
          )}
        </>
      )}
    </div>
  )
}

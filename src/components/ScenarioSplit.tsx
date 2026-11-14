import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { euro } from '../lib/format'
import type { Evaluation } from '../lib/rotation'
import { CropTile } from './ui'

const ROWS = 12
const ROW = 46

/**
 * The typical decade and the scenario side by side, full screen: every crop's place in both rankings, joined by a
 * line, so a what-if shows what moves and what holds. Under warming only the order is shown - how much a warmer
 * season moves a score or a harvest is not yet quantitative.
 */
export function ScenarioSplit({ base, ranking, typical, scenario, quantities, onClose }: {
  base: Evaluation[]
  ranking: Evaluation[]
  typical: string
  scenario: string
  /** show harvest and margin in both columns (a replayed dry year); off under warming */
  quantities: boolean
  onClose: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [onClose])

  const left = base.slice(0, ROWS)
  const right = ranking.slice(0, ROWS)
  const placeIn = (list: Evaluation[], id: string) => list.findIndex((e) => e.crop.id === id)
  const y = (i: number) => i * ROW + ROW / 2
  const row = (e: Evaluation, i: number, other: Evaluation[], side: 'left' | 'right') => {
    const j = placeIn(other, e.crop.id)
    const was = side === 'right' ? base.find((x) => x.crop.id === e.crop.id) : null
    return (
      <div key={e.crop.id} className={`flex h-[46px] items-center gap-2 ${side === 'left' ? 'flex-row-reverse text-right' : ''}`}>
        <span className="num w-5 shrink-0 text-center text-[11px] text-ink-4">{i + 1}</span>
        <CropTile crop={e.crop} size="xs" className="!h-7 !w-7 shrink-0 !rounded-md" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] leading-tight ${i === 0 ? 'text-ink' : 'text-ink-2'}`}>{e.crop.name}</span>
          <span className="block truncate font-mono text-[10.5px] leading-tight text-ink-4">
            {quantities && e.harvest > 0 ? `${e.harvest.toFixed(1)} t/ha · ${euro(e.margin)}/ha` : `score ${e.score.toFixed(1)}`}
            {quantities && was && was.harvest > 0 && Math.abs(e.harvest / was.harvest - 1) >= 0.01 && (
              <span className={e.harvest < was.harvest ? 'text-heat' : 'text-leaf'}> ({e.harvest < was.harvest ? '−' : '+'}{Math.round(Math.abs(e.harvest / was.harvest - 1) * 100)} %)</span>
            )}
          </span>
        </span>
        {j >= ROWS || j < 0 ? <span className="num shrink-0 text-[10px] text-ink-4">{j < 0 ? 'off' : `#${j + 1}`}</span> : null}
      </div>
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`${typical} beside ${scenario}`} className="fixed inset-0 z-[80] overflow-y-auto bg-[#0a0b0e]">
      <div className="mx-auto max-w-[980px] px-4 pt-5 pb-10 sm:px-8 sm:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="kicker">Side by side</div>
            <h2 className="mt-1 font-display-soft text-xl leading-tight text-ink sm:text-2xl">What the scenario moves, and what holds</h2>
          </div>
          <button ref={close} onClick={onClose} aria-label="Close the side-by-side view" className="rounded-full border border-white/15 p-2 text-ink-2 transition hover:border-white/40 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] gap-x-1 sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] sm:gap-x-3">
          <div className="pb-2 text-right font-mono text-[11px] text-ink-3">{typical}</div>
          <div />
          <div className="pb-2 font-mono text-[11px] text-heat">{scenario}</div>
          <div>{left.map((e, i) => row(e, i, ranking, 'left'))}</div>
          <svg width="100%" height={ROWS * ROW} viewBox={`0 0 100 ${ROWS * ROW}`} preserveAspectRatio="none" aria-hidden className="overflow-visible">
            {left.map((e, i) => {
              const j = placeIn(right, e.crop.id)
              if (j < 0) return null
              const moved = j !== i
              return (
                <path
                  key={e.crop.id}
                  d={`M0,${y(i)} C50,${y(i)} 50,${y(j)} 100,${y(j)}`}
                  fill="none"
                  stroke={e.crop.color}
                  strokeOpacity={moved ? 0.9 : 0.35}
                  strokeWidth={i === 0 || j === 0 ? 3 : 1.75}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
          <div>{right.map((e, i) => row(e, i, base, 'right'))}</div>
        </div>
        <p className="mt-6 max-w-2xl text-[12.5px] leading-relaxed text-ink-3">
          {quantities
            ? 'Expected harvest and margin per hectare in each column; the brackets say how the scenario moves the harvest. A number beside a crop is its place in the other column when it falls outside the first twelve.'
            : 'Only the order is compared: under warming the engine says which crop leads, not yet by how much a score or a harvest moves. A number beside a crop is its place in the other column when it falls outside the first twelve.'}
        </p>
      </div>
    </div>
  )
}

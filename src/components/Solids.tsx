import { Pause, Play } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type CSSProperties } from 'react'

// A small CSS-3D piece (no WebGL): a soil monolith whose dark carbon-rich top thickens or thins over twenty years.
// It only draws numbers computed elsewhere. (The plan's four seasons used to turn on a carousel here; they are the
// four vitrines of StrategyBoard now.)

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * A 0-30 cm soil block. The darkness and depth of the humus layer follow the organic-carbon stock: today's (from
 * SoilGrids / your lab test) plus the plan's modelled change, year by year. The scrubber plays the twenty years.
 */
export function SoilMonolith({ stock, delta, color, label }: { stock: number; delta: number[]; color: string; label: string }) {
  const reduce = useReducedMotion()
  const [year, setYear] = useState(reduce ? delta.length : 0)
  const [playing, setPlaying] = useState(!reduce)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setYear((y) => (y >= delta.length ? (setPlaying(false), y) : y + 1)), 180)
    return () => clearInterval(t)
  }, [playing, delta.length])
  const d = year ? delta[year - 1] ?? 0 : 0
  const now = stock + d
  const rel = stock > 0 ? now / stock : 1
  // humus layer: ~12 cm of the 30 cm block at today's stock, scaled by the stock ratio (clamped for legibility)
  const humus = Math.max(4, Math.min(22, 12 * rel))
  const dark = Math.max(0.35, Math.min(0.95, 0.62 * rel))
  const H = 180 // px for 30 cm
  const W = 120
  const D = 70
  const face = (extra: string) => `absolute left-0 top-0 ${extra}`
  const soil = `linear-gradient(to bottom, rgba(20,12,6,${dark}) 0%, rgba(38,24,12,${dark * 0.9}) ${(humus / 30) * 100}%, #6b4a2c ${(humus / 30) * 100 + 6}%, #8a6a45 100%)`

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative h-[230px] w-[200px]" style={{ perspective: 700 }} aria-hidden>
        <div className="solid-turn absolute left-[40px] top-[20px]" style={{ width: W, height: H, transformStyle: 'preserve-3d' }}>
          {/* front */}
          <div className={face('')} style={{ width: W, height: H, background: soil, transform: `translateZ(${D / 2}px)`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)' }}>
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} className="absolute h-[3px] w-[3px] rounded-full bg-[#c9b48f]/40" style={{ left: `${(i * 37) % 100}%`, top: `${40 + ((i * 53) % 55)}%` }} />
            ))}
            <motion.i className="absolute inset-x-0 border-b border-dashed border-leaf/50" animate={{ top: `${(humus / 30) * 100}%` }} transition={{ ease: EASE }} />
          </div>
          {/* side */}
          <div className={face('')} style={{ width: D, height: H, background: soil, filter: 'brightness(.7)', transform: `rotateY(90deg) translateZ(${W - D / 2}px)` }} />
          {/* top: the living surface */}
          <div className={face('')} style={{ width: W, height: D, background: `radial-gradient(circle at 30% 40%, ${color}66, #2d3b1c 70%)`, transform: `rotateX(90deg) translateZ(${D / 2}px)` }} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="kicker">Soil monolith · 0-30 cm · {label}</div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-display-soft text-4xl text-ink tabular-nums">{now.toFixed(0)}</span>
          <span className="text-sm text-ink-3">t C/ha in year {year}, against farming as now</span>
          <span className={`num text-sm ${d > 0.3 ? 'text-leaf' : d < -0.3 ? 'text-heat' : 'text-ink-3'}`}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => { if (year >= delta.length) setYear(0); setPlaying((p) => !p) }} className="rounded-full border border-white/10 p-1.5 text-ink-2 hover:text-ink" aria-label={playing ? 'Pause' : 'Play twenty years'}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <input
            type="range" className="fader flex-1" min={0} max={delta.length} value={year} aria-label="Year"
            style={{ '--fader': color, '--val': `${(year / delta.length) * 100}%` } as CSSProperties}
            onChange={(e) => { setPlaying(false); setYear(Number(e.target.value)) }}
          />
          <span className="num w-10 text-right text-xs text-ink-3">+{year} yr</span>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">Today’s stock plus the plan’s modelled change against keeping the current rotation (ICBM, IPCC residues). The dark layer’s depth and colour picture that trend - not a measured profile.</p>
      </div>
    </div>
  )
}

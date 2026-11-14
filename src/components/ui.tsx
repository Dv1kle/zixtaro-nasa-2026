import { AnimatePresence, animate, motion, useInView, useReducedMotion, useScroll, useTransform, type Variants } from 'motion/react'
import { Component, Fragment, isValidElement, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactElement, type ReactNode } from 'react'
import type { Crop } from '../lib/crops'
import { useLang } from '../lib/i18n'
import { DUR, EASE_OUT, STAGGER } from '../lib/motion'
import { SSP_LABEL, SSPS, whatIfShort, type Projection, type WhatIf } from '../lib/scenario'

// ---------- Crop specimen card - the periodic table of crops, as objects ----------
//
// Each crop is shown as the plant itself: a small crafted 3D specimen (an ear with its awns, a cob half out of its
// husk, an open pod with its seeds, a beet, a tomato truss...) drawn once by one shared offscreen renderer
// (lib/specimen.ts, loaded lazily) and kept as an image for the session - no card holds a live WebGL context. The
// larger cards are a museum vitrine: the specimen on cool graphite (bone on the paper of the plan), lit warm from the
// upper left, a hairline label in mono; the specimen drifts a few pixels against the pointer and a soft sheen follows
// it. The chosen card is lifted by light - a warm pool under the specimen and a straw hairline - not by a box.
// Under reduced motion, on touch and at the two small sizes it lies still.

const TILE = {
  xs: { box: 'h-8 w-8', live: false, label: false },
  sm: { box: 'h-11 w-11', live: false, label: false },
  md: { box: 'h-16 w-16', live: true, label: false },
  lg: { box: 'h-24 w-24', live: true, label: true },
  xl: { box: 'h-36 w-36', live: true, label: true },
  /** the pick itself, at the climax of the page: the specimen as the object in the vitrine */
  hero: { box: 'h-44 w-44 sm:h-56 sm:w-56', live: true, label: true },
} as const

/** Anything that can sit on the periodic table: field crops and greenhouse crops alike. */
export type TileCrop = Pick<Crop, 'color' | 'n' | 'symbol' | 'name' | 'latin'> & { id?: string }

/** specimen images already drawn this session, so a card that remounts shows its plant at once */
const SPECIMENS = new Map<string, string | null>()

/** A crop's specimen drawing: undefined while it is drawn, null where it cannot be. `px`: a larger drawing than a card's. */
export function useSpecimen(crop: TileCrop | null, px?: number): string | null | undefined {
  const key = crop ? (crop.id ?? crop.name) + (px ? `@${px}` : '') : ''
  const [src, setSrc] = useState<string | null | undefined>(() => (key ? SPECIMENS.get(key) : undefined))
  useEffect(() => {
    if (!crop) return
    const known = SPECIMENS.get(key)
    if (known !== undefined) {
      setSrc(known)
      return
    }
    setSrc(undefined)
    let live = true
    import('../lib/specimen')
      .then((m) => m.specimenFor({ id: crop.id, name: crop.name, latin: crop.latin, color: crop.color }, px))
      .then((u) => {
        SPECIMENS.set(key, u)
        if (live) setSrc(u)
      })
      .catch(() => live && setSrc(null))
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return src
}

export function CropTile({
  crop,
  size = 'md',
  dim = false,
  glow = false,
  className = '',
}: {
  crop: TileCrop | null
  size?: keyof typeof TILE
  dim?: boolean
  glow?: boolean
  className?: string
}) {
  const s = TILE[size]
  const reduce = useReducedMotion()
  const live = s.live && !reduce
  const ref = useRef<HTMLDivElement>(null)
  const src = useSpecimen(crop)

  if (!crop) {
    return (
      <div className={`${s.box} sp-empty relative grid shrink-0 place-items-center text-ink-4 ${className}`}>
        <span className="font-mono text-[11px]">?</span>
      </div>
    )
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (!live || e.pointerType === 'touch' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const px = Math.min(1, Math.max(-1, ((e.clientX - r.left) / r.width) * 2 - 1))
    const py = Math.min(1, Math.max(-1, ((e.clientY - r.top) / r.height) * 2 - 1))
    ref.current.style.setProperty('--px', px.toFixed(3))
    ref.current.style.setProperty('--py', py.toFixed(3))
  }
  const leave = () => {
    ref.current?.style.removeProperty('--px')
    ref.current?.style.removeProperty('--py')
  }
  return (
    <div
      ref={ref}
      className={`sp ${s.box} relative shrink-0 ${dim ? 'sp-dim' : ''} ${glow ? 'sp-on' : ''} ${className}`}
      style={{ '--c': crop.color } as CSSProperties}
      data-size={size}
      onPointerMove={live ? move : undefined}
      onPointerLeave={live ? leave : undefined}
      title={`${crop.name} - ${crop.latin}`}
    >
      <span aria-hidden className="sp-light" />
      {src ? (
        <img className="sp-img" src={src} alt="" draggable={false} decoding="async" />
      ) : (
        // while the specimen is drawn (or where WebGL is missing), the crop's symbol stands in, quietly
        <span aria-hidden className={`sp-wait font-mono ${src === null ? 'sp-wait-final' : ''}`}>{crop.symbol}</span>
      )}
      {live && <span aria-hidden className="sp-sheen" />}
      {s.label && (
        <span className="sp-label font-mono">
          <span className="truncate">{crop.name.replace('Winter ', 'W. ').replace('Clover-grass ley', 'Clover ley')}</span>
          <span className="num shrink-0 opacity-70">{String(crop.n).padStart(2, '0')}</span>
        </span>
      )}
    </div>
  )
}

// ---------- Animated number ----------

export function CountUp({ value, decimals = 0, signed = false, className = '' }: { value: number; decimals?: number; signed?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' })
  const reduce = useReducedMotion()
  const shown = useRef(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const format = (v: number) => {
      const s = Math.abs(v).toFixed(decimals)
      if (!signed) return (v < 0 ? '−' : '') + s
      return (v > 0 ? '+' : v < 0 ? '−' : '±') + s
    }
    if (!inView) {
      node.textContent = format(0)
      return
    }
    if (reduce || !Number.isFinite(value)) {
      node.textContent = Number.isFinite(value) ? format(value) : '-'
      shown.current = value
      return
    }
    const controls = animate(shown.current, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = format(v)
        shown.current = v
      },
    })
    return () => controls.stop()
  }, [inView, value, decimals, signed, reduce])
  // the animated digits are a visual copy; screen readers, find-in-page and print get the true value at once,
  // never the "±0" the count starts from
  const truth = Number.isFinite(value)
    ? (() => {
        const s = Math.abs(value).toFixed(decimals)
        if (!signed) return (value < 0 ? '−' : '') + s
        return (value > 0 ? '+' : value < 0 ? '−' : '±') + s
      })()
    : '-'
  return (
    <>
      <span className="sr-only print:not-sr-only">{truth}</span>
      <span ref={ref} aria-hidden className={`tabular-nums print:hidden ${className}`} />
    </>
  )
}

// ---------- Rank changes ----------

/** How many places each id moved since the order last changed (+ = up); cleared after a moment. */
export function useRankDelta(ids: string[]): Record<string, number> {
  const prev = useRef<string[] | null>(null)
  const [delta, setDelta] = useState<Record<string, number>>({})
  const key = ids.join('|')
  useEffect(() => {
    const before = prev.current
    prev.current = ids
    if (!before || before.join('|') === key) return
    const d: Record<string, number> = {}
    ids.forEach((id, i) => {
      const j = before.indexOf(id)
      if (j >= 0 && j !== i) d[id] = j - i
    })
    setDelta(d)
    const t = setTimeout(() => setDelta({}), 1800)
    return () => clearTimeout(t)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return delta
}

/** A small ▲2 / ▼1 that flashes next to a row that just moved. */
export function RankDelta({ d }: { d?: number }) {
  return (
    <AnimatePresence>
      {d ? (
        <motion.span
          key={d}
          initial={{ opacity: 0, y: d > 0 ? 6 : -6, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          className={`font-mono text-[11px] ${d > 0 ? 'text-leaf' : 'text-heat'}`}
          aria-label={d > 0 ? `up ${d}` : `down ${-d}`}
        >
          {d > 0 ? '▲' : '▼'}{Math.abs(d)}
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}

// ---------- Tilt ----------

/** Was a lean toward the pointer; decoration that said nothing, so it holds still now (kept as a wrapper for callers). */
export function Tilt({ children, className = '' }: { children: ReactNode; className?: string; max?: number }) {
  return <div className={className}>{children}</div>
}

// ---------- Section scaffolding ----------

// words rise and fade in - no blur: a filter per word made every headline a stack of compositing layers
// a headline rises line by line, each word out of its own mask; `custom` is the line the word landed on
// The two faces move as the two voices they are: the caps are engraved - each rises out of its mask, crisp; the serif
// word is said - it comes a beat after its line, slower, and out of nothing.
type WordAt = { line: number; voice?: boolean }
const WORD: Variants = {
  hidden: (w?: WordAt) => ({ y: '108%', opacity: w?.voice ? 0 : 1 }),
  show: (w?: WordAt) => {
    const delay = 0.05 + (w?.line ?? 0) * STAGGER.line + (w?.voice ? 0.16 : 0)
    return {
      y: '0%',
      opacity: 1,
      transition: {
        y: { duration: DUR.line * (w?.voice ? 1.3 : 1), delay, ease: EASE_OUT },
        opacity: { duration: w?.voice ? 1.1 : 0, delay: w?.voice ? delay + 0.08 : 0, ease: 'linear' },
      },
    }
  },
}

/** Plain text of a headline - outside English the translator needs whole sentences, not <em>-split pieces. */
export function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

/**
 * Headline → words that rise out of a blur one after another; inline elements (<em>) move as one word.
 * Pieces with no space between them ("loam" + ":", "<em>tank</em>" + ".") stay one word, so punctuation never
 * wraps onto a line of its own.
 */
function splitWords(node: ReactNode, lines: number[] = []): ReactNode[] {
  const atoms: (string | ReactElement)[] = []
  const walk = (n: ReactNode) => {
    if (n == null || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') atoms.push(String(n))
    else if (Array.isArray(n)) n.forEach(walk)
    else if (isValidElement(n)) {
      const el = n as ReactElement<{ children?: ReactNode }>
      if (el.type === Fragment) walk(el.props.children)
      else atoms.push(el)
    }
  }
  walk(node)
  const out: ReactNode[] = []
  let word: ReactNode[] = []
  let voice = false
  let words = 0
  const flush = () => {
    if (word.length) {
      const n = words++
      // the mask: overflow hidden around the word, a little room below so descenders aren't clipped
      out.push(
        <span key={`w${out.length}`} data-word className="inline-block overflow-hidden pb-[0.14em] -mb-[0.14em] align-top">
          <motion.span variants={WORD} custom={{ line: lines[n] ?? 0, voice }} className="inline-block">{word}</motion.span>
        </span>,
      )
    }
    word = []
    voice = false
  }
  atoms.forEach((a, i) => {
    if (typeof a !== 'string') {
      word.push(<Fragment key={`e${i}`}>{a}</Fragment>)
      if (a.type === 'em') voice = true
      return
    }
    for (const part of a.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) {
        flush()
        out.push(part)
      } else word.push(part)
    }
  })
  flush()
  return out
}

/**
 * A section's headline. It speaks alone: the altitude its data is measured at now lives in the altimeter and the
 * crossings, so there is no kicker or pill above it (`kicker` and `altitude` stay accepted for callers). It rises
 * line by line out of masks, once, from a layout that is already in place - no shift, no parallax.
 */
export function SectionHeader({ title, dek, step }: { kicker?: string; altitude?: string; title: ReactNode; dek?: ReactNode; /** "Step 2 of 4 · your field": where the reader is on the way to the answer */ step?: string }) {
  const h2 = useRef<HTMLHeadingElement>(null)
  const lang = useLang()
  // which line each word landed on, measured once laid out (and again when the width changes)
  const [lines, setLines] = useState<number[]>([])
  useEffect(() => {
    const el = h2.current
    if (!el) return
    const measure = () => {
      const tops = [...el.querySelectorAll<HTMLElement>('[data-word]')].map((w) => w.offsetTop)
      const rows = [...new Set(tops)].sort((x, y) => x - y)
      const next = tops.map((t) => rows.indexOf(t))
      setLines((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [title, lang])
  return (
    <header className="max-w-4xl">
      {step && <div className="kicker mb-4">{step}</div>}
      <motion.h2
        ref={h2}
        className="font-display-soft text-[clamp(2.6rem,6.6vw,6.4rem)] leading-[0.88] uppercase text-balance [&_em]:font-voice [&_em]:pr-[0.06em] [&_em]:text-[1.06em] [&_em]:leading-[0.8]"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-10% 0px' }}
      >
        {lang === 'en' ? (
          splitWords(title, lines)
        ) : (
          <span data-word className="inline-block overflow-hidden pb-[0.14em] -mb-[0.14em] align-top">
            <motion.span variants={WORD} custom={{ line: 0 }} className="inline-block">{textOf(title)}</motion.span>
          </span>
        )}
      </motion.h2>
      {dek && (
        <motion.p
          className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2 text-pretty sm:text-lg"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 0.5, delay: 0.35, ease: EASE_OUT }}
        >
          {dek}
        </motion.p>
      )}
    </header>
  )
}

/**
 * A block of the page. It used to rise and fade into view - the same entrance on ~40 blocks, which said nothing and
 * cost a layer each. The page's motion now lives where it means something (the descent, the altimeter, the bands,
 * the stripes); content is simply there when the reader arrives. `delay` stays accepted for callers.
 */
export function Reveal({ children, className = '', tour }: { children: ReactNode; delay?: number; className?: string; tour?: string }) {
  return (
    <div data-tour={tour} className={`min-w-0 ${className}`}>
      {children}
    </div>
  )
}

export function Chip({ children, tone = 'neutral', className = '', title }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'; className?: string; title?: string }) {
  const tones = {
    neutral: 'border-white/12 text-ink-2 bg-white/[0.03]',
    good: 'border-leaf/30 text-leaf bg-leaf/[0.07]',
    warn: 'border-wheat/30 text-wheat bg-wheat/[0.07]',
    bad: 'border-heat/35 text-heat bg-heat/[0.08]',
    info: 'border-orbit/30 text-orbit bg-orbit/[0.07]',
  }
  return <span title={title} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] leading-none ${tones[tone]} ${className}`}>{children}</span>
}

/**
 * A basemap or satellite snapshot that steps aside when the imagery service can't be reached, instead of showing a
 * broken-image icon with its alt text on top of the outline drawn over it.
 */
export function MapImage({ src, alt, className = '', onFail }: { src: string; alt: string; className?: string; onFail?: (failed: boolean) => void }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    onFail?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])
  if (failed) {
    // say so, instead of an empty grid that still looks like a map; decorative copies (alt="") stay silent
    return (
      <div
        role={alt ? 'img' : undefined}
        aria-label={alt ? `${alt} (imagery unavailable)` : undefined}
        aria-hidden={alt ? undefined : true}
        className={`grid place-items-center bg-[#0a1016] ${className}`}
        style={{ backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      >
        {alt && <span className="max-w-[18rem] px-4 text-center font-mono text-[11px] leading-relaxed text-ink-3">Satellite imagery could not be loaded. Nothing below depends on it.</span>}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        setFailed(true)
        onFail?.(true)
      }}
    />
  )
}

/**
 * Keeps one broken part from blanking the whole page: a browser without WebGL2 (the globe throws), a chunk that
 * failed to load offline. The part is replaced by `fallback` and everything else keeps working.
 */
export class Boundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('A part of the page failed and was left out:', error)
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.05] ${className}`} />
}

export function ErrorBox({ title, error, onRetry }: { title: string; error: string; onRetry?: () => void }) {
  return (
    <div className="panel flex flex-col gap-3 border-heat/30 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-medium text-heat">{title}</div>
        <div className="mt-1 text-sm text-ink-3">{error}</div>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-white/40">
          Try again
        </button>
      )}
    </div>
  )
}

/**
 * The Zixtaro mark: a Z drawn as the descent itself - the top stroke is a satellite's orbit (with the satellite),
 * the diagonal the beam from orbit to the field, the bottom stroke the ground line with roots going into the soil.
 */
/** The mark's colours on the dark page, and darker ones that hold up on white paper (the printed reports). The same
 * two temperatures as the whole site: the sky half cool (a steel orbit, a cold-white satellite), the beam warming on
 * its way down, the ground and the roots in straw and wheat. */
const MARK_TONES = {
  screen: { orbit: '#a7b1bf', sat: '#f4f1ea', beam: ['#dfe3e8', '#d0b47a'], ground: '#c9b07a', roots: '#c08f4e' },
  print: { orbit: '#2c3440', sat: '#121316', beam: ['#2c3440', '#8a6a2a'], ground: '#8a6a2a', roots: '#9a6b12' },
}

/** The Zixtaro mark: orbit, satellite, beam, ground, roots. */
export function Logo({ className = '', tone = 'screen', size }: { className?: string; tone?: keyof typeof MARK_TONES; size?: number }) {
  const c = MARK_TONES[tone]
  const beam = `zx-beam-${tone}` // one gradient id per tone: both marks can share a document (screen + print)
  return (
    <svg viewBox="0 0 32 32" className={className} width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={beam} x1="24" y1="9" x2="9" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c.beam[0]} />
          <stop offset="1" stopColor={c.beam[1]} />
        </linearGradient>
      </defs>
      <path d="M6.5 9.2 Q15 5.6 23.8 8.4" fill="none" stroke={c.orbit} strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="25.4" cy="8.9" r="2.1" fill={c.sat} />
      <path d="M23.4 10.6 L9.2 22.4" fill="none" stroke={`url(#${beam})`} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M6.8 23.6 H25.2" fill="none" stroke={c.ground} strokeWidth="2.3" strokeLinecap="round" />
      <path d="M13.5 24.4 v4.3 M13.5 26.4 l-2.4 2.2 M19.4 24.4 l1.3 3.9" fill="none" stroke={c.roots} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-3 text-left"
    >
      <span className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'border-water/50 bg-water/25' : 'border-white/15 bg-white/5'}`}>
        <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-[left,background-color,box-shadow] duration-300 ${checked ? 'left-[22px] bg-water shadow-[0_0_12px_var(--color-water)]' : 'left-0.5 bg-ink-3'}`} />
      </span>
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </button>
  )
}

export type WaterSetting = { irrigated: boolean; budget: number }
export type WaterApi = {
  value: WaterSetting; onRainfed: () => void; onBudget: (mm: number) => void; onUnlimited: () => void
  /** what the cropland around here does (FAO GMIA): shown under the control */
  note?: string
}
const BUDGETS = [50, 100, 150, 250]

/**
 * How much water this field can get: rainfed, a seasonal irrigation budget (mm) or unlimited. The budget runs
 * through the root-zone water model, so stress, yield and ranking all follow it.
 */
export function WaterControl({ value, onRainfed, onBudget, onUnlimited, note, compact = false }: {
  value: WaterSetting
  onRainfed: () => void
  onBudget: (mm: number) => void
  onUnlimited: () => void
  note?: string
  compact?: boolean
}) {
  const mode = value.irrigated ? 'full' : value.budget > 0 ? 'budget' : 'rain'
  const [draft, setDraft] = useState(value.budget || 100)
  useEffect(() => {
    if (value.budget > 0) setDraft(value.budget)
  }, [value.budget])
  const opts: { key: string; label: string; on: boolean; pick: () => void }[] = [
    { key: 'rain', label: 'Rainfed', on: mode === 'rain', pick: onRainfed },
    ...BUDGETS.map((b) => ({ key: `b${b}`, label: `${b} mm`, on: mode === 'budget' && value.budget === b, pick: () => onBudget(b) })),
    { key: 'full', label: 'Unlimited', on: mode === 'full', pick: onUnlimited },
  ]
  const custom = mode === 'budget' && !BUDGETS.includes(value.budget)
  return (
    <div className={compact ? '' : 'space-y-3'}>
      <div role="radiogroup" aria-label="Irrigation water per season" className="scrollbar-none flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-1">
        {opts.map((o) => (
          <button
            key={o.key}
            role="radio"
            aria-checked={o.on}
            onClick={o.pick}
            className={`relative shrink-0 rounded-full px-3 py-1.5 font-mono text-[11.5px] whitespace-nowrap transition-colors ${o.on ? 'text-[#0a0b0e]' : 'text-ink-3 hover:text-ink'}`}
          >
            {o.on && (
              <motion.span
                key={`ripple-${o.key}`}
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full border border-water"
                initial={{ opacity: 0.7, scale: 1 }}
                animate={{ opacity: 0, scale: 1.35 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            )}
            {o.on && (
              <motion.span
                layoutId={`water-pill-${compact ? 'c' : 'f'}`}
                className="absolute inset-0 rounded-full bg-water shadow-[0_0_18px_-2px_var(--color-water)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        ))}
        {custom && (
          <span className="relative shrink-0 rounded-full bg-water px-3 py-1.5 font-mono text-[11.5px] text-[#0a0b0e]">{value.budget} mm</span>
        )}
      </div>
      {note && !compact && <p className="text-[12px] leading-snug text-ink-3">{note}</p>}
      {mode === 'budget' && !compact && (
        <label className="flex items-center gap-3 text-xs text-ink-3">
          <span className="shrink-0">budget</span>
          <input
            type="range"
            className="fader"
            min={10}
            max={400}
            step={10}
            value={draft}
            style={{ '--fader': 'var(--color-water)', '--val': `${((draft - 10) / 390) * 100}%` } as CSSProperties}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={() => onBudget(draft)}
            onKeyUp={() => onBudget(draft)}
            onBlur={() => draft !== value.budget && onBudget(draft)}
          />
          <span className="relative w-16 shrink-0 text-right">
            <motion.span key={draft} className="num inline-block text-water" initial={{ scale: 1.25, y: -2 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }}>{draft} mm</motion.span>
          </span>
        </label>
      )}
    </div>
  )
}

export function Seg({ on, onClick, children, hot = false }: { on: boolean; onClick: () => void; children: ReactNode; hot?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 font-mono text-xs transition ${
        on ? (hot ? 'border-heat/60 bg-heat/15 text-heat' : 'border-white/40 bg-white/10 text-ink') : 'border-white/10 text-ink-3 hover:border-white/30 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * "What if it gets warmer?" - flat +1…+3 °C stress tests, and NASA NEX-GDDP-CMIP6 2050s projections where
 * this field's 0.25° cell has one pre-baked.
 */
export function WarmingSegs({ value, onChange, projection }: { value: WhatIf; onChange: (w: WhatIf) => void; projection: Projection | null }) {
  const pick = (w: WhatIf) => onChange(value === w ? 0 : w)
  return (
    <>
      {([1, 2, 3] as const).map((d) => (
        <Seg key={d} on={value === d} onClick={() => pick(d)} hot>
          {whatIfShort(d)}
        </Seg>
      ))}
      {projection &&
        SSPS.map((s) => (
          <span key={s} title={`${SSP_LABEL[s]}: NASA NEX-GDDP-CMIP6, ${projection.future[0]}-${projection.future[1]} vs ${projection.base[0]}-${projection.base[1]}, mean of ${projection.models.length} models`}>
            <Seg on={value === s} onClick={() => pick(s)} hot>
              {whatIfShort(s)}
            </Seg>
          </span>
        ))}
    </>
  )
}

/**
 * A number input that lets people type: the field can be cleared, "0,05" works as well as "0.05",
 * and the limits apply when they leave the field (not on every keystroke).
 */
export function NumberField({ value, onCommit, min = 0, max = Infinity, decimals = 0, label, className = '' }: {
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  decimals?: number
  label: string
  className?: string
}) {
  const fmt = (v: number) => (decimals ? String(Number(v.toFixed(decimals))) : String(Math.round(v)))
  const [text, setText] = useState(fmt(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(fmt(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused])
  const parse = (t: string) => {
    const clean = decimals ? t.trim().replace(',', '.') : t.replace(/[\s,.']/g, '')
    const n = Number(clean)
    return clean !== '' && Number.isFinite(n) ? n : null
  }
  const commit = () => {
    const n = parse(text)
    const v = n === null ? value : Math.min(max, Math.max(min, n))
    onCommit(v)
    setText(fmt(v))
  }
  return (
    <input
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      aria-label={label}
      value={text}
      onFocus={(e) => {
        setFocused(true)
        e.target.select()
      }}
      onChange={(e) => {
        setText(e.target.value)
        const n = parse(e.target.value)
        if (n !== null && n >= min && n <= max) onCommit(n)
      }}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={`rounded-lg border border-white/15 bg-void/50 px-3 py-2 font-mono text-sm text-ink outline-none focus:border-leaf/60 ${className}`}
    />
  )
}

/** "Wrong kind of site?" - switch field ↔ greenhouse without scrolling back to the top. */
export function SiteSwitch({ to, onClick }: { to: 'field' | 'greenhouse'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-[13px] text-ink-3 transition hover:border-white/35 hover:text-ink">
      {to === 'greenhouse' ? 'Under glass or plastic? Plan this spot as a greenhouse' : 'Not a greenhouse? Plan this spot as an open field'}
      <span aria-hidden>→</span>
    </button>
  )
}

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { descentDepth, formatAltitude } from '../lib/descent'
import { useMedia } from '../lib/hooks'
import { EASE_OUT, SCROLL_SPRING, STAGGER } from '../lib/motion'
import { useNear } from '../lib/prewarm'
import { SPAN, useScrollSpan } from '../lib/scrollSpan'

type Kind = 'clouds' | 'canopy' | 'soil' | 'glass' | 'market'

/**
 * The crossings between the sections of the descent: the cloud deck between orbit and the roadside, the canopy where
 * the air meets the field (or the glass of the house), the soil strata under the surface. Each one holds a single
 * idea - one sentence about this field, the altimeter's number large - while the stratum's own art moves through the
 * frame with the scroll.
 * Desktop: pinned for two screens, the sentence revealed line by line as the reader scrolls. Phones: in the flow, the
 * lines rising once on arrival. Reduced motion: still, the sentence simply there.
 */
export function DescentBand({ kind, lines, object, tail = false }: { kind: Kind; lines?: ReactNode[]; object?: ObjectSlot; /** the next section is a plate that rides up over this scene's last screen (story mode) */ tail?: boolean }) {
  const reduce = useReducedMotion()
  const desktop = useMedia('(min-width: 1024px)')
  const pinned = desktop && !reduce && !!lines?.length
  const tailed = tail && pinned
  // remount on the switch: the scroll offsets of a pinned and a flowing crossing differ
  return <Crossing key={pinned ? (tailed ? 'tailed' : 'pinned') : 'flow'} kind={kind} lines={lines} pinned={pinned} tail={tailed} keep={desktop} reduce={!!reduce} object={object} />
}

/** A crossing's 3D object (lazy three.js), given the crossing's scroll progress; desktop pinned crossings only. */
export type ObjectSlot = (progress: MotionValue<number>) => ReactNode

const FLOW_FADE = 'linear-gradient(180deg, transparent 0%, rgb(0 0 0 / 0.5) 7%, #000 18%, #000 82%, rgb(0 0 0 / 0.5) 93%, transparent 100%)'
const ART_H: Record<Kind, string> = { clouds: 'h-[32vh] min-h-[210px]', canopy: 'h-[26vh] min-h-[180px]', soil: 'h-[30vh] min-h-[200px]', glass: 'h-[26vh] min-h-[180px]', market: 'h-[22vh] min-h-[160px]' }

function Crossing({ kind, lines, pinned, tail, keep, reduce, object }: { kind: Kind; lines?: ReactNode[]; pinned: boolean; tail: boolean; keep: boolean; reduce: boolean; object?: ObjectSlot }) {
  const ref = useRef<HTMLDivElement>(null)
  // On a desktop the object is made ahead of the reader - under the loader, or in a pause of the scrolling - and
  // kept: made on approach it froze the page while it was built, and again on every way back. On a phone, where
  // memory is short, it exists only around the screen: started two and a half screens ahead (it draws nothing until
  // it is whole, and that takes a few seconds), dropped when far.
  const near = useNear(ref, { margin: keep ? '100% 0px' : '250% 0px', keep, enabled: !!object })
  const scrollYProgress = useScrollSpan(ref, pinned ? SPAN.pin : SPAN.through)
  const p = useSpring(scrollYProgress, SCROLL_SPRING)
  // a real (still) motion value: useTransform subscribes to it - a bare { get } stand-in threw and blanked the page
  const still = useMotionValue(0.5)
  // reduced motion: the object is one still frame, posed where it says the most (the roots grown, under the deck)
  const stillObject = useMotionValue(0.62)
  // the scene dissolves into the page at its moving edge only: the top edge while the frame slides in, the bottom
  // edge while it slides out; pinned, the whole frame is the scene
  const enterP = useScrollSpan(ref, SPAN.enter)
  const exitP = useScrollSpan(ref, SPAN.exit)
  const topF = useTransform(enterP, [0, 0.95], [38, 0], { clamp: true })
  const botF = useTransform(exitP, [0.05, 1], [0, 38], { clamp: true })
  const t1 = useTransform(topF, (v) => v * 0.3)
  const t2 = useTransform(topF, (v) => v * 0.62)
  const b1 = useTransform(botF, (v) => v * 0.62)
  const b2 = useTransform(botF, (v) => v * 0.3)
  const edgeFade = useMotionTemplate`linear-gradient(180deg, transparent 0svh, rgb(0 0 0 / 0.3) ${t1}svh, rgb(0 0 0 / 0.75) ${t2}svh, #000 ${topF}svh, #000 calc(100% - ${botF}svh), rgb(0 0 0 / 0.75) calc(100% - ${b1}svh), rgb(0 0 0 / 0.3) calc(100% - ${b2}svh), transparent 100%)`
  const prog = reduce ? still : p
  // With a plate riding over its tail the crossing is a screen longer: the sentence has the first half to itself, the
  // scene settles a little after it, then holds under the plate.
  const pSentence = useTransform(p, [0, 0.5], [0, 1], { clamp: true })
  const pScene = useTransform(p, [0, 0.62], [0, 1], { clamp: true })
  const sentence = tail ? pSentence : prog
  const scene = tail ? pScene : prog
  const art = (
    <div aria-hidden className={`pointer-events-none relative overflow-hidden ${ART_H[kind]} ${pinned ? 'mt-auto' : ''}`}>
      {kind === 'clouds' && <Clouds p={prog} />}
      {kind === 'canopy' && <Canopy p={prog} />}
      {kind === 'soil' && <Soil p={prog} />}
      {kind === 'glass' && <Glass />}
      {kind === 'market' && <Yard />}
    </div>
  )
  if (!lines?.length) return <div ref={ref} data-crossing={kind} className="relative z-0">{art}</div>
  return (
    // the scene shows through this block of the page, on the canvas the scenes share (lib/objects/world): pinned, the
    // whole crossing is its window - and with a plate riding over the last screen, the plate too
    <div ref={ref} data-crossing={kind} data-world-window={pinned ? 'pin' : undefined} data-world-tail={tail ? '' : undefined} className={`relative z-0 ${pinned ? (tail ? 'h-[300svh]' : 'h-[200svh]') : ''}`}>
      <div className={pinned ? 'sticky top-0 flex h-[100svh] flex-col overflow-hidden' : 'relative flex flex-col'}>
        {object && pinned ? (
          // the scene dissolves into the page at both edges of the frame (the atmosphere behind shows through), so a
          // crossing grows out of the dark above it and sinks back into the dark below - never a hard cut
          <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ maskImage: edgeFade, WebkitMaskImage: edgeFade }}>
            {/* light from the depth behind the object - the warm source the object is lit against */}
            <div className="absolute inset-0" style={{ background: kind === 'soil' ? 'radial-gradient(34% 52% at 71% 52%, rgb(214 150 80 / 0.20), rgb(122 74 42 / 0.08) 45%, transparent 72%)' : kind === 'glass' || kind === 'market' ? 'none' : 'radial-gradient(60% 34% at 55% 62%, rgb(232 186 110 / 0.22), rgb(201 176 122 / 0.06) 50%, transparent 75%)' }} />
            {near && object(scene)}
            {/* the sentence's side of the frame stays dark whatever the scene does, so the type always reads */}
            <div className="absolute inset-0" style={{ background: 'radial-gradient(48% 62% at 22% 44%, rgb(10 11 14 / 0.62), rgb(10 11 14 / 0) 100%), linear-gradient(90deg, rgb(10 11 14 / 0.78) 0%, rgb(10 11 14 / 0.55) 32%, rgb(10 11 14 / 0) 60%)' }} />
          </motion.div>
        ) : null}
        <Statement p={sentence} lines={lines} pinned={pinned} reduce={reduce} onImage={!!object && pinned} />
        {object && pinned ? null : object ? (
          // phones (and reduced motion): the same scene in the flow under the sentence, played by the scroll through
          // the crossing, dissolving into the page at both edges
          <div aria-hidden data-world-window="flow" className="pointer-events-none relative mt-2 h-[78svh] overflow-hidden" style={{ maskImage: FLOW_FADE, WebkitMaskImage: FLOW_FADE }}>
            {near && object(reduce ? stillObject : p)}
          </div>
        ) : (
          art
        )}
      </div>
    </div>
  )
}

/** The crossing's one idea: the altimeter's number large, then a sentence about this field, line by line. */
function Statement({ p, lines, pinned, reduce, onImage }: { p: MotionValue<number>; lines: ReactNode[]; pinned: boolean; reduce: boolean; onImage?: boolean }) {
  const num = useRef<HTMLSpanElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // the number moves on every scroll frame, so it is written only while this crossing is on screen: every crossing
    // rewriting its text on each frame, wherever the reader was, kept the page's layout permanently dirty
    let shown = false
    let last = ''
    const write = (d: { metres: number }) => {
      if (!shown || !num.current) return
      const text = formatAltitude(d.metres)
      if (text === last) return
      last = text
      num.current.textContent = text
    }
    const io = new IntersectionObserver(([e]) => {
      shown = e.isIntersecting
      const d = descentDepth.get()
      if (d) write(d)
    })
    if (box.current) io.observe(box.current)
    const off = descentDepth.subscribe(write)
    return () => {
      io.disconnect()
      off()
    }
  }, [])
  // pinned: the whole statement arrives with the scroll and leaves before the frame lets go
  const out = useTransform(p, [0.84, 0.97], [1, 0])
  const outY = useTransform(p, [0.84, 0.97], [0, -32])
  const numIn = useTransform(p, [0.02, 0.1], [0, 1])
  return (
    <motion.div ref={box} style={pinned ? { opacity: out, y: outY } : undefined} className={`relative z-10 mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:pl-28 xl:pl-36 ${pinned ? 'mt-[18svh]' : 'pt-20 pb-10'}`}>
      {/* a line of its own size, laid out on its own: the number changing does not re-lay the frame around it */}
      <motion.div aria-hidden style={pinned ? { opacity: numIn } : undefined} className="h-4 overflow-hidden font-mono text-xs text-ink-3 [contain:strict]">
        altitude <span ref={num} className="ml-2 text-leaf tabular-nums" />
      </motion.div>
      {/* over a lit scene the sentence takes the full bone and a soft dark halo: measured, it holds ≥ 4.5:1 on the
          brightest frame of the field, where the muted tone fell to 1.4:1 over the backlit ears; the halo stays tight - each
          line is clipped by its reveal mask, and a wide glow showed the mask as a dark box */}
      <p className={`font-display-soft mt-6 max-w-[17ch] text-[clamp(2.4rem,5.4vw,5.2rem)] leading-[0.9] uppercase [&_em]:font-voice [&_em]:text-ink [&_em]:text-[1.05em] ${onImage ? 'text-ink [text-shadow:0_1px_2px_rgb(11_10_8/0.6),0_0_10px_rgb(11_10_8/0.35)]' : 'text-ink-2'}`}>
        {lines.map((line, k) =>
          pinned ? <ScrubLine key={k} p={p} k={k} n={lines.length}>{line}</ScrubLine> : <FlowLine key={k} k={k} reduce={reduce}>{line}</FlowLine>,
        )}
      </p>
    </motion.div>
  )
}

/** A line rising out of its own mask as the scroll passes its window - reversible, no ease (the scroll is the ease). */
function ScrubLine({ p, k, n, children }: { p: MotionValue<number>; k: number; n: number; children: ReactNode }) {
  // the lines are all in by ~45 % of the crossing, so the whole sentence stands for a good while before it leaves
  const span = 0.3 / Math.max(1, n)
  const from = 0.08 + k * span
  const y = useTransform(p, [from, from + span * 1.3], ['105%', '0%'])
  const o = useTransform(p, [from, from + span * 1.3], [0, 1])
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <motion.span className="block" style={{ y, opacity: o }}>
        {children}
      </motion.span>
    </span>
  )
}

/** Phones: each line rises once when the crossing arrives. */
function FlowLine({ k, reduce, children }: { k: number; reduce: boolean; children: ReactNode }) {
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <motion.span
        className="block"
        initial={reduce ? false : { y: '105%' }}
        whileInView={{ y: '0%' }}
        viewport={{ once: true, margin: '-12% 0px' }}
        transition={{ duration: 0.9, delay: k * STAGGER.line, ease: EASE_OUT }}
      >
        {children}
      </motion.span>
    </span>
  )
}

// ---------- 1. cloud deck ----------

const PUFFS = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 37) % 100,
  y: 18 + ((i * 53) % 64),
  w: 18 + ((i * 29) % 26),
  layer: i % 3,
  o: 0.08 + ((i * 17) % 10) / 100,
}))

function Clouds({ p }: { p: MotionValue<number> }) {
  const y0 = useTransform(p, [0, 1], ['40%', '-40%'])
  const y1 = useTransform(p, [0, 1], ['80%', '-70%'])
  const y2 = useTransform(p, [0, 1], ['130%', '-110%'])
  const fog = useTransform(p, [0.2, 0.5, 0.8], [0, 0.55, 0])
  const ys = [y0, y1, y2]
  return (
    <div className="band-ground absolute inset-0" style={{ background: 'linear-gradient(180deg, var(--color-void), #050b14 55%, var(--color-void))' }}>
      {[0, 1, 2].map((layer) => (
        <motion.div key={layer} className="band-puffs absolute inset-0" style={{ y: ys[layer] }}>
          {PUFFS.filter((c) => c.layer === layer).map((c, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${c.x - c.w / 2}%`,
                top: `${c.y}%`,
                width: `${c.w * (1 + layer * 0.5)}%`,
                aspectRatio: '3 / 1',
                opacity: c.o * (1 + layer * 0.6),
                background: 'radial-gradient(closest-side, rgb(200 225 245 / 0.9), rgb(159 178 138 / 0.25) 55%, transparent)',
                filter: `blur(${10 + layer * 8}px)`,
              }}
            />
          ))}
        </motion.div>
      ))}
      <motion.div className="absolute inset-0" style={{ opacity: fog, background: 'radial-gradient(80% 60% at 50% 50%, rgb(190 215 235 / 0.16), transparent 70%)' }} />
    </div>
  )
}

// ---------- 2. crop canopy ----------

/** Deterministic pseudo-random numbers, so the canopy and the soil look the same on every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

type Blade = { x: number; h: number; w: number; bend: number; delay: number; ear: boolean }
const CANOPY_W = 1600
const CANOPY_H = 320

function blades(n: number, hMin: number, hMax: number, wMin: number, seed: number, ears = 0): Blade[] {
  const r = seeded(seed)
  return Array.from({ length: n }, (_, i) => ({
    x: (i / n) * CANOPY_W + r() * (CANOPY_W / n),
    h: hMin + r() * (hMax - hMin),
    w: wMin + r() * wMin,
    bend: (r() - 0.5) * 60,
    delay: r() * 4,
    ear: r() < ears,
  }))
}
const BACK = blades(150, 50, 110, 3, 11)
const MID = blades(110, 90, 170, 4.5, 23)
const FRONT = blades(64, 150, 250, 6, 37, 0.35)
const POLLEN = (() => {
  const r = seeded(51)
  return Array.from({ length: 26 }, () => ({ x: r() * 100, y: 20 + r() * 55, s: 1 + r() * 2, d: 6 + r() * 8, delay: -r() * 10 }))
})()

/** A tapered, gently curved leaf from the ground up. */
const leaf = (b: Blade) => {
  const base = CANOPY_H
  const tipX = b.x + b.bend
  const tipY = base - b.h
  return `M${b.x - b.w},${base} Q${b.x - b.w * 0.5 + b.bend * 0.35},${base - b.h * 0.55} ${tipX},${tipY} Q${b.x + b.w * 0.5 + b.bend * 0.35},${base - b.h * 0.55} ${b.x + b.w},${base} Z`
}
/** An ear of grain: little grains stacked along the tip. */
const ear = (b: Blade) => {
  const tipX = b.x + b.bend
  const tipY = CANOPY_H - b.h
  const dir = b.bend >= 0 ? 1 : -1
  return Array.from({ length: 6 }, (_, k) => ({ cx: tipX - dir * k * 1.6, cy: tipY + 4 + k * 5.2, rx: 2.6, ry: 4.4, rot: dir * 18 }))
}

function Canopy({ p }: { p: MotionValue<number> }) {
  const grow = useTransform(p, [0.05, 0.5], [0.25, 1])
  const growMid = useTransform(p, [0.02, 0.45], [0.35, 1])
  const back = useTransform(p, [0, 1], ['6%', '-6%'])
  return (
    <div className="band-ground absolute inset-0" style={{ background: 'linear-gradient(180deg, var(--color-canopy) 0%, #0a1d12 55%, #0c2415 100%)' }}>
      {/* evening light on the horizon */}
      <div className="absolute inset-x-0 bottom-[30%] h-40" style={{ background: 'radial-gradient(55% 100% at 50% 100%, rgb(244 205 106 / 0.12), transparent 70%)' }} />
      <svg viewBox={`0 0 ${CANOPY_W} ${CANOPY_H}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="leaf-front" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#2f5f28" />
            <stop offset="0.6" stopColor="#6fa84a" />
            <stop offset="1" stopColor="#c9b07a" />
          </linearGradient>
          <linearGradient id="leaf-mid" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#1d3d1c" />
            <stop offset="1" stopColor="#4f8a3a" />
          </linearGradient>
          <linearGradient id="ground-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0c2415" stopOpacity="0" />
            <stop offset="1" stopColor="#0c2415" stopOpacity="1" />
          </linearGradient>
        </defs>
        <motion.g style={{ y: back }} opacity={0.5}>
          {BACK.map((b, i) => <path key={i} d={leaf(b)} fill="#244a22" />)}
        </motion.g>
        <motion.g style={{ scaleY: growMid, originY: 1 }}>
          {MID.map((b, i) => (
            // only the front row sways: animating every blade repainted the whole band each frame
            <path key={i} d={leaf(b)} fill="url(#leaf-mid)" opacity={0.85} />
          ))}
        </motion.g>
        <motion.g style={{ scaleY: grow, originY: 1 }}>
          {FRONT.map((b, i) => (
            <g key={i} className="canopy-sway" style={{ animationDelay: `${-b.delay}s`, animationDuration: `${3.6 + (i % 5) * 0.4}s` }}>
              <path d={leaf(b)} fill="url(#leaf-front)" />
              {b.ear && ear(b).map((g, k) => (
                <ellipse key={k} cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} transform={`rotate(${g.rot} ${g.cx} ${g.cy})`} fill="#e9cf7a" opacity={0.9} />
              ))}
            </g>
          ))}
        </motion.g>
        <rect x="0" y={CANOPY_H - 40} width={CANOPY_W} height="40" fill="url(#ground-fade)" />
      </svg>
      {/* pollen and dust drifting in the low sun */}
      {POLLEN.map((d, i) => (
        <span
          key={i}
          className="pollen absolute rounded-full bg-wheat/60"
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.s, height: d.s, animationDuration: `${d.d}s`, animationDelay: `${d.delay}s`, boxShadow: '0 0 6px rgb(244 205 106 / 0.8)' }}
        />
      ))}
    </div>
  )
}

// ---------- 3. soil profile & roots ----------

const SOIL_W = 1600
const SOIL_H = 360
const SURFACE = 44
/** A wavy horizon boundary across the profile. */
function boundary(y: number, amp: number, seed: number): string {
  const r = seeded(seed)
  const pts = Array.from({ length: 17 }, (_, i) => [i * (SOIL_W / 16), y + (r() - 0.5) * 2 * amp] as const)
  let d = `M0,${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    d += ` C${x0 + 40},${y0} ${x1 - 40},${y1} ${x1},${y1}`
  }
  return d
}
/** The area below a boundary, down to the bottom of the profile. */
const below = (top: string) => `${top} L${SOIL_W},${SOIL_H} L0,${SOIL_H} Z`
const B_TOP = boundary(140, 10, 7)
const C_TOP = boundary(258, 14, 13)
const STONES_B = (() => {
  const r = seeded(29)
  return Array.from({ length: 22 }, () => ({ x: r() * SOIL_W, y: 160 + r() * 90, rx: 4 + r() * 9, ry: 3 + r() * 5, rot: r() * 60 - 30 }))
})()
const STONES_C = (() => {
  const r = seeded(41)
  return Array.from({ length: 34 }, () => ({ x: r() * SOIL_W, y: 275 + r() * 80, rx: 6 + r() * 14, ry: 4 + r() * 8, rot: r() * 60 - 30 }))
})()
const HUMUS = (() => {
  const r = seeded(59)
  return Array.from({ length: 140 }, () => ({ x: r() * SOIL_W, y: SURFACE + 6 + r() * 90, r: 0.8 + r() * 1.8 }))
})()
/** Seedlings on the surface and their roots, each root a tapered main axis with side branches. */
const PLANTS = [170, 460, 750, 1040, 1310].map((x, i) => {
  const r = seeded(71 + i * 17)
  const depth = 190 + r() * 130
  const main: [number, number][] = Array.from({ length: 9 }, (_, k) => [x + Math.sin(k * 0.9 + i) * 10 + (r() - 0.5) * 8, SURFACE + (k / 8) * depth])
  const branches = Array.from({ length: 6 }, (_, k) => {
    const at = main[1 + k]
    const dir = k % 2 ? 1 : -1
    const len = 40 + r() * 70
    return `M${at[0]},${at[1]} q${dir * len * 0.5},${len * 0.15} ${dir * len},${len * 0.55}`
  })
  const d = main.map(([mx, my], k) => `${k ? 'L' : 'M'}${mx.toFixed(1)},${my.toFixed(1)}`).join(' ')
  return { x, d, branches }
})
const DROPS = (() => {
  const r = seeded(83)
  return Array.from({ length: 12 }, () => ({ x: r() * 100, d: 5 + r() * 5, delay: -r() * 8 }))
})()

function Soil({ p }: { p: MotionValue<number> }) {
  const drawn = useTransform(p, [0.08, 0.65], [0, 1])
  const drawnSide = useTransform(p, [0.2, 0.75], [0, 1])
  const lift = useTransform(p, [0, 1], ['4%', '-4%'])
  return (
    <div className="absolute inset-0 bg-soil">
      <motion.svg viewBox={`0 0 ${SOIL_W} ${SOIL_H}`} preserveAspectRatio="xMidYMin slice" className="absolute inset-0 h-full w-full" style={{ y: lift }}>
        <defs>
          <linearGradient id="hz-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a1b10" />
            <stop offset="1" stopColor="#23170d" />
          </linearGradient>
          <linearGradient id="hz-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b2715" />
            <stop offset="1" stopColor="#452f1a" />
          </linearGradient>
          <linearGradient id="hz-c" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4d3a24" />
            <stop offset="1" stopColor="#3a2b1a" />
          </linearGradient>
          <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9d8a6e" />
            <stop offset="1" stopColor="#5e503d" />
          </linearGradient>
        </defs>
        {/* sky edge and the living surface */}
        <rect width={SOIL_W} height={SURFACE} fill="#0b1a10" />
        <rect y={SURFACE} width={SOIL_W} height={SOIL_H - SURFACE} fill="url(#hz-a)" />
        <path d={below(B_TOP)} fill="url(#hz-b)" />
        <path d={below(C_TOP)} fill="url(#hz-c)" />
        <path d={B_TOP} fill="none" stroke="rgb(255 230 190 / 0.08)" strokeWidth="1.2" />
        <path d={C_TOP} fill="none" stroke="rgb(255 230 190 / 0.08)" strokeWidth="1.2" />
        {HUMUS.map((h, i) => <circle key={i} cx={h.x} cy={h.y} r={h.r} fill="#120b06" opacity={0.7} />)}
        {[...STONES_B, ...STONES_C].map((s, i) => (
          <g key={i} transform={`rotate(${s.rot} ${s.x} ${s.y})`}>
            <ellipse cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill="url(#stone)" opacity={i < STONES_B.length ? 0.5 : 0.75} />
            <ellipse cx={s.x - s.rx * 0.25} cy={s.y - s.ry * 0.4} rx={s.rx * 0.45} ry={s.ry * 0.25} fill="#e8dcc4" opacity={0.18} />
          </g>
        ))}
        {/* grass fringe on the surface */}
        <path d={`M0,${SURFACE} H${SOIL_W}`} stroke="#6fa84a" strokeWidth="2" opacity={0.6} />
        {Array.from({ length: 120 }, (_, i) => {
          const x = i * (SOIL_W / 120) + ((i * 37) % 11)
          const h = 5 + ((i * 53) % 9)
          return <path key={i} d={`M${x - 1.6},${SURFACE} Q${x},${SURFACE - h * 0.6} ${x + ((i % 3) - 1) * 2},${SURFACE - h} Q${x + 0.6},${SURFACE - h * 0.5} ${x + 1.6},${SURFACE} Z`} fill="#7fb850" opacity={0.7} />
        })}
        {/* seedlings and their roots */}
        {PLANTS.map((pl, i) => (
          <g key={i}>
            <path d={`M${pl.x},${SURFACE} q-10,-14 -22,-18 q12,-2 22,14 q8,-18 24,-20 q-14,8 -24,24 Z`} fill="#c9b07a" opacity={0.85} />
            <motion.path d={pl.d} fill="none" stroke="#efdcb2" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ pathLength: drawn }} opacity={0.8} />
            {pl.branches.map((b, k) => (
              <motion.path key={k} d={b} fill="none" stroke="#efdcb2" strokeWidth={1.6 - k * 0.15} strokeLinecap="round" style={{ pathLength: drawnSide }} opacity={0.55} />
            ))}
          </g>
        ))}
        {/* horizon labels */}
        {[
          ['A · topsoil', 92],
          ['B · subsoil', 200],
          ['C · parent material', 312],
        ].map(([t, y]) => (
          <text key={t} x={SOIL_W - 28} y={y as number} textAnchor="end" className="font-mono" fontSize="13" letterSpacing="3" fill="rgb(244 205 106 / 0.45)">{String(t).toUpperCase()}</text>
        ))}
      </motion.svg>
      {/* rain soaking down */}
      {DROPS.map((d, i) => (
        <span key={i} className="soak absolute top-[14%] h-2 w-[3px] rounded-full bg-water/60" style={{ left: `${d.x}%`, animationDuration: `${d.d}s`, animationDelay: `${d.delay}s` }} />
      ))}
      {/* come out of the field section above, melt into the root-zone section below */}
      <div className="absolute inset-x-0 top-0 h-10" style={{ background: 'linear-gradient(180deg, var(--color-soil), transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: 'linear-gradient(180deg, transparent, var(--color-soil))' }} />
    </div>
  )
}

// ---------- 5. the market (without WebGL): the bins of an elevator against the last light ----------

function Yard() {
  return (
    <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0a0e18 0%, #131a2a 62%, #3a2418 100%)' }}>
      <svg viewBox="0 0 1600 280" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        {[620, 760, 900, 1040].map((x) => (
          <g key={x} fill="#07090d">
            <rect x={x} y={90} width={118} height={190} />
            <polygon points={`${x - 4},90 ${x + 59},58 ${x + 122},90`} />
          </g>
        ))}
        <rect x={826} y={6} width={22} height={274} fill="#07090d" />
        <rect x={600} y={52} width={580} height={5} fill="#07090d" />
        <rect x={0} y={262} width={1600} height={18} fill="#06070a" />
      </svg>
    </div>
  )
}

// ---------- 4. under glass (without WebGL): the roofline of a lit house at dusk ----------

function Glass() {
  // a sawtooth Venlo roofline, warm behind the panes, under the blue of the hour
  const ridges = Array.from({ length: 9 }, (_, i) => `${i * 180},150 ${i * 180 + 90},118`).join(' ')
  return (
    <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0b0f17 0%, #0d1320 55%, var(--color-void) 100%)' }}>
      <svg viewBox="0 0 1600 320" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="gh-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(240 170 90)" stopOpacity="0.55" />
            <stop offset="1" stopColor="rgb(200 120 60)" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <polygon points={`0,320 0,150 ${ridges} 1620,150 1620,320`} fill="url(#gh-glow)" />
        <polyline points={`0,150 ${ridges} 1620,150`} fill="none" stroke="rgb(236 232 224 / 0.35)" strokeWidth="1.5" />
        {Array.from({ length: 40 }, (_, i) => <line key={i} x1={i * 40} y1={150} x2={i * 40} y2={320} stroke="rgb(236 232 224 / 0.08)" strokeWidth="1" />)}
      </svg>
    </div>
  )
}

// A block's scroll progress as a motion value, from the page's kept measurements. Motion's own useScroll measures its
// target on every scroll event (an offsetParent walk and a size read per tracker, a dozen trackers on this page); this
// reads one scroll position per frame and does arithmetic.
import { frame, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, type RefObject } from 'react'
import { elementSpan, onPageGeometry, pageHeight, viewportHeight, type Span } from './pageGeometry'

/** The scroll position (px) at which a block's progress is 0 or 1, from its span and the viewport's height. */
export type Edge = (s: Span, vh: number) => number
export type Edges = readonly [from: Edge, to: Edge]

export const SPAN = {
  /** pinned: from the block's top meeting the top of the screen to its bottom meeting the bottom */
  pin: [(s) => s.top, (s, vh) => s.bottom - vh],
  /** passing through: from its top entering at the bottom of the screen to its bottom leaving at the top */
  through: [(s, vh) => s.top - vh, (s) => s.bottom],
  /** arriving: its top travels from the bottom of the screen to the top */
  enter: [(s, vh) => s.top - vh, (s) => s.top],
  /** leaving: its bottom travels from the bottom of the screen to the top */
  exit: [(s, vh) => s.bottom - vh, (s) => s.bottom],
} satisfies Record<string, Edges>

type Tracker = { compute: (y: number, vh: number) => number; value: MotionValue<number> }
const trackers = new Set<Tracker>()
let listening = false

/** as motion's own: a range of nothing counts as passed */
const share = (from: number, to: number, y: number) => (to === from ? 1 : Math.min(1, Math.max(0, (y - from) / (to - from))))

const updateAll = () => {
  if (!trackers.size) return
  const y = window.scrollY
  const vh = viewportHeight()
  for (const t of trackers) t.value.set(t.compute(y, vh))
}
// in motion's own frame, at its read step: the values are in before anything derived from them renders
const schedule = () => frame.read(updateAll, false, true)

function listen() {
  if (listening) return
  listening = true
  window.addEventListener('scroll', schedule, { passive: true })
  onPageGeometry(schedule)
}

/**
 * 0 … 1 as the page scrolls the block between the two edges (see `SPAN`). `edges` must be a stable reference.
 */
export function useScrollSpan(ref: RefObject<Element | null>, edges: Edges): MotionValue<number> {
  const value = useMotionValue(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const t: Tracker = {
      value,
      compute: (y, vh) => {
        if (!el.isConnected) return value.get()
        const s = elementSpan(el)
        return share(edges[0](s, vh), edges[1](s, vh), y)
      },
    }
    trackers.add(t)
    listen()
    schedule()
    return () => {
      trackers.delete(t)
    }
  }, [ref, edges, value])
  return value
}

/** 0 at the top of the page, 1 at its end. */
export function usePageProgress(): MotionValue<number> {
  const value = useMotionValue(0)
  useEffect(() => {
    const t: Tracker = { value, compute: (y, vh) => share(0, Math.max(0, pageHeight() - vh), y) }
    trackers.add(t)
    listen()
    schedule()
    return () => {
      trackers.delete(t)
    }
  }, [value])
  return value
}

// The heavy parts of the page - its 3D scenes - are made ahead of the reader and then kept.
//
// Made at the moment they scrolled into view, each one held the page still for as long as it took: the geometry, the
// textures, the first frame. Now every scene registers here and is started ahead of time, the one the reader reaches
// next first, each in a turn of the page's one queue for heavy work (lib/calm): in a pause of the scrolling, with time
// between two of them. By the time the reader arrives a scene has been drawn once already. One they reach before its
// turn starts as it always did, on approach.
import { useEffect, useState, type RefObject } from 'react'
import { calm, RANK, type Ask } from './calm'
import { elementSpan, viewportHeight } from './pageGeometry'

/**
 * A turn for work nobody is waiting for - the files of things far down the page (lib/objects/cc0), the closing film:
 * the last in the queue, after a longer pause (a pause between two flicks of the wheel is not one), and taken anyway
 * once it has waited this long.
 */
export const IDLE: Ask = { rank: RANK.idle, still: 800, patience: 15000 }

type Job = { el: Element; run: () => void }
const jobs = new Set<Job>()
let pumping = false
/** between two scenes: the first gets to build (it asks the queue for its own steps meanwhile) before the next starts */
const GAP_MS = 700

/** the one the reader reaches next: the nearest below the screen, then those above it */
function nearest(): Job | null {
  const y = window.scrollY
  const vh = viewportHeight()
  let best: Job | null = null
  let bestD = Infinity
  for (const j of jobs) {
    if (!j.el.isConnected) {
      jobs.delete(j)
      continue
    }
    const s = elementSpan(j.el)
    const d = s.bottom >= y ? Math.max(0, s.top - (y + vh)) : (y - s.bottom) * 1.5 + vh
    if (d < bestD) {
      bestD = d
      best = j
    }
  }
  return best
}

async function pump() {
  if (pumping) return
  pumping = true
  while (jobs.size) {
    await calm.turn({ rank: RANK.start })
    // (picked when the turn comes, not when it was asked for: the reader may have moved meanwhile)
    const job = nearest()
    if (!job) break
    jobs.delete(job)
    job.run()
    await new Promise((res) => setTimeout(res, GAP_MS))
  }
  pumping = false
}

/** Have `run` called in a pause of the scrolling, in the order the reader will meet the elements. Returns a cancel. */
export function prewarm(el: Element, run: () => void): () => void {
  const job: Job = { el, run }
  jobs.add(job)
  void pump()
  return () => {
    jobs.delete(job)
  }
}

/**
 * Should the heavy thing at `ref` exist yet? True from the moment it comes within `margin` of the screen, or its turn
 * comes in the pre-warmer - and then for good (`keep`), so coming back to it costs nothing. With `keep` off it follows
 * the screen: made on approach, dropped when far (small screens, where memory is short).
 */
export function useNear(ref: RefObject<Element | null>, o: { margin?: string; keep?: boolean; enabled?: boolean } = {}): boolean {
  const { margin = '100% 0px', keep = true, enabled = true } = o
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const io = new IntersectionObserver(([e]) => setNear((was) => (keep ? was || e.isIntersecting : e.isIntersecting)), { rootMargin: margin })
    io.observe(el)
    const cancel = keep ? prewarm(el, () => setNear(true)) : undefined
    return () => {
      io.disconnect()
      cancel?.()
    }
  }, [ref, margin, keep, enabled])
  return near
}

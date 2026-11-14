// When may heavy work run? One answer, here.
//
// The loader film used to hide the scenes being built; since it is gone (b2df73d) everything heavy - a scene's
// geometry merged, its textures painted, its first frame drawn, a specimen drawn in the studio, the files of things far
// down the page - happens in the live page, and each of those decided for itself when the reader had paused (prewarm,
// the shared canvas and the studio had three different ideas of it, and no common queue). Run back to back in the
// first pause, they were the 130-230 ms long tasks the reader's next scroll ran into.
//
// Now every piece of heavy work waits here for a turn. There is one definition of a pause (the page visible, and not
// scrolled for `still` ms), one queue ordered by rank and then by age, and one turn at a time: a turn is a slice of
// at most SLICE_MS of the main thread, and the next one is granted only after the browser has painted. A long piece of
// work is cut into steps that call `breathe()` between them: it carries on at once while its slice lasts, and waits
// for its next turn when it does not.
//
// `createCalm` takes its clock, so the queue can be driven by a fake one in tests; the page uses `calm` below.

/** no scroll for this long: the reader has paused */
export const STILL_MS = 320
/** one turn's share of the main thread: half a frame at 60 Hz */
export const SLICE_MS = 8
/** how often a waiting queue looks again while the reader is scrolling */
const LOOK_MS = 100

/**
 * The queue's order: a lower rank goes first among those whose pause has come.
 *  - frame: a scene's first frame, drawn while its window is still off screen
 *  - build: the next step of a scene already being built
 *  - start: a scene started ahead of the reader (lib/prewarm)
 *  - paint: a specimen drawn in the studio
 *  - idle: what nobody is waiting for (the files of things far down the page, the closing film, the print reports)
 */
export const RANK = { frame: 0, build: 1, start: 2, paint: 3, idle: 4 } as const

export type Ask = {
  /** the page must have stood this long (ms; STILL_MS by default - longer for what is heavy and unseen) */
  still?: number
  /** the turn is taken anyway after this long (ms): a reader who never pauses still gets the page built */
  patience?: number
  rank?: number
}

export type Clock = {
  now: () => number
  /** `fn` after `ms` */
  after: (ms: number, fn: () => void) => void
  /** `fn` once the browser has painted a frame */
  afterPaint: (fn: () => void) => void
  visible: () => boolean
}

export type Calm = {
  /** the page was scrolled (at `t`, now by default) */
  scrolled: (t?: number) => void
  /** has the reader paused - the page visible and not scrolled for `still` ms? */
  still: (still?: number) => boolean
  /** a turn: resolves when the reader has paused and the queue gets to this one; the slice starts then */
  turn: (ask?: Ask) => Promise<void>
  /** between two steps of a long piece of work: at once while the slice lasts, else a new turn (with `ask`) */
  breathe: (ask?: Ask) => Promise<void>
  /** waiters in the queue (tests, development) */
  waiting: () => number
}

type Waiter = { rank: number; still: number; patience: number; at: number; seq: number; go: () => void }

export function createCalm(clock: Clock): Calm {
  let lastScroll = -Infinity
  let sliceStart = -Infinity
  let seq = 0
  let scheduled = false
  const queue: Waiter[] = []

  const still = (ms = STILL_MS) => clock.visible() && clock.now() - lastScroll >= ms

  const schedule = (paint: boolean) => {
    if (scheduled) return
    scheduled = true
    if (paint) clock.afterPaint(pump)
    else clock.after(LOOK_MS, pump)
  }

  function pump() {
    scheduled = false
    if (!queue.length) return
    const now = clock.now()
    let best = -1
    for (let i = 0; i < queue.length; i++) {
      const w = queue[i]
      if (!(still(w.still) || now - w.at >= w.patience)) continue
      if (best < 0 || w.rank < queue[best].rank || (w.rank === queue[best].rank && w.seq < queue[best].seq)) best = i
    }
    if (best < 0) {
      schedule(false)
      return
    }
    const [w] = queue.splice(best, 1)
    sliceStart = now
    w.go()
    // (the next turn after the browser has painted: what this one did gets its frame first)
    if (queue.length) schedule(true)
  }

  const turn = (ask: Ask = {}) =>
    new Promise<void>((go) => {
      queue.push({ rank: ask.rank ?? RANK.build, still: ask.still ?? STILL_MS, patience: ask.patience ?? Infinity, at: clock.now(), seq: seq++, go })
      schedule(true)
    })

  return {
    scrolled: (t = clock.now()) => {
      lastScroll = t
    },
    still,
    turn,
    breathe: (ask) => (clock.now() - sliceStart < SLICE_MS ? Promise.resolve() : turn(ask)),
    waiting: () => queue.length,
  }
}

const browser = typeof window !== 'undefined' && typeof document !== 'undefined'

/** the page's own: its clock, its scrolling */
export const calm: Calm = createCalm({
  now: () => performance.now(),
  after: (ms, fn) => void setTimeout(fn, ms),
  // a frame, then a task after it: the turn starts once that frame is on screen (a hidden page paints no frames - its
  // timers are what is left; its turns wait for it anyway)
  afterPaint: (fn) => {
    if (browser && document.visibilityState === 'visible') requestAnimationFrame(() => setTimeout(fn, 0))
    else setTimeout(fn, LOOK_MS)
  },
  visible: () => !browser || document.visibilityState === 'visible',
})
if (browser) window.addEventListener('scroll', () => calm.scrolled(), { passive: true })

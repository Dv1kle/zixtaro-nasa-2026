// One motion system for the page. Motion lives where it means
// something - position, time, causality - and is never decoration. Values tied to the scroll get no ease at all:
// their weight comes from the smooth scroll (lib/scroll.ts) or a spring.

/** entrances and one-time narrative beats: fast in, long settle */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const
/** long narrative beats (an intro, an answer surfacing) */
export const EASE_SETTLE = [0.2, 0.7, 0.2, 1] as const
/** state changes: toggles, swaps, a tab switching */
export const EASE_STATE = [0.45, 0, 0.15, 1] as const

/** seconds */
export const DUR = {
  hover: 0.12,
  toggle: 0.24,
  expand: 0.45,
  line: 0.9,
  narrative: 1.4,
} as const

/** between revealed lines of a headline, between blocks (never more than four in a run) */
export const STAGGER = { line: 0.09, block: 0.08 } as const

/** a scroll-linked value that should trail the scroll a little, like a camera on a dolly */
export const SCROLL_SPRING = { stiffness: 120, damping: 30, mass: 0.4 } as const

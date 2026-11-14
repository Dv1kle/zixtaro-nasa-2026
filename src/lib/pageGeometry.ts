// The page's own measurements, taken once and kept: where each section (or any block) starts and ends in the document,
// and the viewport's height. Everything that follows the scroll - the altimeter, the section nav, the crossings' own
// progress - asks here on every frame. Measuring the DOM there instead forced a layout of the page per frame, each
// time anything on it had changed since the last one.

/** A block's extent in document coordinates: px from the top of the page. */
export type Span = { top: number; bottom: number }

const byId = new Map<string, Span | null>()
let byElement = new WeakMap<Element, Span>()
const listeners = new Set<() => void>()
let watching = false
let stale = true
let measuredAt = 0
let vh = 0
let pageH = 0

function invalidate() {
  stale = true
  listeners.forEach((f) => f())
}

function watch() {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener('resize', invalidate)
  // the page grows as its parts mount and as panels open: any change of the document's height moves what is below
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(invalidate).observe(document.body)
}

function fresh() {
  watch()
  const now = performance.now()
  // a block can also move without the page's height changing (one part swapped for another of the same height), so
  // the measurements are retaken once a second as well
  if (!stale && now - measuredAt < 1000) return
  stale = false
  measuredAt = now
  byId.clear()
  byElement = new WeakMap()
  vh = window.innerHeight
  // (the page's height is read when it is asked for: reading it here laid the whole growing page out again on every
  // frame of a first visit, whoever was asking, and only the closing film ever asks)
  pageH = -1
}

function measure(el: Element): Span {
  const r = el.getBoundingClientRect()
  const y = window.scrollY
  return { top: r.top + y, bottom: r.bottom + y }
}

/** A section's span by its id, or null while it is not on the page. */
export function sectionSpan(id: string): Span | null {
  fresh()
  let s = byId.get(id)
  if (s === undefined) {
    const el = document.getElementById(id)
    s = el ? measure(el) : null
    byId.set(id, s)
  }
  return s
}

/** An element's span. For blocks that sit in the flow of the page - not sticky or transformed ones, which move. */
export function elementSpan(el: Element): Span {
  fresh()
  let s = byElement.get(el)
  if (!s) {
    s = measure(el)
    byElement.set(el, s)
  }
  return s
}

export function viewportHeight(): number {
  fresh()
  return vh
}

/** The whole document's height. */
export function pageHeight(): number {
  fresh()
  if (pageH < 0) pageH = document.documentElement.scrollHeight
  return pageH
}

/** Called when the measurements have gone stale (a resize, the page growing), so a reader can take them again. */
export function onPageGeometry(f: () => void): () => void {
  watch()
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

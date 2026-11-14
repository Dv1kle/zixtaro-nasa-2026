// The display's own frame: how many milliseconds between two refreshes of this screen (16.7 at 60 Hz, 6.9 at 144).
// The scenes take it as their budget - a scene tuned to hold "about 60" looks slow beside a page that scrolls at 144.
// A page cannot ask for the rate; it can only watch its animation frames, which never come faster than the screen.

const RATES = [60, 72, 75, 90, 100, 120, 144, 165, 240]
let interval = 1000 / 60
let measuring = false

function measure() {
  if (measuring || typeof requestAnimationFrame !== 'function') return
  measuring = true
  const gaps: number[] = []
  let last = 0
  const tick = (now: number) => {
    if (last) gaps.push(now - last)
    last = now
    if (gaps.length < 60) return requestAnimationFrame(tick)
    measuring = false
    // the fast end of what was seen: a busy page drops frames, it never gains any
    gaps.sort((a, b) => a - b)
    const seen = gaps[Math.floor(gaps.length * 0.2)]
    const rate = RATES.reduce((best, r) => (Math.abs(1000 / r - seen) < Math.abs(1000 / best - seen) ? r : best), 60)
    interval = 1000 / rate
  }
  requestAnimationFrame(tick)
}

if (typeof window !== 'undefined') {
  measure()
  // again once the page has settled (the first second of a load is no time to count frames), and when the window
  // may have moved to another screen
  window.setTimeout(measure, 4000)
  window.addEventListener('zixtaro:intro-done', () => window.setTimeout(measure, 1500))
  window.addEventListener('resize', () => window.setTimeout(measure, 500))
}

/** Milliseconds between two frames of this display. */
export const displayInterval = () => interval

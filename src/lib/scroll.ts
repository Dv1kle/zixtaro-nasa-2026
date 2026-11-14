// Inertial scroll for wheels and trackpads on desktop (Lenis): the page gains weight, and the scroll-scrubbed moments
// (the hero's dive, the crossings, the stripes) glide instead of stepping. Touch keeps the platform's own scroll,
// and readers who ask for reduced motion get plain native scrolling.
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

let lenis: Lenis | null = null
let holds = 0
let ticked = -1

/**
 * Advance the inertial scroll for this animation frame - once per frame, whoever asks first. Whatever draws something
 * that has to sit where the page is (the scenes' shared canvas) asks before it measures, so it is not a frame behind.
 */
export function tickScroll(t: number) {
  if (!lenis || t === ticked) return
  ticked = t
  lenis.raf(t)
}

/** Hold the page still while something is open over it (an instrument's sheet), and let it go again. */
export function holdScroll(on: boolean) {
  holds = Math.max(0, holds + (on ? 1 : -1))
  const held = holds > 0
  if (held) lenis?.stop()
  else lenis?.start()
  // without the inertial scroll (touch, reduced motion) the page's own scroll is what has to stop
  document.documentElement.style.overflow = held && !lenis ? 'hidden' : ''
}

export function startSmoothScroll(): () => void {
  const fine = window.matchMedia('(pointer: fine) and (min-width: 1024px)')
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  let raf = 0
  const stop = () => {
    cancelAnimationFrame(raf)
    lenis?.destroy()
    lenis = null
  }
  const start = () => {
    if (lenis || !fine.matches || still.matches) return
    lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
      // section links (#plan, #ground…) glide too - the hero's "Descend" plays the dive on the way down - and the
      // page's own hash, which holds the scenario, is left alone
      anchors: { offset: -64 },
      // menus, sheets and side scrollers keep their own scrolling
      allowNestedScroll: true,
      prevent: (node) => !!node.closest?.('[data-lenis-prevent], [role="dialog"], .maplibregl-ctrl'),
    })
    const loop = (t: number) => {
      tickScroll(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
  }
  const sync = () => (fine.matches && !still.matches ? start() : stop())
  sync()
  fine.addEventListener('change', sync)
  still.addEventListener('change', sync)
  return () => {
    fine.removeEventListener('change', sync)
    still.removeEventListener('change', sync)
    stop()
  }
}

// CSS animations that never end (a pulsing marker, a flowing dash, a swaying leaf) keep ticking when their element is
// a dozen screens away: every tick restyles it and repaints the page's layer, on every frame, for nobody. Measured on
// this page that was the largest single cost of a scroll frame. This pauses each endless animation while its element is
// out of view and lets it run again on the way back in - whatever the animation is, with nothing to add where it is
// declared.

const SCAN_MS = 1500

export function governAnimations(): () => void {
  if (typeof document.getAnimations !== 'function' || typeof IntersectionObserver === 'undefined' || typeof CSSAnimation === 'undefined') return () => {}
  /** the element watched → its endless animations */
  const held = new Map<Element, Set<Animation>>()
  const inView = new WeakMap<Element, boolean>()
  /** the ones paused here - an animation the page itself holds paused is left alone */
  const mine = new WeakSet<Animation>()

  const apply = (el: Element) => {
    const on = inView.get(el) !== false
    for (const a of held.get(el) ?? []) {
      try {
        if (!on && a.playState === 'running') {
          a.pause()
          mine.add(a)
        } else if (on && mine.has(a)) {
          mine.delete(a)
          if (a.playState === 'paused') a.play()
        }
      } catch {
        // an animation whose element has just left the page
      }
    }
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        inView.set(e.target, e.isIntersecting)
        apply(e.target)
      }
    },
    // a little early, so nothing is caught starting as it scrolls in
    { rootMargin: '12% 0px' },
  )

  const scan = () => {
    for (const a of document.getAnimations()) {
      if (!(a instanceof CSSAnimation)) continue
      const effect = a.effect as KeyframeEffect | null
      const target = effect?.target
      if (!target || effect.getComputedTiming().iterations !== Infinity) continue
      // a shape inside an <svg> has no box of its own to observe: its drawing stands in for it
      const el = target instanceof SVGElement && target.ownerSVGElement ? target.ownerSVGElement : target
      let set = held.get(el)
      if (!set) {
        set = new Set()
        held.set(el, set)
        io.observe(el)
      }
      if (!set.has(a)) {
        set.add(a)
        if (inView.get(el) === false) apply(el)
      }
    }
    for (const [el, set] of held) {
      if (!el.isConnected) {
        io.unobserve(el)
        held.delete(el)
        continue
      }
      for (const a of set) if (a.playState === 'idle' || a.playState === 'finished') set.delete(a)
    }
  }

  // new parts of the page bring new animations: look again every so often, in idle time
  let idle = 0
  const tick = () => {
    if (document.visibilityState !== 'visible') return
    if (typeof window.requestIdleCallback === 'function') {
      window.cancelIdleCallback(idle)
      idle = window.requestIdleCallback(scan, { timeout: 1000 })
    } else scan()
  }
  const timer = window.setInterval(tick, SCAN_MS)
  tick()

  return () => {
    window.clearInterval(timer)
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle)
    io.disconnect()
    for (const set of held.values()) {
      for (const a of set) {
        try {
          if (mine.has(a) && a.playState === 'paused') a.play()
        } catch {
          // gone
        }
      }
    }
    held.clear()
  }
}

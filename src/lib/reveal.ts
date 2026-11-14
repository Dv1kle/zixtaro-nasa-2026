// Parts of the page can sit in a closed tab. "Show me X" (a jump link, a tour step) first announces the part's
// data-tour id, so whatever holds it opens, then scrolls to it once it is actually on screen.

const EVENT = 'zixtaro:show'

/** Tell the page a part is wanted: the tab that holds [data-tour=id] opens itself. */
export function announce(id: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: id }))
}

export function onAnnounce(fn: (id: string) => void): () => void {
  const on = (e: Event) => fn((e as CustomEvent<string>).detail)
  window.addEventListener(EVENT, on)
  return () => window.removeEventListener(EVENT, on)
}

/** The element once it exists and has a box (a tab has rendered it), or whatever there is after `timeout` ms. */
export function whenVisible(selector: string, timeout = 900): Promise<Element | null> {
  return new Promise((resolve) => {
    const t0 = performance.now()
    const tick = () => {
      const el = document.querySelector(selector)
      if (el && el.getClientRects().length) return resolve(el)
      if (performance.now() - t0 > timeout) return resolve(el)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

/** Open what holds [data-tour=id] and bring it into view. */
export function showPart(id: string, block: ScrollLogicalPosition = 'start') {
  announce(id)
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  void whenVisible(`[data-tour="${id}"]`).then((el) => el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block }))
}

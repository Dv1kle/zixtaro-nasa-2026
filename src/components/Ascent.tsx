import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useMedia } from '../lib/hooks'
import { sectionSpan, viewportHeight } from '../lib/pageGeometry'
import { calm } from '../lib/calm'
import { IDLE } from '../lib/prewarm'
import { useStory } from './Instrument'

/**
 * The way back up. The page opens with a film - orbit, the cloud deck, the field - and ends with the same film run the
 * other way: from the market section to the last line of the page the camera rises off the field, through the weather
 * and back to orbit, behind the plates ("Where it sells best", "Seen from orbit. Checked on the ground."). The descent
 * gets its other bracket, and the last third of the page its scene, from a shader the visit has already compiled.
 *
 * It is a scene of the canvas the scenes share (lib/ascentFilm, lib/objects/world): this block only marks where - a
 * pinned window whose stretch the film works out itself. Made in an idle turn of the page's queue for heavy work, in a
 * pause of the scrolling (lib/calm, lib/prewarm IDLE; three.js and the canvas come with the scenes' chunk) - or at once,
 * if the reader is within three screens of the market and it is not there yet. The story on a desktop with motion on;
 * elsewhere the page ends as it did.
 */
export function Ascent() {
  const ref = useRef<HTMLDivElement>(null)
  const on = useAscent()
  useEffect(() => {
    const el = ref.current
    if (!on || !el) return
    let off: (() => void) | null = null
    let gone = false
    let asked = false
    const make = () => {
      if (asked || gone) return
      asked = true
      window.removeEventListener('scroll', near)
      void import('../lib/ascentFilm')
        .then((m) => {
          if (!gone) off = m.mountAscent(el)
        })
        .catch(() => {})
    }
    // the last resort: the reader has not paused once, and the stretch is three screens away
    const near = () => {
      const market = sectionSpan('market')
      if (market && window.scrollY > market.top - viewportHeight() * 4) make()
    }
    window.addEventListener('scroll', near, { passive: true })
    void calm.turn(IDLE).then(make)
    return () => {
      gone = true
      window.removeEventListener('scroll', near)
      off?.()
    }
  }, [on])
  if (!on) return null
  return <div ref={ref} aria-hidden hidden data-world-window="pin" />
}

/** Is the closing film behind the page's last stretch? (the market section and the footer go transparent for it) */
export function useAscent(): boolean {
  const story = useStory()
  const desktop = useMedia('(min-width: 1024px)')
  const reduce = useReducedMotion()
  return story && desktop && !reduce
}

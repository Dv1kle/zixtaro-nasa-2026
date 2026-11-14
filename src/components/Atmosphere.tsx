// The one living ground behind the whole descent (orbit → cloud deck → air → canopy → soil → dawn), driven by
// `descentDepth` (scroll) plus a slow drift over time. It is drawn by the canvas the scenes share, as that canvas's
// first layer (lib/atmosphereGround, lib/objects/world) - it had a canvas, a WebGL context and a loop of its own
// before. While it is up, `html.atmo` turns the sections into transparent plates over it; if WebGL is missing, refused
// or lost, the class goes and the CSS section grounds stay as the fallback.
//
// This file is the page's side of it only: three.js and the canvas come with the scenes' own chunk, asked for once
// the page has a quiet moment - the loader's film is still playing then, and nothing of this is seen under it.
import { useEffect } from 'react'

export function Atmosphere() {
  useEffect(() => {
    let off: (() => void) | null = null
    let gone = false
    const load = () => {
      void import('../lib/atmosphereGround')
        .then((m) => {
          if (!gone) off = m.mountAtmosphere()
        })
        .catch(() => {})
    }
    let idle = 0
    let timer = 0
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(load, { timeout: 1500 })
    else timer = window.setTimeout(load, 300)
    return () => {
      gone = true
      if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle)
      window.clearTimeout(timer)
      off?.()
    }
  }, [])
  return null
}

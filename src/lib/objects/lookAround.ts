// The scenes answer the reader's hand: the camera leans a little toward the pointer and shifts with it, so the near
// things slide against the far ones - the scene is a place, not a film of one. One pointer for the whole page, a damped
// follow per scene (each catches up in its own time, like a head turning). Mice only: a finger has no resting place on
// the screen, and a reader who asked for less motion gets none of it (the scenes do not call this under reduced motion).
import type * as THREE from 'three'

const target = { x: 0, y: 0 }
let listening = false
let vw = 1
let vh = 1

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  const size = () => {
    vw = Math.max(1, window.innerWidth)
    vh = Math.max(1, window.innerHeight)
  }
  size()
  window.addEventListener('resize', size)
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return
      target.x = Math.max(-1, Math.min(1, (e.clientX / vw) * 2 - 1))
      target.y = Math.max(-1, Math.min(1, (e.clientY / vh) * 2 - 1))
    },
    { passive: true },
  )
  // the pointer has left the page: the camera comes back to rest
  const rest = () => {
    target.x = 0
    target.y = 0
  }
  document.documentElement.addEventListener('pointerleave', rest)
  window.addEventListener('blur', rest)
}

export type Look = { x: number; y: number }

/**
 * A scene's own smoothed copy of the pointer: call the returned function once a frame with the frame's dt; x and y run
 * -1 … 1 from the centre of the screen (right and down positive).
 */
export function lookAround(follow = 2.2): (dt: number) => Look {
  listen()
  const v: Look = { x: 0, y: 0 }
  return (dt) => {
    const k = Math.min(1, Math.max(0, dt) * follow)
    v.x += (target.x - v.x) * k
    v.y += (target.y - v.y) * k
    return v
  }
}

/**
 * Lean a camera that has just been posed: turn toward the pointer by up to `yaw` / `pitch` (radians) and slide
 * sideways and up by up to `shift` (the scene's units) - the slide is what gives the parallax.
 */
export function lean(camera: THREE.Camera, v: Look, yaw: number, pitch: number, shift: number) {
  camera.translateX(v.x * shift)
  camera.translateY(-v.y * shift * 0.6)
  camera.rotateY(-v.x * yaw)
  camera.rotateX(-v.y * pitch)
}

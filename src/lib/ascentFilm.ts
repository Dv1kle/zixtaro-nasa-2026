// The way back up, as a scene of the canvas the scenes share (lib/objects/world).
//
// The page ends with the loader's film run the other way: from the market to the last line the camera rises off the
// field, through the weather and back to orbit (components/Ascent). It used to be the loader's own module on a canvas
// and a WebGL context of its own, faded in over the page's last scene by CSS. Here it is one more window of the shared
// canvas: the same fragment shader (lib/descentLoader DESCENT_FRAG) on the same camera (createFilmClock), drawn into
// a buffer and shown through the stretch it belongs to - so the market's yard dissolves into it the way the cloud deck
// dissolves into the field, the two take turns at the frame, and there is no fifth context to make.
import * as THREE from 'three'
import { ascentAltitude } from './descent'
import { createFilmClock, DESCENT_FRAG, filmNoise, NOISE_SIZE } from './descentLoader'
import { createWorldStage } from './objects/world'
import { onPageGeometry, pageHeight, sectionSpan, viewportHeight } from './pageGeometry'

const VERT = /* glsl */ `
attribute vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

/** Puts the closing film behind the page's last stretch; `el` is its (empty) block. Returns the teardown, or null. */
export function mountAscent(el: HTMLElement): (() => void) | null {
  // Where the stretch runs, in page px. `from` … `to`: the scroll range the climb is keyed to - from the market
  // section coming up over the bottom of the screen to the very end of the page, or, where the market has a scene of
  // its own before it (the elevator), from the last screen of its plate. `top` … `bottom`: the film's window - under
  // the market's own scene where there is one (that scene's lower edge dissolves into the film), else rising from the
  // bottom of the screen as the market's plate arrives.
  let own: boolean | null = null
  const stretch = () => {
    const market = sectionSpan('market')
    if (!market) return null
    const vh = viewportHeight()
    if (own === null) own = !!document.querySelector('[data-crossing="market"][data-world-window]')
    const from = own ? market.bottom - vh * 0.55 : market.top - vh * 0.7
    const to = Math.max(from + 1, pageHeight() - vh)
    return { from, to, top: own ? market.bottom : from + vh, bottom: Math.max(pageHeight(), from + vh + 1), vh }
  }
  const climbAt = (s: { from: number; to: number }, y: number) => Math.min(1, Math.max(0, (y - s.from) / (s.to - s.from)))

  const noise = new THREE.DataTexture(filmNoise(), NOISE_SIZE, NOISE_SIZE, THREE.RedFormat, THREE.UnsignedByteType)
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping
  noise.magFilter = noise.minFilter = THREE.LinearFilter
  noise.generateMipmaps = false
  noise.unpackAlignment = 1
  noise.needsUpdate = true
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uAlt: { value: 1.8 },
    uPitch: { value: 0 },
    uYaw: { value: 0 },
    uDrift: { value: 0 },
    uSunEl: { value: 0 },
    // (the loader's film fades up from black; this one is uncovered by its window)
    uFade: { value: 1 },
    uInCloud: { value: 0 },
    uRoll: { value: 0 },
    uFov: { value: 0.7 },
    uSunScr: { value: new THREE.Vector3(9, 9, 0) },
    uNoise: { value: noise },
  }
  // the camera follows the scroll both ways, from wherever it is first asked to be
  const clock = createFilmClock({ reduce: false, free: true })
  let lastAlt = 0
  /** the climb has begun: only then does the altimeter read it */
  let climbing = false

  const stage = createWorldStage(el, {
    label: 'ascent',
    // it grades itself (its own tone map and gamma), as the loader's film does
    encoded: true,
    animate: true,
    // a backdrop behind a veil: half the frame budget's pixel ratio is plenty (three quarters of CSS px at most)
    resolution: 0.5,
    span: () => stretch(),
    onFrame: ({ dt }) => {
      const s = stretch()
      if (!s) return
      const p = climbAt(s, window.scrollY)
      // 1 is low over the field, where the loader's film ended; 0.1 is orbit, the limb and the sun on it
      clock.target(1 - p * 0.9)
      const f = clock.step(dt, true, stage!.camera.aspect)
      uniforms.uTime.value = f.time
      uniforms.uAlt.value = f.alt
      uniforms.uPitch.value = f.pitch
      uniforms.uYaw.value = f.yaw
      uniforms.uDrift.value = f.drift
      uniforms.uSunEl.value = f.sunEl
      uniforms.uInCloud.value = f.inCloud
      uniforms.uRoll.value = f.roll
      uniforms.uFov.value = f.fov
      uniforms.uSunScr.value.set(f.sunScr[0], f.sunScr[1], f.sunScr[2])
      const now = performance.now()
      if (climbing && now - lastAlt > 100) {
        lastAlt = now
        ascentAltitude.set(f.alt)
      }
    },
  })
  if (!stage) {
    noise.dispose()
    return null
  }
  const tri = new THREE.BufferGeometry()
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  const mesh = new THREE.Mesh(tri, new THREE.RawShaderMaterial({ vertexShader: VERT, fragmentShader: DESCENT_FRAG, uniforms, depthTest: false, depthWrite: false }))
  mesh.frustumCulled = false
  // the shader works in the pixels of the buffer it is drawn into, whatever resolution the stage has settled on
  mesh.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget()
    if (rt) uniforms.uRes.value.set(rt.width, rt.height)
  }
  stage.scene.add(mesh)
  // nothing is drawn until the driver has linked the program in the background (the visit has compiled this shader
  // once already, for the loader)
  stage.hold(stage.compile())

  // The altimeter reads the climb while the film is up; above the stretch it goes back to the sections' own heights.
  // (The scene's own frame is not drawn off screen, so this is watched from the scroll.)
  let frame = 0
  const watch = () => {
    frame = 0
    const s = stretch()
    const y = window.scrollY
    climbing = !!s && y > s.from - s.vh * 0.25 && climbAt(s, y) >= 0.04
    if (!climbing) ascentAltitude.set(0)
  }
  const ask = () => {
    if (!frame) frame = requestAnimationFrame(watch)
  }
  const offGeometry = onPageGeometry(() => {
    own = null
    ask()
    stage.invalidate()
  })
  window.addEventListener('scroll', ask, { passive: true })
  watch()

  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('scroll', ask)
    offGeometry()
    stage.dispose()
    noise.dispose()
    ascentAltitude.set(0)
  }
}

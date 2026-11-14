// The living atmosphere, as the ground of the canvas the scenes share (lib/objects/world).
//
// It used to be a canvas of its own with a WebGL context and a loop of its own, running beside the scenes' canvas all
// the way down the page: a second context to make (a fifth of a second of the main thread, straight after the
// loader), a second loop asking for a frame at the screen's full rate for a slow drift, a second backing store. Now it
// is one more thing the shared canvas draws: a half-size frame of the same shader, put down under the scenes'
// windows.
//
// What it shows is unchanged (lib/atmosphere-shader: the strata by `descentDepth`, a slow drift over time, the Bayer
// dither in its own pixels) and so is its budget: a frame only while something changes - the depth, the drift below
// orbit, the size - and the tab is visible; phones and coarse pointers get the two-octave shader at 30 frames a
// second; under prefers-reduced-motion time stands still. While it is on the canvas `html.atmo` turns the sections
// into transparent plates over it; without WebGL (or with the context lost) the class goes and the CSS grounds stay.
import * as THREE from 'three'
import { atmosphereFrag, type AtmosphereQuality } from './atmosphere-shader'
import { descentDepth } from './descent'
import { setWorldGround, type Ground } from './objects/world'

const LITE_FRAME_MS = 1000 / 30
/** the drift is slow: on a fast screen it is drawn at most this often, and the scenes get the frames between */
const DRIFT_MS = 1000 / 75

const VERT = /* glsl */ `
attribute vec3 position;
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/** Puts the atmosphere under the shared canvas's scenes; returns the teardown. Never throws: no WebGL leaves the CSS. */
export function mountAtmosphere(): () => void {
  const root = document.documentElement
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const coarseQuery = window.matchMedia('(pointer: coarse)')
  const reduced = () => motionQuery.matches
  const depthNow = () => descentDepth.get()?.stratum ?? 0

  let disposed = false
  let wanted: AtmosphereQuality = 'full'
  const readWindow = () => {
    wanted = coarseQuery.matches || window.innerWidth < 768 ? 'lite' : 'full'
  }
  readWindow()

  let time = 0 // seconds of drift; only advances while drift is visible
  let lastTick = 0 // when the last frame was drawn (0: the drift is asleep)
  let lastDepth = -1
  let dirty = true // something other than time changed: the size, the motion preference, a fresh context
  let kick: (() => void) | null = null

  const tri = new THREE.BufferGeometry()
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  const scene = new THREE.Scene()
  const cam = new THREE.OrthographicCamera()
  const uniforms = { uRes: { value: new THREE.Vector2(1, 1) }, uDepth: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 1 } }
  let mesh: THREE.Mesh | null = null
  let quality: AtmosphereQuality | null = null
  let target: THREE.WebGLRenderTarget | null = null
  /** the program for this quality is linked and may be drawn with */
  let linked = false
  let linking = false

  const drifting = () => !reduced() && depthNow() > 0.02

  const ground: Ground = {
    wants: (now) => {
      if (disposed || linking) return false
      if (dirty || !linked || quality !== wanted || depthNow() !== lastDepth) return true
      // orbit (depth ≈ 0) is a still star field: nothing to animate while the hero covers the screen
      if (!drifting()) return false
      return now - lastTick >= (wanted === 'lite' ? LITE_FRAME_MS : DRIFT_MS) - 2
    },
    draw: (now, renderer, bw, bh) => {
      // one of its pixels is two by two of the canvas's: the Bayer grid stays exact when it is put down (nearest)
      const w = Math.max(1, Math.round(bw / 2))
      const h = Math.max(1, Math.round(bh / 2))
      if (!target) target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, generateMipmaps: false })
      else if (target.width !== w || target.height !== h) target.setSize(w, h)
      if (quality !== wanted || !mesh) {
        // the lite or the full shader follows the screen: crossing 768 px (a rotation, a resize) swaps the program
        if (mesh) {
          scene.remove(mesh)
          ;(mesh.material as THREE.Material).dispose()
        }
        quality = wanted
        linked = false
        mesh = new THREE.Mesh(tri, new THREE.RawShaderMaterial({ vertexShader: VERT, fragmentShader: atmosphereFrag(quality), uniforms, depthTest: false, depthWrite: false }))
        mesh.frustumCulled = false
        scene.add(mesh)
      }
      const before = renderer.getRenderTarget()
      if (!linked) {
        // linked in the background where the driver can (the first program on a cold cache takes seconds on some
        // drivers, and asking for it at once would hold the page while the loader plays) - under the state it will
        // be drawn in, or the program asked for is not the one the frame uses
        if (renderer.extensions.has('KHR_parallel_shader_compile')) {
          linking = true
          renderer.setRenderTarget(target)
          const done = () => {
            linking = false
            linked = true
            dirty = true
            kick?.()
          }
          renderer.compileAsync(scene, cam).then(done, done)
          renderer.setRenderTarget(before)
          return null
        }
        linked = true
      }
      const depth = depthNow()
      const moving = !reduced() && depth > 0.02
      const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0
      if (moving) time += dt
      lastTick = moving ? now : 0 // asleep, the next wake starts the drift from no elapsed time
      lastDepth = depth
      dirty = false
      uniforms.uRes.value.set(w, h)
      uniforms.uDepth.value = depth
      uniforms.uTime.value = time
      uniforms.uMotion.value = reduced() ? 0 : 1
      renderer.setRenderTarget(target)
      renderer.render(scene, cam)
      renderer.setRenderTarget(before)
      return target.texture
    },
    live: () => !disposed && drifting(),
    shown: (on) => root.classList.toggle('atmo', on && !disposed),
    lost: () => {
      // the context came back empty: the buffer and the program are made again
      target?.dispose()
      target = null
      linked = false
      linking = false
      quality = null
      dirty = true
    },
  }

  const wake = () => {
    readWindow()
    dirty = true
    kick?.()
  }
  const onDepth = () => kick?.()

  // The canvas is made by the first scene, under the loader, and takes this ground up then. Where no scene will make
  // one soon (a page without scenes, a visit without the loader) it is made here, in an idle moment.
  kick = setWorldGround(ground)
  let idle = 0
  let timer = 0
  const make = () => {
    if (!disposed) kick = setWorldGround(ground, true)
    kick?.()
  }
  const whenIdle = () => {
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(make, { timeout: 1200 })
    else timer = window.setTimeout(make, 200)
  }
  if (document.querySelector('[aria-label="Loading Zixtaro"]')) window.addEventListener('zixtaro:intro-done', whenIdle, { once: true })
  else whenIdle()

  const offDepth = descentDepth.subscribe(onDepth)
  window.addEventListener('resize', wake)
  document.addEventListener('visibilitychange', wake)
  motionQuery.addEventListener('change', wake)
  coarseQuery.addEventListener('change', wake)
  kick?.()

  return () => {
    disposed = true
    setWorldGround(null)
    root.classList.remove('atmo')
    if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle)
    window.clearTimeout(timer)
    window.removeEventListener('zixtaro:intro-done', whenIdle)
    offDepth()
    window.removeEventListener('resize', wake)
    document.removeEventListener('visibilitychange', wake)
    motionQuery.removeEventListener('change', wake)
    coarseQuery.removeEventListener('change', wake)
    target?.dispose()
    if (mesh) (mesh.material as THREE.Material).dispose()
    tri.dispose()
  }
}

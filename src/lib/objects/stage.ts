// A small three.js stage for one object: a transparent canvas over the atmosphere, its own render loop that runs only
// while the object is on screen and the tab is visible, DPR capped, and everything disposed on teardown.
// A stage is made ahead of the reader and then kept (lib/prewarm): it draws one frame as soon as it is ready, so it is
// warm before it scrolls in; off screen it draws nothing; far from the screen it lets go of its frame buffers and keeps
// what was costly to make - geometry, textures, linked programs.
//
// The scenes of the descent do not get a canvas each: given a plain block instead of a canvas, a stage is a layer on
// the one canvas they share (lib/objects/world).
import type { EffectComposer } from 'postprocessing'
import * as THREE from 'three'
import type { LensTier } from './lens'
import { createPacer, type PaceOptions } from './pace'
import { precompile, restComposer } from './precompile'
import { createWorldStage } from './world'

export type StageFrame = { time: number; dt: number }

/**
 * `maxDpr`, `adaptive` (PaceOptions) are for a stage with a canvas of its own. On the shared canvas the frame budget
 * (lib/objects/budget) sets every scene's pixel ratio from its tier; a scene says only `resolution`.
 */
export type StageOptions = PaceOptions & {
  /** shared canvas: the share of the tier's pixel ratio this scene is drawn at (default 1; a soft backdrop asks less) */
  resolution?: number
  fov?: number
  /** update the scene before each draw */
  onFrame: (f: StageFrame) => void
  /** draw the frame yourself; default: the composer given to `setComposer`, or renderer.render(scene, camera).
   * A stage with a canvas of its own only. */
  render?: (dt: number) => void
  onResize?: (w: number, h: number) => void
  /** let go of the frame buffers while the stage is far from the screen (true), take them back on the way in
   * (false) - see `restComposer`. A stage with a canvas of its own only: the shared canvas rests its scenes itself. */
  rest?: (resting: boolean) => void
  /** the scene writes display values itself - its own tone map and gamma, no colour-space include (shared canvas) */
  encoded?: boolean
  /** the scene's window in page px, where it is not a block's own span (shared canvas; null: nowhere yet) */
  span?: () => { top: number; bottom: number } | null
  /** a name for the development log (what the first frame cost, which programs it still had to compile) */
  label?: string
}

export type Stage = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** draw one frame now (e.g. on a scroll change while the loop sleeps) */
  invalidate: () => void
  /** the scene's shadow casters moved: its shadow maps are redrawn with its next frame (and only then - on the shared
   * canvas they are not redrawn in every frame) */
  shadowsDirty: () => void
  /** what the frame budget's tier allows the scene to build with: the lens's tier, the side of a shadow map */
  quality: () => { lens: LensTier; shadowSize: number }
  /** draw nothing until this work is done: the scene still being built, its shaders linking in the background */
  hold: (work: Promise<unknown>) => void
  /** the scene's post-processing chain: the stage sizes it, rests it and draws the frame with it */
  setComposer: (composer: EffectComposer) => void
  /** link every program the first frame needs, in the background (lib/objects/precompile); hold the stage on it */
  compile: (composer?: EffectComposer | null) => Promise<void>
  dispose: () => void
}

/**
 * A stage on the canvas given, or - given any other block - a scene on the canvas the descent's scenes share.
 * `animate`: keep a continuous loop (drift, wind); false = draw only on invalidate() (reduced motion).
 */
export function createStage(el: HTMLElement, opts: StageOptions): Stage | null {
  return el instanceof HTMLCanvasElement ? createCanvasStage(el, opts) : createWorldStage(el, opts)
}

function createCanvasStage(canvas: HTMLCanvasElement, opts: StageOptions): Stage | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power', premultipliedAlpha: true })
  } catch {
    return null
  }
  renderer.setClearColor(0x000000, 0)
  // asking the driver whether each program linked is a round trip to the GPU process per program, on the main thread;
  // worth it while developing, not for a reader
  renderer.debug.checkShaderErrors = import.meta.env.DEV
  const pacer = createPacer(opts)
  renderer.setPixelRatio(pacer.dpr())
  let composer: EffectComposer | null = null
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 32, 1, 0.05, 200)
  // sized at once: the scene's own setup (its composer, its uniforms) starts at the real size, and the first frame
  // does not resize everything it has only just made
  {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w && h) {
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
  }

  let raf = 0
  let last = 0
  let time = 0
  let onScreen = true
  let disposed = false

  const size = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    const cur = renderer.getSize(new THREE.Vector2())
    // the aspect too: a stage rebuilt on the same canvas finds the renderer already at this size, and would otherwise
    // keep the new camera's default aspect of 1 (a stretched frame)
    if (cur.x !== w || cur.y !== h || Math.abs(camera.aspect - w / h) > 1e-6) {
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      composer?.setSize(w, h)
      opts.onResize?.(w, h)
    }
  }
  // the pixel ratio follows the measured frame (lib/objects/pace)
  const adapt = (now: number) => {
    if (!pacer.tick(now)) return
    renderer.setPixelRatio(pacer.dpr())
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w && h) {
      renderer.setSize(w, h, false)
      composer?.setSize(w, h)
      opts.onResize?.(w, h)
    }
    dirty = true
  }
  const draw = (now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    if (opts.animate) time += dt
    size()
    opts.onFrame({ time, dt })
    if (opts.render) opts.render(dt)
    else if (composer) composer.render(dt)
    else renderer.render(scene, camera)
  }
  let lastDraw = 0
  let dirty = true
  let held = 0
  let first = true
  /** a frame is owed even off screen: the first one (the scene is warm before it scrolls in), and one after a rest */
  let prime = true
  let resting = false
  const loop = (now: number) => {
    raf = 0
    if (disposed) return
    // still being put together: nothing is drawn (a half-built scene, or programs the driver has not linked - asking
    // for those would freeze the page); the end of the work kicks the loop
    if (held > 0 || resting) return
    // off screen nothing is drawn - a scroll anywhere on the page invalidates the scenes that follow it - except
    // the frame that is owed
    if (!onScreen && !prime) return
    adapt(now)
    const least = pacer.cadence()
    if (dirty || prime || !least || now - lastDraw >= least) {
      dirty = false
      prime = false
      lastDraw = now
      if (first && import.meta.env.DEV && opts.label) {
        // the first frame is where a missed precompile shows: programs created here were linked on the main thread
        const programs = renderer.info.programs?.length ?? 0
        const t = performance.now()
        draw(now)
        const made = (renderer.info.programs ?? []).slice(programs)
        console.info(`[stage ${opts.label}] first frame ${Math.round(performance.now() - t)} ms, programs ${programs} -> ${programs + made.length}` + (made.length ? ': ' + made.map((p) => p.name || (p as { type?: string }).type || '?').join(', ') : ''))
      } else draw(now)
      // development: how many frames each scene really draws (the frame-rate probe reads it)
      if (import.meta.env.DEV && opts.label) {
        const w = window as unknown as { __stageDraws?: Record<string, number> }
        ;(w.__stageDraws ??= {})[opts.label] = (w.__stageDraws[opts.label] ?? 0) + 1
      }
      first = false
    }
    if (opts.animate && onScreen && document.visibilityState === 'visible') raf = requestAnimationFrame(loop)
  }
  const kick = () => {
    if (!raf && !disposed) raf = requestAnimationFrame(loop)
  }
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting
    if (onScreen) kick()
  })
  io.observe(canvas)
  const onVis = () => document.visibilityState === 'visible' && kick()
  document.addEventListener('visibilitychange', onVis)
  const ro = new ResizeObserver(() => kick())
  ro.observe(canvas)
  // Far from the screen the stage rests: its frame buffers go (a post-processing chain holds a few hundred megabytes
  // of them at a desktop's size - too much to keep for every scene on the page). Within a screen and a half it takes
  // them back and draws a frame, before it is seen.
  let restTimer = 0
  const REST_MS = 5000
  const toRest = (r: boolean) => (opts.rest ? opts.rest(r) : restComposer(composer, r))
  const rest = () => {
    restTimer = 0
    if (disposed || resting || !(opts.rest || composer)) return
    if (first || held > 0) {
      // not before its first frame: that one warms everything up at the real size
      restTimer = window.setTimeout(rest, REST_MS)
      return
    }
    resting = true
    toRest(true)
  }
  const wake = () => {
    window.clearTimeout(restTimer)
    restTimer = 0
    if (!resting) return
    resting = false
    toRest(false)
    prime = true
    dirty = true
    kick()
  }
  const nearIo = new IntersectionObserver(
    ([e]) => {
      if (e.isIntersecting) wake()
      else if (!restTimer && !resting) restTimer = window.setTimeout(rest, REST_MS)
    },
    { rootMargin: '150% 0px' },
  )
  nearIo.observe(canvas)
  kick()

  return {
    renderer,
    scene,
    camera,
    invalidate: () => {
      dirty = true
      kick()
    },
    // a canvas of its own keeps three's default: its shadow maps are redrawn in every frame
    shadowsDirty: () => {
      dirty = true
      kick()
    },
    quality: () => ({ lens: 'high', shadowSize: 2048 }),
    hold: (work) => {
      held += 1
      const release = () => {
        held -= 1
        dirty = true
        kick()
      }
      work.then(release, release)
    },
    setComposer: (c) => {
      composer = c
      const s = renderer.getSize(new THREE.Vector2())
      if (s.x && s.y) c.setSize(s.x, s.y)
    },
    compile: (c) => precompile(renderer, scene, camera, c ?? composer),
    dispose: () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.clearTimeout(restTimer)
      io.disconnect()
      nearIo.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
    },
  }
}

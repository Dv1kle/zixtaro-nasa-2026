// One canvas for the scenes of the descent.
//
// The cloud deck, the field, the soil core and the glasshouse used to be a canvas each, with a renderer each, sliding
// up the page inside their sections like any other block. Here they share one renderer on one canvas that stands
// still behind the whole page. A scene is drawn into its own buffer and shown through its window - the stretch of the
// page it belongs to: the window's edges move with the scroll, the picture does not. So a scene is uncovered where
// it stands instead of sliding in, and where two windows meet the upper scene dissolves straight into the lower one,
// with no dark seam and no cut.
//
// What sharing buys besides: one WebGL context instead of four (every program is linked once, whichever scene asks
// first), and one loop that knows about all of them - and so one owner of the frame budget (lib/objects/budget): the
// quality tier and every scene's pixel ratio follow from it, shadow maps are redrawn only when a scene says its casters
// moved, and in a crossing both scenes are drawn on every frame, the one on its way out held once little is left.
//
// Two more things live here since. The ground: the atmosphere behind the whole page (components/Atmosphere) is the
// canvas's own first layer - it had a context and a loop of its own. And a box: an object that belongs to the page's
// layout (the air's two cores) is a scene too, drawn at the size of its block and carried with it as the page
// scrolls - `data-world-window="box"`. The closing film (lib/ascentFilm) is a window like the others, whose stretch
// it works out itself (`span`).
import type { EffectComposer } from 'postprocessing'
import * as THREE from 'three'
import { elementSpan, onPageGeometry } from '../pageGeometry'
import { calm, RANK } from '../calm'
import { displayInterval } from '../refresh'
import { tickScroll } from '../scroll'
import { cadence, createGovernor, crossingHolds, lensTier, parseTier, pixelRatio, shadowSize, startTier, type Tier } from './budget'
import { precompile, restComposer } from './precompile'
import type { Stage, StageOptions } from './stage'

/** the ground every scene is cleared to: the page's own graphite */
const CLEAR = 0x0a0b0e
/** far from the screen for this long, a scene lets go of its frame buffers */
const REST_MS = 5000
/** a scene within a screen and a half waits this long at most for a pause before its first frame is drawn anyway */
const CLOSE_WAIT_MS = 400
/** a scene that was not ready when its window came on screen fades in over this */
const APPEAR_MS = 450
/** a pinned window's moving edge dissolves over this share of the screen at most */
const EDGE = 0.38
/** a window in the flow (phones, reduced motion) dissolves over this share of its own height at each end */
const FLOW_EDGE = 0.18
/** windows closer than this (px) are one after the other: the upper scene dissolves into the lower */
const TOUCH = 8
/** development: ?worlddbg logs what the scenes do (made, resized, resting) */
const DBG = import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('worlddbg')

type Layer = {
  label?: string
  animate: boolean
  /** the scene writes display values itself (its own tone map and gamma) */
  encoded: boolean
  // where its window is on screen now, px from the top; how far each edge dissolves
  top: number
  /** the share of the screen's height its window covers, now and in the frame before (crossings) */
  share: number
  prevShare: number
  /** held at its last frame: on its way out of a crossing with little of it left (budget, crossingHolds) */
  frozen: boolean
  /** its shadow maps are redrawn with its next frame: the first one, its casters moved, or the context came back */
  shadows: boolean
  bottom: number
  fadeTop: number
  fadeBottom: number
  /** a box: its picture is its block's size and moves with it - where the block is sideways, and its side fades (px) */
  box: { left: number; width: number; fadeLeft: number; fadeRight: number } | null
  onScreen: boolean
  /** within a screen and a half of the screen: about to be seen */
  close: boolean
  /** it has a frame to show */
  ready: boolean
  /** its buffers were just resized and hold nothing: it is drawn again before the canvas is */
  lost: boolean
  lastDraw: number
  measure: (y: number) => void
  /** nothing stops it from drawing (built, linked, awake) */
  able: () => boolean
  /** a frame is owed even off screen: the first one, and one after a rest */
  owed: () => boolean
  wants: (now: number) => boolean
  draw: (now: number) => void
  texture: () => THREE.Texture | null
  opacity: (now: number) => number
  fit: () => void
}

/**
 * The ground: one picture behind every scene, the whole screen. It draws itself into a buffer of its own (display
 * values, as it will be seen) whenever it asks to, and the canvas puts that buffer down first.
 */
export type Ground = {
  /** a new frame is wanted now (what it shows changed, or its drift has moved on) */
  wants: (now: number) => boolean
  /** draw it; the texture to put down (null: nothing yet). `width`, `height`: the canvas in device px */
  draw: (now: number, renderer: THREE.WebGLRenderer, width: number, height: number) => THREE.Texture | null
  /** it keeps moving: the loop stays awake for it */
  live: () => boolean
  /** it is on the canvas (true, after its first frame) or no longer is (false: the canvas is gone, the context lost) */
  shown: (on: boolean) => void
  /** the context came back: everything it had on the GPU is gone */
  lost?: () => void
}

type World = {
  renderer: THREE.WebGLRenderer
  layers: Layer[]
  /** the quality tier the frame budget is on now, and the frame stride it fell back to */
  tier: () => Tier
  stride: () => number
  setGround: (g: Ground | null) => void
  width: () => number
  height: () => number
  kick: () => void
  /** development: the module is being replaced - take the canvas down with it */
  destroy: () => void
}

const PRESENT_FRAG = /* glsl */ `
uniform sampler2D tMap;
// the window: top, bottom, how far the top edge dissolves, how far the bottom one - CSS px from the top of the screen
uniform vec4 uWin;
// a box: its left edge and its width, how far its left and right edges dissolve - CSS px; width 0: the whole screen
uniform vec4 uBox;
// the canvas in device px, and device px per CSS px
uniform vec3 uView;
// opacity; 1 when the frame is still linear and has to be encoded for the display
uniform vec2 uLook;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float x = gl_FragCoord.x / uView.z;
  float y = (uView.y - gl_FragCoord.y) / uView.z;
  float a = uLook.x;
  if (uWin.z > 0.5) a *= smoothstep(0.0, 1.0, (y - uWin.x) / uWin.z);
  if (uWin.w > 0.5) a *= smoothstep(0.0, 1.0, (uWin.y - y) / uWin.w);
  // a scene's picture stands still on the screen; a box's picture is the box
  vec2 uv = gl_FragCoord.xy / uView.xy;
  if (uBox.y > 0.5) {
    uv = vec2((x - uBox.x) / uBox.y, 1.0 - (y - uWin.x) / max(uWin.y - uWin.x, 1.0));
    if (uBox.z > 0.5) a *= smoothstep(0.0, 1.0, (x - uBox.x) / uBox.z);
    if (uBox.w > 0.5) a *= smoothstep(0.0, 1.0, (uBox.x + uBox.y - x) / uBox.w);
  }
  vec4 c = vec4(texture2D(tMap, uv).rgb, 1.0);
  if (uLook.y > 0.5) c = linearToOutputTexel(c);
  // a grey level of noise along the dissolve: a long soft edge over the dark would band without it
  a = clamp(a + (hash(gl_FragCoord.xy) - 0.5) * (2.0 / 255.0) * step(0.002, a) * step(a, 0.998), 0.0, 1.0);
  gl_FragColor = vec4(c.rgb * a, a);
}
`

let world: World | null | undefined

function makeWorld(): World | null {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.className = 'screen-only'
  // behind the page; the full height of the screen whatever a phone's address bar is doing, so the canvas is not
  // resized in the middle of a scroll
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100vh;z-index:-1;pointer-events:none;visibility:hidden'
  document.body.appendChild(canvas)
  let renderer: THREE.WebGLRenderer
  try {
    // nothing is drawn to the canvas but finished frames, so it needs no depth of its own
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', premultipliedAlpha: true })
  } catch {
    canvas.remove()
    return null
  }
  // asking the driver whether each program linked is a round trip to the GPU process per program, on the main thread;
  // worth it while developing, not for a reader
  renderer.debug.checkShaderErrors = import.meta.env.DEV
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // every clear is asked for by name: the scenes draw into their own buffers, and several layers go onto one canvas
  renderer.autoClear = false
  // the soil's lamp and the market's dusk cast shadows; a scene whose lights cast none is not touched by this. Their
  // lights never move and their casters move only with the scroll, so the maps are redrawn when a scene asks
  // (stage.shadowsDirty), not in every frame: two 2048-square depth passes a frame for nothing
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  const canvasRatio = Math.min(window.devicePixelRatio, 1.5)
  renderer.setPixelRatio(canvasRatio)

  // The frame budget: a tier from the GPU's name to start, then from the measured frame. `?tier=low|mid|high` holds
  // one, to measure each on the same machine.
  const asked = parseTier(new URLSearchParams(location.search).get('tier'))
  const gov = createGovernor(asked ?? startTier(gpuName(renderer)), { fixed: !!asked })
  if (DBG) console.info('[world] tier', gov.tier(), gpuName(renderer))

  const layers: Layer[] = []
  let W = 0
  let H = 0
  let raf = 0
  let sizeStale = true
  let showing = false
  let lastSig = ''

  const uniforms = {
    tMap: { value: null as THREE.Texture | null },
    uWin: { value: new THREE.Vector4() },
    uBox: { value: new THREE.Vector4() },
    uView: { value: new THREE.Vector3(1, 1, 1) },
    uLook: { value: new THREE.Vector2(1, 1) },
  }
  let ground: Ground | null = null
  let groundTex: THREE.Texture | null = null
  let groundShown = false
  const tri = new THREE.BufferGeometry()
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  const presentMesh = new THREE.Mesh(
    tri,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: PRESENT_FRAG,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      // premultiplied "over": a layer covers what is under it by its own alpha
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    }),
  )
  presentMesh.frustumCulled = false
  const presentScene = new THREE.Scene()
  presentScene.add(presentMesh)
  const presentCam = new THREE.OrthographicCamera()

  const measureSize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h || (w === W && h === H)) return
    W = w
    H = h
    renderer.setSize(W, H, false)
    const px = renderer.getDrawingBufferSize(new THREE.Vector2())
    uniforms.uView.value.set(px.x, px.y, canvasRatio)
    for (const l of layers) l.fit()
    lastSig = ''
  }
  measureSize()
  sizeStale = false
  // the present pass's program, linked in the background like the scenes' own
  if (renderer.extensions.has('KHR_parallel_shader_compile')) void renderer.compileAsync(presentScene, presentCam).catch(() => {})

  /** Put the scenes that have a frame onto the canvas, each through its window, the lower ones first. */
  const paint = (vis: Layer[], now: number) => {
    renderer.setRenderTarget(null)
    renderer.setViewport(0, 0, W, H)
    renderer.setScissorTest(false)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    if (!vis.length && !groundTex) {
      if (DBG && showing) console.info('[world] nothing to show', layers.map((l) => `${l.label}:${l.onScreen ? 'on' : 'off'}:${l.ready ? 'ready' : 'not'}`).join(' '))
      if (showing) canvas.style.visibility = 'hidden'
      showing = false
      return
    }
    // the ground first: the whole screen, as it was drawn (display values)
    if (groundTex) {
      uniforms.tMap.value = groundTex
      uniforms.uWin.value.set(0, H, 0, 0)
      uniforms.uBox.value.set(0, 0, 0, 0)
      uniforms.uLook.value.set(1, 0)
      renderer.render(presentScene, presentCam)
    }
    // the scenes' windows across the screen, the lower ones first; then the boxes, which stand in the page over them
    const wins = vis.filter((l) => !l.box).map((l) => ({ l, top: l.top, bottom: l.bottom, fadeTop: l.fadeTop, fadeBottom: l.fadeBottom }))
    for (let i = 1; i < wins.length; i++) {
      const a = wins[i - 1]
      const b = wins[i]
      // one window right after the other: the lower scene already stands under the upper one's dissolving edge
      if (b.top - a.bottom < TOUCH) {
        b.top = a.bottom - a.fadeBottom
        b.fadeTop = 0
      }
    }
    renderer.setScissorTest(true)
    for (let i = wins.length - 1; i >= 0; i--) {
      const w = wins[i]
      const t = Math.max(0, Math.floor(w.top))
      const b = Math.min(H, Math.ceil(w.bottom))
      const tex = w.l.texture()
      if (b <= t || !tex) continue
      uniforms.tMap.value = tex
      uniforms.uWin.value.set(w.top, w.bottom, w.fadeTop, w.fadeBottom)
      uniforms.uBox.value.set(0, 0, 0, 0)
      uniforms.uLook.value.set(w.l.opacity(now), w.l.encoded ? 0 : 1)
      renderer.setScissor(0, H - b, W, b - t)
      renderer.render(presentScene, presentCam)
    }
    for (const l of vis) {
      if (!l.box) continue
      const t = Math.max(0, Math.floor(l.top))
      const b = Math.min(H, Math.ceil(l.bottom))
      const x0 = Math.max(0, Math.floor(l.box.left))
      const x1 = Math.min(W, Math.ceil(l.box.left + l.box.width))
      const tex = l.texture()
      if (b <= t || x1 <= x0 || !tex) continue
      uniforms.tMap.value = tex
      uniforms.uWin.value.set(l.top, l.bottom, l.fadeTop, l.fadeBottom)
      uniforms.uBox.value.set(l.box.left, l.box.width, l.box.fadeLeft, l.box.fadeRight)
      uniforms.uLook.value.set(l.opacity(now), l.encoded ? 0 : 1)
      renderer.setScissor(x0, H - b, x1 - x0, b - t)
      renderer.render(presentScene, presentCam)
    }
    renderer.setScissorTest(false)
    if (!showing) canvas.style.visibility = 'visible'
    showing = true
    if (groundTex && !groundShown) {
      groundShown = true
      ground?.shown(true)
    }
  }

  const frame = (now: number) => {
    raf = 0
    // the inertial scroll moves the page in its own animation frame: taken first, so the windows are measured where
    // this frame will show them
    tickScroll(now)
    if (sizeStale) {
      sizeStale = false
      measureSize()
    }
    if (!W || !H) return
    const y = window.scrollY
    for (const l of layers) l.measure(y)
    const visible = document.visibilityState === 'visible'
    // Every scene on screen that wants a frame draws in this one. A crossing (two scenes' windows on screen, one
    // dissolving into the other) draws both (they used to take turns: each camera moved at half rate under edges that
    // moved at full rate), except the one on its way out once little of it is left: it holds its last frame (budget).
    // A scene off screen that is owed a frame goes alone: it is one frame, and it has to be there before its window
    // arrives. That frame - its first, the costly one - waits for a turn of its own in the page's queue for heavy work
    // (lib/calm): drawn in the middle of the reader's scroll, or in the same task as another scene's build, it was a
    // hitch of a fifth of a second. A scene within a screen and a half waits for a pause only so long (CLOSE_WAIT_MS):
    // it has to be there before the reader is.
    const quiet = owedTurn === 'granted'
    const wins = layers.filter((l) => l.onScreen && !l.box && l.able())
    const holds = crossingHolds(wins.map((l) => ({ share: l.share, prev: l.prevShare, held: l.frozen, ready: l.ready })))
    for (const l of layers) l.frozen = false
    wins.forEach((l, i) => (l.frozen = holds[i]))
    const draws: Layer[] = []
    let deferred = false
    if (visible) {
      const owing = layers.filter((l) => !l.onScreen && l.owed())
      closeOwed = owing.some((l) => l.close)
      const owed = quiet ? owing.find((l) => l.close) ?? owing[0] : undefined
      deferred = !owed && owing.length > 0
      if (owed) draws.push(owed)
      else for (const l of layers) if (l.onScreen && l.able() && !l.frozen && l.wants(now)) draws.push(l)
      // (a turn that came is spent in this frame, whether it drew or what it was for has been drawn meanwhile)
      if (quiet) owedTurn = null
    }
    let live = 0
    for (const l of layers) if (l.onScreen && l.animate && l.able()) live += 1
    // the budget measures the frame while it is steady - one scene animating, no crossing. A new tier refits every
    // scene's buffers once; the ones on screen are drawn again in this frame, below.
    if (live === 1 && wins.length < 2) {
      if (gov.sample(now, displayInterval())) {
        if (DBG) console.info('[world] tier', gov.tier())
        for (const l of layers) l.fit()
        lastSig = ''
      }
    } else gov.skip()
    for (const l of draws) l.draw(now)
    // a scene whose buffers were resized in this frame (the window, or the tier) holds nothing until it is drawn
    // again: shown as it is, it was a black frame in the middle of a scroll
    for (const l of layers) if (l.onScreen && l.lost && l.able()) l.draw(now)
    // the ground draws when it asks to - a half-size frame of one cheap shader, beside whatever scene took the turn
    let grounded = false
    if (ground && visible && ground.wants(now)) {
      const px = renderer.getDrawingBufferSize(bufSize)
      groundTex = ground.draw(now, renderer, px.x, px.y) ?? groundTex
      grounded = true
    }
    const vis = layers.filter((l) => l.onScreen && l.ready).sort((a, b) => a.top - b.top)
    let sig = ''
    let fading = false
    for (const l of vis) {
      const o = l.opacity(now)
      if (o < 1) fading = true
      sig += `${layers.indexOf(l)}:${Math.round(l.top)}:${Math.round(l.bottom)}:${l.box ? Math.round(l.box.left) + ':' + Math.round(l.box.width) : ''}:${o.toFixed(3)};`
    }
    if (draws.some((l) => l.onScreen) || sig !== lastSig || grounded) {
      paint(vis, now)
      lastSig = sig
    }
    if (visible && (live > 0 || fading || !!ground?.live())) kick()
    // an owed frame put off: it asks the queue for a turn, and the loop wakes for it when the turn comes (whether or not
    // it is awake meanwhile). Asked again when a close scene is owed one and the turn asked for so far was a far scene's,
    // which waits as long as it takes.
    if (visible && deferred && (!owedTurn || (owedTurn === 'far' && closeOwed))) {
      owedTurn = closeOwed ? 'close' : 'far'
      void calm.turn({ rank: RANK.frame, patience: closeOwed ? CLOSE_WAIT_MS : Infinity }).then(() => {
        owedTurn = 'granted'
        kick()
      })
    }
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }
  const bufSize = new THREE.Vector2()
  /** an owed frame's turn: asked for (for a close scene, or only far ones), or come - it is drawn in the frame right after */
  let owedTurn: 'far' | 'close' | 'granted' | null = null
  let closeOwed = false
  window.addEventListener('scroll', kick, { passive: true })
  document.addEventListener('visibilitychange', kick)
  onPageGeometry(kick)
  new ResizeObserver(() => {
    sizeStale = true
    kick()
  }).observe(canvas)

  // The context can be taken away (the GPU process restarted, a laptop switched cards). Without it there is no ground:
  // the page falls back to its CSS grounds until the context is back, then everything is drawn again.
  const onLost = (e: Event) => {
    e.preventDefault()
    groundTex = null
    if (groundShown) ground?.shown(false)
    groundShown = false
    canvas.style.visibility = 'hidden'
    showing = false
  }
  const onRestored = () => {
    ground?.lost?.()
    for (const l of layers) {
      l.ready = false
      l.lost = true
      l.shadows = true
    }
    lastSig = ''
    kick()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  const setGround = (g: Ground | null) => {
    // (the same one again - asked for twice, by the scene that made the canvas and by the ground itself: nothing to do)
    if (g === ground) return
    if (ground && groundShown) ground.shown(false)
    ground = g
    groundTex = null
    groundShown = false
    lastSig = ''
    kick()
  }
  const destroy = () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('scroll', kick)
    document.removeEventListener('visibilitychange', kick)
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('webglcontextrestored', onRestored)
    if (groundShown) ground?.shown(false)
    canvas.remove()
    renderer.dispose()
  }
  return { renderer, layers, tier: gov.tier, stride: gov.stride, setGround, width: () => W, height: () => H, kick, destroy }
}

/** the GPU's name as the driver gives it ('' where the browser keeps it to itself) */
function gpuName(renderer: THREE.WebGLRenderer): string {
  try {
    const gl = renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
  } catch {
    return ''
  }
}

// ---- the ground: asked for by the atmosphere, taken up by the canvas whenever there is one ----
let wantedGround: Ground | null = null
/**
 * Give the canvas its ground (null: take it away). The canvas is not made for it at once - the first scene makes it,
 * under the loader - unless `now` says nothing else will: then it is made here. Returns a function that wakes the
 * loop (what the ground shows has changed), or null where there can be no canvas (no WebGL).
 */
export function setWorldGround(g: Ground | null, now = false): (() => void) | null {
  wantedGround = g
  if (world === undefined && now && g) world = makeWorld()
  if (world === null) return null
  world?.setGround(g)
  return () => world?.kick()
}

// development: an edit to this file would otherwise leave the old canvas standing behind the page with its last frame
if (import.meta.hot) import.meta.hot.dispose(() => world?.destroy())

/**
 * A scene on the shared canvas. `el` is the scene's own (empty) block; it shows through the nearest ancestor marked
 * `data-world-window` - "pin" for a pinned crossing (with `data-world-tail` the window runs on under the section that
 * rides up over the crossing's last screen), "flow" for a block in the flow of the page.
 */
export function createWorldStage(el: HTMLElement, opts: StageOptions): Stage | null {
  if (world === undefined) {
    world = makeWorld()
    if (world && wantedGround) world.setGround(wantedGround)
  }
  if (!world) return null
  const w = world
  const { renderer } = w
  const win = el.closest<HTMLElement>('[data-world-window]') ?? el
  const flow = win.dataset.worldWindow !== 'pin'
  const tail = win.dataset.worldTail !== undefined
  // a box: an object in the page's layout. `data-world-fade`: how far each edge dissolves, as shares of the box -
  // "left top right bottom"
  const boxed = win.dataset.worldWindow === 'box'
  const fades = (win.dataset.worldFade ?? '0 0 0 0').split(/[\s,]+/).map(Number)
  let boxW = 0
  let boxH = 0
  let boxLeft = 0
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 32, w.width() && w.height() ? w.width() / w.height() : 1, 0.05, 200)
  // the scene's pixel ratio: the budget's tier, times the share of it the scene asks for
  const ratio = () => pixelRatio(w.tier(), window.devicePixelRatio, opts.resolution ?? 1)

  let composer: EffectComposer | null = null
  let target: THREE.WebGLRenderTarget | null = null
  let held = 0
  let first = true
  let prime = true
  let dirty = true
  let resting = false
  let disposed = false
  let near = true
  let restTimer = 0
  let last = 0
  let time = 0
  /** when its frame arrived with its window already on screen: it fades in from there */
  let shownAt = 0

  const ownTarget = () => {
    if (!target) {
      // a scene that grades itself is kept as it wrote it; one that leaves linear light is kept in half floats
      target = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: !opts.encoded, type: opts.encoded ? THREE.UnsignedByteType : THREE.HalfFloatType })
      fit()
    }
    return target
  }
  const fit = () => {
    // a box is drawn at its block's size; a scene at the screen's
    const W = boxed ? boxW : w.width()
    const H = boxed ? boxH : w.height()
    if (!W || !H) return
    camera.aspect = W / H
    camera.updateProjectionMatrix()
    if (!resting) {
      const pw = Math.max(1, Math.round(W * ratio()))
      const ph = Math.max(1, Math.round(H * ratio()))
      if (composer) {
        // not the composer's own setSize: that one resizes the renderer, and the canvas with it
        if (composer.inputBuffer.width !== pw || composer.inputBuffer.height !== ph) {
          composer.inputBuffer.setSize(pw, ph)
          composer.outputBuffer.setSize(pw, ph)
          // the copy of the scene's depth the effects read (the depth of field): the same size, or the copy fails
          ;(composer as unknown as { depthRenderTarget: THREE.WebGLRenderTarget | null }).depthRenderTarget?.setSize(pw, ph)
          for (const pass of composer.passes) pass.setSize(pw, ph)
          layer.lost = true
          if (DBG) console.info('[world]', opts.label, 'fit', pw, ph)
        }
      } else if (target && (target.width !== pw || target.height !== ph)) {
        target.setSize(pw, ph)
        layer.lost = true
      }
    }
    opts.onResize?.(W, H)
    dirty = true
  }
  const rest = () => {
    restTimer = 0
    if (disposed || resting) return
    if (first || held > 0) {
      // not before its first frame: that one warms everything up at the real size
      restTimer = window.setTimeout(rest, REST_MS)
      return
    }
    resting = true
    layer.ready = false
    if (DBG) console.info('[world]', opts.label, 'rest')
    if (composer) restComposer(composer, true)
    else target?.setSize(2, 2)
  }
  const wake = () => {
    resting = false
    fit()
    prime = true
    dirty = true
  }

  const layer: Layer = {
    label: opts.label,
    animate: opts.animate,
    encoded: !!opts.encoded,
    top: 0,
    share: 0,
    prevShare: 0,
    frozen: false,
    shadows: true,
    bottom: 0,
    fadeTop: 0,
    fadeBottom: 0,
    box: boxed ? { left: 0, width: 0, fadeLeft: 0, fadeRight: 0 } : null,
    onScreen: false,
    close: false,
    ready: false,
    lost: false,
    lastDraw: 0,
    measure: (y) => {
      const H = w.height()
      // (a scene that says where its own window is - and nowhere, while it cannot say yet)
      const span = opts.span ? opts.span() ?? { top: 1e9, bottom: 1e9 } : elementSpan(win)
      let bottom = span.bottom
      if (tail && win.nextElementSibling) bottom = Math.max(bottom, elementSpan(win.nextElementSibling).bottom)
      layer.top = span.top - y
      layer.bottom = bottom - y
      if (layer.box) {
        // A box is carried with its block, so it has to be where the block IS in this frame - and the kept span is
        // only where the block was when the page was last measured. The air's cores are held by position: sticky
        // while the scroll lays their years: by the kept span their picture slid away from under their own labels
        // for as long as the block stood still. So the block itself is asked, in every frame it could be near (the
        // kept span says roughly where: a held block is at most its runway from it); its own scene reads the same
        // rectangle in the same frame, so this is no second layout.
        if (layer.bottom > -2 * H && layer.top < 3 * H) {
          const r = win.getBoundingClientRect()
          layer.top = r.top
          layer.bottom = r.bottom
          boxLeft = r.left
          if (Math.round(r.width) !== boxW || Math.round(r.height) !== boxH) {
            boxW = Math.round(r.width)
            boxH = Math.round(r.height)
            fit()
          }
        }
        const bh = layer.bottom - layer.top
        layer.box.left = boxLeft
        layer.box.width = boxW
        layer.box.fadeLeft = boxW * (fades[0] || 0)
        layer.box.fadeRight = boxW * (fades[2] || 0)
        layer.fadeTop = bh * (fades[1] || 0)
        layer.fadeBottom = bh * (fades[3] || 0)
      } else if (flow) layer.fadeTop = layer.fadeBottom = (layer.bottom - layer.top) * FLOW_EDGE
      else {
        // the edge that is moving through the screen dissolves, the more the further in it is; pinned (both edges
        // off screen) the whole frame is the scene
        layer.fadeTop = EDGE * Math.min(H, Math.max(0, layer.top))
        layer.fadeBottom = EDGE * Math.min(H, Math.max(0, H - layer.bottom))
      }
      layer.onScreen = layer.bottom > 0 && layer.top < H
      layer.prevShare = layer.share
      layer.share = H ? Math.max(0, Math.min(H, layer.bottom) - Math.max(0, layer.top)) / H : 0
      // within a screen and a half it has its buffers and a frame, before it is seen; far away it lets them go
      near = layer.bottom > -1.5 * H && layer.top < 2.5 * H
      layer.close = near
      if (near) {
        window.clearTimeout(restTimer)
        restTimer = 0
        if (resting) wake()
      } else if (!restTimer && !resting) restTimer = window.setTimeout(rest, REST_MS)
    },
    able: () => held === 0 && !resting && !disposed,
    owed: () => prime && layer.able(),
    wants: (now) => {
      if (dirty || prime) return true
      if (!opts.animate) return false
      const least = cadence(displayInterval(), w.stride(), opts.minFrameMs)
      return !least || now - layer.lastDraw >= least
    },
    draw: (now) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      if (opts.animate) time += dt
      const programs = renderer.info.programs?.length ?? 0
      const t0 = first && import.meta.env.DEV ? performance.now() : 0
      renderer.setClearColor(CLEAR, 1)
      opts.onFrame({ time, dt })
      // the shadow maps only when the scene asked (its casters moved) or on its first frame: the scene's first render
      // in this draw redraws them, and nothing else's render does
      renderer.shadowMap.needsUpdate = layer.shadows
      if (composer) composer.render(dt)
      else {
        renderer.setRenderTarget(ownTarget())
        renderer.clear()
        renderer.render(scene, camera)
      }
      renderer.shadowMap.needsUpdate = false
      layer.shadows = false
      if (import.meta.env.DEV && opts.label) {
        if (first) {
          // the first frame is where a missed precompile shows: programs created here were linked on the main thread
          const made = (renderer.info.programs ?? []).slice(programs)
          console.info(`[stage ${opts.label}] first frame ${Math.round(performance.now() - t0)} ms, programs ${programs} -> ${programs + made.length}` + (made.length ? ': ' + made.map((p) => p.name || (p as { type?: string }).type || '?').join(', ') : ''))
        }
        // how many frames each scene really draws (the frame-rate probe reads it)
        const g = window as unknown as { __stageDraws?: Record<string, number> }
        ;(g.__stageDraws ??= {})[opts.label] = (g.__stageDraws[opts.label] ?? 0) + 1
      }
      if (!layer.ready) shownAt = layer.onScreen ? now : 0
      layer.ready = true
      layer.lost = false
      layer.lastDraw = now
      dirty = false
      prime = false
      first = false
    },
    texture: () => {
      if (!composer) return target?.texture ?? null
      // the passes hand the frame back and forth between the composer's two buffers; it ends in the one the last
      // swapping pass wrote
      let swaps = 0
      for (const pass of composer.passes) if (pass.enabled && pass.needsSwap) swaps += 1
      return (swaps % 2 ? composer.outputBuffer : composer.inputBuffer).texture
    },
    opacity: (now) => {
      if (!shownAt) return 1
      const t = Math.min(1, (now - shownAt) / APPEAR_MS)
      if (t >= 1) shownAt = 0
      return t * t * (3 - 2 * t)
    },
    fit,
  }
  w.layers.push(layer)
  if (DBG) console.info('[world]', opts.label, 'made', w.layers.length)
  // a box is looked at again whenever the page's layout may have moved or resized its block
  const stale = () => w.kick()
  const offGeometry = boxed ? onPageGeometry(stale) : null
  const boxWatch = boxed && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(stale) : null
  boxWatch?.observe(win)
  if (boxed) window.addEventListener('resize', stale)
  w.kick()

  return {
    renderer,
    scene,
    camera,
    invalidate: () => {
      dirty = true
      w.kick()
    },
    shadowsDirty: () => {
      layer.shadows = true
      dirty = true
      w.kick()
    },
    quality: () => ({ lens: lensTier(w.tier()), shadowSize: shadowSize(w.tier()) }),
    hold: (work) => {
      held += 1
      const release = () => {
        held -= 1
        dirty = true
        w.kick()
      }
      work.then(release, release)
    },
    setComposer: (c) => {
      composer = c
      // the frame ends in the composer's own buffer, linear: the canvas gets it from the present pass, through the
      // scene's window
      c.autoRenderToScreen = false
      for (const pass of c.passes) pass.renderToScreen = false
      target?.dispose()
      target = null
      fit()
    },
    compile: (c) => precompile(renderer, scene, camera, c ?? composer, c ?? composer ? null : ownTarget()),
    dispose: () => {
      disposed = true
      if (DBG) console.info('[world]', opts.label, 'disposed')
      offGeometry?.()
      boxWatch?.disconnect()
      if (boxed) window.removeEventListener('resize', stale)
      window.clearTimeout(restTimer)
      const i = w.layers.indexOf(layer)
      if (i >= 0) w.layers.splice(i, 1)
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      target?.dispose()
      target = null
      // the renderer stays: it is every scene's
      w.kick()
    },
  }
}

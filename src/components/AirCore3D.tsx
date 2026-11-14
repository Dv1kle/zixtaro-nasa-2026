// THE AIR CORE - the 45 years of this field's air as one object: two clear resin cores lying on the dark ground, each
// year cast inside as a thin coloured layer - the air temperature in the large core in front, the growing-season
// water balance in the slim core behind it. A low warm sun stands behind them: the resin catches it as a rim, and each
// rod, being a lens, focuses it into a bright line on the ground in front, tinted by the years it passed through. A
// cool blue-slate fill and sky keep the shadows cold (the page's two-temperature grade). The pair turns a little as
// the page scrolls past; the year under the pointer (or the keyboard's year) rises out of the resin with its numbers.
//
// Made lazily (three.js + postprocessing), only near the viewport, its loop asleep off screen. The layer colours are
// the same ramps as the key beside it, tone-mapped neutrally so the science keeps its colours.
//
// Where the page's scroll is driven frame by frame (a desktop with motion on - lib/scroll) the object has no canvas of
// its own: it is a box on the canvas the scenes share (lib/objects/world, `shared`) - drawn at its block's size and
// carried with the block, its edges dissolved there. That is one WebGL context and one whole set of programs less
// (the resin's, the bloom's, the tone map's are the ones the soil and the market use). Elsewhere - a phone, reduced
// motion: the page is moved by the browser, a frame ahead of anything drawn for it - it keeps its own canvas.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ToneMappingMode, type EffectComposer } from 'postprocessing'
import { buildLens } from '../lib/objects/lens'
import { lookAround } from '../lib/objects/lookAround'
import { precompile, restComposer } from '../lib/objects/precompile'
import { roomEnvironment } from '../lib/objects/roomEnv'
import { createStage, type Stage } from '../lib/objects/stage'
import { airWarm, airWet } from '../lib/airCore'
import { diverging } from '../lib/color'
import { signed } from '../lib/format'

export type AirYear = { year: number; t: number; cwb: number }
export type AirCoreProps = {
  years: AirYear[]
  tMax: number
  wMax: number
  /** the year in focus (index), lifted out of the resin */
  focus: number | null
  /** the last year laid (index): later years are still clear resin (the Play sweep, the desktop scroll) */
  laidTo: number
  reduce: boolean
  /** the pointer over a year (index), or off the cores (null); `mouse` = a hover, not a tap */
  onPick: (i: number | null, mouse: boolean) => void
  /** called once if WebGL is not available, so the page can fall back */
  onFail?: () => void
  /** drawn on the canvas the scenes share, as a box (see the note at the top); false: on a canvas of its own */
  shared?: boolean
}

const L = 8 // the cores' length, in scene units
const CORES = [
  { R: 0.46, r: 0.39, z: 0.28 }, // air temperature
  { R: 0.25, r: 0.205, z: -1.3 }, // water balance
]
const SUN = new THREE.Vector3(-0.45, 0.42, -0.79).normalize()

const GROUND_VERT = /* glsl */ `
varying vec3 vG;
void main() {
  vG = vec3(position.x, 0.0, -position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
// the floor: cool graphite, a warm sheen toward the sun behind, each core's contact shadow and the bright line it
// focuses on the ground in front of it, tinted by the year above each point of the line
const GROUND_FRAG = /* glsl */ `
uniform sampler2D uTemp;
uniform sampler2D uWet;
uniform vec3 uSun;
uniform float uL;
uniform vec3 uC0; // R, z, unused
uniform vec3 uC1;
varying vec3 vG;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 core(vec3 c, sampler2D tex, vec3 col, out float shade) {
  float R = c.x;
  vec2 o = -uSun.xz * (R / uSun.y);           // where the sun's ray through the axis meets the ground
  // contact shadow under the rod and the shadow it throws toward the light's far side
  float zc = c.y + o.y * 0.5;
  float hw = abs(o.y) * 0.5 + R * 0.75;
  float inX = smoothstep(-uL * 0.5 - 0.2, -uL * 0.5 + 0.15, vG.x - o.x * 0.5) * (1.0 - smoothstep(uL * 0.5 - 0.15, uL * 0.5 + 0.2, vG.x - o.x * 0.5));
  shade = (1.0 - smoothstep(hw * 0.55, hw * 1.25, abs(vG.z - zc))) * inX;
  float contact = (1.0 - smoothstep(0.0, R * 0.9, abs(vG.z - c.y))) * inX;
  shade = max(shade * 0.55, contact * 0.85);
  // the focused line, coloured by the year the light came through
  float u = (vG.x - o.x + uL * 0.5) / uL;
  vec4 y = texture2D(tex, vec2(clamp(u, 0.0, 1.0), 0.5));
  float inside = step(0.0, u) * step(u, 1.0) * y.a;
  float d = abs(vG.z - (c.y + o.y));
  float line = exp(-pow(d / (R * 0.07), 2.0));
  float glow = exp(-pow(d / (R * 0.55), 2.0));
  return inside * (vec3(1.0, 0.86, 0.66) * line * 1.15 * mix(vec3(1.0), y.rgb * 1.6, 0.55) + y.rgb * glow * 0.32);
}
void main() {
  float g = hash(floor(vG.xz * 140.0)) * 0.012;
  vec3 base = vec3(0.028, 0.032, 0.04) + g;
  // the warm light from behind grazes the floor toward the back
  base += vec3(0.075, 0.062, 0.05) * smoothstep(1.5, -5.0, vG.z) * 0.45;
  base += vec3(0.02, 0.03, 0.045) * smoothstep(-1.0, 4.0, vG.z);
  float s0, s1;
  vec3 light = core(uC0, uTemp, base, s0) + core(uC1, uWet, base, s1);
  vec3 col = base * (1.0 - 0.75 * max(s0, s1)) + light;
  // the floor falls away into the dark at its edges
  float fade = smoothstep(9.0, 4.0, length(vG.xz * vec2(0.62, 1.0)));
  gl_FragColor = vec4(mix(vec3(0.039, 0.043, 0.055), col, fade), 1.0);
}
`

function colourTexture(years: AirYear[], pick: (y: AirYear) => string) {
  const data = new Uint8Array(years.length * 4)
  years.forEach((y, i) => {
    const c = new THREE.Color(pick(y))
    data.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], i * 4)
  })
  const tex = new THREE.DataTexture(data, years.length, 1, THREE.RGBAFormat)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

export default function AirCore3D(props: AirCoreProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const shared = !!props.shared
  const tag = useRef<HTMLDivElement>(null)
  const ticks = useRef<HTMLDivElement>(null)
  const names = useRef<HTMLDivElement>(null)
  const live = useRef(props)
  live.current = props
  const stageRef = useRef<Stage | null>(null)
  const { years, tMax, wMax } = props

  useEffect(() => {
    stageRef.current?.invalidate()
  }, [props.focus, props.laidTo])

  useEffect(() => {
    // the block itself on the shared canvas; its own canvas otherwise
    const el: HTMLElement | null = shared ? box.current : canvas.current
    if (!el) return
    const n = years.length
    const slot = L / n
    const group = new THREE.Group()
    const lift = new Float32Array(n)
    const laid = new Float32Array(n).fill(1)
    const temp = colourTexture(years, (y) => airWarm(diverging(y.t, tMax)))
    const wet = colourTexture(years, (y) => airWet(diverging(y.cwb, wMax)))
    const tmpM = new THREE.Matrix4()
    const tmpQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    const tmpP = new THREE.Vector3()
    const tmpS = new THREE.Vector3()
    const project = new THREE.Vector3()
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let composer: EffectComposer | null = null
    let pointer: { x: number; y: number; mouse: boolean } | null = null
    let lastPick: number | null = -2
    let turn = 0

    const look = lookAround(3)
    const stage = createStage(el, {
      label: 'air',
      fov: 30,
      animate: !props.reduce,
      // (a canvas of its own; on the shared canvas the frame budget sets the pixel ratio)
      maxDpr: 1.5,
      minFrameMs: 30,
      // (a canvas of its own sizes, rests and draws its chain itself; on the shared canvas the stage does all three)
      ...(shared ? {} : { onResize: (w: number, h: number) => composer?.setSize(w, h), rest: (r: boolean) => restComposer(composer, r), render: (dt: number) => composer?.render(dt) }),
      onFrame: ({ dt }) => {
        const p = live.current
        const cam = stage!.camera
        // frame the pair whatever the aspect: their length fills most of the width, seen from in front and above
        const fovY = THREE.MathUtils.degToRad(cam.fov)
        const dist = Math.max(7.4, (L * 0.7) / (Math.tan(fovY / 2) * cam.aspect))
        const dir = new THREE.Vector3(0.12, 0.56, 1).normalize()
        cam.position.set(0, 0.1, -0.5).addScaledVector(dir, dist)
        cam.lookAt(0, 0.1, -0.5)
        // the page's scroll turns the pair a little (still under reduced motion)
        const r = el.getBoundingClientRect()
        const t = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height)))
        // ...and the reader's hand turns them a little more
        const want = p.reduce ? 0 : (t - 0.5) * 0.42 + look(dt).x * 0.1
        turn += (want - turn) * (p.reduce ? 1 : Math.min(1, dt * 4))
        group.rotation.y = turn
        group.updateMatrixWorld()
        // pointer → the year under it (a ray against the two resin shells)
        if (pointer) {
          ndc.set((pointer.x / r.width) * 2 - 1, -(pointer.y / r.height) * 2 + 1)
          ray.setFromCamera(ndc, cam)
          const hit = ray.intersectObjects(shells, false)[0]
          let i: number | null = null
          if (hit) {
            const local = group.worldToLocal(hit.point.clone())
            i = Math.min(n - 1, Math.max(0, Math.floor((local.x + L / 2) / slot)))
          }
          if (i !== lastPick) {
            lastPick = i
            p.onPick(i, pointer.mouse)
          }
        }
        // the layers: laid ones in the resin, the focused one risen out of it
        const k = p.reduce ? 1 : Math.min(1, dt * 11)
        for (let i = 0; i < n; i++) {
          const wantLift = p.focus === i ? 1 : 0
          const wantLaid = i <= p.laidTo ? 1 : 0
          const nl = lift[i] + (wantLift - lift[i]) * k
          const nd = laid[i] + (wantLaid - laid[i]) * k
          lift[i] = Math.abs(wantLift - nl) < 1e-3 ? wantLift : nl
          laid[i] = Math.abs(wantLaid - nd) < 1e-3 ? wantLaid : nd
        }
        for (const [ci, mesh] of discs.entries()) {
          const c = CORES[ci]
          for (let i = 0; i < n; i++) {
            const s = Math.max(0.0001, laid[i])
            const up = lift[i]
            tmpP.set(-L / 2 + (i + 0.5) * slot, c.R + up * c.R * 0.95, c.z + up * c.R * 0.3)
            tmpS.set(1 + up * 0.1, s, 1 + up * 0.1)
            mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS))
          }
          mesh.instanceMatrix.needsUpdate = true
        }
        // the laid years' light on the floor
        const ta = temp.image.data as Uint8Array
        const wa = wet.image.data as Uint8Array
        for (let i = 0; i < n; i++) {
          ta[i * 4 + 3] = wa[i * 4 + 3] = Math.round(255 * laid[i])
        }
        temp.needsUpdate = wet.needsUpdate = true

        // the DOM layer: the risen year's tag, the decade marks under the front core, the cores' names
        const w = r.width
        const h = r.height
        const toScreen = (x: number, y: number, z: number) => {
          project.set(x, y, z)
          group.localToWorld(project)
          project.project(cam)
          return [(project.x * 0.5 + 0.5) * w, (-project.y * 0.5 + 0.5) * h] as const
        }
        if (tag.current) {
          const f = p.focus
          if (f !== null) {
            const [sx, sy] = toScreen(-L / 2 + (f + 0.5) * slot, CORES[0].R * 2 + CORES[0].R * 0.95 + 0.14, CORES[0].z)
            tag.current.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`
            tag.current.style.opacity = '1'
          } else tag.current.style.opacity = '0'
        }
        if (ticks.current) {
          for (const node of Array.from(ticks.current.children) as HTMLElement[]) {
            const i = Number(node.dataset.i)
            const [sx, sy] = toScreen(-L / 2 + (i + 0.5) * slot, 0, CORES[0].z + CORES[0].R + 0.42)
            node.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`
          }
        }
        if (names.current) {
          const kids = Array.from(names.current.children) as HTMLElement[]
          kids.forEach((node, ci) => {
            const c = CORES[ci]
            const [sx, sy] = toScreen(L / 2 + 0.28, c.R, c.z)
            node.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`
          })
        }
      },
    })
    if (!stage) {
      temp.dispose()
      wet.dispose()
      props.onFail?.()
      return
    }
    stageRef.current = stage
    const { scene, renderer, camera } = stage
    if (!shared) renderer.setClearColor(0x0a0b0e, 1)
    // (the studio the resin reflects is baked once per renderer and kept with it - lib/objects/roomEnv)
    scene.environment = roomEnvironment(renderer)
    scene.environmentIntensity = 0.42
    scene.add(group)

    // light: the low warm sun behind, a cool slate fill from the front, a cold sky
    const sun = new THREE.DirectionalLight(new THREE.Color('#ffcf94'), 3.2)
    sun.position.copy(SUN).multiplyScalar(10)
    group.add(sun)
    const fill = new THREE.DirectionalLight(new THREE.Color('#8da3c2'), 0.75)
    fill.position.set(2.5, 2.2, 6)
    group.add(fill)
    group.add(new THREE.HemisphereLight(new THREE.Color('#5a6d88'), new THREE.Color('#0d0f13'), 0.5))

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 16),
      new THREE.ShaderMaterial({
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        uniforms: {
          uTemp: { value: temp },
          uWet: { value: wet },
          uSun: { value: SUN },
          uL: { value: L },
          uC0: { value: new THREE.Vector3(CORES[0].R, CORES[0].z, 0) },
          uC1: { value: new THREE.Vector3(CORES[1].R, CORES[1].z, 0) },
        },
      }),
    )
    ground.rotation.x = -Math.PI / 2
    group.add(ground)

    // the years: thin discs cast in the resin, coloured by the year (a faint glow of their own keeps them legible)
    const discs: THREE.InstancedMesh[] = []
    const shells: THREE.Mesh[] = []
    for (const [ci, c] of CORES.entries()) {
      const geo = new THREE.CylinderGeometry(c.r, c.r, slot * 0.8, 56, 1)
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0, envMapIntensity: 0.8 })
      mat.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n  totalEmissiveRadiance += vColor * 0.16;\n#endif',
        )
      }
      const mesh = new THREE.InstancedMesh(geo, mat, n)
      years.forEach((y, i) => mesh.setColorAt(i, new THREE.Color(ci === 0 ? airWarm(diverging(y.t, tMax)) : airWet(diverging(y.cwb, wMax)))))
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.frustumCulled = false
      group.add(mesh)
      discs.push(mesh)
      // the clear resin around them: a polished rod with its end caps
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(c.R, c.R, L + 0.16, 96, 1, false),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#f4f6f8'),
          roughness: 0.05,
          metalness: 0,
          transmission: 1,
          thickness: c.R * 1.4,
          ior: 1.46,
          attenuationColor: new THREE.Color('#d9e1ea'),
          attenuationDistance: 3.5,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.1,
        }),
      )
      shell.rotation.z = Math.PI / 2
      shell.position.set(0, c.R, c.z)
      group.add(shell)
      shells.push(shell)
    }

    // the lens (lib/objects/lens): a low bloom for the rims and the focused lines, a neutral tone map (the layers keep
    // their colours), a vignette and a fine grain; the focused lines are thin
    composer = buildLens(renderer, scene, camera, {
      bloom: { luminanceThreshold: 0.82, luminanceSmoothing: 0.3, intensity: 0.55, mipmapBlur: true, radius: 0.6 },
      tone: ToneMappingMode.NEUTRAL,
      vignette: { offset: 0.32, darkness: 0.5 },
      grain: 0.1,
      thinLines: true,
    }, stage.quality().lens).composer
    if (shared) stage.setComposer(composer)
    else {
      const size = new THREE.Vector2()
      renderer.getSize(size)
      if (size.x && size.y) composer.setSize(size.x, size.y)
    }
    // nothing is drawn until the driver has linked every program in the background (lib/objects/precompile)
    stage.hold(shared ? stage.compile(composer) : precompile(renderer, scene, camera, composer))

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top, mouse: e.pointerType === 'mouse' }
      stage.invalidate()
    }
    const leave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      pointer = null
      lastPick = -2
      live.current.onPick(null, true)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', move)
    el.addEventListener('pointerleave', leave)
    const onScroll = () => stage.invalidate()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', move)
      el.removeEventListener('pointerleave', leave)
      window.removeEventListener('scroll', onScroll)
      composer?.dispose()
      composer = null
      temp.dispose()
      wet.dispose()
      stageRef.current = null
      stage.dispose()
    }
    // the object is built once per field; focus and the laid year are read live from the props
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, tMax, wMax, props.reduce, shared])

  const f = props.focus !== null ? years[props.focus] : null
  const decades = years.map((y, i) => ({ y: y.year, i })).filter((x) => x.y % 10 === 0 || x.i === 0 || x.i === years.length - 1)
  return (
    // (on the shared canvas the block is the object's window: its picture is carried with it, its four edges dissolved
    // by the same shares the page's own mask takes from the labels - ClimateCharts CORE_FADE)
    <div ref={box} className="relative h-full w-full" {...(shared ? { 'data-world-window': 'box', 'data-world-fade': '0.11 0.16 0.11 0.18' } : {})}>
      {!shared && <canvas ref={canvas} aria-hidden className="block h-full w-full touch-pan-y" />}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={tag} className="absolute top-0 left-0 opacity-0 transition-opacity duration-200">
          {f && (
            <div className="-translate-x-1/2 -translate-y-full border-l border-leaf bg-void/80 px-2.5 py-1.5 font-mono text-[11px] leading-snug whitespace-nowrap text-ink">
              <div className="text-leaf">{f.year}</div>
              <div>
                air <span className={f.t > 0 ? 'text-heat' : 'text-water'}>{signed(f.t, 2, ' °C')}</span>
              </div>
              <div>
                water <span className={f.cwb < 0 ? 'text-wheat' : 'text-water'}>{signed(f.cwb, 0, ' mm')}</span>
              </div>
            </div>
          )}
        </div>
        <div ref={ticks}>
          {decades.map((d) => (
            <span key={d.y} data-i={d.i} className="absolute top-0 left-0 font-mono text-[10.5px] text-ink-3">
              <span className="block -translate-x-1/2">{d.y}</span>
            </span>
          ))}
        </div>
        <div ref={names} className="hidden sm:block">
          <span className="absolute top-0 left-0 font-mono text-[10.5px] whitespace-nowrap text-ink-3"><span className="block -translate-y-1/2">air · 2 m</span></span>
          <span className="absolute top-0 left-0 font-mono text-[10.5px] whitespace-nowrap text-ink-3"><span className="block -translate-y-1/2">water balance</span></span>
        </div>
      </div>
    </div>
  )
}

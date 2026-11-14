// THE HOUSE THROUGH THE YEAR - the grower's glasshouse as a jewel-like scale model of a working nursery: a four-bay
// Venlo house sawn open at its front gable, standing on a landscaped base whose sides are cut to show the soil, with the
// yard, the packing hall and its dock, the boiler house, the tanks, the poplar windbreak and the neighbours' fields
// round it (ghCutawaySite). The month drives everything you see, from the model's own numbers (lib/ghCutaway):
//   the sun - a bead on a hairline arc beside the house (a dot for every month), as high as the month's CERES daylight
//     lets it climb (a picture of the light, not a solar angle), its light and the shadows of every glazing bar
//     falling into the house, with shafts as strong as the cover lets through;
//   the roof vents opening as far as the house runs over the crop's day set point; the night screen and the shade
//     screen gliding under the gutters; the lamps coming on bay by bay; the heating rails glowing with the boiler's
//     work, the heat leaving through the glass and the chimney's vapour;
//   the crop from planting to a full, fruiting crop (vines on high wires for the tall crops), with its drip lines,
//     sticky cards, fans and the pipe-rail trolley; in the months the house is left cold, a cleaned, resting house
//     (slabs stacked, hoses coiled, the trolley parked, one service light);
//   rain on the roof and the tank's true level; snow under a freezing mean (none on a heated roof), frost, puddles;
//   a cold blue-hour sky with stars over the dark months, a high warm haze over the bright ones.
// Month changes glide (about a second); a slow camera drift and the pointer's parallax; under reduced motion each month
// is a still frame. One lazy canvas (three.js + postprocessing), its loop asleep off screen; labels are DOM, projected.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { KernelSize, type EffectComposer } from 'postprocessing'
import { buildLens } from '../lib/objects/lens'
import { precompile, restComposer } from '../lib/objects/precompile'
import { createStage, type Stage } from '../lib/objects/stage'
import type { CutawayMonth } from '../lib/ghCutaway'
import type { Cover, GhCropId } from '../lib/greenhouse'
import { BASE, BAYS, D, GH, RH, roofY, SPAN, TANK, W } from './ghCutawayDims'
import { buildSite, noiseTexture, rng } from './ghCutawaySite'

export type Cutaway3DLabels = {
  /** outside air, °C, as shown */
  out: string
  /** the pill over the crop (null when the house stands empty) */
  inside: string | null
  hot: boolean
  /** why the house stands empty (null while the crop is in) */
  note: string | null
  tank: string
  floor: string
}

export type Cutaway3DProps = {
  look: CutawayMonth
  /** every month's daylight share (the ticks on the sun's arc) */
  lights: number[]
  crop: { id: GhCropId }
  cover: Cover
  /** what the grower's house has: heating (boiler), lamps, a night screen, CO₂ dosing, a CHP */
  kit: { heated: boolean; lit: boolean; screen: boolean; co2?: boolean; chp?: boolean }
  reduce: boolean
  labels: Cutaway3DLabels
  /** called once if WebGL is not available, so the page can fall back to the flat drawing */
  onFail?: () => void
}

const C = new THREE.Vector3(W / 2, 0, -D / 2) // the house's centre on the ground
// the sun's side: to the left and a touch toward the viewer - a raking side light. Its arc stands beside the house, its
// light still reaches into the cut and onto the crop's near side, and every shadow falls across the yard to the right,
// where it can be seen (from further toward the viewer they fell behind the things that cast them, and the model
// stood as flat as an unlit one)
const AZ = new THREE.Vector3(-0.97, 0, 0.16).normalize()
const ARC_R = 5.6
/** the arc stands face-on in the open ground left of the house: the winter sun low at its foot, the summer sun high */
const ARC_C = new THREE.Vector3(-5.2, 0, -2.6)
/** how much of the rain field falls: none in a dry month, a fair shower in a wet one */
const rainShare = (mm: number) => Math.max(0, Math.min(0.55, (mm - 35) / 140))
// never high: a low sun draws the model with its shadows, in summer too (the month's light is in its strength and colour)
const elevOf = (light: number) => THREE.MathUtils.degToRad(7 + 27 * Math.max(0, Math.min(1, light)))
const toSun = (e: number, out = new THREE.Vector3()) => out.set(AZ.x * Math.cos(e), Math.sin(e), AZ.z * Math.cos(e))
const VIEW = new THREE.Vector3(0.44, 0.6, 1).normalize()
const UP = new THREE.Vector3(0, 1, 0)
// dev only: ?ghforce=lamps,heat,screen,shade,night,harvest,rain,snow,vent,cold overrides the month, to judge each effect
const FORCE = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('ghforce')?.split(',') ?? [] : []

// ---- colours (linear) -------------------------------------------------------------------------------------------------
const lin = (hex: string) => new THREE.Color(hex)
const SUN_LOW = new THREE.Color(1.0, 0.5, 0.22)
const SUN_HIGH = new THREE.Color(1.0, 0.82, 0.6)
const SODIUM = new THREE.Color(1.0, 0.56, 0.2)
const HEAT = lin('#e05a2b')

// ---- the crops ------------------------------------------------------------------------------------------------------
type Kind = 'vine' | 'bush' | 'rosette' | 'table'
type Fruit = 'round' | 'cherry' | 'long' | 'lobed' | 'egg' | 'cone' | null
type LeafShape = 'palm' | 'pinnate' | 'ovate' | 'ruffle' | 'trifol' | 'wavy'
type Crop3D = { kind: Kind; h: number; leaves: number; leafLen: number; leafWid: number; shape: LeafShape; fruit: Fruit; fruitCol: string; leafCol: string; dz: number; flower: string | null; bees: boolean }
const CROP3D: Record<GhCropId, Crop3D> = {
  tomato: { kind: 'vine', h: 3.3, leaves: 15, leafLen: 0.62, leafWid: 0.44, shape: 'pinnate', fruit: 'round', fruitCol: '#a8301e', leafCol: '#4a6a33', dz: 0.5, flower: '#c9b04a', bees: true },
  cherry: { kind: 'vine', h: 3.3, leaves: 15, leafLen: 0.58, leafWid: 0.42, shape: 'pinnate', fruit: 'cherry', fruitCol: '#b02a20', leafCol: '#4a6a33', dz: 0.5, flower: '#c9b04a', bees: true },
  cucumber: { kind: 'vine', h: 3.4, leaves: 16, leafLen: 0.44, leafWid: 0.48, shape: 'palm', fruit: 'long', fruitCol: '#2d4a24', leafCol: '#4f7535', dz: 0.55, flower: '#cdb247', bees: false },
  pepper: { kind: 'vine', h: 2.8, leaves: 20, leafLen: 0.3, leafWid: 0.2, shape: 'ovate', fruit: 'lobed', fruitCol: '#b8741a', leafCol: '#3f6232', dz: 0.45, flower: '#d8d2c2', bees: true },
  eggplant: { kind: 'bush', h: 1.4, leaves: 10, leafLen: 0.36, leafWid: 0.26, shape: 'wavy', fruit: 'egg', fruitCol: '#2b1634', leafCol: '#4a6238', dz: 0.6, flower: '#8d7aa6', bees: true },
  courgette: { kind: 'bush', h: 0.75, leaves: 9, leafLen: 0.46, leafWid: 0.48, shape: 'palm', fruit: 'long', fruitCol: '#3c6629', leafCol: '#55753a', dz: 0.8, flower: '#cdb247', bees: true },
  lettuce: { kind: 'rosette', h: 0.22, leaves: 13, leafLen: 0.19, leafWid: 0.18, shape: 'ruffle', fruit: null, fruitCol: '#000000', leafCol: '#86a54c', dz: 0.32, flower: null, bees: false },
  strawberry: { kind: 'table', h: 0.3, leaves: 9, leafLen: 0.18, leafWid: 0.18, shape: 'trifol', fruit: 'cone', fruitCol: '#b01e36', leafCol: '#456a30', dz: 0.3, flower: '#ddd8cc', bees: true },
  basil: { kind: 'bush', h: 0.48, leaves: 18, leafLen: 0.11, leafWid: 0.075, shape: 'ovate', fruit: null, fruitCol: '#000000', leafCol: '#4b7a30', dz: 0.26, flower: null, bees: false },
}
const ROW_OFFSETS = [0.6, 1.3, 2.7, 3.4] // two double rows per bay; the paths (and the heating pipes) between them
const PIPES_X = Array.from({ length: BAYS * 2 - 1 }, (_, i) => (i + 1) * 2)
const FRAMES = [0, -D / 3, (-2 * D) / 3, -D]
const keepAttrs = (g: THREE.BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g
  for (const n of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(n)) out.deleteAttribute(n)
  return out
}

/** a leaf blade's outline, painted once per crop: alpha is the shape, the grey carries the veins (the instance colours it) */
function leafTexture(shape: LeafShape) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // local coords: u across (-0.5…0.5), v from the stem (0) to the tip (1); the canvas's bottom is the stem
  const X = (u: number) => (u + 0.5) * S
  const Y = (v: number) => (1 - v) * S
  const fill = () => {
    const gr = g.createLinearGradient(0, S, 0, 0)
    gr.addColorStop(0, '#b9c4ac')
    gr.addColorStop(1, '#d7dccb')
    g.fillStyle = gr
    g.fill()
  }
  const blade = (cu: number, cv: number, len: number, wid: number, ang: number, serr = 0, wave = 0) => {
    // an ovate blade from (cu, cv) toward angle ang (0 = toward the tip), pointed at its end
    g.beginPath()
    const n = 48
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const side = i <= n / 2 ? 1 : -1
      const s = i <= n / 2 ? t * 2 : 2 - t * 2 // 0 at the base … 1 at the tip
      let w = wid * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.75)), 0.9) * (1 - 0.15 * s)
      w *= 1 + serr * (0.5 + 0.5 * Math.sin(s * 70)) + wave * Math.sin(s * 14)
      const a = len * s
      const u = cu + Math.sin(ang) * a + Math.cos(ang) * w * side
      const v = cv + Math.cos(ang) * a - Math.sin(ang) * w * side
      if (i === 0) g.moveTo(X(u), Y(v))
      else g.lineTo(X(u), Y(v))
    }
    g.closePath()
    fill()
  }
  const vein = (u0: number, v0: number, u1: number, v1: number, w: number) => {
    g.strokeStyle = 'rgba(245,248,236,0.55)'
    g.lineWidth = w
    g.beginPath()
    g.moveTo(X(u0), Y(v0))
    g.lineTo(X(u1), Y(v1))
    g.stroke()
  }
  if (shape === 'palm' || shape === 'ruffle') {
    // palmate and heart-shaped (cucumber, courgette), or a round ruffled lettuce leaf
    const cx = 0
    const cy = shape === 'palm' ? 0.36 : 0.45
    const R = shape === 'palm' ? 0.47 : 0.48
    g.beginPath()
    const n = 220
    for (let i = 0; i <= n; i++) {
      const p = (i / n) * Math.PI * 2 // 0 = toward the tip
      const lobes = shape === 'palm' ? 0.74 + 0.26 * Math.pow(Math.abs(Math.cos(p * 2.5)), 1.6) : 0.86 + 0.08 * Math.sin(p * 13) + 0.05 * Math.sin(p * 29)
      const notch = 1 - (shape === 'palm' ? 0.62 : 0.3) * Math.exp(-Math.pow((p - Math.PI) / 0.32, 2))
      const r = R * lobes * notch * (1 + 0.025 * Math.sin(p * 46))
      const u = cx + Math.sin(p) * r
      const v = cy + Math.cos(p) * r * (p > Math.PI / 2 && p < 1.5 * Math.PI ? 0.78 : 1)
      if (i === 0) g.moveTo(X(u), Y(v))
      else g.lineTo(X(u), Y(v))
    }
    g.closePath()
    fill()
    for (const a of shape === 'palm' ? [0, 1.26, -1.26, 2.3, -2.3] : [0, 0.8, -0.8, 1.6, -1.6]) vein(cx, cy, cx + Math.sin(a) * R * 0.85, cy + Math.cos(a) * R * 0.85, a === 0 ? 4 : 2.5)
    vein(0, 0, cx, cy, 5)
  } else if (shape === 'pinnate') {
    // tomato: a compound leaf, pairs of leaflets along the midrib and one at the end
    for (const [v, s] of [[0.22, 0.6], [0.43, 0.85], [0.64, 0.8]] as [number, number][])
      for (const side of [-1, 1]) {
        blade(0, v, 0.27 * s, 0.075 * s, side * 1.05, 0.05)
        vein(0, v, side * 0.2 * s, v + 0.12 * s, 1.5)
      }
    for (const side of [-1, 1]) blade(0, 0.33, 0.08, 0.03, side * 1.3)
    blade(0, 0.74, 0.26, 0.1, 0, 0.05)
    vein(0, 0, 0, 0.97, 4)
  } else if (shape === 'trifol') {
    // strawberry: three serrated leaflets on one stalk
    for (const a of [-0.85, 0, 0.85]) blade(0, 0.32, 0.6, 0.16, a, 0.12)
    vein(0, 0, 0, 0.9, 3)
  } else {
    // ovate (pepper, basil), wavy-edged (aubergine)
    blade(0, 0.02, 0.97, shape === 'wavy' ? 0.36 : 0.3, 0, 0, shape === 'wavy' ? 0.07 : 0)
    vein(0, 0, 0, 0.92, 4)
    for (let i = 1; i < 6; i++) for (const side of [-1, 1]) vein(0, i * 0.15, side * 0.2 * Math.sin((Math.PI * i) / 6.5), i * 0.15 + 0.12, 1.5)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** a leaf's surface: the full blade's square, cupped along its midrib and drooping toward the tip, stem along +z */
function leafGeo(shape: LeafShape) {
  const g = new THREE.PlaneGeometry(1, 1, 4, 6)
  const p = g.attributes.position as THREE.BufferAttribute
  const cup = shape === 'palm' || shape === 'ruffle' ? 0.08 : 0.16
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i)
    const v = p.getY(i) + 0.5
    const y = Math.abs(u) * cup + Math.sin(v * 1.3) * 0.16 - v * v * 0.3
    p.setXYZ(i, u, y, v)
  }
  g.computeVertexNormals()
  return g
}

/** a hanging fruit, its stalk end at the origin */
function fruitGeo(kind: Exclude<Fruit, null>) {
  let g: THREE.BufferGeometry
  if (kind === 'round') {
    g = new THREE.SphereGeometry(0.042, 12, 9)
    g.scale(1, 0.85, 1)
    g.translate(0, -0.045, 0)
  } else if (kind === 'cherry') {
    g = new THREE.SphereGeometry(0.023, 10, 8)
    g.translate(0, -0.025, 0)
  } else if (kind === 'long') {
    g = new THREE.CapsuleGeometry(0.026, 0.28, 4, 10)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.pow(p.getY(i) / 0.17, 2) * 0.012)
    g.computeVertexNormals()
    g.translate(0, -0.17, 0)
  } else if (kind === 'lobed') {
    g = new THREE.SphereGeometry(0.05, 16, 12)
    const p = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const phi = Math.atan2(v.z, v.x)
      const side = Math.sqrt(v.x * v.x + v.z * v.z) / 0.05
      const k = 1 + 0.09 * Math.cos(phi * 4) * side
      p.setXYZ(i, v.x * k, v.y * 1.18 - (v.y < 0 ? 0.004 : 0), v.z * k)
    }
    g.computeVertexNormals()
    g.translate(0, -0.06, 0)
  } else if (kind === 'egg') {
    g = new THREE.SphereGeometry(0.05, 14, 12)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 0.05
      const w = 0.75 + 0.35 * (1 - y) * 0.5
      p.setXYZ(i, p.getX(i) * w, p.getY(i) * 2.2, p.getZ(i) * w)
    }
    g.computeVertexNormals()
    g.translate(0, -0.12, 0)
  } else {
    g = new THREE.ConeGeometry(0.02, 0.046, 9)
    g.rotateX(Math.PI)
    g.translate(0, -0.026, 0)
  }
  return g
}

// ---- shaders --------------------------------------------------------------------------------------------------------
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
// the backdrop: graphite under the model rising to a sky toward the top of the frame - a cold blue hour with stars
// over the dark months, a high warm haze on the sun's side over the bright ones, an overcast when it rains
const SKY_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform float uLight;
uniform float uNight;
uniform float uCloud;
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = smoothstep(-0.55, 0.05, d.y);
  float zen = smoothstep(0.0, 0.7, d.y);
  // blue hour: steel blue at the horizon, deep graphite-blue above; day: a pale cool haze, warmer toward the sun
  vec3 nightCol = mix(vec3(0.0034, 0.0038, 0.0048), mix(vec3(0.016, 0.022, 0.034), vec3(0.006, 0.008, 0.013), zen), h);
  vec3 dayCol = mix(vec3(0.0045, 0.0045, 0.005), mix(vec3(0.05, 0.052, 0.056), vec3(0.018, 0.022, 0.03), zen), h);
  vec3 col = mix(nightCol, dayCol, smoothstep(0.25, 0.85, uLight));
  vec2 a = normalize(d.xz + 1e-5);
  float side = max(dot(a, normalize(uSun.xz)), 0.0);
  col += uSunCol * pow(side, 3.0) * h * (1.0 - zen * 0.7) * (0.006 + 0.045 * uLight);
  float c = texture2D(uNoise, d.xz / (0.35 + d.y) * 0.25 + vec2(uTime * 0.0015, 0.0)).r;
  col = mix(col, col * 0.75 + vec3(0.012, 0.013, 0.015) * h * (0.35 + uLight), uCloud * smoothstep(0.35, 0.7, c) * h);
  vec3 g = d * 170.0;
  vec3 id = floor(g);
  float s = fract(sin(dot(id, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float star = step(0.987, s) * smoothstep(0.42, 0.0, length(fract(g) - 0.5));
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + s * 2.5) + s * 40.0);
  col += vec3(0.7, 0.76, 0.86) * star * tw * uNight * smoothstep(0.55, 0.9, h) * (1.0 - uCloud * 0.85) * 0.8;
  gl_FragColor = vec4(col, 1.0);
}
`
const WORLD_VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vUv = uv;
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
// the panes, premultiplied: what they reflect (the sky, the sun's glint) adds light, the glass's own green edge tints
// it, the cover's haze dims what is behind; condensation clouds the panes in cold months with the crop in; snow lies
// on an unheated roof; at night the lit house glows through
const GLASS_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uSkyHi;
uniform vec3 uSkyLo;
uniform float uLight;
uniform float uMilk;
uniform float uGlow;
uniform vec3 uGlowCol;
uniform float uSnow;
uniform float uFog;
uniform sampler2D uNoise;
varying vec3 vW;
varying vec3 vN;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float roof = smoothstep(0.6, 0.85, abs(N.y));
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 env = mix(uSkyLo, uSkyHi, smoothstep(-0.2, 0.7, R.y));
  float rs = max(dot(R, uSun), 0.0);
  vec3 spec = uSunCol * (pow(rs, 900.0) * 24.0 + pow(rs, 60.0) * 0.5) * (0.1 + uLight);
  float lit = max(dot(N, uSun), 0.0) * 0.6 + 0.4;
  vec2 nz = texture2D(uNoise, (vW.xz + vW.y * 0.7) * 0.11).rg;
  float sn = roof * smoothstep(0.0, 0.14, uSnow - nz.x * 0.55 + 0.05) * min(1.0, uSnow * 2.5);
  float fog = uFog * (0.55 + 0.45 * nz.y);
  vec3 tint = mix(vec3(1.0), vec3(0.78, 1.0, 0.9), F);
  vec3 col = (env * F + spec) * tint + vec3(0.8, 0.82, 0.86) * (uMilk + fog * 0.5) * (0.01 + 0.08 * uLight * lit) + uGlowCol * uGlow * (0.035 + 0.25 * (uMilk + fog * 0.4));
  float a = 0.015 + F * 0.3 + uMilk * 0.22 + fog * 0.1;
  col = mix(col, vec3(0.62, 0.65, 0.7) * (0.08 + 0.75 * uLight * lit) + uGlowCol * uGlow * 0.05, sn);
  a = mix(a, 0.95, sn);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`
// a shaft of sunlight through the roof: a soft ribbon along the light, turned to the camera, kept inside the house
const BEAM_VERT = /* glsl */ `
attribute vec3 aStart;
attribute float aWid;
attribute float aSeed;
uniform vec3 uL;
varying vec2 vUv;
varying vec3 vW;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec3 dir = -uL;
  float len = min(aStart.y / max(uL.y, 0.06), 16.0);
  vec3 toCam = normalize(cameraPosition - aStart);
  vec3 side = normalize(cross(dir, toCam));
  vec3 p = aStart + dir * ((1.0 - uv.y) * len) + side * (uv.x - 0.5) * aWid;
  vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`
const BEAM_FRAG = /* glsl */ `
uniform float uBeam;
uniform float uTime;
uniform vec3 uCol;
varying vec2 vUv;
varying vec3 vW;
varying float vSeed;
void main() {
  if (vW.x < 0.05 || vW.x > ${(W - 0.05).toFixed(2)} || vW.z < ${(-D + 0.05).toFixed(2)} || vW.z > -0.05 || vW.y < 0.0) discard;
  float t = 1.0 - vUv.y;
  float across = exp(-pow((vUv.x - 0.5) * 3.4, 2.0));
  float along = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.7, 1.0, t)) * (1.0 - 0.45 * t);
  float shimmer = 0.78 + 0.22 * sin(uTime * 0.5 + vSeed * 30.0 + t * 5.0);
  gl_FragColor = vec4(uCol * across * along * shimmer * uBeam * 0.32, 1.0);
}
`
const CONE_FRAG = /* glsl */ `
uniform float uLamp;
uniform vec3 uCol;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float facing = pow(abs(dot(normalize(vN), V)), 1.6);
  float down = vUv.y; // 1 at the lamp, 0 at the crop
  gl_FragColor = vec4(uCol * facing * down * down * uLamp * 0.05, 1.0);
}
`
const FLOOR_HEAT_FRAG = /* glsl */ `
uniform float uHeat;
uniform vec3 uCol;
varying vec3 vW;
void main() {
  float px = clamp(2.0 * floor(vW.x / 2.0 + 0.5), 2.0, ${(W - 2).toFixed(1)});
  float d = abs(vW.x - px);
  float g = exp(-d * d * 5.0) * uHeat;
  float ends = smoothstep(${(-D + 0.1).toFixed(2)}, ${(-D + 0.8).toFixed(2)}, vW.z) * smoothstep(-0.8, -1.4, vW.z);
  gl_FragColor = vec4(uCol * g * ends * 0.16, 1.0);
}
`
const AIR_FRAG = /* glsl */ `
uniform float uGlow;
uniform vec3 uCol;
varying vec3 vW;
void main() {
  float lowAir = 1.0 - smoothstep(0.0, ${RH.toFixed(1)}, vW.y) * 0.55;
  gl_FragColor = vec4(uCol * uGlow * lowAir * 0.03, 1.0);
}
`
const POINT_FRAG = /* glsl */ `
uniform vec3 uCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  gl_FragColor = vec4(uCol * exp(-r * 14.0) * vA, 1.0);
}
`
// warm air leaving through the glass over the ridges, as long as the boiler works: soft veils that rise and shimmer
const PLUME_VERT = /* glsl */ `
attribute vec3 aPos;
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  vec3 p = aPos + right * (uv.x - 0.5) * 1.6 + vec3(0.0, uv.y * 1.5, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`
const PLUME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHeat;
uniform vec3 uCol;
varying vec2 vUv;
varying float vSeed;
void main() {
  float a = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = vUv.x - 0.5 + (fi - 1.0) * 0.12 + sin(vUv.y * (4.0 + fi) - uTime * (0.8 + 0.2 * fi) + vSeed * 9.0 + fi * 2.1) * 0.1 * vUv.y;
    float strand = exp(-x * x * 900.0);
    float flow = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(vUv.y * 7.0 - uTime * (1.2 + 0.3 * fi) + vSeed * 20.0 + fi));
    a += strand * flow;
  }
  float up = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.2, 1.0, vUv.y));
  gl_FragColor = vec4(mix(uCol, vec3(0.85, 0.78, 0.68), 0.45) * a * up * uHeat * 0.025, 1.0);
}
`
// dust in the house's air, catching the shafts by day and the lamps by night
const MOTE_VERT = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uLit;
uniform float uScale;
varying float vA;
void main() {
  vec3 p = vec3(aSeed.x + sin(uTime * 0.13 + aSeed.z * 9.0) * 0.25, mod(aSeed.z * ${GH.toFixed(1)} + uTime * 0.035, ${GH.toFixed(1)}), aSeed.y + cos(uTime * 0.11 + aSeed.x) * 0.2);
  vA = uLit * (0.4 + 0.6 * sin(uTime * (0.7 + aSeed.z) + aSeed.x * 7.0) * 0.5 + 0.3);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = min(uScale * 0.4 / -mv.z, 4.0);
  gl_Position = projectionMatrix * mv;
}
`
const RAIN_VERT = /* glsl */ `
attribute vec4 aDrop; // x, z, phase, which end (0 head, 1 tail)
uniform float uTime;
uniform float uRain;
varying float vA;
void main() {
  float H = 16.0;
  float y = H - mod(uTime * 9.0 + aDrop.z * H, H) + aDrop.w * 0.5;
  vec3 p = vec3(aDrop.x - (H - y) * 0.05, y, aDrop.y);
  float r = mod(p.x, ${SPAN.toFixed(1)});
  float roof = ${GH.toFixed(2)} + ${(RH - GH).toFixed(2)} * (1.0 - abs(r - ${(SPAN / 2).toFixed(1)}) / ${(SPAN / 2).toFixed(1)});
  bool over = p.x > 0.0 && p.x < ${W.toFixed(1)} && p.z < 0.0 && p.z > ${(-D).toFixed(1)} && p.y < roof;
  vA = (step(fract(aDrop.z * 7.31), uRain) * (over || p.y < 0.0 ? 0.0 : 1.0)) * (0.2 + 0.8 * aDrop.w);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`
const RAIN_FRAG = /* glsl */ `
uniform vec3 uCol;
varying float vA;
void main() { gl_FragColor = vec4(uCol * vA, 1.0); }
`

/** a soft radial glow, for the sun's bead */
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.15, 'rgba(255,255,255,0.55)')
  r.addColorStop(0.45, 'rgba(255,255,255,0.12)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/** the house's floor: a white woven ground sheet with the joins of its rolls and the scuffs of the paths */
function sheetTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#bdbab2'
  g.fillRect(0, 0, 512, 512)
  const r = rng(13)
  for (let y = 0; y < 512; y += 3) {
    g.fillStyle = `rgba(255,255,255,${0.05 + 0.05 * r()})`
    g.fillRect(0, y, 512, 1)
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() < 0.6 ? `rgba(60,58,52,${0.06 * r()})` : `rgba(255,255,255,${0.08 * r()})`
    g.fillRect(r() * 512, r() * 512, 2 + r() * 10, 1 + r() * 3)
  }
  g.fillStyle = 'rgba(70,68,62,0.25)'
  g.fillRect(0, 0, 512, 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(W / 4, D / 4)
  t.anisotropy = 8
  return t
}

/** a straight run of tube between points (pipes, the arc's ticks) */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 8) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r, r, len, sides, 1, true)
  g.translate(0, len / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()))
  g.translate(a.x, a.y, a.z)
  return g
}

type Member = { p: [number, number, number]; s: [number, number, number]; rx?: number; ry?: number; rz?: number }

/** the steel and aluminium: columns, gutters, ridges, glazing bars, trusses, lattice girders, wall mullions */
function structure(): Member[] {
  const out: Member[] = []
  const at = (z: number) => (z === 0 ? -0.05 : z === -D ? -D + 0.05 : z)
  for (let k = 0; k <= BAYS; k++) {
    const x = k * SPAN
    for (const z of FRAMES) out.push({ p: [x, GH / 2, at(z)], s: [0.11, GH, 0.11] })
    // the gutter: a wide aluminium channel with its lips
    out.push({ p: [x, GH + 0.02, -D / 2], s: [0.26, 0.12, D] })
    out.push({ p: [x - 0.12, GH + 0.1, -D / 2], s: [0.02, 0.06, D] })
    out.push({ p: [x + 0.12, GH + 0.1, -D / 2], s: [0.02, 0.06, D] })
    // the lattice girder under it, between the columns: a bottom chord and a zigzag up to the gutter
    if (k > 0 && k < BAYS) {
      out.push({ p: [x, GH - 0.55, -D / 2], s: [0.05, 0.05, D] })
      for (let i = 0; i < D * 2; i++) out.push({ p: [x, GH - 0.27, -(i + 0.5) * 0.5], s: [0.03, 0.76, 0.03], rx: (i % 2 ? 1 : -1) * (Math.PI / 4) })
    }
  }
  const slope = Math.atan2(RH - GH, SPAN / 2)
  const rafter = Math.hypot(RH - GH, SPAN / 2)
  const bars = Math.round(D / 0.83)
  for (let k = 0; k < BAYS; k++) {
    const x0 = k * SPAN
    out.push({ p: [x0 + SPAN / 2, RH, -D / 2], s: [0.07, 0.08, D] }) // the ridge
    for (let i = 0; i <= bars; i++) {
      const z = -Math.min(D - 0.02, i * (D / bars)) - 0.01
      out.push({ p: [x0 + SPAN / 4, (GH + RH) / 2, z], s: [rafter, 0.045, 0.03], rz: slope })
      out.push({ p: [x0 + (3 * SPAN) / 4, (GH + RH) / 2, z], s: [rafter, 0.045, 0.03], rz: -slope })
    }
    // the truss at each frame: a tie at the gutter line, a king post, two struts
    for (const z of FRAMES) {
      const zz = z === 0 ? -0.04 : z === -D ? -D + 0.04 : z
      out.push({ p: [x0 + SPAN / 2, GH, zz], s: [SPAN, 0.07, 0.07] })
      out.push({ p: [x0 + SPAN / 2, (GH + RH) / 2, zz], s: [0.05, RH - GH, 0.05] })
      const st = Math.atan2(0.4, 1)
      out.push({ p: [x0 + SPAN / 2 - 0.5, GH + 0.2, zz], s: [Math.hypot(1, 0.4), 0.04, 0.04], rz: -st })
      out.push({ p: [x0 + SPAN / 2 + 0.5, GH + 0.2, zz], s: [Math.hypot(1, 0.4), 0.04, 0.04], rz: st })
    }
  }
  // the side walls' mullions and rails
  for (const x of [0, W]) {
    for (let i = 1; i < D; i++) out.push({ p: [x, GH / 2, -i], s: [0.04, GH, 0.04] })
    for (const y of [0.7, 2.4, 3.6]) out.push({ p: [x, y, -D / 2], s: [0.045, 0.045, D] })
  }
  // the back gable's mullions, up to the roof line
  for (let i = 1; i < W; i++) {
    if (i % SPAN === 0) continue
    const h = roofY(i)
    out.push({ p: [i, h / 2, -D + 0.02], s: [0.04, h, 0.04] })
  }
  for (const y of [0.7, 2.4]) out.push({ p: [W / 2, y, -D + 0.02], s: [W, 0.045, 0.045] })
  return out
}

export default function GreenhouseCutaway3D(props: Cutaway3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const tagOut = useRef<HTMLDivElement>(null)
  const tagIn = useRef<HTMLDivElement>(null)
  const tagTank = useRef<HTMLDivElement>(null)
  const tagFloor = useRef<HTMLDivElement>(null)
  const live = useRef(props)
  live.current = props
  const stageRef = useRef<Stage | null>(null)
  // the arc's month ticks are built with the model: rebuild if the year's light changes
  const lightsKey = props.lights.map((v) => v.toFixed(3)).join(',')

  useEffect(() => {
    const el = ref.current
    const box = host.current
    if (!el || !box) return
    const first = live.current
    const reduce = first.reduce
    const kit = { heated: first.kit.heated, lit: first.kit.lit, screen: first.kit.screen, co2: !!first.kit.co2, chp: !!first.kit.chp }
    const arch = CROP3D[first.crop.id] ?? CROP3D.tomato
    const milk = { glass: 0, poly: 0.3, film2: 0.42, film: 0.3 }[first.cover] ?? 0
    const L0 = first.look
    // the animated state starts at the month itself: the first frame is already right
    const cur = {
      light: L0.light,
      inLight: L0.inLight,
      heat: L0.heat,
      lamps: L0.lamps ? 1 : 0,
      ripple: L0.lamps ? 2 : 0,
      screen: L0.screen ? 1 : 0,
      shade: L0.shade ? 1 : 0,
      rain: rainShare(L0.rainMm),
      cloud: L0.rainMm > 45 ? 1 : 0,
      night: L0.night ? 1 : 0,
      level: L0.level,
      growth: L0.growth,
      harvest: L0.harvest ? 1 : 0,
      inCrop: L0.inCrop ? 1 : 0,
      vent: L0.vent,
      snow: Math.max(L0.snow, L0.frost * 0.32),
      wet: L0.wet,
      green: L0.green,
      fog: L0.fog,
    }
    let composer: EffectComposer | null = null
    let pointer = { x: 0, y: 0 }
    const parallax = { x: 0, y: 0 }
    const disposables: { dispose: () => void }[] = []
    const keep = <T extends { dispose: () => void }>(x: T) => {
      disposables.push(x)
      return x
    }
    const sunDir = new THREE.Vector3()
    const sunCol = new THREE.Color()
    const tmp = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    let lastG = -1
    let lastH = -1
    let updatePlants: (g: number, h: number) => void = () => {}
    let updateInside: (inCrop: number, time: number) => void = () => {}
    let updateVents: (v: number) => void = () => {}
    let updateLamps: (ripple: number) => void = () => {}
    // the high wires' strings go up with the crop and come down with it
    let strings: THREE.LineBasicMaterial | null = null
    const noise = keep(noiseTexture())
    // uniforms shared by several materials
    const U = {
      time: { value: 0 },
      sun: { value: new THREE.Vector3() },
      sunCol: { value: new THREE.Color() },
      light: { value: 0 },
      heat: { value: 0 },
      lamp: { value: 0 },
      rain: { value: 0 },
      beam: { value: 0 },
      glow: { value: 0 },
      scale: { value: 400 },
      skyHi: { value: new THREE.Color(0.05, 0.055, 0.065) },
      skyLo: { value: new THREE.Color(0.012, 0.013, 0.016) },
      roofSnow: { value: 0 },
      fog: { value: 0 },
      noise: { value: noise as THREE.Texture },
    }
    const SU = { uSnow: { value: 0 }, uWet: { value: 0 }, uGreen: { value: 0 }, uNoise: { value: noise as THREE.Texture | null }, uMask: { value: null as THREE.Texture | null } }
    const fruitCol = new THREE.Color(arch.fruit ? arch.fruitCol : arch.leafCol)
    const skyDay = new THREE.Color(0.08, 0.082, 0.086)
    const hemiDay = new THREE.Color(0.62, 0.64, 0.68)
    let site: ReturnType<typeof buildSite> | null = null
    let fitFor = -1
    let fitDist = 60
    let fitTarget = new THREE.Vector3()
    let fit: (cam: THREE.PerspectiveCamera, narrow: boolean) => void = () => {}

    const stage = createStage(el, {
      label: 'cutaway',
      fov: 28,
      animate: !reduce,
      maxDpr: 1.5,
      adaptive: { min: 0.75, max: 1.75 },
      onResize: (w, h) => {
        composer?.setSize(w, h)
        U.scale.value = h * 0.9
      },
      rest: (r) => restComposer(composer, r),
      render: (dt) => composer?.render(dt),
      onFrame: ({ time, dt }) => {
        const P = live.current
        const L: CutawayMonth = FORCE.length
          ? {
              ...P.look,
              ...(FORCE.includes('lamps') ? { lamps: true } : {}),
              ...(FORCE.includes('heat') ? { heat: 0.85 } : {}),
              ...(FORCE.includes('screen') ? { screen: true } : {}),
              ...(FORCE.includes('shade') ? { shade: true } : {}),
              ...(FORCE.includes('night') ? { light: 0.12, inLight: 0.08, night: true } : {}),
              ...(FORCE.includes('harvest') ? { growth: 1, harvest: true, inCrop: true } : {}),
              ...(FORCE.includes('rain') ? { rainMm: 130, wet: 1 } : {}),
              ...(FORCE.includes('snow') ? { snow: 0.9, frost: 1, wet: 0, green: 0 } : {}),
              ...(FORCE.includes('vent') ? { vent: 1 } : {}),
              ...(FORCE.includes('cold') ? { inCrop: false, growth: 0, harvest: false, lamps: false, heat: 0, screen: false, shade: false } : {}),
            }
          : P.look
        const snap = P.reduce
        const k = snap ? 1 : 1 - Math.exp(-dt * 2.6)
        const kq = snap ? 1 : 1 - Math.exp(-dt * 4)
        const kg = snap ? 1 : 1 - Math.exp(-dt * 1.9)
        const go = (key: keyof typeof cur, to: number, kk: number) => {
          const v = cur[key] + (to - cur[key]) * kk
          cur[key] = Math.abs(to - v) < 1e-4 ? to : v
        }
        go('light', L.light, k)
        go('inLight', L.inLight, k)
        go('heat', L.heat, k)
        go('lamps', L.lamps ? 1 : 0, kq)
        // the lamps come on bay by bay (a ripple across the house), and go out together
        if (L.lamps) cur.ripple = snap ? 2 : Math.min(2, cur.ripple + dt * 1.6)
        else cur.ripple = snap ? 0 : Math.max(0, cur.ripple - dt * 3)
        go('screen', L.screen ? 1 : 0, kg)
        go('shade', L.shade ? 1 : 0, kg)
        go('rain', rainShare(L.rainMm), k)
        go('cloud', L.rainMm > 45 ? 1 : 0, k)
        go('night', L.night ? 1 : 0, k)
        go('level', L.level, kg)
        go('growth', L.growth, kg)
        go('harvest', L.harvest ? 1 : 0, kg)
        go('inCrop', L.inCrop ? 1 : 0, kg)
        go('vent', L.vent, kg)
        go('snow', Math.max(L.snow, L.frost * 0.32), k)
        go('wet', L.wet, k)
        go('green', L.green, k)
        go('fog', L.fog, k)

        // the sun: on its arc, as high as the month's light; its colour from a low orange to a high straw
        const e = elevOf(cur.light)
        toSun(e, sunDir)
        sunCol.copy(SUN_LOW).lerp(SUN_HIGH, Math.min(1, cur.light * 1.15))
        U.time.value = snap ? 7.5 : time
        U.sun.value.copy(sunDir)
        U.sunCol.value.copy(sunCol)
        U.light.value = cur.light
        U.heat.value = cur.heat
        U.lamp.value = cur.lamps
        U.rain.value = cur.rain
        // a heated roof sheds its snow; an unheated one carries it
        U.roofSnow.value = cur.snow * (1 - Math.min(1, cur.heat * 6))
        U.fog.value = cur.fog * 0.8
        U.beam.value = Math.pow(Math.max(0, cur.inLight), 0.8) * (1 - cur.screen) * (1 - 0.6 * cur.shade) * (1 - 0.45 * cur.cloud) * (1 - 0.8 * U.roofSnow.value)
        U.glow.value = cur.lamps * 0.9 + cur.heat * 0.25 * (1 - cur.light) + 0.04
        U.skyHi.value.setRGB(0.05, 0.056, 0.07).lerp(skyDay, cur.light)
        SU.uSnow.value = cur.snow
        SU.uWet.value = cur.wet * (1 - cur.snow)
        SU.uGreen.value = cur.green
        moteLit.value = U.beam.value * 0.4 + cur.lamps * 0.3
        sun.position.copy(C).addScaledVector(sunDir, 40)
        sun.color.copy(sunCol)
        // a raking key and a quieter fill: the model is lit like an object on a table, its shadows doing the drawing
        sun.intensity = (0.3 + 5.0 * cur.light) * (1 - 0.28 * cur.cloud)
        rim.intensity = 0.4 + 0.75 * cur.light
        hemi.intensity = 0.12 + 0.2 * cur.light
        hemi.color.setRGB(0.4, 0.5, 0.68).lerp(hemiDay, cur.light * 0.6)
        scene.environmentIntensity = 0.1 + 0.2 * cur.light
        bead.position.copy(ARC_C).addScaledVector(sunDir, ARC_R)
        halo.position.copy(bead.position)
        ;(bead.material as THREE.MeshBasicMaterial).color.copy(sunCol).multiplyScalar(2.5 + 9 * cur.light * (1 - 0.5 * cur.cloud))
        halo.scale.setScalar(1.8 + 2.0 * cur.light)
        ;(halo.material as THREE.SpriteMaterial).color.copy(sunCol).multiplyScalar(0.3 + 0.5 * cur.light)
        sky.uniforms.uLight.value = cur.light
        sky.uniforms.uNight.value = cur.night
        sky.uniforms.uCloud.value = cur.cloud
        // the lamps, the pipes, the screens
        for (const pl of lampLights) pl.intensity = 110 * cur.lamps
        updateLamps(cur.ripple)
        pipeMat.emissiveIntensity = 3.4 * cur.heat
        // a night screen: drawn fully through the dark months, only partly where the days are long
        const drawn = cur.screen * Math.max(0.3, Math.min(1, 1.15 - cur.light))
        for (const s of screens) s.scale.x = Math.max(0.02, drawn)
        for (const s of shades) {
          s.scale.x = Math.max(0.02, cur.shade)
          s.visible = cur.shade > 0.03
        }
        if (strings) {
          strings.opacity = 0.4 * Math.min(1, cur.growth * 4)
          strings.visible = cur.growth > 0.01
        }
        updateVents(cur.vent)
        updateInside(cur.inCrop, U.time.value)
        // the crop
        if (Math.abs(cur.growth - lastG) > 1e-4 || Math.abs(cur.harvest - lastH) > 1e-4) {
          lastG = cur.growth
          lastH = cur.harvest
          updatePlants(cur.growth, cur.harvest)
        }
        site?.update({
          time: U.time.value,
          dt: snap ? 1 : dt,
          snap,
          light: cur.light,
          night: cur.night,
          snow: cur.snow,
          wet: cur.wet,
          green: cur.green,
          heat: cur.heat,
          harvest: L.harvest,
          level: cur.level,
          rain: cur.rain,
          lamps: cur.lamps,
          sunCol,
          fruitCol,
        })

        // the camera: a three-quarter view from above the road, fitted once per frame shape so the house and its
        // world read together; a slow drift (two long, unrelated swells, never a straight line) and the pointer's lean
        const cam = stage!.camera
        if (!snap) {
          parallax.x += (pointer.x - parallax.x) * Math.min(1, dt * 2.2)
          parallax.y += (pointer.y - parallax.y) * Math.min(1, dt * 2.2)
        }
        const narrow = cam.aspect < 1.5
        if (fitFor !== cam.aspect) {
          fitFor = cam.aspect
          fit(cam, narrow)
        }
        const T = snap ? 0 : time
        const yaw = snap ? 0 : Math.sin((T * Math.PI * 2) / 56) * 0.075 + Math.sin((T * Math.PI * 2) / 23 + 1.3) * 0.018 + parallax.x * 0.06
        camDir.copy(VIEW).applyAxisAngle(UP, yaw)
        camDir.y += snap ? 0 : Math.sin((T * Math.PI * 2) / 41) * 0.025 - parallax.y * 0.04
        camDir.normalize()
        const dist = fitDist * (snap ? 1 : 1 + 0.018 * Math.sin((T * Math.PI * 2) / 67 + 0.5))
        cam.position.copy(fitTarget).addScaledVector(camDir, dist)
        cam.lookAt(fitTarget)
        cam.updateMatrixWorld()

        // the labels, pinned to the model
        const r = box.getBoundingClientRect()
        const put = (node: HTMLDivElement | null, x: number, y: number, z: number) => {
          if (!node) return
          const v = tmp.set(x, y, z).project(cam)
          node.style.transform = `translate3d(${Math.round((v.x * 0.5 + 0.5) * r.width)}px, ${Math.round((-v.y * 0.5 + 0.5) * r.height)}px, 0)`
        }
        put(tagOut.current, ARC_C.x + 1.2, 0.2, ARC_C.z + 2.4)
        put(tagIn.current, W / 2, 3.1, 0)
        // (over the tank's rim: the truck parks in front of it in harvest months)
        put(tagTank.current, TANK.x + 2.4, TANK.h + 0.5, TANK.z + 0.6)
        put(tagFloor.current, 0.2, -0.15, BASE.z1)
      },
    })
    if (!stage) {
      first.onFail?.()
      return
    }
    stageRef.current = stage
    const { scene, renderer, camera } = stage
    camera.near = 2
    camera.far = 400
    // a stage rebuilt on the same canvas at a pixel ratio of 1 finds the renderer already at the canvas's size and
    // never sets the camera's aspect: set it here
    if (el.clientWidth && el.clientHeight) camera.aspect = el.clientWidth / el.clientHeight
    camera.updateProjectionMatrix()
    renderer.setClearColor(0x0a0b0e, 1)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.localClippingEnabled = true
    const pmrem = keep(new THREE.PMREMGenerator(renderer))
    const env = keep(pmrem.fromScene(new RoomEnvironment(), 0.04).texture)
    scene.environment = env
    // A found evening sky (lib/objects/cc0 - Poly Haven, CC0) takes the studio's place in the glass once its file is
    // in: a real horizon in the roof's panes, its low sun turned to where this model's sun rises and sets (AZ).
    let gone = false
    void import('../lib/objects/cc0')
      .then(({ loadSky }) => loadSky(renderer, 'evening_field'))
      .then((sky) => {
        if (gone) return
        scene.environment = sky
        scene.environmentRotation.set(0, 0.653 - Math.atan2(AZ.z, AZ.x), 0)
        stageRef.current?.invalidate()
      })
      .catch(() => {})

    /** fit the frame: the whole base (or, on a phone, the house and its tank) inside the view, a little air round it */
    fit = (cam, narrow) => {
      fitTarget = narrow ? new THREE.Vector3(9.5, 1.2, -5.5) : new THREE.Vector3(10.2, 0.5, -9.5)
      const pts = narrow
        ? [new THREE.Vector3(-1, 0, 1.4), new THREE.Vector3(W + 1, 0, 1.4), new THREE.Vector3(-1, RH, -D), new THREE.Vector3(TANK.x + 2, 0, 0), new THREE.Vector3(-1, 0, -D), new THREE.Vector3(W, RH + 0.5, -D)]
        : [
            new THREE.Vector3(BASE.x0, -BASE.depth, BASE.z1),
            new THREE.Vector3(BASE.x1, -BASE.depth, BASE.z1),
            new THREE.Vector3(BASE.x0, 0, BASE.z0),
            new THREE.Vector3(BASE.x1, 0, BASE.z0),
            new THREE.Vector3(BASE.x0 + 6, 9, BASE.z0),
          ]
      const margin = narrow ? 0.94 : 0.97
      let lo = 10
      let hi = 400
      const probe = cam.clone()
      const v = new THREE.Vector3()
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2
        probe.position.copy(fitTarget).addScaledVector(VIEW, mid)
        probe.lookAt(fitTarget)
        probe.updateMatrixWorld()
        probe.updateProjectionMatrix()
        const inside = pts.every((p) => {
          v.copy(p).project(probe)
          return Math.abs(v.x) < margin && Math.abs(v.y) < margin
        })
        if (inside) hi = mid
        else lo = mid
      }
      fitDist = hi
    }

    // ---- light ----
    const sun = new THREE.DirectionalLight(0xffffff, 2)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -29
    sun.shadow.camera.right = 29
    sun.shadow.camera.top = 26
    sun.shadow.camera.bottom = -26
    sun.shadow.camera.near = 5
    sun.shadow.camera.far = 90
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.04
    sun.shadow.radius = 2.5
    sun.target.position.set(9, 0, -9)
    scene.add(sun, sun.target)
    const hemi = new THREE.HemisphereLight(new THREE.Color(0.42, 0.5, 0.66), new THREE.Color(0.05, 0.05, 0.055), 0.3)
    scene.add(hemi)
    // a cool rim from behind, opposite the sun: it draws the roofs' far edges and the crowns out of the dark the model
    // stands in (by night it is the only light from outside: the moon)
    const rim = new THREE.DirectionalLight(new THREE.Color('#9db4d6'), 0.6)
    rim.position.set(C.x + 30, 20, C.z - 36)
    rim.target.position.copy(C)
    scene.add(rim, rim.target)
    // the lamps' light (and the house's lantern glow on the yard round it)
    const lampLights = [W / 4, (3 * W) / 4].map((x) => {
      const pl = new THREE.PointLight(SODIUM, 0, 34, 2)
      pl.position.set(x, GH - 0.9, -D / 2)
      scene.add(pl)
      return pl
    })
    // the service light of a resting house
    const service = new THREE.PointLight(new THREE.Color(1, 0.7, 0.42), 0, 12, 2)
    service.position.set(2.2, 2.4, -1.6)
    scene.add(service)

    // ---- the backdrop ----
    const sky = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uSun: U.sun, uSunCol: U.sunCol, uLight: { value: 0 }, uNight: { value: 0 }, uCloud: { value: 0 }, uTime: U.time, uNoise: U.noise },
      side: THREE.BackSide,
      depthWrite: false,
    })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 24), sky)
    dome.position.set(10, 0, -10)
    dome.renderOrder = -1
    scene.add(dome)

    // ---- the structure (its metal shared with the site) ----
    const metal = new THREE.MeshStandardMaterial({ color: '#c3c6cb', metalness: 0.85, roughness: 0.32, envMapIntensity: 0.9 })

    // ---- the site round the house ----
    site = buildSite({ heated: kit.heated, co2: kit.co2, chp: kit.chp }, SU, metal)
    scene.add(site.group)
    disposables.push(site)

    // the house's floor: a white ground sheet (it shows every shadow and every pool of light), a concrete path in front
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: keep(sheetTexture()), roughness: 0.85 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(W / 2, 0.015, -D / 2)
    floor.receiveShadow = true
    scene.add(floor)
    const path = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 1.0), new THREE.MeshStandardMaterial({ color: '#6d6b66', roughness: 0.9 }))
    path.position.set(W / 2, 0.02, -0.5)
    path.receiveShadow = true
    scene.add(path)
    // the pipes' warmth on the floor
    const floorHeat = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: FLOOR_HEAT_FRAG, uniforms: { uHeat: U.heat, uCol: { value: HEAT } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    floorHeat.rotation.x = -Math.PI / 2
    floorHeat.position.set(W / 2, 0.025, -D / 2)
    scene.add(floorHeat)

    const members = structure()
    const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), metal, members.length)
    {
      const m = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      const eul = new THREE.Euler()
      members.forEach((b, i) => {
        q.setFromEuler(eul.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0))
        frame.setMatrixAt(i, m.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(...b.s)))
      })
    }
    frame.castShadow = true
    frame.receiveShadow = true
    scene.add(frame)
    // the section line: the cut through the front frame, drawn faintly as on a drawing
    {
      const pts: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0.01), new THREE.Vector3(0, GH, 0.01)]
      for (let k = 0; k < BAYS; k++) pts.push(new THREE.Vector3(k * SPAN + SPAN / 2, RH, 0.01), new THREE.Vector3((k + 1) * SPAN, GH, 0.01))
      pts.push(new THREE.Vector3(W, 0, 0.01))
      const g = mergeGeometries(pts.slice(1).map((p, i) => keepAttrs(rod(pts[i], p, 0.018, 5))))!
      scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.34, 0.33, 0.31) })))
    }

    // ---- the cover ----
    const glassMat = new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: GLASS_FRAG,
      uniforms: {
        uSun: U.sun,
        uSunCol: U.sunCol,
        uSkyHi: U.skyHi,
        uSkyLo: U.skyLo,
        uLight: U.light,
        uMilk: { value: milk },
        uGlow: U.glow,
        uGlowCol: { value: SODIUM.clone().lerp(new THREE.Color(1, 0.85, 0.7), 0.3) },
        uSnow: U.roofSnow,
        uFog: U.fog,
        uNoise: U.noise,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    {
      const panes: THREE.BufferGeometry[] = []
      for (let k = 0; k < BAYS; k++) {
        const x0 = k * SPAN
        for (const [xa, xb] of [[x0, x0 + SPAN / 2], [x0 + SPAN / 2, x0 + SPAN]]) {
          const g = new THREE.BufferGeometry()
          const ya = roofY(xa)
          const yb = roofY(xb)
          g.setAttribute('position', new THREE.Float32BufferAttribute([xa, ya, 0, xb, yb, 0, xb, yb, -D, xa, ya, 0, xb, yb, -D, xa, ya, -D], 3))
          g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2))
          g.computeVertexNormals()
          panes.push(g)
        }
      }
      for (const x of [0, W]) {
        const g = new THREE.PlaneGeometry(D, GH)
        g.rotateY(Math.PI / 2)
        g.translate(x, GH / 2, -D / 2)
        panes.push(keepAttrs(g))
      }
      const s = new THREE.Shape()
      s.moveTo(0, 0)
      s.lineTo(0, GH)
      for (let k = 0; k < BAYS; k++) {
        s.lineTo(k * SPAN + SPAN / 2, RH)
        s.lineTo((k + 1) * SPAN, GH)
      }
      s.lineTo(W, 0)
      s.closePath()
      const g = new THREE.ShapeGeometry(s)
      g.translate(0, 0, -D)
      panes.push(keepAttrs(g))
      const pane = new THREE.Mesh(mergeGeometries(panes)!, glassMat)
      pane.renderOrder = 2
      scene.add(pane)
    }

    // ---- the roof vents: hinged at the ridge, alternating on both slopes, opened as far as the month needs ----
    {
      const VL = 1.5 // along the ridge
      const VW = 0.95 // down the slope
      const slots: { x: number; z: number; side: 1 | -1 }[] = []
      for (let k = 0; k < BAYS; k++)
        for (let j = 0; j < 5; j++) {
          const z = -1.6 - j * ((D - 3) / 4)
          slots.push({ x: k * SPAN + SPAN / 2, z, side: (j + k) % 2 ? 1 : -1 })
        }
      const ventGlass = new THREE.PlaneGeometry(VW, VL)
      ventGlass.rotateX(-Math.PI / 2)
      ventGlass.translate(-VW / 2, 0.035, 0)
      const fr = mergeGeometries([
        keepAttrs(new THREE.BoxGeometry(VW, 0.05, 0.045).translate(-VW / 2, 0.02, VL / 2)),
        keepAttrs(new THREE.BoxGeometry(VW, 0.05, 0.045).translate(-VW / 2, 0.02, -VL / 2)),
        keepAttrs(new THREE.BoxGeometry(0.045, 0.05, VL).translate(-VW, 0.02, 0)),
      ])!
      const glassI = new THREE.InstancedMesh(ventGlass, glassMat, slots.length)
      glassI.renderOrder = 2
      const frameI = new THREE.InstancedMesh(fr, metal, slots.length)
      frameI.castShadow = true
      scene.add(glassI, frameI)
      const slope = Math.atan2(RH - GH, SPAN / 2)
      const m = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      const one = new THREE.Vector3(1, 1, 1)
      const pos = new THREE.Vector3()
      const Z = new THREE.Vector3(0, 0, 1)
      const flip = new THREE.Matrix4().makeScale(-1, 1, 1)
      let last = -1
      updateVents = (v) => {
        if (Math.abs(v - last) < 1e-4) return
        last = v
        const open = v * THREE.MathUtils.degToRad(38)
        slots.forEach((s, i) => {
          // local -x runs down the slope from the hinge: the left slope turns by +slope, the right one is its mirror
          q.setFromAxisAngle(Z, slope - open)
          m.compose(pos.set(s.x, RH + 0.04, s.z), q, one)
          if (s.side > 0) m.premultiply(new THREE.Matrix4().makeTranslation(-s.x, 0, 0)).premultiply(flip).premultiply(new THREE.Matrix4().makeTranslation(s.x, 0, 0))
          glassI.setMatrixAt(i, m)
          frameI.setMatrixAt(i, m)
        })
        glassI.instanceMatrix.needsUpdate = true
        frameI.instanceMatrix.needsUpdate = true
      }
    }

    // ---- the heating: tube rails along the paths, glowing with the boiler's work ----
    const pipeMat = new THREE.MeshStandardMaterial({ color: '#8f9399', metalness: 0.8, roughness: 0.3, emissive: HEAT, emissiveIntensity: 0 })
    if (kit.heated) {
      const g: THREE.BufferGeometry[] = []
      for (const px of PIPES_X) {
        for (const dx of [-0.24, 0.24]) g.push(keepAttrs(rod(new THREE.Vector3(px + dx, 0.1, -1.0), new THREE.Vector3(px + dx, 0.1, -D + 0.25), 0.028, 10)))
        const bend = new THREE.TorusGeometry(0.24, 0.028, 8, 16, Math.PI)
        bend.rotateX(-Math.PI / 2)
        bend.translate(px, 0.1, -D + 0.25)
        g.push(keepAttrs(bend))
        g.push(keepAttrs(rod(new THREE.Vector3(px - 0.24, 0.1, -1.0), new THREE.Vector3(px - 0.24, 0.35, -0.8), 0.028, 8)))
      }
      // the header along the front, feeding each loop
      g.push(keepAttrs(rod(new THREE.Vector3(0.3, 0.35, -0.8), new THREE.Vector3(W - 0.3, 0.35, -0.8), 0.06, 12)))
      const pipes = new THREE.Mesh(mergeGeometries(g)!, pipeMat)
      pipes.castShadow = true
      scene.add(pipes)
    }

    // ---- screens under the gutters: the night (energy) screen and the shade screen, drawn across each bay ----
    const fabric = (seed: number, light: boolean) => {
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 256
      const g = c.getContext('2d')!
      g.fillStyle = light ? '#d6d2c8' : '#6b6a66'
      g.fillRect(0, 0, 64, 256)
      const r = rng(seed)
      for (let y = 0; y < 256; y += 4) {
        g.fillStyle = light ? `rgba(255,255,255,${0.15 + 0.15 * r()})` : `rgba(200,205,212,${0.25 + 0.25 * r()})`
        g.fillRect(0, y, 64, light ? 1 : 2)
      }
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(1, light ? 2.6 : 1.8)
      return keep(t)
    }
    const screenMat = new THREE.MeshStandardMaterial({ map: fabric(11, true), roughness: 0.92, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false })
    const shadeMat = new THREE.MeshStandardMaterial({ map: fabric(12, false), roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.62, depthWrite: false })
    const screens: THREE.Mesh[] = []
    const shades: THREE.Mesh[] = []
    {
      const g = new THREE.PlaneGeometry(SPAN - 0.1, D - 0.1)
      g.rotateX(-Math.PI / 2)
      g.translate((SPAN - 0.1) / 2, 0, -D / 2)
      for (let k = 0; k < BAYS; k++) {
        const sc = new THREE.Mesh(g, screenMat)
        sc.position.set(k * SPAN + 0.05, GH - 0.08, 0)
        sc.castShadow = true
        sc.visible = kit.screen
        scene.add(sc)
        screens.push(sc)
        const sh = new THREE.Mesh(g, shadeMat)
        sh.position.set(k * SPAN + 0.05, GH - 0.2, 0)
        scene.add(sh)
        shades.push(sh)
      }
    }

    // ---- lamps under the trusses: housings with their reflectors, a soft cone of light, coming on bay by bay ----
    {
      const spots: THREE.Vector3[] = []
      for (let x = 1; x < W; x += 2) for (const z of [-1.8, -4.4, -7, -9.6, -12.2]) spots.push(new THREE.Vector3(x, GH - 0.42, z))
      const housingGeo = mergeGeometries([keepAttrs(new RoundedBoxGeometry(0.52, 0.1, 0.24, 1, 0.03)), keepAttrs(new THREE.BoxGeometry(0.6, 0.03, 0.3).translate(0, -0.06, 0))])!
      const housing = new THREE.InstancedMesh(housingGeo, new THREE.MeshStandardMaterial({ color: '#2a2b2e', metalness: 0.6, roughness: 0.4 }), spots.length)
      const faces = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.012, 0.18), new THREE.MeshBasicMaterial({ color: 0xffffff }), spots.length)
      const coneMat = new THREE.ShaderMaterial({
        vertexShader: WORLD_VERT,
        fragmentShader: CONE_FRAG,
        uniforms: { uLamp: U.lamp, uCol: { value: SODIUM } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const coneGeo = new THREE.CylinderGeometry(0.2, 1.25, GH - 1.0, 20, 1, true)
      coneGeo.translate(0, -(GH - 1.0) / 2, 0)
      const cones = new THREE.InstancedMesh(coneGeo, coneMat, spots.length)
      const m = new THREE.Matrix4()
      const off = new THREE.Color(0.03, 0.03, 0.03)
      const on = SODIUM.clone().multiplyScalar(9)
      const c = new THREE.Color()
      spots.forEach((p, i) => {
        housing.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z))
        faces.setMatrixAt(i, m.makeTranslation(p.x, p.y - 0.08, p.z))
        cones.setMatrixAt(i, m.makeTranslation(p.x, p.y - 0.09, p.z))
        faces.setColorAt(i, off)
      })
      housing.castShadow = true
      cones.renderOrder = 3
      housing.visible = faces.visible = cones.visible = kit.lit
      scene.add(housing, faces, cones)
      let last = -1
      updateLamps = (rp) => {
        if (!kit.lit || Math.abs(rp - last) < 1e-3) return
        last = rp
        spots.forEach((p, i) => {
          const k = THREE.MathUtils.smoothstep(rp - (p.x / W) * 0.9 - 0.05 * Math.sin(p.z * 3), 0, 0.15)
          faces.setColorAt(i, c.copy(off).lerp(on, k))
        })
        if (faces.instanceColor) faces.instanceColor.needsUpdate = true
      }
    }

    // ---- the air inside: a faint glow when the house is lit and warm ----
    const air = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.1, GH, D - 0.1),
      new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: AIR_FRAG, uniforms: { uGlow: U.glow, uCol: { value: SODIUM } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
    )
    air.position.set(W / 2, GH / 2, -D / 2)
    air.renderOrder = 1
    scene.add(air)

    // ---- shafts of sun through the roof ----
    {
      const N = 34
      const base = new THREE.PlaneGeometry(1, 1)
      const g = new THREE.InstancedBufferGeometry()
      g.index = base.index
      g.setAttribute('position', base.getAttribute('position'))
      g.setAttribute('uv', base.getAttribute('uv'))
      const start = new Float32Array(N * 3)
      const wid = new Float32Array(N)
      const seed = new Float32Array(N)
      const r = rng(23)
      for (let i = 0; i < N; i++) {
        const x = 0.5 + r() * (W - 1)
        start[i * 3] = x
        start[i * 3 + 1] = roofY(x) - 0.05
        start[i * 3 + 2] = -0.8 - r() * (D - 1.6)
        wid[i] = 0.6 + r() * 1.4
        seed[i] = r()
      }
      g.setAttribute('aStart', new THREE.InstancedBufferAttribute(start, 3))
      g.setAttribute('aWid', new THREE.InstancedBufferAttribute(wid, 1))
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1))
      g.instanceCount = N
      const beams = new THREE.Mesh(
        g,
        new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: { uL: U.sun, uBeam: U.beam, uTime: U.time, uCol: U.sunCol }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      )
      beams.frustumCulled = false
      beams.renderOrder = 3
      scene.add(beams)
    }

    // ---- heat over the roof, dust in the house ----
    {
      const base = new THREE.PlaneGeometry(1, 1)
      const g = new THREE.InstancedBufferGeometry()
      g.index = base.index
      g.setAttribute('position', base.getAttribute('position'))
      g.setAttribute('uv', base.getAttribute('uv'))
      const spots: number[] = []
      const seeds: number[] = []
      const r = rng(5)
      for (let k = 0; k < BAYS; k++)
        for (const z of [-1.8, -5, -8.4, -11.8]) {
          spots.push(k * SPAN + SPAN / 2 + (r() - 0.5) * 0.6, RH + 0.05, z + (r() - 0.5) * 0.8)
          seeds.push(r())
        }
      g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(spots), 3))
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1))
      g.instanceCount = seeds.length
      const plumes = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, uniforms: { uTime: U.time, uHeat: U.heat, uCol: { value: HEAT } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
      plumes.frustumCulled = false
      plumes.renderOrder = 4
      scene.add(plumes)
    }
    const moteLit = { value: 0 }
    {
      const n = 420
      const a = new Float32Array(n * 3)
      const r = rng(9)
      for (let i = 0; i < n; i++) a.set([0.3 + r() * (W - 0.6), -0.3 - r() * (D - 0.6), r()], i * 3)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(a, 3))
      const pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: MOTE_VERT, fragmentShader: POINT_FRAG, uniforms: { uTime: U.time, uLit: moteLit, uScale: U.scale, uCol: U.sunCol }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      pts.frustumCulled = false
      pts.renderOrder = 4
      scene.add(pts)
    }

    // ---- rain ----
    {
      const N = 1500
      const a = new Float32Array(N * 2 * 4)
      const r = rng(31)
      for (let i = 0; i < N; i++) {
        const x = BASE.x0 + r() * (BASE.x1 - BASE.x0)
        const z = BASE.z0 + r() * (BASE.z1 - BASE.z0)
        const ph = r()
        a.set([x, z, ph, 0, x, z, ph, 1], i * 8)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3))
      g.setAttribute('aDrop', new THREE.BufferAttribute(a, 4))
      const rain = new THREE.LineSegments(
        g,
        new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: { uTime: U.time, uRain: U.rain, uCol: { value: new THREE.Color(0.04, 0.047, 0.055) } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      rain.frustumCulled = false
      rain.renderOrder = 4
      scene.add(rain)
    }

    // ---- the sun's arc: a hairline quadrant beside the house, a tick for each month's noon, the bead for this one ----
    {
      const arcPts: THREE.Vector3[] = []
      for (let i = 0; i <= 64; i++) arcPts.push(ARC_C.clone().addScaledVector(toSun(THREE.MathUtils.degToRad((i / 64) * 62)), ARC_R))
      const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts), 128, 0.025, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.34, 0.33, 0.31) }))
      scene.add(arc)
      const dots = first.lights.map((lt) => {
        const p = ARC_C.clone().addScaledVector(toSun(elevOf(lt)), ARC_R)
        return keepAttrs(new THREE.SphereGeometry(0.09, 10, 8).translate(p.x, p.y, p.z))
      })
      scene.add(new THREE.Mesh(mergeGeometries(dots)!, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.46, 0.44, 0.4) })))
      // the dial's foot: a small stone plinth
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.18, 24), new THREE.MeshStandardMaterial({ color: '#4c4a45', roughness: 0.7 }))
      foot.position.copy(ARC_C).setY(0.09)
      foot.receiveShadow = true
      scene.add(foot)
    }
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    scene.add(bead)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: keep(glowTexture()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    halo.renderOrder = 5
    scene.add(halo)

    // ---- the crop ----
    const leafTex = keep(leafTexture(arch.shape))
    {
      const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.35, alphaTest: 0.45, alphaToCoverage: true })
      // leaves stir in the fans' air, and glow faintly with the light through them (and with the lamps by night)
      leafMat.onBeforeCompile = (sh) => {
        sh.uniforms.uLeafGlow = U.lamp
        sh.uniforms.uT = U.time
        sh.uniforms.uSunT = U.sunCol
        sh.uniforms.uLightT = U.light
        sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
  #ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3 + instanceMatrix[3].y * 3.1;
  transformed.y += sin(uT * 1.4 + ph) * 0.05 * uv.y;
  transformed.x += sin(uT * 1.1 + ph * 1.3) * 0.04 * uv.y;
  #endif`,
        )
        sh.fragmentShader = 'uniform float uLeafGlow;\nuniform vec3 uSunT;\nuniform float uLightT;\n' + sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n  totalEmissiveRadiance += vColor * diffuseColor.rgb * ((0.04 + 0.12 * uLeafGlow) * vec3(1.0, 0.75, 0.45) + uSunT * 0.1 * uLightT);\n#endif',
        )
      }
      leafMat.customProgramCacheKey = () => 'gh-leaf'
      const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide })
      const stemMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5b7a3c'), roughness: 0.7 })
      const fruitMat = new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.25, metalness: 0 })
      const r = rng(41 + first.crop.id.length * 13)
      type Plant = { x: number; z: number; y0: number; hf: number; lean: number; yaw: number }
      const plants: Plant[] = []
      const y0 = arch.kind === 'vine' ? 0.5 : arch.kind === 'table' ? 1.05 : 0.02
      for (let k = 0; k < BAYS; k++)
        for (const off of ROW_OFFSETS)
          for (let z = -1.4; z > -D + 0.6; z -= arch.dz)
            plants.push({ x: k * SPAN + off + (r() - 0.5) * 0.04, z: z + (r() - 0.5) * arch.dz * 0.25, y0, hf: arch.h * (0.9 + r() * 0.2), lean: (r() - 0.5) * 0.08, yaw: r() * Math.PI * 2 })
      // the stems
      const stemGeo = new THREE.CylinderGeometry(arch.kind === 'vine' ? 0.011 : 0.016, arch.kind === 'vine' ? 0.015 : 0.022, 1, 5, 1)
      stemGeo.translate(0, 0.5, 0)
      const stems = new THREE.InstancedMesh(stemGeo, stemMat, plants.length)
      stems.castShadow = true
      scene.add(stems)
      // the leaves: fixed heights on the full-grown plant; a young plant shows the ones below its tip
      type Leaf = { p: number; f: number; yaw: number; pitch: number; roll: number; s: number; lw: number; ll: number }
      const leaves: Leaf[] = []
      plants.forEach((pl, pi) => {
        for (let i = 0; i < arch.leaves; i++) {
          const t = (i + 0.5) / arch.leaves
          const f = arch.kind === 'vine' ? t * 0.96 : arch.kind === 'bush' ? 0.12 + 0.82 * t : 0.05 + 0.5 * t * t
          const pitch = arch.kind === 'rosette' || arch.kind === 'table' ? -0.55 + t * 0.9 : arch.kind === 'bush' ? 0.1 + (1 - t) * 0.35 : -0.1 + r() * 0.5
          const s = (arch.kind === 'vine' ? 0.8 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.1)) : arch.kind === 'bush' ? 1.15 - 0.45 * t : 0.7 + 0.5 * t) * (0.85 + r() * 0.3)
          leaves.push({ p: pi, f, yaw: pl.yaw + i * 2.39996 + (r() - 0.5) * 0.5, pitch, roll: (r() - 0.5) * 0.7, s, lw: arch.leafWid, ll: arch.leafLen })
        }
      })
      const leafMesh = new THREE.InstancedMesh(leafGeo(arch.shape), leafMat, leaves.length)
      leafMesh.customDepthMaterial = depthMat
      {
        const base = new THREE.Color(arch.leafCol)
        const c = new THREE.Color()
        const old = new THREE.Color('#7d7a3e')
        // young leaves at the tip a fresher green, old ones lower down darker and a little yellowed
        leaves.forEach((l, i) => leafMesh.setColorAt(i, c.copy(base).multiplyScalar(0.7 + r() * 0.4 + 0.25 * l.f).lerp(old, r() * 0.2 * (1 - l.f))))
        if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true
      }
      leafMesh.castShadow = true
      leafMesh.receiveShadow = true
      scene.add(leafMesh)
      // the fruit
      type FruitSlot = { p: number; f: number; ang: number; out: number; drop: number; side: number; s: number; seed: number; lie: boolean }
      const slots: FruitSlot[] = []
      if (arch.fruit) {
        plants.forEach((pl, pi) => {
          if (arch.kind === 'vine') {
            const trusses = arch.fruit === 'round' || arch.fruit === 'cherry' ? [0.13, 0.22, 0.31, 0.4] : [0.16, 0.27, 0.38, 0.49]
            trusses.forEach((f, ti) => {
              const ang = pl.yaw + ti * 2.4
              const n = arch.fruit === 'round' ? 4 : arch.fruit === 'cherry' ? 7 : 1
              for (let j = 0; j < n; j++) slots.push({ p: pi, f, ang, out: 0.07 + j * (arch.fruit === 'cherry' ? 0.03 : 0.045), drop: 0.02 + j * (arch.fruit === 'cherry' ? 0.03 : 0.04), side: (j % 2 ? 1 : -1) * 0.025, s: 0.85 + r() * 0.3, seed: r(), lie: false })
            })
          } else if (arch.kind === 'bush') {
            const lie = arch.fruit === 'long'
            for (let j = 0; j < 3; j++) slots.push({ p: pi, f: lie ? 0.04 : 0.35 + j * 0.15, ang: pl.yaw + j * 2.1, out: lie ? 0.24 : 0.12, drop: 0, side: 0, s: lie ? 1.3 : 0.9 + r() * 0.3, seed: r(), lie })
          } else if (arch.kind === 'table') {
            for (let j = 0; j < 4; j++) slots.push({ p: pi, f: 0, ang: (j % 2 ? 0 : Math.PI) + (r() - 0.5) * 0.5, out: 0.16, drop: 0.04 + r() * 0.1, side: (r() - 0.5) * 0.12, s: 0.9 + r() * 0.3, seed: r(), lie: false })
          }
        })
      }
      const fruitMesh = arch.fruit ? new THREE.InstancedMesh(fruitGeo(arch.fruit), fruitMat, Math.max(1, slots.length)) : null
      if (fruitMesh) {
        const base = new THREE.Color(arch.fruitCol)
        const c = new THREE.Color()
        slots.forEach((_, i) => fruitMesh.setColorAt(i, c.copy(base).multiplyScalar(0.85 + r() * 0.3)))
        if (fruitMesh.instanceColor) fruitMesh.instanceColor.needsUpdate = true
        fruitMesh.castShadow = true
        scene.add(fruitMesh)
      }
      // flowers near the growing tip while the crop sets fruit
      const flowerMesh = arch.flower ? new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.022, 0), new THREE.MeshStandardMaterial({ color: arch.flower, roughness: 0.6, emissive: new THREE.Color(arch.flower), emissiveIntensity: 0.15 }), plants.length * 2) : null
      if (flowerMesh) scene.add(flowerMesh)
      // the growing medium: hanging substrate gutters with their slabs for the vines, raised troughs for the
      // strawberries; the drip lines; the high wires and the strings the vines climb
      if (arch.kind === 'vine' || arch.kind === 'table') {
        const zLen = D - 2.0
        const n = ROW_OFFSETS.length * BAYS
        const trough = new THREE.InstancedMesh(
          new THREE.BoxGeometry(arch.kind === 'table' ? 0.3 : 0.22, arch.kind === 'table' ? 0.16 : 0.06, zLen),
          new THREE.MeshStandardMaterial({ color: arch.kind === 'table' ? '#3b3c3f' : '#e1ded6', roughness: 0.7 }),
          n,
        )
        const m = new THREE.Matrix4()
        let i = 0
        for (let k = 0; k < BAYS; k++) for (const off of ROW_OFFSETS) trough.setMatrixAt(i++, m.makeTranslation(k * SPAN + off, y0 - (arch.kind === 'table' ? 0.09 : 0.06), -1.3 - zLen / 2))
        trough.castShadow = true
        trough.receiveShadow = true
        scene.add(trough)
        // the gutters stand on legs
        const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, y0 - 0.12, 0.025), metal, n * 5)
        let j = 0
        for (let k = 0; k < BAYS; k++) for (const off of ROW_OFFSETS) for (let s = 0; s < 5; s++) legs.setMatrixAt(j++, m.makeTranslation(k * SPAN + off, (y0 - 0.12) / 2, -1.6 - s * ((zLen - 0.6) / 4)))
        scene.add(legs)
        // the drip lines: a black hose along each gutter, a dripper's stake into each slab
        const seg: number[] = []
        for (let k = 0; k < BAYS; k++) for (const off of ROW_OFFSETS) seg.push(k * SPAN + off + 0.07, y0 + 0.02, -1.3, k * SPAN + off + 0.07, y0 + 0.02, -1.3 - zLen)
        for (const pl of plants) seg.push(pl.x + 0.07, y0 + 0.02, pl.z, pl.x + 0.02, y0 - 0.02, pl.z)
        const dg = new THREE.BufferGeometry()
        dg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
        scene.add(new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.02, 0.02, 0.02) })))
      }
      if (arch.kind === 'vine') {
        const wireY = 3.95
        const seg: number[] = []
        for (let k = 0; k < BAYS; k++) for (const off of ROW_OFFSETS) seg.push(k * SPAN + off, wireY, -1.1, k * SPAN + off, wireY, -D + 0.4)
        for (const pl of plants) seg.push(pl.x, y0, pl.z, pl.x + 0.02, wireY, pl.z)
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
        strings = new THREE.LineBasicMaterial({ color: new THREE.Color(0.36, 0.35, 0.33), transparent: true, opacity: 0.4 })
        scene.add(new THREE.LineSegments(g, strings))
      }

      const m4 = new THREE.Matrix4()
      const pos = new THREE.Vector3()
      const scl = new THREE.Vector3()
      const q = new THREE.Quaternion()
      const qi = new THREE.Quaternion()
      const eul = new THREE.Euler(0, 0, 0, 'YXZ')
      const leafQ = leaves.map((l) => new THREE.Quaternion().setFromEuler(new THREE.Euler(l.pitch, l.yaw, l.roll, 'YXZ')))
      updatePlants = (g, h) => {
        const ease = (x: number) => x * x * (3 - 2 * x)
        plants.forEach((pl, i) => {
          const H = pl.hf * g
          q.setFromEuler(eul.set(pl.lean, 0, pl.lean * 0.6))
          stems.setMatrixAt(i, m4.compose(pos.set(pl.x, pl.y0, pl.z), q, scl.set(1, Math.max(0.0005, arch.kind === 'rosette' || arch.kind === 'table' ? H * 0.4 : H), 1)))
          if (flowerMesh) {
            // two flowers just under the tip, while the plant is growing and fruiting
            for (let j = 0; j < 2; j++) {
              const y = Math.max(0, H - 0.25 - j * 0.3)
              const a = pl.yaw + j * 2.6
              const sc = g > 0.35 ? 1 : 0.0001
              flowerMesh.setMatrixAt(i * 2 + j, m4.compose(pos.set(pl.x - pl.lean * 0.6 * y + Math.cos(a) * 0.08, pl.y0 + y, pl.z + pl.lean * y + Math.sin(a) * 0.08), qi, scl.set(sc, sc, sc)))
            }
          }
        })
        stems.instanceMatrix.needsUpdate = true
        if (flowerMesh) flowerMesh.instanceMatrix.needsUpdate = true
        leaves.forEach((l, i) => {
          const pl = plants[l.p]
          const H = pl.hf * g
          const y = l.f * pl.hf
          // a leaf exists once the plant has grown past it; it unfolds over the next 30 cm (scaled for small crops)
          let s = g <= 0 ? 0 : Math.min(1, Math.max(0, (H - y) / (0.18 * pl.hf + 0.05)))
          s = ease(s)
          // high-wire crops at harvest: the bottom leaves are stripped so the fruit hangs clear
          if (arch.kind === 'vine' && l.f < 0.3) s *= 1 - 0.92 * ease(h)
          const up = Math.min(y, H)
          pos.set(pl.x - pl.lean * 0.6 * up, pl.y0 + up, pl.z + pl.lean * up)
          scl.set(l.lw * l.s * s + 1e-4, l.ll * l.s * s + 1e-4, l.ll * l.s * s + 1e-4)
          leafMesh.setMatrixAt(i, m4.compose(pos, leafQ[i], scl))
        })
        leafMesh.instanceMatrix.needsUpdate = true
        if (fruitMesh) {
          slots.forEach((sl, i) => {
            const pl = plants[sl.p]
            const H = pl.hf * g
            const y = sl.f * pl.hf
            const grow = ease(Math.min(1, Math.max(0, (h - sl.seed * 0.45) / 0.55))) * (y < H ? 1 : 0)
            const ca = Math.cos(sl.ang)
            const sa = Math.sin(sl.ang)
            pos.set(pl.x - pl.lean * 0.6 * y + ca * sl.out - sa * sl.side, pl.y0 + y - sl.drop, pl.z + pl.lean * y + sa * sl.out + ca * sl.side)
            if (sl.lie) q.setFromEuler(eul.set(0, sl.ang, Math.PI / 2 - 0.25))
            else q.setFromEuler(eul.set(0.1 * (sl.seed - 0.5), sl.ang, 0.08 * (sl.seed - 0.5)))
            const sc = sl.s * grow + 1e-4
            fruitMesh.setMatrixAt(i, m4.compose(pos, q, scl.set(sc, sc, sc)))
          })
          fruitMesh.instanceMatrix.needsUpdate = true
        }
      }
    }

    // ---- life in the house: fans, sticky cards, the bumblebee hive, the pipe-rail trolley; and the resting house's
    // stacked slabs, coiled hoses and parked trolley ----
    {
      const mm = new THREE.Matrix4()
      // horizontal airflow fans under the gutters, two per bay
      const fanSpots: THREE.Vector3[] = []
      for (let k = 0; k < BAYS; k++) for (const z of [-3.6, -9.8]) fanSpots.push(new THREE.Vector3(k * SPAN + SPAN / 2, GH - 0.55, z))
      const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(0.32, 0.045, 8, 24), new THREE.MeshStandardMaterial({ color: '#3a3c40', metalness: 0.6, roughness: 0.4 }), fanSpots.length)
      const bladeGeo = mergeGeometries([0, 1, 2].map((i) => keepAttrs(new THREE.BoxGeometry(0.28, 0.08, 0.01).translate(0.15, 0, 0).rotateX(0.35).rotateZ((i * Math.PI * 2) / 3))))!
      const blades = new THREE.InstancedMesh(bladeGeo, metal, fanSpots.length)
      fanSpots.forEach((p, i) => ring.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z)))
      scene.add(ring, blades)
      // yellow sticky cards over the rows (muted: a trap, not a highlight)
      const cardSpots: THREE.Vector3[] = []
      for (let k = 0; k < BAYS; k++) for (const o of [0.95, 3.05]) for (let z = -2.4; z > -D + 1; z -= 3.1) cardSpots.push(new THREE.Vector3(k * SPAN + o, 2.0, z))
      const cardCol = new THREE.Color('#b8a548')
      const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.25), new THREE.MeshStandardMaterial({ color: cardCol, roughness: 0.6, side: THREE.DoubleSide, emissive: cardCol, emissiveIntensity: 0.05 }), cardSpots.length)
      scene.add(cards)
      // the hive: a bone box on a post by the path, for the crops bumblebees pollinate
      const hive = new THREE.Group()
      if (arch.bees) {
        const hb = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.3, 0.32, 2, 0.03), new THREE.MeshStandardMaterial({ color: '#cfccc4', roughness: 0.7 }))
        hb.position.y = 1.15
        hb.castShadow = true
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.36), new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.6 }))
        lid.position.y = 1.32
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), metal)
        post.position.y = 0.5
        hive.add(hb, lid, post)
        hive.position.set(SPAN * 2, 0, -1.1)
        scene.add(hive)
      }
      // the pipe-rail trolley: a scissor lift riding the heating pipes (parked on the path when the house rests)
      const trolley = new THREE.Group()
      {
        const steel = new THREE.MeshStandardMaterial({ color: '#8b8f94', metalness: 0.7, roughness: 0.35 })
        const tyre = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.6 })
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 1.4), steel)
        base.position.y = 0.2
        const deck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 1.3), steel)
        deck.position.y = 1.55
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.04), steel)
        rail.position.set(0, 1.9, 0.63)
        trolley.add(base, deck, rail)
        for (const s of [-1, 1]) {
          const x1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, Math.hypot(1.2, 1.3)), steel)
          x1.position.set(s * 0.28, 0.88, 0)
          x1.rotation.x = Math.atan2(1.3, 1.2)
          const x2 = x1.clone()
          x2.rotation.x = -x1.rotation.x
          trolley.add(x1, x2)
          for (const z of [-0.55, 0.55]) {
            const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), tyre)
            wh.rotation.z = Math.PI / 2
            wh.position.set(s * 0.24, 0.1, z)
            trolley.add(wh)
          }
        }
        trolley.traverse((o) => (o.castShadow = true))
        scene.add(trolley)
      }
      // the resting house: substrate slabs stacked on pallets, hoses coiled, a work lamp on its stand
      const rest = new THREE.Group()
      {
        const slabMat = new THREE.MeshStandardMaterial({ color: '#d8d6cf', roughness: 0.55 })
        const palletMat = new THREE.MeshStandardMaterial({ color: '#6d6458', roughness: 0.9 })
        const slab = new THREE.BoxGeometry(1.0, 0.075, 0.2)
        const stackAt = (x: number, z: number, layers: number) => {
          const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1.0), palletMat)
          p.position.set(x, 0.07, z)
          rest.add(p)
          const n = layers * 4
          const im = new THREE.InstancedMesh(slab, slabMat, n)
          for (let i = 0; i < n; i++) im.setMatrixAt(i, mm.makeTranslation(x, 0.18 + Math.floor(i / 4) * 0.08, z - 0.33 + (i % 4) * 0.22))
          im.castShadow = true
          rest.add(im)
        }
        stackAt(1.0, -1.6, 9)
        stackAt(1.0, -2.8, 7)
        stackAt(2.35, -1.6, 5)
        const hoseMat = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.55 })
        for (const [x, z] of [[5.6, -1.4], [6.3, -1.9], [13.4, -1.5]] as [number, number][])
          for (let i = 0; i < 4; i++) {
            const t = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.012, 0.02, 6, 28), hoseMat)
            t.rotation.x = Math.PI / 2
            t.position.set(x, 0.04 + i * 0.04, z)
            t.castShadow = true
            rest.add(t)
          }
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), metal)
        stand.position.set(2.2, 1.1, -1.6)
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.45).multiplyScalar(5) }))
        head.position.set(2.2, 2.25, -1.6)
        rest.add(stand, head)
        scene.add(rest)
      }
      const parked = new THREE.Vector3(8.0, 0, -1.4)
      const working = new THREE.Vector3(10, 0, -6.5)
      updateInside = (k, t) => {
        // fans turn while the crop is in; cards and hive go with the crop; the resting kit shows when it is out
        fanSpots.forEach((p, i) => {
          mm.makeRotationZ(t * 9 * k + i).setPosition(p.x, p.y, p.z + 0.02)
          blades.setMatrixAt(i, mm)
        })
        blades.instanceMatrix.needsUpdate = true
        const sc = Math.max(0.0001, k)
        cardSpots.forEach((p, i) => cards.setMatrixAt(i, mm.makeScale(sc, sc, sc).setPosition(p.x, p.y, p.z)))
        cards.instanceMatrix.needsUpdate = true
        hive.visible = k > 0.5
        rest.visible = k < 0.5
        service.intensity = 9 * (1 - k)
        // the trolley rides the pipes into the crop (or stands on the path when the house rests or has no pipes)
        if (kit.heated) {
          trolley.position.lerpVectors(parked, working, k)
          trolley.position.z += k * Math.sin(t * 0.12) * 2.2
          trolley.position.y = k * 0.1
        } else trolley.position.copy(parked)
      }
    }

    // ---- the lens (lib/objects/lens): a bloom for the sun, the lamps and the glowing pipes, a filmic tone map, a
    // vignette and a fine grain; the glazing bars are hair-thin. And a tilt-shift: a model on a table is photographed
    // close - the band it stands in is sharp, the far edge and the near one fall softly out of focus, the cue that says
    // "small and made", which an evenly sharp frame never gives ----
    composer = buildLens(renderer, scene, camera, {
      tilt: { offset: 0.06, focusArea: 1.25, feather: 0.55, kernelSize: KernelSize.SMALL, resolutionScale: 0.5 },
      bloom: { luminanceThreshold: 0.9, luminanceSmoothing: 0.3, intensity: 0.7, mipmapBlur: true, radius: 0.65 },
      vignette: { offset: 0.3, darkness: 0.5 },
      grain: 0.08,
      thinLines: true,
    }).composer
    if (el.clientWidth && el.clientHeight) {
      composer.setSize(el.clientWidth, el.clientHeight)
      U.scale.value = el.clientHeight * 0.9
    }
    // nothing is drawn until the driver has linked every program in the background (lib/objects/precompile)
    stage.hold(precompile(renderer, scene, camera, composer))
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const r = box.getBoundingClientRect()
      const c = (v: number) => Math.max(-1, Math.min(1, v))
      pointer = { x: c(((e.clientX - r.left) / r.width) * 2 - 1), y: c(((e.clientY - r.top) / r.height) * 2 - 1) }
    }
    const leave = () => {
      pointer = { x: 0, y: 0 }
    }
    box.addEventListener('pointermove', move)
    box.addEventListener('pointerleave', leave)

    return () => {
      gone = true
      box.removeEventListener('pointermove', move)
      box.removeEventListener('pointerleave', leave)
      composer?.dispose()
      composer = null
      for (const d of disposables) d.dispose()
      stageRef.current = null
      stage.dispose()
    }
  }, [props.crop.id, props.cover, props.reduce, lightsKey, props.kit.heated, props.kit.lit, props.kit.screen, props.kit.co2, props.kit.chp]) // eslint-disable-line react-hooks/exhaustive-deps

  // a new month: draw it (the loop sleeps under reduced motion)
  useEffect(() => {
    stageRef.current?.invalidate()
  }, [props.look, props.labels])

  const l = props.labels
  return (
    <div ref={host} className="absolute inset-0">
      <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden max-sm:hidden" aria-hidden>
        <div ref={tagOut} className="absolute top-0 left-0">
          <div className="-translate-x-1/2 -translate-y-full pb-2 text-left">
            <div className="font-mono text-[12px] text-ink-3">outside</div>
            <div className="font-display-soft text-[30px] leading-none text-ink">{l.out}</div>
          </div>
        </div>
        <div ref={tagIn} className="absolute top-0 left-0">
          {(l.inside || l.note) && (
            <div className={`-translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-3 py-1 font-mono text-[13px] ${l.inside ? `border bg-[rgb(10_11_14/0.78)] ${l.hot ? 'border-heat text-heat' : 'border-white/15 text-ink'}` : 'bg-[rgb(10_11_14/0.62)] text-ink-2'}`}>
              {l.inside ?? l.note}
            </div>
          )}
        </div>
        <div ref={tagTank} className="absolute top-0 left-0">
          <div className="-translate-x-1/2 -translate-y-full font-mono text-[12px] whitespace-nowrap text-water">{l.tank}</div>
        </div>
        <div ref={tagFloor} className="absolute top-0 left-0">
          <div className="translate-y-1 font-mono text-[11px] whitespace-nowrap text-ink-4">{l.floor}</div>
        </div>
      </div>
    </div>
  )
}

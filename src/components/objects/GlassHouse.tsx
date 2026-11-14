// H2 under glass - the greenhouse's crossing. A Venlo glasshouse at blue hour: a ridge-and-furrow glass roof on thin
// aluminium bars, the dusk sky sliding over the panes, and the house burning warm from inside - lamps over the crop,
// condensation glowing on the glass like a lantern. The camera comes in low over the dark land, rises to the roof
// line, sinks through the glass between two gutters and ends in a path between the rows, the crop on its wires on
// both sides and the lamps running away overhead into the warm haze. Two temperatures only: the cool night outside,
// the warm light the house makes. Lazy (three.js loads only when the crossing comes near).
//
// The house does not stand alone: it has its yard (boiler house, the heat-buffer tank, a chimney breathing vapour,
// sodium lamps over wet concrete that mirrors the lit gable), a road with a lorry's headlights coming out from behind
// it, windbreak poplars and tree lines fading into a low mist, drilled fields, and on the horizon the neighbours'
// glasshouses glowing under their own light domes, below thin cloud bands that still hold the last of the day.
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { DepthOfFieldEffect, EffectComposer } from 'postprocessing'
import { buildLens, devLensOff } from '../../lib/objects/lens'
import { lean, lookAround } from '../../lib/objects/lookAround'
import { calm } from '../../lib/calm'
import { createStage } from '../../lib/objects/stage'
import { nurseryThings } from './glassHouseThings'
import type { ObjectBase } from './types'

export type GlassHouseProps = ObjectBase & {
  /** the crop in the house (a greenhouse crop id: tomato, cucumber, pepper, lettuce …) */
  crop: { id: string; name: string }
  /** supplemental lamps: a lit house burns, an unlit one glows with its work lights */
  lit?: boolean
  /** the cover: glass is clear, polycarbonate and film are milky */
  cover?: string
}

// ---------- the house: a Venlo block, the gable end facing the approach ----------
const SPAN = 4 // roof span between two gutters, m
const X0 = -16
const X1 = 16
const Z0 = -98
const Z1 = 0
const GUTTER = 5.2
const RIDGE = 0.85 // ridge rise over the gutters
const BAY = 4.5 // truss spacing along the house
const ROW = 1.6 // crop row pitch
const PATH_X = -0.8 // the path the camera walks down at the end
const WIRE = 3.8
const LAMP_Y = GUTTER - 0.78
const roofY = (x: number) => {
  const u = ((((x - X0) % SPAN) + SPAN) % SPAN) / SPAN
  return GUTTER + RIDGE * (1 - Math.abs(u * 2 - 1))
}

type Archetype = 'palmate' | 'pinnate' | 'ovate' | 'low'
function archetypeOf(id: string): Archetype {
  if (id === 'cucumber' || id === 'courgette') return 'palmate'
  if (id === 'tomato' || id === 'cherry') return 'pinnate'
  if (id === 'pepper' || id === 'eggplant') return 'ovate'
  return 'low'
}

/** deterministic, so the house looks the same on every visit */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ---------- shading: one light model for the whole scene ----------
// The dusk is a cool hemisphere; the lamps are a ceiling of warm sources over the crop (light from above, the canopy
// shading its own lower half, brighter in the paths than under the rows); outside, the house spills its light onto
// the land. Atmosphere: a warm condensation haze along the part of each view ray that runs inside the house, a thin
// cool dusk along the part outside - computed per pixel with a ray-box intersection.
const COMMON = /* glsl */ `
uniform float uLamp;
uniform vec4 uBox;
uniform float uTop;
uniform float uTime;
uniform vec3 uSunDir;
uniform float uCamIn;
uniform float uHazeIn;
uniform float uCanopy;
uniform vec3 uYard[3];
const vec3 LAMP = vec3(1.0, 0.54, 0.21);
const float GUT = ${GUTTER.toFixed(2)};
const float RID = ${RIDGE.toFixed(2)};
const float SPN = ${SPAN.toFixed(1)};
const float ROWP = ${ROW.toFixed(2)};

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

vec3 skyCol(vec3 d) {
  float up = d.y;
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float az = clamp(0.5 + 0.5 * dot(dh, normalize(uSunDir.xz)), 0.0, 1.0);
  vec3 zen = vec3(0.0045, 0.0095, 0.027);
  vec3 hor = vec3(0.072, 0.1, 0.165);
  vec3 col = mix(zen, hor, exp(-max(up, 0.0) * 4.6));
  // the last of the day: a low ember where the sun went down - narrow, the one warm thing in the sky
  col += vec3(0.3, 0.12, 0.028) * pow(az, 60.0) * exp(-max(up, 0.0) * 28.0);
  // below the horizon: the dark land
  col = mix(col, vec3(0.0045, 0.0058, 0.0085), smoothstep(0.0, -0.035, up));
  return col;
}

float roofAt(float x) {
  float u = fract((x - uBox.x) / SPN);
  return GUT + RID * (1.0 - abs(u * 2.0 - 1.0));
}
float inHouse(vec3 p) {
  float e = 0.12;
  return smoothstep(uBox.x - e, uBox.x + e, p.x) * smoothstep(uBox.y + e, uBox.y - e, p.x)
    * smoothstep(uBox.z - e, uBox.z + e, p.z) * smoothstep(uBox.w + e, uBox.w - e, p.z)
    * smoothstep(roofAt(p.x) + 0.08, roofAt(p.x) - 0.08, p.y);
}
// the length of the segment from p toward the camera (distance d) that lies inside the house's box
float pathInside(vec3 p, vec3 dir, float d) {
  vec3 bmin = vec3(uBox.x, 0.0, uBox.z);
  vec3 bmax = vec3(uBox.y, uTop, uBox.w);
  vec3 inv = 1.0 / (dir + vec3(equal(dir, vec3(0.0))) * 1e-5);
  vec3 t0 = (bmin - p) * inv;
  vec3 t1 = (bmax - p) * inv;
  vec3 tn = min(t0, t1);
  vec3 tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), max(tn.z, 0.0));
  float b = min(min(tf.x, tf.y), min(tf.z, d));
  return max(b - a, 0.0);
}

// how much of the lamps' light reaches p (inside the house): from above, the canopy shading its lower half,
// the rows shading the ground under them
float lampAt(vec3 p) {
  // a tall crop shades its own lower half; a low crop on its benches stands in the full light
  float canopy = mix(1.0, mix(0.4, 1.0, smoothstep(0.4, 3.4, p.y)), uCanopy);
  float dr = abs(p.x - (floor(p.x / ROWP + 0.5) * ROWP));
  float rows = mix(0.62, 1.0, smoothstep(0.15, 0.55, dr) + smoothstep(1.2, 2.6, p.y));
  return uLamp * canopy * min(rows, 1.0);
}

vec3 shade(vec3 p, vec3 n, vec3 alb) {
  float ins = inHouse(p);
  // the dusk: a cool hemisphere (the house's own roof shades it inside)
  vec3 amb = mix(vec3(0.0035, 0.004, 0.0055), vec3(0.03, 0.044, 0.075), n.y * 0.5 + 0.5);
  vec3 col = alb * amb * mix(1.0, 0.55, ins);
  // the lamps: a ceiling of warm sources - down onto the crop, up onto the roof's underside; and the white floor
  // cover throws some of it back up
  float above = smoothstep(${(LAMP_Y - 0.25).toFixed(2)}, ${(LAMP_Y + 0.35).toFixed(2)}, p.y);
  float top = mix(clamp(n.y * 0.6 + 0.4, 0.0, 1.0), clamp(-n.y * 0.7 + 0.3, 0.0, 1.0) * 0.8, above);
  col += alb * LAMP * 2.1 * ins * top * lampAt(p);
  col += alb * LAMP * 0.32 * ins * uLamp * clamp(-n.y * 0.7 + 0.3, 0.0, 1.0) * (1.0 - above);
  // outside: the house lights the land around it, falling off with the distance from its walls
  vec2 c = vec2(0.5 * (uBox.x + uBox.y), 0.5 * (uBox.z + uBox.w));
  vec2 h = vec2(0.5 * (uBox.y - uBox.x), 0.5 * (uBox.w - uBox.z));
  vec2 q = max(abs(p.xz - c) - h, 0.0);
  float dist = length(q);
  vec3 toH = normalize(vec3(clamp(p.x, uBox.x, uBox.y) - p.x, 2.6 - p.y, clamp(p.z, uBox.z, uBox.w) - p.z) + vec3(0.0, 1e-3, 0.0));
  float spill = (1.0 - ins) * uLamp * exp(-dist * 0.24) / (1.0 + dist * 0.5);
  col += alb * LAMP * 0.9 * spill * max(dot(n, toH), 0.0);
  // the yard's sodium lamps: a pool of light under each
  for (int i = 0; i < 3; i++) {
    vec3 dl = uYard[i] - p;
    float r2 = dot(dl, dl);
    col += alb * LAMP * 2.6 * (1.0 - ins) * max(dot(n, dl * inversesqrt(max(r2, 1e-4))), 0.0) / (1.0 + r2 * 0.07);
  }
  return col;
}
// the dusk air outside: thin overall, and a low mist lying over the land that thickens it near the ground
float duskHaze(vec3 p, float dout) {
  return 1.0 - exp(-dout * 0.0044 * (1.0 + 1.8 * exp(-max(p.y, 0.0) * 0.3) * smoothstep(70.0, 200.0, dout)));
}

vec3 atmos(vec3 col, vec3 p) {
  vec3 toC = cameraPosition - p;
  float d = max(length(toC), 1e-3);
  vec3 dir = toC / d;
  float din = pathInside(p, dir, d);
  float dout = max(d - din, 0.0);
  vec3 warm = LAMP * uLamp * uHazeIn;
  vec3 cool = skyCol(normalize(vec3(-dir.x, 0.015, -dir.z)));
  float hin = 1.0 - exp(-din * 0.032 * mix(0.35, 1.0, uCamIn));
  float hout = duskHaze(p, dout);
  // order along the ray: from the surface toward the eye
  if (inHouse(p) > 0.5) {
    col = mix(col, warm, hin);
    col = mix(col, cool, hout);
  } else {
    col = mix(col, cool, hout);
    col = mix(col, warm, hin);
  }
  return col;
}
`

const VERT = /* glsl */ `
${COMMON}
uniform float uSway;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vCol;
#ifdef LEAF
// a leaf is small: its lamp light and its haze are worked out at its corners, not at every pixel of its blade
varying float vLampK;
varying float vHin;
varying float vHout;
varying vec3 vCool;
#endif
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
  #endif
  vec3 pos = position;
  vec3 nrm = normal;
  #ifdef LEAF
    // a leaf cups along its midrib and arches toward its tip
    pos.z += pos.x * pos.x * 0.9 - pos.y * pos.y * 0.22;
    nrm = normalize(vec3(-1.8 * pos.x, 0.44 * pos.y, 1.0));
  #endif
  vec4 wp = m * vec4(pos, 1.0);
  #ifdef LEAF
    // the air the fans keep moving: leaves stir, tips most
    wp.xyz += vec3(sin(uTime * 0.9 + wp.z * 0.8 + wp.y * 1.7), 0.4 * sin(uTime * 1.3 + wp.x * 2.1), 0.0) * uSway * position.y;
  #endif
  vWorld = wp.xyz;
  vN = normalize(mat3(m) * nrm);
  vUv = uv;
  #ifdef LEAF
    vLampK = lampAt(wp.xyz) * inHouse(wp.xyz);
    vec3 toC = cameraPosition - wp.xyz;
    float d = max(length(toC), 1e-3);
    vec3 dir = toC / d;
    float din = pathInside(wp.xyz, dir, d);
    vHin = 1.0 - exp(-din * 0.032 * mix(0.35, 1.0, uCamIn));
    vHout = duskHaze(wp.xyz, max(d - din, 0.0));
    vCool = skyCol(normalize(vec3(-dir.x, 0.015, -dir.z)));
  #endif
  vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

/** plain lit surfaces: the ground, the floor cover, the plinth, the stems */
const SOLID_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uAlb;
uniform float uGround;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 alb = uAlb * vCol;
  float wet = 0.0;
  if (uGround > 0.5) {
    // the land: dark grass, a gravel apron round the house, the white ground cover inside
    vec2 c = vec2(0.5 * (uBox.x + uBox.y), 0.5 * (uBox.z + uBox.w));
    vec2 h = vec2(0.5 * (uBox.y - uBox.x), 0.5 * (uBox.w - uBox.z));
    float dist = length(max(abs(vWorld.xz - c) - h, 0.0));
    float grain = 0.75 + 0.5 * vnoise(vWorld.xz * 0.9) * vnoise(vWorld.xz * 0.13 + 3.0);
    alb = mix(vec3(0.02, 0.026, 0.022), vec3(0.075, 0.075, 0.072), smoothstep(4.5, 3.6, dist)) * grain;
    // tyre tracks in the apron
    alb *= 1.0 - 0.25 * smoothstep(0.25, 0.0, abs(fract(dist * 0.42) - 0.5)) * smoothstep(4.0, 1.5, dist);
    // the fields beyond: drilled rows running away into the dusk (they melt together with distance)
    float seen = length(cameraPosition.xz - vWorld.xz);
    float rows = smoothstep(0.25, 0.5, abs(fract(vWorld.x * 0.42 + 0.35 * vnoise(vWorld.xz * 0.04)) - 0.5) * 2.0);
    alb *= mix(1.0, 0.62 + 0.6 * rows, smoothstep(7.0, 12.0, dist) * exp(-seen * 0.016));
    // the yard: a concrete apron in front of the gable and across to the road, slab by slab
    float yard = max(
      smoothstep(-21.0, -19.0, vWorld.x) * smoothstep(48.6, 47.8, vWorld.x) * smoothstep(0.2, 0.6, vWorld.z) * smoothstep(40.0, 31.0, vWorld.z),
      smoothstep(16.6, 17.4, vWorld.x) * smoothstep(48.6, 47.8, vWorld.x) * smoothstep(-22.0, -21.0, vWorld.z) * smoothstep(24.0, 23.0, vWorld.z));
    vec3 conc = vec3(0.062, 0.064, 0.068) * (0.78 + 0.44 * vnoise(vWorld.xz * 0.7));
    vec2 slab = abs(fract(vWorld.xz / 5.0) - 0.5) * 5.0;
    conc *= 1.0 - 0.35 * smoothstep(0.07, 0.02, min(slab.x, slab.y));
    alb = mix(alb, conc, yard);
    // the road past the yard, its centre line dashed
    float road = smoothstep(3.9, 3.5, abs(vWorld.x - 52.0));
    vec3 asph = vec3(0.026, 0.027, 0.03) * (0.85 + 0.3 * vnoise(vWorld.xz * 1.3));
    asph += vec3(0.11) * smoothstep(0.1, 0.06, abs(vWorld.x - 52.0)) * step(0.55, fract(vWorld.z / 9.0)) * exp(-seen * 0.012);
    alb = mix(alb, asph, road);
    // it rained: the concrete and the road hold water in their low places
    wet = max(yard, road) * smoothstep(0.42, 0.62, vnoise(vWorld.xz * 0.42 + 7.0) * 0.7 + vnoise(vWorld.xz * 0.11 + 2.0) * 0.3);
    alb *= 1.0 - 0.45 * wet;
    float ins = inHouse(vec3(vWorld.x, 0.1, vWorld.z));
    // the cover: white woven film, with a concrete cross path at the gable end
    vec3 cover = vec3(0.5, 0.51, 0.5) * (0.9 + 0.1 * vnoise(vWorld.xz * vec2(8.0, 1.5)));
    cover = mix(cover, vec3(0.3, 0.3, 0.29), smoothstep(-2.4, -2.2, vWorld.z));
    alb = mix(alb, cover, ins);
  }
  vec3 col = shade(vWorld, n, alb);
  if (wet > 0.0) {
    // the puddles mirror what stands over them: the dusk sky, and in front of the gable the lit house itself
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
    float F = 0.03 + 0.97 * pow(clamp(1.0 - V.y, 0.0, 1.0), 5.0);
    col += skyCol(R) * F * wet * 0.8;
    if (R.z < -1e-3 && vWorld.z > uBox.w) {
      vec3 h = vWorld + R * ((uBox.w - vWorld.z) / R.z);
      // (standing water is never a clean mirror: the gable's image is soft at its edges and broken by ripples)
      float inG = smoothstep(uBox.x - 2.5, uBox.x + 2.5, h.x) * smoothstep(uBox.y + 2.5, uBox.y - 2.5, h.x)
        * smoothstep(0.2, 1.4, h.y) * smoothstep(GUT + RID + 1.2, GUT - 1.0, h.y);
      // brightest where the lamps hang, the crop's dark band below them
      float band = 0.25 + 0.75 * smoothstep(2.4, 4.2, h.y);
      float ripple = 0.7 + 0.3 * vnoise(vec2(vWorld.x * 2.6, vWorld.z * 0.5));
      col += LAMP * uLamp * 1.5 * inG * band * ripple * F * wet;
    }
  }
  gl_FragColor = vec4(atmos(col, vWorld), 1.0);
}
`

/** a scanned thing in the yard (lib/objects/cc0): its own colour from its map, the shade it holds in its creases
 *  from the scan's occlusion, lit by the same light as everything else here */
const SCAN_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uMap;
uniform sampler2D uArm;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 alb = texture2D(uMap, vUv).rgb * mix(0.4, 1.0, texture2D(uArm, vUv).r);
  // (what stands on the ground is darker toward its foot: the ground's own shade on it)
  vec3 col = shade(vWorld, n, alb) * mix(0.6, 1.0, smoothstep(0.0, 0.35, vWorld.y));
  gl_FragColor = vec4(atmos(col, vWorld), 1.0);
}
`

/** aluminium, steel and wet glossy fruit: lit like a solid, plus a reflection of the dusk sky outside and of the
 *  ceiling of lamps inside */
const METAL_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uAlb;
uniform float uSpec;
uniform float uGloss;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vCol;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 alb = uAlb * vCol;
  vec3 col = shade(vWorld, n, alb);
  float F = uSpec + (1.0 - uSpec) * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
  vec3 R = reflect(-V, n);
  float ins = inHouse(vWorld);
  // outside it mirrors the dusk; inside, the lamps hanging over it
  vec3 env = skyCol(R) * (1.0 - ins);
  env += LAMP * uLamp * ins * (0.06 + 1.8 * pow(max(R.y, 0.0), uGloss));
  // and the glow of the house, seen from outside
  env += LAMP * uLamp * 0.05 * (1.0 - ins) * max(-R.z, 0.0);
  col += env * F * mix(vec3(1.0), alb * 3.0, 0.25);
  gl_FragColor = vec4(atmos(col, vWorld), 1.0);
}
`

/** leaves: a procedural blade (palmate, pinnate or ovate), lamp light from above, and seen from below the light
 *  coming through it */
const LEAF_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uAlb;
uniform float uShape;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vCol;
varying float vLampK;
varying float vHin;
varying float vHout;
varying vec3 vCool;
float ell(vec2 q, vec2 c, float ang, vec2 r) {
  vec2 d = q - c;
  float s = sin(ang), co = cos(ang);
  d = vec2(co * d.x - s * d.y, s * d.x + co * d.y);
  return length(d / r);
}
void main() {
  vec2 q = vUv - vec2(0.5, 0.0);
  float vein = 1.0;
  if (uShape < 0.5) {
    // palmate (cucumber): five shallow lobes round a heart-shaped base
    vec2 o = q - vec2(0.0, 0.47);
    float a = atan(o.x, o.y);
    float r = length(o);
    float lobes = 0.78 + 0.22 * pow(abs(cos(a * 2.5)), 0.8);
    float R = 0.47 * lobes * (1.0 - 0.55 * smoothstep(2.5, 3.14, abs(a)));
    R *= 1.0 - 0.03 * (0.5 + 0.5 * sin(a * 34.0));
    if (r > R) discard;
    // pale veins running out to the lobes, the blade darker toward its edge
    float vl = 1.0 - smoothstep(0.0, 0.035, abs(sin(a * 2.5)) * r * 3.0);
    vein = (0.82 + 0.3 * smoothstep(R, 0.0, r)) * (1.0 + 0.45 * vl * smoothstep(0.02, 0.1, r));
  } else if (uShape < 1.5) {
    // pinnate (tomato): leaflets in pairs along a rachis, one at the tip
    float m = 9.0;
    m = min(m, ell(q, vec2(-0.17, 0.28), -0.9, vec2(0.15, 0.08)));
    m = min(m, ell(q, vec2(0.17, 0.32), 0.9, vec2(0.15, 0.08)));
    m = min(m, ell(q, vec2(-0.18, 0.55), -0.8, vec2(0.17, 0.09)));
    m = min(m, ell(q, vec2(0.18, 0.59), 0.8, vec2(0.17, 0.09)));
    m = min(m, ell(q, vec2(-0.1, 0.13), -1.1, vec2(0.08, 0.05)));
    m = min(m, ell(q, vec2(0.1, 0.15), 1.1, vec2(0.08, 0.05)));
    m = min(m, ell(q, vec2(0.0, 0.84), 0.0, vec2(0.11, 0.16)));
    float rach = step(abs(q.x), 0.018) * step(q.y, 0.85);
    if (m > 1.0 && rach < 0.5) discard;
    vein = 0.86 + 0.14 * smoothstep(0.0, 0.25, m);
  } else {
    // ovate (pepper, aubergine), a point at the tip
    float w = 0.36 * sin(3.14159 * pow(clamp(vUv.y, 0.0, 1.0), 0.8));
    if (abs(q.x) > w || vUv.y < 0.04) discard;
    vein = 0.84 + 0.16 * smoothstep(0.0, 0.04, abs(q.x));
  }
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(n, V) < 0.0) n = -n;
  vec3 alb = uAlb * vCol * vein;
  // the house's light: the cool dusk through the roof, the lamps from above, the floor's bounce from below
  vec3 col = alb * mix(vec3(0.0035, 0.004, 0.0055), vec3(0.03, 0.044, 0.075), n.y * 0.5 + 0.5) * 0.55;
  col += alb * LAMP * 2.1 * clamp(n.y * 0.6 + 0.4, 0.0, 1.0) * vLampK;
  col += alb * LAMP * 0.32 * uLamp * clamp(-n.y * 0.7 + 0.3, 0.0, 1.0) * step(0.01, vLampK);
  // the light through the blade: a leaf seen from below glows yellow-green against the lamps
  float under = clamp(-n.y, 0.0, 1.0);
  col += vec3(0.16, 0.3, 0.035) * vCol * vein * LAMP * 1.2 * vLampK * under * under;
  // a waxy sheen toward the lamps
  vec3 R = reflect(-V, n);
  col += LAMP * vLampK * 0.12 * pow(max(R.y, 0.0), 6.0) * (0.04 + 0.96 * pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 4.0));
  // the warm air of the house, then the dusk if the eye is outside
  col = mix(col, LAMP * uLamp * uHazeIn, vHin);
  col = mix(col, vCool, vHout);
  gl_FragColor = vec4(col, 1.0);
}
`

/** the luminaires' lamps and the far houses' glow: light itself, through the haze */
const EMIT_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uEmit;
varying vec3 vWorld;
varying vec3 vCol;
void main() {
  vec3 col = uEmit * vCol * uLamp;
  gl_FragColor = vec4(atmos(col, vWorld), 1.0);
}
`

/** the glass: the dusk sky mirrored at grazing angles, condensation lit from inside (the lantern), and a little of
 *  what is behind taken away. Premultiplied: rgb is what the pane adds, alpha what it hides. */
const GLASS_FRAG = /* glsl */ `
${COMMON}
uniform float uMilk;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(n, V) < 0.0) n = -n;
  float cosT = clamp(dot(n, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
  vec3 R = reflect(-V, n);
  // outside the panes mirror the sky; from inside they mirror the lit house
  vec3 refl = mix(skyCol(R), LAMP * uLamp * 0.05, uCamIn);
  // condensation: fine droplets running down the panes, lit by the lamps under them
  float streak = vnoise(vec2((vWorld.x + vWorld.z) * 9.0, vWorld.y * 0.7 + vWorld.x * 0.3)) * vnoise(vec2(vWorld.z * 3.1, vWorld.x * 0.9));
  float cond = uMilk * (0.55 + 0.9 * streak);
  vec3 glow = LAMP * uLamp * cond * (0.5 + 1.3 * (1.0 - cosT));
  float a = clamp(F * 0.92 + cond * 0.5 + 0.03, 0.0, 0.96);
  vec3 col = refl * (F * 1.35 + 0.05 * (1.0 - uCamIn)) + glow;
  // only the outdoor stretch of the view ray hazes the pane
  vec3 toC = cameraPosition - vWorld;
  float d = length(toC);
  float hout = 1.0 - exp(-d * 0.0044 * (1.0 - uCamIn));
  col = mix(col, skyCol(normalize(vec3(-toC.x, 0.015 * d, -toC.z))) * a, hout);
  gl_FragColor = vec4(col, a);
}
`

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const SKY_FRAG = /* glsl */ `
${COMMON}
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyCol(d);
  vec2 dh = normalize(d.xz + vec2(1e-5));
  float az = clamp(0.5 + 0.5 * dot(dh, normalize(uSunDir.xz)), 0.0, 1.0);
  // the early stars, where the blue is deepest: a sparse bright layer and a fine faint one
  vec2 g = floor(d.xz / max(d.y, 0.05) * 90.0);
  float s = step(0.9965, hash2(g)) * smoothstep(0.25, 0.6, d.y);
  col += vec3(0.5, 0.55, 0.65) * s * (0.4 + 0.6 * hash2(g + 7.0)) * 0.6;
  vec2 g2 = floor(d.xz / max(d.y, 0.05) * 210.0);
  col += vec3(0.42, 0.47, 0.6) * step(0.994, hash2(g2)) * smoothstep(0.12, 0.45, d.y) * hash2(g2 + 3.0) * 0.22 * (0.8 + 0.2 * sin(uTime * 1.7 + hash2(g2) * 40.0));
  // thin cloud bands low over the land: slate against the dusk, their undersides still holding the last of the day
  float ang = atan(d.z, d.x);
  float band = vnoise(vec2(ang * 2.6 + uTime * 0.004, d.y * 34.0 + 1.7)) * 0.65 + vnoise(vec2(ang * 7.0, d.y * 80.0)) * 0.35;
  float cl = smoothstep(0.5, 0.74, band) * smoothstep(0.012, 0.05, d.y) * exp(-d.y * 6.5);
  vec3 cloud = mix(vec3(0.03, 0.04, 0.062), vec3(0.34, 0.15, 0.06), pow(az, 7.0) * exp(-d.y * 9.0));
  col = mix(col, cloud, cl * 0.75);
  // the neighbours: every nursery on the plain throws a dome of sodium light into the mist above it
  float dome = pow(max(dot(dh, normalize(vec2(0.72, -0.69))), 0.0), 26.0) + 0.8 * pow(max(dot(dh, normalize(vec2(-0.55, -0.83))), 0.0), 40.0) + 0.6 * pow(max(dot(dh, normalize(vec2(0.12, -0.99))), 0.0), 70.0);
  col += LAMP * uLamp * 0.06 * dome * exp(-max(d.y, 0.0) * 13.0) * smoothstep(-0.01, 0.01, d.y);
  gl_FragColor = vec4(col, 1.0);
}
`

/** condensation and dust hanging in the lamp light inside the house */
const MOTE_VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute float aSeed;
varying float vSeed;
varying float vNear;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.17 + aSeed * 40.0) * 0.22;
  p.y += sin(uTime * 0.23 + aSeed * 17.0) * 0.16 + uTime * 0.012;
  p.z += cos(uTime * 0.13 + aSeed * 23.0) * 0.25;
  p.y = 0.4 + mod(p.y - 0.4, 4.4);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vSeed = aSeed;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uScale * (0.5 + aSeed * 0.9) / -mv.z, uScale * 0.7);
  vNear = smoothstep(0.4, 1.4, -mv.z) * (1.0 - smoothstep(14.0, 30.0, -mv.z));
}
`
const MOTE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLamp;
uniform float uCamIn;
varying float vSeed;
varying float vNear;
varying vec3 vWorld;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  float tw = 0.6 + 0.4 * sin(uTime * (0.8 + vSeed * 1.6) + vSeed * 50.0);
  float a = exp(-r * 16.0);
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * 0.5 * uLamp * tw * a * vNear * uCamIn, 1.0);
}
`

/** the chimney's vapour: soft puffs rising and leaning with the wind, lit warm from the yard below, cool above */
const PLUME_VERT = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute float aSeed;
varying float vAge;
varying float vSeed;
void main() {
  float age = fract(aSeed * 7.31 + uTime * 0.045);
  vec3 p = position;
  p.y += age * 17.0;
  p.x += age * age * 15.0 + sin(aSeed * 40.0 + uTime * 0.3) * (0.3 + age * 1.6);
  p.z += cos(aSeed * 23.0 + uTime * 0.23) * (0.3 + age * 1.4) - age * 4.0;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uScale * (1.2 + age * 6.5) / -mv.z, 220.0);
  vAge = age;
  vSeed = aSeed;
}
`
const PLUME_FRAG = /* glsl */ `
uniform float uLamp;
varying float vAge;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  float a = exp(-r * 13.0) * smoothstep(0.0, 0.07, vAge) * (1.0 - vAge) * (1.0 - vAge) * 0.2;
  vec3 col = mix(vec3(1.0, 0.56, 0.25) * 0.5 * uLamp, vec3(0.07, 0.095, 0.15), smoothstep(0.0, 0.5, vAge + c.y * 0.3));
  gl_FragColor = vec4(col * a, a);
}
`

// ---------- geometry ----------
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** trees as the dusk shows them: poplars as tall spindles, the others as a few lumps of crown on a short trunk */
function treesGeometry(list: { x: number; z: number; h: number; w: number }[], seed: number) {
  const r = rng(seed)
  const parts: THREE.BufferGeometry[] = []
  const lump = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, spindle: boolean) => {
    const g = new THREE.SphereGeometry(1, 8, spindle ? 10 : 6)
    const pos = g.attributes.position
    const k = r() * 10
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const rough = 1 + 0.16 * Math.sin(x * 3.1 + k) * Math.cos(z * 2.7 + k * 1.3) + 0.1 * Math.sin(y * 6.3 + k * 0.7)
      // a poplar is widest a third of the way up and runs out to a point
      const shape = spindle ? 0.55 + 0.45 * Math.sin(Math.PI * Math.pow((1 - y) / 2, 0.75)) - 0.25 * Math.max(0, y) : 1
      pos.setXYZ(i, x * rough * shape, y, z * rough * shape)
    }
    g.computeVertexNormals()
    g.scale(rx, ry, rz)
    g.translate(cx, cy, cz)
    parts.push(g)
  }
  for (const t of list) {
    if (t.w < 2.5) lump(t.x, t.h * 0.54, t.z, t.w * 0.5, t.h * 0.47, t.w * 0.5, true)
    else {
      const n = 3 + Math.floor(r() * 2)
      for (let j = 0; j < n; j++) lump(t.x + (r() - 0.5) * t.w * 0.9, t.h * (0.5 + r() * 0.26), t.z + (r() - 0.5) * t.w * 0.9, t.w * (0.42 + r() * 0.24), t.h * (0.2 + r() * 0.11), t.w * (0.42 + r() * 0.24), false)
    }
    parts.push(new THREE.CylinderGeometry(t.w * 0.05, t.w * 0.08, t.h * 0.34, 5).translate(t.x, t.h * 0.17, t.z))
  }
  return mergeGeometries(parts)!
}

/** every bar, gutter, truss and post of the frame: one unit box, a matrix each */
function frameMatrices() {
  const out: THREE.Matrix4[] = []
  const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rot?: THREE.Euler) => {
    const q = new THREE.Quaternion()
    if (rot) q.setFromEuler(rot)
    out.push(new THREE.Matrix4().compose(V3(cx, cy, cz), q, V3(sx, sy, sz)))
  }
  const len = Z1 - Z0
  const cz = (Z0 + Z1) / 2
  const slope = Math.atan2(RIDGE, SPAN / 2)
  const slopeLen = Math.hypot(RIDGE, SPAN / 2)
  for (let gx = X0; gx <= X1 + 1e-6; gx += SPAN) {
    // the gutters, the house's long valleys
    box(gx, GUTTER - 0.06, cz, 0.24, 0.16, len)
  }
  for (let sx = X0; sx < X1 - 1e-6; sx += SPAN) {
    const mid = sx + SPAN / 2
    box(mid, GUTTER + RIDGE + 0.02, cz, 0.06, 0.07, len) // the ridge
    // the glazing bars, ridge to gutter, one every pane's width along the house
    for (let z = Z1 - 0.02; z >= Z0 - 0.01; z -= 1.25) {
      for (const side of [-1, 1]) {
        box(mid + side * SPAN / 4, GUTTER + RIDGE / 2 + 0.015, z, slopeLen, 0.045, 0.032, new THREE.Euler(0, 0, -side * slope))
      }
    }
  }
  // the trusses: lattice girders under the gutters, posts on a 8 x 4.5 m grid
  for (let z = Z1; z >= Z0 - 1e-6; z -= BAY) {
    box(0, GUTTER - 0.62, z, X1 - X0, 0.06, 0.05)
    box(0, GUTTER - 0.15, z, X1 - X0, 0.06, 0.05)
    for (let x = X0; x < X1 - 1e-6; x += 1) {
      const lean = Math.atan2(0.47, 1) * ((Math.round(x) & 1) ? 1 : -1)
      box(x + 0.5, GUTTER - 0.385, z, Math.hypot(1, 0.47), 0.035, 0.035, new THREE.Euler(0, 0, lean))
    }
    for (const x of [X0, -12, -4, 4, 12, X1]) box(x, (GUTTER - 0.1) / 2, z, 0.12, GUTTER - 0.1, 0.12)
  }
  // the side walls' and gable ends' bars
  for (let z = Z1; z >= Z0; z -= 1.25) {
    for (const x of [X0, X1]) box(x, GUTTER / 2, z, 0.05, GUTTER, 0.04)
  }
  for (const x of [X0, X1]) {
    box(x, 0.5, cz, 0.06, 0.06, len)
    box(x, 2.6, cz, 0.05, 0.05, len)
  }
  for (const z of [Z1, Z0]) {
    for (let x = X0; x <= X1 + 1e-6; x += 1) {
      const h = roofY(x)
      box(x, h / 2, z, 0.04, h, 0.05)
    }
    box(0, 0.5, z, X1 - X0, 0.06, 0.06)
    box(0, 2.6, z, X1 - X0, 0.05, 0.05)
  }
  return out
}

/** the glass skin: sixteen roof slopes, two long walls, two sawtooth gable ends */
function glassGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const len = Z1 - Z0
  const cz = (Z0 + Z1) / 2
  const slope = Math.atan2(RIDGE, SPAN / 2)
  const slopeLen = Math.hypot(RIDGE, SPAN / 2)
  for (let sx = X0; sx < X1 - 1e-6; sx += SPAN) {
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(slopeLen, len, 1, 1)
      g.rotateX(-Math.PI / 2)
      g.rotateZ(-side * slope)
      g.translate(sx + SPAN / 2 + side * SPAN / 4, GUTTER + RIDGE / 2, cz)
      parts.push(g)
    }
  }
  for (const x of [X0, X1]) {
    const g = new THREE.PlaneGeometry(len, GUTTER - 0.5)
    g.rotateY(Math.PI / 2)
    g.translate(x, 0.5 + (GUTTER - 0.5) / 2, cz)
    parts.push(g)
  }
  const shape = new THREE.Shape()
  shape.moveTo(X0, 0.5)
  shape.lineTo(X1, 0.5)
  for (let x = X1; x >= X0 - 1e-6; x -= SPAN / 2) shape.lineTo(x, roofY(x))
  shape.lineTo(X0, 0.5)
  for (const z of [Z1, Z0]) {
    const g = new THREE.ShapeGeometry(shape)
    g.translate(0, 0, z)
    parts.push(g)
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!
  merged.deleteAttribute('uv')
  merged.computeVertexNormals()
  return merged
}

type Plant = { base: THREE.Vector3; top: THREE.Vector3; near: number; seed: number }

/** the crop: double rows on high wires (or low gutters), the path the camera walks down left open */
function plantLayout(kind: Archetype, bench: number) {
  const r = rng(kind === 'low' ? 5 : 17)
  const plants: Plant[] = []
  const H = kind === 'ovate' ? 3.0 : WIRE
  for (let k = Math.ceil((X0 + 1) / ROW); k * ROW <= X1 - 1; k++) {
    const rx = k * ROW
    const lines = kind === 'low' ? [0] : [-0.25, 0.25]
    for (const off of lines) {
      const lx = rx + off
      const corridor = Math.abs(lx - PATH_X)
      for (let z = -2.6; z > Z0 + 1.2; ) {
        // the far rows and the far end only ever show through the glass and the haze: fewer, bigger plants there
        const near = Math.max(0, 1 - corridor / 7) * Math.max(0, 1 - Math.max(0, -z - 20) / 30)
        const far = THREE.MathUtils.smoothstep(-z, 50, 90)
        const step = (kind === 'low' ? 0.32 : 0.5) * (1 + (1 - near) * 0.9 + far * 0.8)
        const bx = lx + (r() - 0.5) * 0.06
        const lean = (r() - 0.5) * 0.5
        plants.push({ base: V3(bx, kind === 'low' ? bench : 0.14, z), top: V3(bx + (r() - 0.5) * 0.08, kind === 'low' ? bench : H * (0.97 + r() * 0.05), z + lean), near, seed: r() })
        z -= step * (0.85 + r() * 0.3)
      }
    }
  }
  return plants
}

export default function GlassHouse({ progress, reduce, crop, lit = true, cover = 'glass' }: GlassHouseProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  reduce = reduce || !!reduceMotion

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // dev only: ?ghcrop=tomato shows another crop's house without re-ranking the model
    const cropId = (import.meta.env.DEV && new URLSearchParams(location.search).get('ghcrop')) || crop.id
    const kind = archetypeOf(cropId)
    const shared = {
      uLamp: { value: lit ? 1 : 0.55 },
      uBox: { value: new THREE.Vector4(X0, X1, Z0, Z1) },
      uTop: { value: GUTTER + RIDGE },
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.62, -0.06, -0.78).normalize() },
      uCamIn: { value: 0 },
      uHazeIn: { value: 0.28 },
      uCanopy: { value: kind === 'low' ? 0 : 1 },
      // the yard's lamps: over the gable door, and two on posts between the tank and the road
      uYard: { value: [V3(0, 4.1, 1.4), V3(17, 6.4, 9.5), V3(37, 6.4, 10)] },
    }
    const solid = (alb: THREE.ColorRepresentation, extra: Record<string, THREE.IUniform> = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SOLID_FRAG, uniforms: { ...shared, uSway: { value: 0 }, uAlb: { value: new THREE.Color(alb) }, uGround: { value: 0 }, ...extra } })
    const metal = (alb: THREE.ColorRepresentation, spec: number, gloss: number) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: METAL_FRAG, uniforms: { ...shared, uSway: { value: 0 }, uAlb: { value: new THREE.Color(alb) }, uSpec: { value: spec }, uGloss: { value: gloss } } })

    // ---- the camera's way in: keyframes over the crossing's progress ----
    const keys = [
      // (the opening is a wide lens from further back: the house in its yard, the road, the plain behind; the lens
      // closes as the camera comes in)
      { p: 0.0, pos: V3(-36, 1.5, 34), look: V3(7, 8.2, -8), fd: 50, fr: 46, bokeh: 0.22, fov: 50 },
      { p: 0.2, pos: V3(-30, 1.7, 28), look: V3(6.5, 7.6, -9), fd: 44, fr: 42, bokeh: 0.22, fov: 49 },
      { p: 0.35, pos: V3(-17, 4.3, 13), look: V3(0, 4.3, -18), fd: 22, fr: 22, bokeh: 0.25, fov: 45 },
      { p: 0.5, pos: V3(-6, 9.2, 4.5), look: V3(1, 5.4, -28), fd: 16, fr: 18, bokeh: 0.18, fov: 41 },
      { p: 0.64, pos: V3(-1.3, 7.2, -2.6), look: V3(-0.9, 3.6, -30), fd: 10, fr: 12, bokeh: 0.2, fov: 40 },
      { p: 0.77, pos: V3(-0.9, 4.0, -7.6), look: V3(-0.8, 2.9, -42), fd: 7, fr: 6, bokeh: 1.1, fov: 40 },
      kind === 'low' ? { p: 1.0, pos: V3(-0.8, 1.9, -12.5), look: V3(-0.8, 1.0, -80), fd: 5.5, fr: 5, bokeh: 1.5, fov: 40 } : { p: 1.0, pos: V3(-0.8, 2.0, -12.5), look: V3(-0.8, 2.6, -90), fd: 6.5, fr: 5, bokeh: 1.5, fov: 40 },
    ]
    const posCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, 'centripetal')
    const lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, 'centripetal')
    const along = (p: number) => {
      // piecewise: progress → the curve's parameter, a smoothstep inside each stretch
      const n = keys.length - 1
      let i = 0
      while (i < n - 1 && p > keys[i + 1].p) i++
      const t = THREE.MathUtils.clamp((p - keys[i].p) / (keys[i + 1].p - keys[i].p), 0, 1)
      const e = t * t * (3 - 2 * t)
      return { u: (i + THREE.MathUtils.lerp(t, e, 0.5)) / n, i, t: e }
    }
    const camPos = new THREE.Vector3()
    const camLook = new THREE.Vector3()
    const focus = new THREE.Vector3()
    let p = progress.get()
    let composer: EffectComposer | null = null
    let dof: DepthOfFieldEffect | null = null
    let sky: THREE.Mesh | null = null
    let motes: THREE.ShaderMaterial | null = null
    let plume: THREE.ShaderMaterial | null = null
    let lorry: THREE.Group | null = null
    const leafMats: THREE.ShaderMaterial[] = []

    const look = lookAround()
    const stage = createStage(el, {
      label: 'glass',
      fov: 40,
      animate: !reduce,
      onResize: (w, h) => {
        if (motes) motes.uniforms.uScale.value = h * 0.02
        if (plume) plume.uniforms.uScale.value = h * 1.2
      },
      onFrame: ({ time, dt }) => {
        const { u, i, t } = along(THREE.MathUtils.clamp(p, 0, 1))
        posCurve.getPoint(u, camPos)
        lookCurve.getPoint(u, camLook)
        // a hand-held breath, quieter inside
        const calm = 1 - shared.uCamIn.value * 0.6
        camPos.x += Math.sin(time * 0.29) * 0.04 * calm
        camPos.y += Math.sin(time * 0.41 + 1.3) * 0.025 * calm
        const cam = stage!.camera
        cam.position.copy(camPos)
        cam.lookAt(camLook)
        // the reader's hand: a lean toward the pointer - wide in the yard, close and quiet between the rows
        if (!reduce) lean(cam, look(dt), 0.055, 0.03, 0.9 * calm)
        const fov = THREE.MathUtils.lerp(keys[i].fov, keys[i + 1].fov, t)
        if (Math.abs(cam.fov - fov) > 0.01) {
          cam.fov = fov
          cam.updateProjectionMatrix()
        }
        // the lorry on the road: out from behind the house, past the yard, away (and round again)
        if (lorry) lorry.position.z = -70 + ((time * 8.5 + 50) % 140)
        if (plume) plume.uniforms.uTime.value = time
        // the camera is inside once it is under the roof between the walls
        const under = THREE.MathUtils.smoothstep(roofY(camPos.x) - camPos.y, -0.05, 0.25)
        const within = camPos.x > X0 && camPos.x < X1 && camPos.z < Z1 - 0.05 && camPos.z > Z0 ? 1 : 0
        shared.uCamIn.value = under * within
        shared.uTime.value = time
        if (sky) sky.position.copy(camPos)
        if (dof) {
          const a = keys[i]
          const b = keys[i + 1]
          const fd = THREE.MathUtils.lerp(a.fd, b.fd, t)
          dof.cocMaterial.focusRange = THREE.MathUtils.lerp(a.fr, b.fr, t)
          dof.bokehScale = THREE.MathUtils.lerp(a.bokeh, b.bokeh, t)
          focus.copy(camLook).sub(camPos).normalize().multiplyScalar(fd).add(camPos)
          dof.target = focus
        }
        for (const m of leafMats) m.uniforms.uTime.value = time
        if (motes) {
          motes.uniforms.uTime.value = time
          motes.uniforms.uCamIn.value = shared.uCamIn.value
        }
      },
    })
    if (!stage) return
    const { scene, renderer, camera } = stage
    // The house is built in steps (lib/calm): part by part, each part in a turn of the page's queue for heavy work, in
    // the pauses of the scrolling. Built in one go it was a seventh of a second of the page's thread, met by the
    // reader's next scroll. The stage draws nothing until all of it is in.
    let gone = false
    /** between two parts: on at once while this turn lasts, else in the next; false: the scene was taken down meanwhile */
    const onward = async () => {
      await calm.breathe()
      return !gone
    }
    const build = async () => {
      await calm.turn()
      if (gone) return
      camera.near = 0.06
      camera.far = 520
      camera.updateProjectionMatrix()
      renderer.setClearColor(0x0a0b0e, 1)

      // the sky, following the camera
      sky = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 24), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { ...shared }, side: THREE.BackSide, depthWrite: false }))
      sky.renderOrder = -1
      scene.add(sky)

      if (!(await onward())) return
      // the land, the gravel apron, the white floor inside
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), solid('#ffffff', { uGround: { value: 1 } }))
      ground.rotation.x = -Math.PI / 2
      ground.position.set(0, 0, -40)
      scene.add(ground)

      if (!(await onward())) return
      // the plinth: a low concrete wall the glass stands on
      const plinthGeo = mergeGeometries([
        new THREE.BoxGeometry(X1 - X0 + 0.3, 0.5, 0.18).translate(0, 0.25, Z1),
        new THREE.BoxGeometry(X1 - X0 + 0.3, 0.5, 0.18).translate(0, 0.25, Z0),
        new THREE.BoxGeometry(0.18, 0.5, Z1 - Z0).translate(X0, 0.25, (Z0 + Z1) / 2),
        new THREE.BoxGeometry(0.18, 0.5, Z1 - Z0).translate(X1, 0.25, (Z0 + Z1) / 2),
      ])!
      scene.add(new THREE.Mesh(plinthGeo, solid('#55585c')))

      if (!(await onward())) return
      // ---- the house's world ----
      const emit = (r: number, g: number, b: number) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: EMIT_FRAG, uniforms: { ...shared, uSway: { value: 0 }, uEmit: { value: new THREE.Vector3(r, g, b) } } })
      {
        const tr = rng(91)
        // the trees: a poplar windbreak beyond the road, a broken line along the left boundary, and the far edge of
        // the plain where the fields stop
        const trees: { x: number; z: number; h: number; w: number }[] = []
        for (let z = 60; z > -230; z -= 3.6 + tr() * 5.5) trees.push(tr() < 0.16 ? { x: 96 + (tr() - 0.5) * 5, z, h: 8 + tr() * 5, w: 4 + tr() * 3 } : { x: 94 + (tr() - 0.5) * 2.4, z, h: 11 + tr() * 11, w: 1.5 + tr() * 0.9 })
        for (let z = 30; z > -230; z -= 9 + tr() * 16) if (tr() > 0.25) trees.push({ x: -82 + (tr() - 0.5) * 8, z, h: 7 + tr() * 6, w: 3.4 + tr() * 2.6 })
        for (let x = -230; x < 260; x += 6 + tr() * 9) trees.push({ x, z: -236 + (tr() - 0.5) * 22, h: 8 + tr() * 9, w: 4 + tr() * 4 })
        for (const [x, z] of [[45, 22], [41.5, 27], [64, -30], [70, 8], [61, 34]]) trees.push({ x, z, h: 7 + tr() * 4, w: 3.2 + tr() * 2 })
        const wood = new THREE.Mesh(treesGeometry(trees, 7), solid('#0e1611'))
        wood.frustumCulled = false
        scene.add(wood)

        // the yard, right of the gable: the insulated heat-buffer tank, the boiler house behind it, the chimney
        const built: THREE.BufferGeometry[] = [
          new THREE.BoxGeometry(13, 6.2, 9).translate(34, 3.1, 2),
          new THREE.BoxGeometry(13.5, 0.3, 9.5).translate(34, 6.35, 2),
          new THREE.BoxGeometry(4.5, 3.2, 4).translate(43, 1.6, 4.5),
        ]
        scene.add(new THREE.Mesh(mergeGeometries(built)!, solid('#33363c')))
        const TX = 22.5
        const TZ = 6
        const steel: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(3.7, 3.7, 12, 40).translate(TX, 6, TZ), new THREE.CylinderGeometry(0.4, 3.74, 0.9, 40).translate(TX, 12.45, TZ)]
        // the tank's hoops and its ladder, the chimney, the lamp posts and their arms
        for (let y = 1.2; y < 12; y += 1.55) steel.push(new THREE.CylinderGeometry(3.76, 3.76, 0.09, 40).translate(TX, y, TZ))
        steel.push(new THREE.BoxGeometry(0.06, 12, 0.06).translate(TX - 2.4, 6, TZ + 2.92), new THREE.BoxGeometry(0.06, 12, 0.06).translate(TX - 1.95, 6, TZ + 3.24))
        for (let y = 0.6; y < 12; y += 0.42) steel.push(new THREE.BoxGeometry(0.5, 0.035, 0.035).translate(TX - 2.17, y, TZ + 3.1).rotateY(0))
        steel.push(new THREE.CylinderGeometry(0.42, 0.6, 21, 14).translate(42.5, 10.5, -1))
        for (const [x, z] of [[17, 9.5], [37, 10]]) steel.push(new THREE.CylinderGeometry(0.07, 0.1, 6.6, 6).translate(x, 3.3, z + 0.9), new THREE.BoxGeometry(0.07, 0.07, 1.0).translate(x, 6.6, z + 0.45))
        // the gable's sliding door: two glazed leaves in a heavier frame
        for (const x of [-1.7, 0, 1.7]) steel.push(new THREE.BoxGeometry(0.11, 3.5, 0.11).translate(x, 1.75, 0.1))
        for (const y of [0.55, 1.9, 3.5]) steel.push(new THREE.BoxGeometry(3.5, 0.1, 0.11).translate(0, y, 0.1))
        scene.add(new THREE.Mesh(mergeGeometries(steel.map((g) => (g.index ? g.toNonIndexed() : g)))!, metal('#8b9198', 0.22, 5)))
        // light: the lamps' heads, the lamp over the gable door, the boiler house's lit door and window band
        const heads: THREE.BufferGeometry[] = [new THREE.BoxGeometry(0.5, 0.08, 0.22).translate(0, 4.15, 0.5)]
        for (const [x, z] of [[17, 9.5], [37, 10]]) heads.push(new THREE.BoxGeometry(0.26, 0.07, 0.5).translate(x, 6.5, z))
        scene.add(new THREE.Mesh(mergeGeometries(heads)!, emit(16, 9, 3.6)))
        const lit: THREE.BufferGeometry[] = [new THREE.PlaneGeometry(3.6, 3.5).translate(32.6, 1.95, 6.52), new THREE.PlaneGeometry(11, 0.7).translate(34, 5.1, 6.52), new THREE.PlaneGeometry(2.6, 0.8).translate(43, 2.3, 6.52)]
        scene.add(new THREE.Mesh(mergeGeometries(lit)!, emit(1.9, 1.05, 0.44)))
        // the red light on the chimney's lip
        scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6).translate(42.5, 21.2, -1), emit(9, 0.5, 0.3)))

        // the neighbours on the plain: long low houses, lit like this one, sunk in the mist under their light domes
        const far: THREE.BufferGeometry[] = [
          new THREE.BoxGeometry(150, 5.4, 90).translate(215, 2.7, -205),
          new THREE.BoxGeometry(120, 5.4, 70).translate(-190, 2.7, -290),
          new THREE.BoxGeometry(170, 5.4, 60).translate(40, 2.7, -330),
        ]
        scene.add(new THREE.Mesh(mergeGeometries(far)!, emit(1.5, 0.82, 0.33)))

        // the chimney's vapour
        const NP = 70
        const pp = new Float32Array(NP * 3)
        const ps = new Float32Array(NP)
        for (let i = 0; i < NP; i++) {
          pp.set([42.5, 21.4, -1], i * 3)
          ps[i] = tr()
        }
        const pg = new THREE.BufferGeometry()
        pg.setAttribute('position', new THREE.BufferAttribute(pp, 3))
        pg.setAttribute('aSeed', new THREE.BufferAttribute(ps, 1))
        plume = new THREE.ShaderMaterial({ vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, uniforms: { uTime: { value: 0 }, uScale: { value: 900 }, uLamp: shared.uLamp }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor })
        const puffs = new THREE.Points(pg, plume)
        puffs.frustumCulled = false
        puffs.renderOrder = 1
        scene.add(puffs)

        // the lorry on the road: a dark box behind two headlights, two red lamps at its back
        lorry = new THREE.Group()
        lorry.add(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(2.5, 2.9, 9).translate(0, 2.05, -2.2), new THREE.BoxGeometry(2.4, 2.3, 2.2).translate(0, 1.6, 3.5)])!, solid('#1b1d21')))
        lorry.add(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.34, 0.2, 0.06).translate(-0.85, 0.95, 4.62), new THREE.BoxGeometry(0.34, 0.2, 0.06).translate(0.85, 0.95, 4.62)])!, emit(40, 34, 24)))
        lorry.add(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.2, 0.14, 0.06).translate(-1.0, 1.1, -6.72), new THREE.BoxGeometry(0.2, 0.14, 0.06).translate(1.0, 1.1, -6.72)])!, emit(5, 0.3, 0.2)))
        lorry.position.set(53.6, 0, -80)
        scene.add(lorry)
      }

      if (!(await onward())) return
      // the frame: aluminium, catching the dusk on its edges
      const frames = frameMatrices()
      const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), metal('#7d838c', 0.18, 6), frames.length)
      frames.forEach((m, i) => frame.setMatrixAt(i, m))
      frame.frustumCulled = false
      scene.add(frame)

      if (!(await onward())) return
      // the luminaires over every crop row: a dark reflector and the hot lamp under it
      const lampMats: THREE.Matrix4[] = []
      for (let k = Math.ceil((X0 + 1) / ROW); k * ROW <= X1 - 1; k++) {
        for (let z = Z1 - 1.6; z > Z0 + 0.8; z -= 2.25) {
          // (the two rows the camera sinks between keep their first lamps out of the lens)
          if (Math.abs(k * ROW - PATH_X) < 1.2 && z > -11.5) continue
          lampMats.push(new THREE.Matrix4().makeTranslation(k * ROW, LAMP_Y, z))
        }
      }
      const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.11, 0.52).translate(0, 0.07, 0), metal('#5a6068', 0.2, 10), lampMats.length)
      const bulbMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: EMIT_FRAG, uniforms: { ...shared, uSway: { value: 0 }, uEmit: { value: new THREE.Vector3(14, 7.6, 3.0) } } })
      const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.035, 0.34), bulbMat, lampMats.length)
      lampMats.forEach((m, i) => {
        housing.setMatrixAt(i, m)
        bulbs.setMatrixAt(i, m)
      })
      housing.frustumCulled = false
      bulbs.frustumCulled = false
      scene.add(housing, bulbs)

      if (!(await onward())) return
      // the heating pipes: a pair down every path, the trolley's rail
      const pipeGeos: THREE.BufferGeometry[] = []
      for (let k = Math.ceil((X0 + 1) / ROW); k * ROW <= X1 - 1; k++) {
        const px = k * ROW + ROW / 2
        if (px > X1 - 0.6) continue
        for (const o of [-0.28, 0.28]) {
          const g = new THREE.CylinderGeometry(0.026, 0.026, Z1 - Z0 - 3.2, 10, 1, true)
          g.rotateX(Math.PI / 2)
          g.translate(px + o, 0.13, (Z0 + Z1 - 2.6) / 2)
          pipeGeos.push(g)
        }
      }
      scene.add(new THREE.Mesh(mergeGeometries(pipeGeos)!, metal('#9aa0a6', 0.35, 14)))

      if (!(await onward())) return
      // a harvest trolley left on the rails of the camera's path, crates stacked on it; and the yellow sticky cards
      // that hang in every working house, one every few metres along the rows
      {
        const tz = -22
        const cart: THREE.BufferGeometry[] = [new THREE.BoxGeometry(0.62, 0.05, 1.3).translate(PATH_X, 0.42, tz)]
        for (const dx of [-0.28, 0.28]) {
          for (const dz of [-0.5, 0.5]) cart.push(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10).rotateZ(Math.PI / 2).translate(PATH_X + dx, 0.2, tz + dz), new THREE.BoxGeometry(0.03, 0.2, 0.03).translate(PATH_X + dx, 0.31, tz + dz))
          cart.push(new THREE.BoxGeometry(0.03, 1.25, 0.03).translate(PATH_X + dx, 1.05, tz - 0.62))
        }
        cart.push(new THREE.BoxGeometry(0.6, 0.03, 0.03).translate(PATH_X, 1.66, tz - 0.62), new THREE.BoxGeometry(0.6, 0.03, 0.03).translate(PATH_X, 1.1, tz - 0.62))
        scene.add(new THREE.Mesh(mergeGeometries(cart.map((g) => (g.index ? g.toNonIndexed() : g)))!, metal('#7b828a', 0.25, 8)))
        const crates: THREE.BufferGeometry[] = []
        for (const [dz, n] of [[0.3, 3], [-0.22, 2]] as const) for (let j = 0; j < n; j++) crates.push(new THREE.BoxGeometry(0.54, 0.25, 0.4).translate(PATH_X + (j % 2 ? 0.012 : -0.01), 0.445 + 0.127 + j * 0.262, tz + dz))
        scene.add(new THREE.Mesh(mergeGeometries(crates)!, solid('#23364a')))
        const cardMat = solid('#bfa51a')
        cardMat.side = THREE.DoubleSide
        const cr = rng(11)
        const cards: THREE.Matrix4[] = []
        for (let k = Math.ceil((X0 + 1) / ROW); k * ROW <= X1 - 1; k++) {
          if (Math.abs(k * ROW - PATH_X) > 7) continue
          for (let z = -5 - cr() * 4; z > Z0 + 4; z -= 6 + cr() * 3) cards.push(new THREE.Matrix4().compose(V3(k * ROW + (cr() - 0.5) * 0.3, (kind === 'low' ? 2.2 : WIRE - 0.45) + cr() * 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cr() * 0.8 - 0.4, (cr() - 0.5) * 0.12)), V3(1, 1, 1)))
        }
        const cardMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.25), cardMat, cards.length)
        cards.forEach((m, i) => cardMesh.setMatrixAt(i, m))
        cardMesh.frustumCulled = false
        scene.add(cardMesh)
      }

      if (!(await onward())) return
      // ---- the crop ----
      if (!(await onward())) return
      // low crops stand in gutters at bench height: strawberries raised to picking height, lettuce and herbs lower
      const bench = cropId === 'strawberry' ? 1.25 : 0.95
      const plants = plantLayout(kind, bench)
      const r = rng(29)
      const m4 = new THREE.Matrix4()
      const qt = new THREE.Quaternion()
      const up = V3(0, 1, 0)
      const tint = new THREE.Color()
      if (kind !== 'low') {
        // stems from the floor to the wire
        const stemMat = solid('#3a4a1c')
        const stemmed = plants.filter((pl) => pl.near > 0.22)
        const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.009, 1, 5, 1, true).translate(0, 0.5, 0), stemMat, stemmed.length)
        stemmed.forEach((pl, i) => {
          const d = pl.top.clone().sub(pl.base)
          qt.setFromUnitVectors(up, d.clone().normalize())
          stems.setMatrixAt(i, m4.compose(pl.base, qt, V3(1, d.length(), 1)))
        })
        stems.frustumCulled = false
        scene.add(stems)
        // the wires the crop hangs from
        const wires: THREE.BufferGeometry[] = []
        for (let k = Math.ceil((X0 + 1) / ROW); k * ROW <= X1 - 1; k++) {
          for (const o of [-0.25, 0.25]) {
            const g = new THREE.BoxGeometry(0.01, 0.01, Z1 - Z0 - 3)
            g.translate(k * ROW + o, (kind === 'ovate' ? 3.0 : WIRE) + 0.05, (Z0 + Z1 - 2.6) / 2)
            wires.push(g)
          }
        }
        scene.add(new THREE.Mesh(mergeGeometries(wires)!, metal('#8a9096', 0.3, 8)))
      } else {
        // low crops grow in white gutters on legs at bench height
        const gut: THREE.BufferGeometry[] = []
        for (let k = Math.ceil((X0 + 1) / ROW); k * ROW <= X1 - 1; k++) {
          gut.push(new THREE.BoxGeometry(0.3, 0.11, Z1 - Z0 - 3.4).translate(k * ROW, bench - 0.04, (Z0 + Z1 - 2.6) / 2))
          for (let z = -3; z > Z0 + 1.6; z -= 3) gut.push(new THREE.BoxGeometry(0.035, bench - 0.1, 0.035).translate(k * ROW, (bench - 0.1) / 2, z))
        }
        scene.add(new THREE.Mesh(mergeGeometries(gut)!, solid('#b9bcbf')))
      }

      if (!(await onward())) return
      // leaves: a procedural blade on a cupped quad, thousands of them
      const shape = kind === 'palmate' ? 0 : kind === 'pinnate' ? 1 : 2
      const leafCol = cropId === 'lettuce' ? '#76a83a' : cropId === 'basil' ? '#3d7e2a' : cropId === 'strawberry' ? '#3f7a2a' : kind === 'pinnate' ? '#2c4f1a' : '#2a5418'
      const leafMat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: LEAF_FRAG,
        uniforms: { ...shared, uTime: { value: 0 }, uSway: { value: reduce ? 0 : 0.012 }, uAlb: { value: new THREE.Color(leafCol).multiplyScalar(0.55) }, uShape: { value: kind !== 'low' ? shape : cropId === 'lettuce' ? 0 : cropId === 'strawberry' ? 1 : 2 } },
        side: THREE.DoubleSide,
        defines: { LEAF: '' },
      })
      leafMats.push(leafMat)
      const leaves: THREE.Matrix4[] = []
      const leafTints: number[] = []
      const side = new THREE.Vector3()
      const tip = new THREE.Vector3()
      const nrm = new THREE.Vector3()
      const basis = new THREE.Matrix4()
      const addLeaf = (at: THREE.Vector3, yaw: number, droop: number, size: number, width: number) => {
        const out = V3(Math.cos(yaw), 0, Math.sin(yaw))
        tip.copy(out).multiplyScalar(Math.cos(droop)).add(V3(0, -Math.sin(droop), 0)).normalize()
        side.crossVectors(up, out).normalize()
        nrm.crossVectors(side, tip).normalize()
        basis.makeBasis(side.clone().multiplyScalar(size * width), tip.clone().multiplyScalar(size), nrm.clone().multiplyScalar(size))
        basis.setPosition(at.clone().addScaledVector(out, 0.03))
        leaves.push(basis.clone())
        leafTints.push(0.75 + r() * 0.45)
      }
      const fruits: { m: THREE.Matrix4; c: THREE.Color }[] = []
      const at = new THREE.Vector3()
      for (const pl of plants) {
        if (kind === 'low') {
          // a rosette (lettuce), an upright bunch (basil), a crown with fruit over the gutter's edge (strawberry)
          const lettuce = cropId === 'lettuce'
          const basil = cropId === 'basil'
          const n = basil ? 12 : lettuce ? 10 : 8
          for (let j = 0; j < n; j++) {
            const yaw = (j / n) * Math.PI * 2 * (basil ? 2.3 : 1) + pl.seed * 6
            const inner = j % 2 === 0 ? 1 : 0
            const lift = basil ? 0.05 + (j % 4) * 0.06 : 0.04 + inner * 0.03
            at.copy(pl.base).add(V3(0, lift, 0))
            // lettuce: a rosette, its inner leaves standing up; strawberry: leaves arching out over the gutter's edge
            const droop = basil ? -0.45 + r() * 0.5 : lettuce ? -0.55 * inner + (r() - 0.3) * 0.4 : 0.15 + r() * 0.5
            const size = (lettuce ? 0.21 - inner * 0.05 : basil ? 0.085 : 0.2) * (1 + (1 - pl.near) * 0.3)
            addLeaf(at, yaw, droop, size, lettuce ? 1.15 : basil ? 0.8 : 1.0)
          }
          if (cropId === 'strawberry' && pl.near > 0.15) {
            for (let j = 0; j < 3; j++) {
              const s = 0.016 + r() * 0.008
              const side = r() < 0.5 ? -1 : 1
              fruits.push({ m: new THREE.Matrix4().compose(pl.base.clone().add(V3(side * (0.2 + r() * 0.05), -0.08 - r() * 0.12, (r() - 0.5) * 0.2)), qt.identity(), V3(s, s * 1.3, s)), c: new THREE.Color(r() < 0.75 ? '#a5121c' : '#c8a24a') })
            }
          }
          continue
        }
        // high-wire crops: leaves from ~0.9 m up (the old ones are picked off below), mostly reaching into the paths
        const H = pl.top.y - pl.base.y
        const t0 = 0.14
        const every = (kind === 'ovate' ? 0.22 : 0.3) * (1 + (1 - pl.near) * 0.8)
        const scale = (kind === 'palmate' ? 0.3 : kind === 'pinnate' ? 0.42 : 0.17) * (1 + (1 - pl.near) * 0.5)
        let j = 0
        for (let tt = t0 + r() * 0.05; tt < 1.0; tt += every / H) {
          at.lerpVectors(pl.base, pl.top, tt)
          const toPath = r() < 0.75 ? (Math.sin(j * 2.4) > 0 ? 0 : Math.PI) : Math.PI / 2 + (r() - 0.5)
          const yaw = toPath + (r() - 0.5) * 1.1
          addLeaf(at, yaw, 0.15 + r() * 0.5 + (1 - tt) * 0.3, scale * (0.75 + 0.5 * Math.sin(Math.PI * tt)), kind === 'pinnate' ? 0.8 : 1.0)
          j++
        }
        if (pl.near < 0.2) continue
        // fruit, hanging under the leaves where the hands can reach
        const nf = kind === 'palmate' ? 2 + Math.floor(r() * 2) : 2
        for (let f = 0; f < nf; f++) {
          const tt = 0.2 + r() * 0.32
          at.lerpVectors(pl.base, pl.top, tt)
          const out = V3(Math.cos(r() * 6.28), 0, Math.sin(r() * 6.28)).multiplyScalar(0.06)
          if (kind === 'palmate') {
            const len = cropId === 'courgette' ? 0.22 : 0.3
            const c = new THREE.Color(cropId === 'courgette' ? '#2c4a1e' : '#1d3a14').multiplyScalar(0.8 + r() * 0.4)
            fruits.push({ m: new THREE.Matrix4().compose(at.clone().add(out).add(V3(0, -len / 2, 0)), qt.setFromEuler(new THREE.Euler((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25)), V3(0.024, len, 0.024)), c })
          } else if (kind === 'pinnate') {
            // a truss: ripe at the bottom of the plant, turning higher up
            const n = cropId === 'cherry' ? 9 : 5
            const R = cropId === 'cherry' ? 0.016 : 0.034
            const ripe = 1 - THREE.MathUtils.smoothstep(tt, 0.22, 0.5)
            for (let b = 0; b < n; b++) {
              const c = new THREE.Color('#2e5a1a').lerp(new THREE.Color('#e0a020'), Math.min(1, ripe * 2)).lerp(new THREE.Color('#b81a10'), Math.max(0, ripe * 2 - 1)).multiplyScalar(0.55)
              const o2 = V3(Math.cos(b * 2.1) * R * 1.5, -b * R * 1.1, Math.sin(b * 2.1) * R * 1.5)
              fruits.push({ m: new THREE.Matrix4().compose(at.clone().add(out).add(o2).add(V3(0, -0.06, 0)), qt.identity(), V3(R, R * 0.9, R)), c })
            }
          } else {
            const aub = cropId === 'eggplant'
            const c = new THREE.Color(aub ? '#1d0b22' : r() < 0.6 ? '#9c1408' : '#c88a0c').multiplyScalar(0.7)
            fruits.push({ m: new THREE.Matrix4().compose(at.clone().add(out).add(V3(0, aub ? -0.11 : -0.07, 0)), qt.identity(), aub ? V3(0.045, 0.11, 0.045) : V3(0.045, 0.055, 0.045)), c })
          }
        }
      }
      const eye = keys[keys.length - 1].pos
      const ord = leaves.map((m, i) => ({ i, d: (m.elements[12] - eye.x) ** 2 + (m.elements[13] - eye.y) ** 2 + (m.elements[14] - eye.z) ** 2 }))
      ord.sort((a, b) => a.d - b.d)
      const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1, 2, 3).translate(0, 0.5, 0), leafMat, leaves.length)
      ord.forEach(({ i }, k) => {
        leafMesh.setMatrixAt(k, leaves[i])
        leafMesh.setColorAt(k, tint.setScalar(leafTints[i]))
      })
      leafMesh.frustumCulled = false
      scene.add(leafMesh)
      if (fruits.length) {
        const fruitGeo = kind === 'palmate' ? new THREE.CapsuleGeometry(1, 0.6, 3, 7).scale(1, 0.62, 1) : new THREE.SphereGeometry(1, 9, 7)
        const fruitMesh = new THREE.InstancedMesh(fruitGeo, metal('#ffffff', 0.12, 10), fruits.length)
        fruits.forEach((f, i) => {
          fruitMesh.setMatrixAt(i, f.m)
          fruitMesh.setColorAt(i, f.c)
        })
        fruitMesh.frustumCulled = false
        scene.add(fruitMesh)
      }

      if (!(await onward())) return
      // the glass, last: premultiplied, it adds the sky and the lantern glow and hides a little of what's behind
      const milk = cover === 'glass' ? 0.09 : cover === 'poly' ? 0.16 : 0.18
      const glassMat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: GLASS_FRAG,
        uniforms: { ...shared, uSway: { value: 0 }, uMilk: { value: milk } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      })
      const glass = new THREE.Mesh(glassGeometry(), glassMat)
      glass.renderOrder = 2
      scene.add(glass)

      if (!(await onward())) return
      // condensation and dust in the lamp light, round the path the camera ends in
      const N = 700
      const rm = rng(63)
      const mpos = new Float32Array(N * 3)
      const mseed = new Float32Array(N)
      for (let i = 0; i < N; i++) {
        mpos[i * 3] = PATH_X + (rm() - 0.5) * 7
        mpos[i * 3 + 1] = 0.4 + rm() * 4.4
        mpos[i * 3 + 2] = -6 - rm() * 34
        mseed[i] = rm()
      }
      const moteGeo = new THREE.BufferGeometry()
      moteGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3))
      moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(mseed, 1))
      motes = new THREE.ShaderMaterial({
        vertexShader: MOTE_VERT,
        fragmentShader: MOTE_FRAG,
        uniforms: { uTime: { value: 0 }, uScale: { value: 16 }, uLamp: shared.uLamp, uCamIn: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const moteMesh = new THREE.Points(moteGeo, motes)
      moteMesh.frustumCulled = false
      moteMesh.renderOrder = 3
      scene.add(moteMesh)

      if (!(await onward())) return
      // the lens (lib/objects/lens): a depth of field with a focus pull down the way in, bloom on the lamps, a filmic tone
      // map, grain and a vignette; the glazing bars are hair-thin
      const off_ = devLensOff()
      if (off_.includes('motes')) moteMesh.visible = false
      if (off_.includes('leaves')) leafMesh.visible = false
      if (off_.includes('glass')) glass.visible = false
      if (off_.includes('frame')) frame.visible = false
      const built = buildLens(
        renderer,
        scene,
        camera,
        {
          focus: { focusDistance: 40, focusRange: 30, bokehScale: 0.4, resolutionScale: 0.75 },
          bloom: { luminanceThreshold: 1.0, luminanceSmoothing: 0.35, intensity: 0.75, mipmapBlur: true, radius: 0.68 },
          vignette: { offset: 0.3, darkness: 0.6 },
          grain: 0.12,
          thinLines: true,
        },
        stage.quality().lens,
        off_,
      )
      composer = built.composer
      dof = built.dof
      const size = new THREE.Vector2()
      renderer.getSize(size)
      stage.setComposer(composer)
      if (size.x && size.y) {
        motes.uniforms.uScale.value = size.y * 0.02
        if (plume) plume.uniforms.uScale.value = size.y * 1.2
      }
      // nothing is drawn until the driver has linked every program in the background (lib/objects/precompile)
      stage.hold(stage.compile(composer))

      // ---- what stands about the yard: scans (lib/objects/cc0), in when their files are - lit by this scene's light ----
      void nurseryThings((s) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SCAN_FRAG, uniforms: { ...shared, uSway: { value: 0 }, uMap: { value: s.map }, uArm: { value: s.arm } } }), solid('#4a3a2a'))
        .then((things) => {
          if (gone || !composer) {
            for (const t of things) (t as THREE.Mesh).geometry?.dispose()
            return
          }
          for (const t of things) {
            t.frustumCulled = false
            scene.add(t)
          }
          stage.hold(stage.compile(composer))
        })
        .catch(() => {})

    }
    stage.hold(build())

    const off = progress.on('change', (v) => {
      p = v
      stage.invalidate()
    })
    return () => {
      gone = true
      off()
      composer?.dispose()
      composer = null
      stage.dispose()
    }
  }, [crop.id, lit, cover, progress, reduce]) // eslint-disable-line react-hooks/exhaustive-deps

  // (drawn on the canvas the scenes share - lib/objects/world; this block only says where)
  return <div ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
}

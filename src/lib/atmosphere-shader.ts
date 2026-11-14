// GLSL for the one living ground behind the descent (see components/Atmosphere.tsx), plus the small WebGL helpers
// it needs. Everything the fragment shader does is a function of two numbers - `uDepth`, the reader's stratum
// (0 orbit · 1 the cloud deck · 2–2.4 air over the field · 3 the surface · 4 the soil · 5 dawn at the surface) and
// `uTime`, a slow drift - so there is nothing to synchronise: the altimeter publishes depth, the shader answers.
//
// The whole image is built as one base colour (a chain of palette mixes along depth) with each stratum's own
// quiet features added inside a smooth depth window, so that no two strata ever switch - they overlap and hand over.
// The output is quantised through a 4×4 Bayer matrix in canvas pixels: the page's one "material", and the thing that
// keeps dark gradients from banding.

export const ATMOSPHERE_VERT = /* glsl */ `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

/** How much work a frame does: desktop gets the full fbm, phones and coarse pointers the cheaper branch. */
export type AtmosphereQuality = 'full' | 'lite'

/** The fragment shader for one quality level (the octave count and the calm-column floor are compiled in). */
export function atmosphereFrag(quality: AtmosphereQuality): string {
  const octaves = quality === 'full' ? 4 : 2
  // on a phone the content column is the whole width, so the "calm" mask is nearly flat instead of left-weighted
  const calmFloor = quality === 'full' ? '0.30' : '0.72'
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define OCTAVES ${octaves}
#define CALM_FLOOR ${calmFloor}

uniform vec2 uRes;     // canvas size in device pixels (the half-res backing store)
uniform float uDepth;  // stratum 0 … 5
uniform float uTime;   // seconds of drift; frozen under prefers-reduced-motion
uniform float uMotion; // 1 when drift is allowed, 0 when frozen (hides the one thing that only makes sense moving)
varying vec2 vUv;

// the page's palette (index.css), as linear-ish sRGB triplets
const vec3 VOID   = vec3(0.039, 0.043, 0.055); // #0a0b0e cool graphite
const vec3 SPACE  = vec3(0.043, 0.051, 0.071); // #0b0d12
const vec3 ATMO   = vec3(0.055, 0.066, 0.086); // cool night air
const vec3 CANOPY = vec3(0.047, 0.059, 0.059); // dark field
const vec3 SOIL   = vec3(0.067, 0.058, 0.054); // dark earth, barely warm
const vec3 DAWN   = vec3(0.059, 0.063, 0.078); // blue-hour dusk
const vec3 ORBIT  = vec3(0.914, 0.886, 0.824); // #e9e2d2 bone
const vec3 LEAF   = vec3(0.624, 0.698, 0.541); // #9fb28a lichen
const vec3 WHEAT  = vec3(0.788, 0.690, 0.478); // #c9b07a straw

// --- noise -----------------------------------------------------------------------------------------------------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  float n = 0.0;
  for (int i = 0; i < OCTAVES; i++) {
    s += a * vnoise(p);
    n += a;
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s / n;
}

// a smooth window over depth: rises a→b, holds, falls c→e
float win(float d, float a, float b, float c, float e) {
  return smoothstep(a, b, d) * (1.0 - smoothstep(c, e, d));
}

// --- 4×4 Bayer in canvas pixels ---------------------------------------------------------------------------------
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y);
  vec2 px = gl_FragCoord.xy;
  float d = uDepth;
  float t = uTime;

  // the content column (left ~60 %) stays the calmest; features are scaled by this, the base colour is not
  float calm = CALM_FLOOR + (1.0 - CALM_FLOOR) * smoothstep(0.40, 0.88, uv.x);

  // --- base: one chain of palette mixes along depth -----------------------------------------------------------
  vec3 col = VOID;
  col = mix(col, SPACE, smoothstep(0.2, 1.0, d));
  col = mix(col, ATMO, smoothstep(1.0, 2.0, d));
  col = mix(col, CANOPY, smoothstep(2.35, 3.0, d));
  col = mix(col, SOIL, smoothstep(3.25, 4.0, d));
  col = mix(col, DAWN, smoothstep(4.25, 5.0, d));

  // --- 0 · orbit: a sparse static star field, drifting up a little as the fall begins ---------------------------
  float wSpace = 1.0 - smoothstep(0.55, 1.15, d);
  if (wSpace > 0.002) {
    vec2 sp = px + vec2(0.0, d * uRes.y * 0.22);
    vec2 cell = floor(sp / 26.0);
    float h = hash12(cell);
    vec2 off = vec2(hash12(cell + 7.1), hash12(cell + 3.7)) * 22.0 + 2.0;
    float dist = length(sp - (cell * 26.0 + off));
    float star = smoothstep(1.15, 0.35, dist) * step(0.58, h) * (0.3 + 0.7 * hash12(cell + 11.3));
    col += ORBIT * star * 0.17 * wSpace;
  }

  // --- 1 · the cloud deck: fbm fog that thickens toward 1 and parts again by ~1.6 -------------------------------
  float wCloud = win(d, 0.35, 1.0, 1.0, 1.65);
  if (wCloud > 0.002) {
    vec2 q = p * 2.1 + vec2(t * 0.012, d * 0.85);
    float n = fbm(q);
    float n2 = vnoise(q * 3.3 + vec2(-t * 0.01, 2.7));
    float dens = smoothstep(0.40, 0.80, n * 0.78 + n2 * 0.22);
    vec3 cloud = vec3(0.6, 0.64, 0.7);
    col = mix(col, cloud * 0.165, dens * wCloud * (0.55 + 0.45 * calm));
    col += cloud * 0.028 * wCloud * (0.5 + 0.5 * n);
  }

  // --- 2–2.4 · air over the field: a Rayleigh-ish gradient, lighter toward the top, very low luminance -----------
  float wAir = win(d, 1.1, 2.0, 2.45, 3.0);
  if (wAir > 0.002) {
    float sky = pow(uv.y, 1.6);
    float haze = 0.5 + 0.5 * vnoise(vec2(p.x * 1.4 + t * 0.008, uv.y * 2.6 + d * 0.5));
    vec3 ray = vec3(0.38, 0.44, 0.56);
    col += ray * (0.04 * sky + 0.012 * haze * (1.0 - sky)) * wAir * (0.55 + 0.45 * calm);
  }

  // --- 3 · the surface: chlorophyll dark with faint, slow light shafts as through a canopy ----------------------
  float wCan = win(d, 2.5, 3.0, 3.25, 3.9);
  if (wCan > 0.002) {
    float sway = sin(t * 0.07) * 0.03;
    float s1 = vnoise(vec2((p.x * 1.3 + sway + d * 0.05) * 6.0, 0.5 + t * 0.01));
    float shaft = smoothstep(0.55, 0.95, s1);
    shaft *= shaft;
    float fall = pow(uv.y, 1.4);
    float wob = 0.6 + 0.4 * vnoise(vec2(p.x * 3.0, uv.y * 2.0 - t * 0.03));
    col += LEAF * shaft * fall * wob * 0.07 * wCan * calm;
    float m = fbm(p * 1.6 + vec2(0.0, d * 0.6)) - 0.5;
    col += vec3(0.07, 0.09, 0.08) * m * 0.45 * wCan;
  }

  // --- 4 · the soil: a cool mineral dark (the warmth is kept for the light), strata, grain, now and then a root hair
  float wSoil = win(d, 3.3, 4.0, 4.1, 4.8);
  if (wSoil > 0.002) {
    float y = uv.y + d * 0.7;
    float warp = fbm(vec2(p.x * 1.2, y * 2.0)) - 0.5;
    float bands = 0.5 + 0.5 * sin((y * 9.0 + warp * 1.6) * 6.2832);
    float seam = smoothstep(0.90, 1.0, bands);
    vec3 mineral = vec3(0.3, 0.29, 0.29);
    col += mineral * (bands * 0.016 + seam * 0.035) * wSoil * (0.5 + 0.5 * calm);
    col += (hash12(px) - 0.5) * 0.018 * wSoil;
    if (uMotion > 0.5) {
      float rt = t * 0.045;
      float seg = floor(rt);
      float head = 1.15 - fract(rt) * 1.65;
      float along = (head - uv.y) / 0.42;
      float rx = 0.60 + 0.34 * hash12(vec2(seg, 2.0));
      float wig = (vnoise(vec2(uv.y * 7.0 + seg * 13.0, 0.3)) - 0.5) * 0.045;
      float dx = abs(uv.x - (rx + wig)) * uRes.x;
      float vis = step(0.0, along) * (1.0 - smoothstep(0.6, 1.0, along)) * smoothstep(0.0, 0.08, along);
      col += vec3(0.5, 0.42, 0.32) * smoothstep(1.4, 0.4, dx) * vis * 0.1 * wSoil;
    }
  }

  // --- 5 · dawn at the surface: the dark lifting toward a warm-green horizon glow low in the frame ---------------
  float wDawn = smoothstep(4.3, 5.0, d);
  if (wDawn > 0.002) {
    float k = (uv.y - 0.10) / 0.22;
    float hz = exp(-k * k);
    float side = 0.45 + 0.55 * smoothstep(0.3, 0.9, uv.x);
    float soft = 0.8 + 0.2 * vnoise(vec2(p.x * 2.0 + t * 0.01, 1.0));
    col += mix(LEAF, WHEAT, 0.45) * hz * 0.055 * side * soft * wDawn;
  }

  // --- the material: ordered dither, then quantise ---------------------------------------------------------------
  float th = bayer4(px) - 0.5;
  const float LEVELS = 64.0;
  col = floor(col * LEVELS + 0.5 + th) / LEVELS;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`
}

// --- WebGL helpers ----------------------------------------------------------------------------------------------

export const ATMOSPHERE_CONTEXT_ATTRS: WebGLContextAttributes = {
  antialias: false,
  alpha: false,
  depth: false,
  stencil: false,
  powerPreference: 'low-power',
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
}

export function compileShader(gl: WebGLRenderingContext, type: number, src: string, defer = false): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!defer && !gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    if (import.meta.env.DEV) console.warn('[atmosphere] shader failed to compile:', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

/**
 * Links the atmosphere program for one quality level; null (and nothing thrown) when the GPU refuses it. With
 * `defer` (KHR_parallel_shader_compile present) nothing waits for the driver here: the caller polls the program's
 * completion status and checks the link itself, so a slow compile never blocks the page.
 */
export function createAtmosphereProgram(gl: WebGLRenderingContext, quality: AtmosphereQuality, defer = false): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, ATMOSPHERE_VERT, defer)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, atmosphereFrag(quality), defer)
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
    return null
  }
  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.bindAttribLocation(prog, 0, 'aPos')
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (defer) return prog
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    if (import.meta.env.DEV) console.warn('[atmosphere] program failed to link:', gl.getProgramInfoLog(prog))
    gl.deleteProgram(prog)
    return null
  }
  return prog
}

/** One triangle that covers clip space - cheaper than a quad and with no diagonal seam. */
export const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3])

/**
 * The backing-store scale (canvas pixels per CSS pixel): about half the device pixel ratio with the ratio capped at
 * 1.5, then snapped so that one canvas pixel covers a whole number of device pixels - the canvas is upscaled with
 * `image-rendering: pixelated`, and an integer step keeps the Bayer grid exact instead of beating against the screen.
 * DPR 1 → 0.5 (2×), 1.5 → 0.75 (2×), 2 → 0.667 (3×), 3 → 0.75 (4×).
 */
export function backingScale(dpr: number): number {
  const d = dpr || 1
  const step = Math.max(2, Math.round(d / (Math.min(d, 1.5) * 0.5)))
  return d / step
}

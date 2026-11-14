// The loader's film: one fragment shader that flies from Landsat's orbit (705 km) down through the cloud deck to the
// fields, while the page loads underneath. The descent IS the progress bar - the camera's altitude follows the real
// loading on a log scale, so every decade of height (orbit · the edge of space · the tropopause · the clouds · the
// field) takes the same share of the wait. A time-lapse dawn rides along: the sun crests the limb at orbit and
// stands a few degrees up, raking the field, by the time the camera arrives.
//
// It runs wherever it is given a canvas: in a worker on an OffscreenCanvas (descentLoader.worker.ts - so the
// page building on the main thread cannot stall it), or on the main thread as the fallback. Units are kilometres; the
// planet's centre sits at (0, -R, 0) under a camera at (0, h, 0), and every ray-sphere test uses the cancellation-free
// form, so float32 holds metre precision from 705 km all the way down.

export type DescentCanvas = HTMLCanvasElement | OffscreenCanvas

export type DescentOptions = {
  /** CSS pixel size of the canvas and the device pixel ratio */
  width: number
  height: number
  dpr: number
  /** reduced motion: no drift, no time-lapse, a frame only when something changes */
  reduce: boolean
  /** the camera's altitude, in km, about ten times a second (for the readout beside the film) */
  onAlt?: (km: number, frameMs?: number) => void
  /** the first frame is on the canvas (the page can show it) */
  onDrawn?: () => void
  /** every frame, with the camera's altitude (the worker draws the readout from it) */
  onTick?: (km: number) => void
  /** the driver refused the program after all (the page carries on without the film) */
  onFail?: () => void
  /** the camera follows `progress` both ways, from wherever it is given first: the page's closing ascent runs the
   * film backwards (the loader's film only ever falls, at its own pace) */
  free?: boolean
  raf?: (cb: (t: number) => void) => number
  caf?: (id: number) => void
}

export type Descent = {
  /** loading progress 0..1 (the camera's target altitude) */
  progress: (p: number) => void
  size: (width: number, height: number, dpr: number) => void
  /** the way out: tip the camera to nadir and drop, over `ms` */
  leave: (ms: number) => void
  dispose: () => void
}

export const ORBIT_KM = 705
export const FIELD_KM = 1.8
/** loading progress → the camera's altitude (km), on a log scale */
export const altitudeAt = (p: number) => ORBIT_KM * Math.pow(FIELD_KM / ORBIT_KM, Math.min(1, Math.max(0, p)))
/**
 * The shot list, keyed on the film's clock u (0 → 1):
 *   0–0.16   orbit at dawn: the sun cresting the limb, a long lens, almost still
 *   0.16–0.6 the dive: gathering speed, banking away from the sun, the lens widening with the speed
 *   0.6–0.72 the cloud deck: levelling out, punching through
 *   0.72–1   the field: a long float down, the lens closing in, the camera tipping toward the ground
 * Altitude is keyed in log space; yaw in radians; pitch and the vertical field of view in degrees.
 */
const KEYS = {
  u: [0, 0.16, 0.42, 0.6, 0.7, 0.84, 1],
  lnAlt: [705, 560, 60, 9, 4, 2.4, FIELD_KM].map(Math.log),
  yaw: [-0.26, -0.22, 0.12, 0.36, 0.45, 0.54, 0.6],
  pitch: [-13, -14, -20, -27, -32, -42, -50],
  fov: [34, 36, 50, 50, 46, 42, 40],
}
/** loading progress → the film's clock (the film keeps a little of the field approach for the very end) */
const filmAt = (p: number) => Math.min(1, Math.max(0, p))
/** a monotone cubic through keyed values (Fritsch-Carlson): smooth, and never overshooting a key */
function curve(xs: number[], ys: number[], x: number): number {
  const n = xs.length
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  let i = 0
  while (x > xs[i + 1]) i++
  const d = (k: number) => (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k])
  const m = (k: number) => {
    if (k === 0) return d(0)
    if (k === n - 1) return d(n - 2)
    const a = d(k - 1)
    const b = d(k)
    return a * b <= 0 ? 0 : (3 * (a + b)) / ((2 * b + a) / a + (b + 2 * a) / b) / 3 * 2
  }
  const h = xs[i + 1] - xs[i]
  const t = (x - xs[i]) / h
  const t2 = t * t
  const t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m(i) + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m(i + 1)
}

/** altitude → 0 at the field … 1 at orbit (the altimeter's scale) */
export const altitudeShare = (km: number) => Math.min(1, Math.max(0, Math.log(km / FIELD_KM) / Math.log(ORBIT_KM / FIELD_KM)))

const VERT = /* glsl */ `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

/** The film's fragment shader (the page's closing ascent draws it too, as a scene of the shared canvas). */
export const DESCENT_FRAG = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform float uAlt;      // km above the ground
uniform float uPitch;    // radians (negative looks down)
uniform float uYaw;
uniform float uDrift;    // km travelled along the ground track
uniform float uSunEl;    // sun elevation at the field, radians
uniform float uFade;     // 0..1 fade from black (the opening)
uniform float uInCloud;  // 0..1 the camera inside the cloud deck (worked out on the CPU)
uniform float uRoll;     // the bank, radians
uniform float uFov;      // vertical field of view, radians
uniform vec3 uSunScr;    // the sun on screen (uv units) and how much of its flare shows
uniform sampler2D uNoise; // 256x256 random values, linear + repeat: one fetch per octave

const float R = 6371.0;
const float H0 = 8.5;      // scale height of the visible haze, km
const float KS = 0.02;     // haze per km of sea-level air
const float CH = 4.0;      // the cloud deck, km
const float PI = 3.14159265;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// value noise from the texture: the cell coordinate is smoothed, then one bilinear fetch between texel centres
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return texture2D(uNoise, (i + f + 0.5) / 256.0).r;
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = ROT * p; a *= 0.5; } return s; }
float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = ROT * p; a *= 0.5; } return s; }

// Ray from the camera (0,h,0) against the sphere of radius R+s about (0,-R,0): both roots, or (-1,-1).
vec2 shell(float h, float s, vec3 rd) {
  float b = (R + h) * rd.y;
  float c = (h - s) * (2.0 * R + h + s);
  float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0);
  float sq = sqrt(disc);
  float q = -(b + (b >= 0.0 ? sq : -sq));
  float t0 = q, t1 = c / q;
  return vec2(min(t0, t1), max(t0, t1));
}

// the cloud deck's cover at a ground-track point (km): cumulus fields in weather-sized patches, plus the one cloud
// the camera sinks through on the way down
float cloudCover(vec2 q, float fp) {
  float c = smoothstep(0.56, 0.8, fbm(q / 7.5 + vec2(0.0, uTime * 0.006))) * smoothstep(0.3, 0.62, fbm3(q / 150.0 + 4.0));
  vec2 o = q - vec2(0.0, uDrift);
  return clamp(max(c, exp(-dot(o, o) / 5.0) * 0.85), 0.0, 1.0) * (1.0 - smoothstep(2.0, 8.0, fp));
}

// One field of the patchwork at q (km): which field, where in it, its size and turn, its distance to the edge.
// Field lines bend a little with the land (a domain warp); each district is worked in its own direction, with a
// lane along its edge.
#ifndef LITE
struct Fld { vec2 cell; vec2 f; vec2 rc; float W; float L; float edge; float id; float lane; };
Fld field(vec2 q) {
  vec2 qw = q + (vec2(noise(q / 1.7), noise(q / 1.7 + 17.3)) - 0.5) * 0.2;
  vec2 dc = floor(qw / 3.0);
  float ang = (hash12(dc) - 0.5) * 0.45 + step(0.6, hash12(dc + 3.1)) * 1.5708;
  float cs = cos(ang), sn = sin(ang);
  vec2 r = vec2(cs * qw.x + sn * qw.y, -sn * qw.x + cs * qw.y);
  float W = 0.12 + 0.2 * hash12(dc + 9.7);
  float L = W * (1.3 + 1.9 * hash12(dc + 1.3));
  float row = floor(r.y / L);
  r.x += hash12(vec2(row, dc.x * 7.0 + dc.y)) * W;
  Fld o;
  o.cell = vec2(floor(r.x / W), row) + dc * 31.0;
  o.f = vec2(fract(r.x / W) * W, fract(r.y / L) * L);
  o.rc = vec2(cs, sn);
  o.W = W;
  o.L = L;
  o.edge = min(min(o.f.x, W - o.f.x), min(o.f.y, L - o.f.y));
  o.id = hash12(o.cell);
  vec2 de = abs(fract(qw / 3.0) - 0.5) * 3.0;
  o.lane = 1.5 - max(de.x, de.y);
  return o;
}

// The ground's albedo (display-referred) at q; fp = the pixel's footprint in km. Close up: fields with drill rows,
// tramlines, swaths and headlands, hedgerow trees, woods, villages; far off it all averages into the land's tone.
vec3 farmland(vec2 q, float fp, Fld o, out float tree) {
  float h = o.id;
  vec3 c = h < 0.17 ? vec3(0.74, 0.62, 0.38)      // ripe wheat
    : h < 0.31 ? vec3(0.66, 0.56, 0.38)           // stubble
    : h < 0.43 ? vec3(0.34, 0.26, 0.19)           // ploughed
    : h < 0.52 ? vec3(0.45, 0.36, 0.26)           // harrowed
    : h < 0.64 ? vec3(0.32, 0.40, 0.23)           // winter green
    : h < 0.74 ? vec3(0.40, 0.45, 0.27)           // grass ley
    : h < 0.82 ? vec3(0.42, 0.42, 0.26)           // maize
    : h < 0.9 ? vec3(0.62, 0.55, 0.38)            // barley stubble
    : vec3(0.27, 0.22, 0.17);                     // fallow
  float close = smoothstep(0.012, 0.003, fp);
  // the direction the field is worked: rows and tramlines run along it
  float along = hash12(o.cell + 5.3) < 0.5 ? o.f.x : o.f.y;
  c *= 1.0 - 0.1 * (0.5 + 0.5 * sin(along * 640.0)) * smoothstep(0.004, 0.0015, fp);
  float tl = abs(fract(along / 0.024) - 0.5) * 0.024;
  c = mix(c, c * 0.72, (1.0 - smoothstep(0.0007, 0.0007 + fp, tl)) * 0.55 * close * step(0.3, h));
  // swaths on the cut fields, soil and wetness patches everywhere
  c *= 1.0 + 0.07 * sin(along * 330.0) * step(0.8, hash12(o.cell + 8.1)) * close;
  c *= 0.8 + 0.34 * fbm3(q / 0.07 + o.cell * 3.0);
  // headlands: the turning strip round each field, a shade lighter; the grass verge; the lane
  c = mix(c, c * 1.12 + 0.02, (1.0 - smoothstep(0.007, 0.013, o.edge)) * 0.5 * close);
  c = mix(c, vec3(0.30, 0.34, 0.21), 1.0 - smoothstep(0.0018, 0.0018 + fp, o.edge));
  c = mix(c, vec3(0.56, 0.53, 0.47), (1.0 - smoothstep(0.003, 0.003 + fp * 1.2, o.lane)) * 0.85);
  // villages: roofs and gardens round a few points of the land
  vec2 vc = floor(q / 2.6);
  vec2 ctr = (vc + 0.25 + 0.5 * hash22(vc + 3.0)) * 2.6;
  float rad = (0.1 + 0.16 * hash12(vc + 5.0)) * step(0.5, hash12(vc + 41.0));
  float inV = smoothstep(rad, rad * 0.55, length(q - ctr));
  vec2 lot = floor(q / 0.024);
  vec2 lf = fract(q / 0.024) - 0.5;
  float lh = hash12(lot);
  float roof = step(0.3, lh) * step(abs(lf.x), 0.3) * step(abs(lf.y), 0.2) * inV;
  c = mix(c, mix(vec3(0.28, 0.33, 0.2), vec3(0.4, 0.38, 0.32), step(0.6, hash12(lot + 2.0))), inV * 0.85);
  vec3 rc = lh > 0.72 ? vec3(0.52, 0.25, 0.17) : lh > 0.5 ? vec3(0.44, 0.42, 0.42) : vec3(0.58, 0.34, 0.23);
  c = mix(c, rc, roof * smoothstep(0.01, 0.004, fp));
  // trees: lines of crowns along the hedged fields, and woods
  float crowns = smoothstep(0.12, 0.5, noise(q / 0.011));
  float hedge = (1.0 - smoothstep(0.004, 0.009, o.edge)) * step(0.5, hash12(o.cell + 2.7));
  float wood = smoothstep(0.6, 0.64, fbm3(q / 2.2 + 11.0));
  tree = max(hedge * crowns, wood * (0.55 + 0.45 * crowns)) * (1.0 - inV * 0.6);
  c = mix(c, vec3(0.085, 0.11, 0.065) * (0.75 + 0.5 * noise(q / 0.004)), tree);
  // past a few pixels per field the patchwork averages out (no shimmer from orbit)
  return mix(vec3(0.46, 0.41, 0.28), c, smoothstep(o.W * 0.4, o.W * 0.07, fp));
}

// a hedged field's long dawn shadow: how far it is from here to the field's edge, walking toward the sun
float hedgeShade(Fld o, vec2 toSun, float len) {
  vec2 s = vec2(o.rc.x * toSun.x + o.rc.y * toSun.y, -o.rc.y * toSun.x + o.rc.x * toSun.y);
  float dx = s.x > 0.0 ? (o.W - o.f.x) / max(s.x, 1e-4) : o.f.x / max(-s.x, 1e-4);
  float dy = s.y > 0.0 ? (o.L - o.f.y) / max(s.y, 1e-4) : o.f.y / max(-s.y, 1e-4);
  return step(0.5, hash12(o.cell + 2.7)) * (1.0 - smoothstep(len * 0.55, len, min(dx, dy)));
}

float terrainH(vec2 q) { return fbm3(q / 2.4) * 0.07; } // rolling ground, km
#endif
float bigH(vec2 q) { return fbm3(q / 28.0) * 0.55; }    // whole hills, seen side-lit from high up

vec3 tonemap(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// ---- space and the limb: haze by the Chapman estimate at the ray's lowest point ----
vec3 skyColor(vec3 rd, float h, vec3 sun, vec3 sunCol, vec3 air, float mu) {
  float tc = max(-(R + h) * rd.y, 0.0);
  float hmin = rd.y < 0.0 ? sqrt(max((R + h) * (R + h) * (1.0 - rd.y * rd.y), 0.0)) - R : h;
  float path = min(H0 / max(rd.y, 1e-3), sqrt(2.0 * PI * R * H0));
  float od = KS * 1.6 * exp(-max(hmin, 0.0) / H0) * path;
  vec3 pm = vec3(0.0, h, 0.0) + rd * tc;
  float lit = smoothstep(-0.22, 0.12, dot(normalize(pm + vec3(0.0, R, 0.0)), sun));
  vec3 sky = air * (0.05 + 1.25 * lit) * (1.0 - exp(-od));
  // a thin bright line where the ray grazes the air above the sunlit limb
  sky += mix(vec3(0.35, 0.5, 0.85), vec3(1.0, 0.62, 0.3), pow(max(mu, 0.0), 3.0)) * exp(-max(hmin, 0.0) / 3.0) * lit * 0.5;
  float tr = exp(-od);
  // stars, only where the air is thin
  vec2 su = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, -1.0, 1.0))) * 160.0;
  vec2 sid = floor(su);
  float sh = hash12(sid);
  vec2 sp = fract(su) - 0.5 - (hash22(sid) - 0.5) * 0.6;
  float star = step(0.986, sh) * smoothstep(0.17, 0.0, length(sp)) * (sh - 0.986) * 70.0 * (0.75 + 0.25 * sin(uTime * 2.0 + sh * 60.0));
  sky += vec3(0.85, 0.9, 1.0) * star * tr * smoothstep(80.0, 220.0, h + 120.0 * (1.0 - lit));
  // the sun: a hot core and a thin halo in space; the wide bloom only inside the air
  vec3 redden = vec3(1.0, exp(-od * 0.45), exp(-od * 1.1));
  float m = max(mu, 0.0);
  sky += sunCol * redden * (pow(m, 60000.0) * 26.0 + pow(m, 6000.0) * 0.9 + pow(m, 400.0) * 0.06 + pow(m, 22.0) * 0.1 * (1.0 - smoothstep(20.0, 120.0, h)));
  return sky;
}

// ---- the ground: land, rivers, lakes, the sea, the haze between ----
vec3 groundColor(vec3 rd, float h, float tg, float pixAng, vec3 sun, vec3 sunCol, vec3 air) {
  vec3 p = vec3(0.0, h, 0.0) + rd * tg;
  vec3 n = normalize(p + vec3(0.0, R, 0.0));
  vec2 q = p.xz + vec2(0.0, uDrift);
  float fp = tg * pixAng;
  float belt = exp(-length(p.xz) / 140.0);
  // continents and sea from far; the field's own country is always land
  float landMask = 1.0;
  float reg = 0.5;
  if (fp > 0.03) {
    landMask = mix(1.0, smoothstep(0.47, 0.5, fbm3(q / 1900.0 + 50.0) + 0.25 * exp(-length(p.xz) / 900.0)), smoothstep(0.05, 0.6, fp));
    reg = fbm3(q / 700.0 + 9.0);
  }
#ifdef LITE
  // from orbit the patchwork is far below a pixel: its mean tone (what farmland() itself averages out to)
  float tree = 0.0;
  vec3 alb = vec3(0.46, 0.41, 0.28);
#else
  Fld fo = field(q);
  float tree;
  vec3 alb = farmland(q, fp, fo, tree);
#endif
  // beyond the farm belt: rougher country
  vec3 wild = mix(vec3(0.32, 0.29, 0.21), vec3(0.15, 0.17, 0.12), smoothstep(0.4, 0.62, reg));
  float k = clamp(belt + smoothstep(0.42, 0.55, reg) * 0.6, 0.0, 1.0);
  alb = mix(wild, alb, k) * 0.9;
  tree *= k;
  // relief: rolling ground catches the low sun close up, whole hills do from high up
  float E = max(0.5, fp * 2.0);
  float bh = bigH(q);
  vec2 slope = vec2(bigH(q + vec2(E, 0.0)) - bh, bigH(q + vec2(0.0, E)) - bh) / E;
#ifndef LITE
  float e = max(0.03, fp * 2.0);
  float th = terrainH(q);
  slope += vec2(terrainH(q + vec2(e, 0.0)) - th, terrainH(q + vec2(0.0, e)) - th) / e * smoothstep(1.5, 0.2, fp);
#endif
  vec3 tn = normalize(n + vec3(-slope.x, 0.0, -slope.y));
  float ndl = dot(tn, sun);
  // cloud shadows, projected along the sun
  float shade = 1.0 - 0.7 * cloudCover(q + sun.xz / max(sun.y, 0.08) * CH, fp);
  vec3 amb = vec3(0.05, 0.07, 0.11) * (0.25 + 0.75 * smoothstep(-0.2, 0.15, dot(n, sun)));
#ifdef LITE
  vec3 lc = alb * (sunCol * max(ndl, 0.0) * shade + amb);
#else
  // the hedges' long dawn shadows, cast away from the low sun (close up only)
  float tsh = fp < 0.012 ? hedgeShade(fo, normalize(sun.xz), 0.012 / max(tan(uSunEl), 0.06)) * (1.0 - tree) * smoothstep(0.012, 0.004, fp) : 0.0;
  vec3 lc = alb * (sunCol * max(ndl, 0.0) * shade * (1.0 - 0.62 * tsh) * (1.0 + tree * 0.6) + amb);
  // morning mist lying in the hollows, lit warm from the side
  float mist = smoothstep(0.52, 0.78, fbm3(q / 1.3 + vec2(uTime * 0.012, 0.0))) * (1.0 - smoothstep(0.0, 0.035, th)) * (1.0 - smoothstep(6.0, 40.0, h));
  lc = mix(lc, air * 0.55 + sunCol * 0.16, mist * 0.45);
#endif
  // water: the sea, and rivers and lakes on the land - dark, holding the dawn sky and the sun's glint
  vec3 rf = reflect(rd, n);
  float fres = 0.02 + 0.98 * pow(clamp(1.0 - dot(-rd, n), 0.0, 1.0), 5.0);
  float gl = max(dot(rf, sun), 0.0);
  vec3 water = vec3(0.012, 0.022, 0.035) * (amb * 6.0 + sunCol * max(dot(n, sun), 0.0) * 0.4);
  water += sunCol * (pow(gl, 900.0) * 6.0 + pow(gl, 60.0) * 0.25) * fres * 4.0 + air * (0.12 + fres * 0.5);
#ifndef LITE
  float river = (1.0 - smoothstep(0.0009, 0.0009 + fp / 60.0, abs(fbm3(q / 36.0 + 7.0) - 0.5))) * smoothstep(0.9, 0.08, fp);
  float lake = smoothstep(0.705, 0.712, fbm3(q / 9.0 + 3.0)) * smoothstep(0.9, 0.1, fp);
  lc = mix(lc, water, max(river, lake) * landMask);
#endif
  lc = mix(water, lc, landMask);
  // aerial perspective along the slant (thicker toward the horizon and near the ground, thinner from orbit)
  float cosz = max(-dot(rd, n), 0.02);
  float od = KS * (H0 / cosz) * (1.0 - exp(-min(h, 60.0) / H0)) * mix(1.8, 0.75, smoothstep(3.0, 30.0, h));
  float lit = smoothstep(-0.25, 0.12, dot(n, sun));
  return lc * exp(-od) + air * (0.06 + 1.1 * lit) * (1.0 - exp(-od));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float h = uAlt;
  // camera: yaw then pitch, a 40-degree vertical field of view
  vec3 fw = vec3(sin(uYaw) * cos(uPitch), sin(uPitch), cos(uYaw) * cos(uPitch));
  vec3 rt0 = normalize(vec3(cos(uYaw), 0.0, -sin(uYaw)));
  vec3 up0 = cross(fw, rt0);
  vec3 rt = rt0 * cos(uRoll) + up0 * sin(uRoll);
  vec3 up = up0 * cos(uRoll) - rt0 * sin(uRoll);
  float focal = 0.5 / tan(0.5 * uFov);
  vec3 rd = normalize(fw * focal - rt * uv.x + up * uv.y);
  float pixAng = 1.0 / (uRes.y * focal);

  // the sun stands 35 degrees off the axis, low, and rises as the camera falls
  vec3 sun = normalize(vec3(-0.57 * cos(uSunEl), sin(uSunEl), 0.82 * cos(uSunEl)));
  float lowSun = 1.0 - smoothstep(0.02, 0.35, uSunEl);
  vec3 sunCol = mix(vec3(1.0, 0.86, 0.68), vec3(1.0, 0.56, 0.26), lowSun) * 3.2;
  float mu = dot(rd, sun);
  // the air's own colour in this direction: cool steel, warming toward the sun
  vec3 air = mix(vec3(0.10, 0.17, 0.33), vec3(1.2, 0.6, 0.24), pow(max(mu, 0.0), 5.0) * (0.45 + 0.55 * lowSun));
  air += vec3(1.0, 0.5, 0.2) * pow(max(mu, 0.0), 48.0) * 1.4;

  vec2 g = shell(h, 0.0, rd);
  bool hitGround = g.y > 0.0 && g.x > 0.0;
  float tg = hitGround ? g.x : 1e9;
  // the limb, antialiased: the ray's lowest altitude (negative = it would pass below ground) over its distance is
  // the angle to the planet's edge; within a pixel of it, sky and ground blend by coverage
  float hminS = rd.y < 0.0 ? sqrt(max((R + h) * (R + h) * (1.0 - rd.y * rd.y), 0.0)) - R : h;
  float skyCov = smoothstep(-0.7, 0.7, (hminS / max(-(R + h) * rd.y, 1.0)) / pixAng);
  vec3 col = vec3(0.0);
  if (skyCov > 0.0) col = skyColor(rd, h, sun, sunCol, air, mu) * skyCov;
  if (skyCov < 1.0) col += (hitGround ? groundColor(rd, h, tg, pixAng, sun, sunCol, air) : air * (0.06 + 1.1 * smoothstep(-0.25, 0.12, sun.y))) * (1.0 - skyCov);

  // ---- the cloud deck ----
  vec2 cs = shell(h, CH, rd);
  float tcl = h > CH ? cs.x : cs.y;
  if (tcl > 0.0 && tcl < tg) {
    vec3 pc = vec3(0.0, h, 0.0) + rd * tcl;
    vec2 qc = pc.xz + vec2(0.0, uDrift);
    float fpc = tcl * pixAng;
    float d = cloudCover(qc, fpc);
    // a crude thickness: the side facing away from the sun sits in its own shadow
    float d2 = cloudCover(qc + sun.xz * 0.5, fpc);
    vec3 cn = normalize(pc + vec3(0.0, R, 0.0));
    float cl = max(dot(cn, sun), 0.0);
    float self = clamp(1.0 - (d2 - d) * 1.6, 0.35, 1.0);
    vec3 cc = sunCol * (0.16 + 0.5 * cl) * self * (h > CH ? 0.5 : 0.12) + vec3(0.07, 0.09, 0.13) * (h > CH ? 1.0 : 0.55);
    float cosz = max(abs(dot(rd, cn)), 0.02);
    float od = KS * (H0 / cosz) * (1.0 - exp(-min(h, 60.0) / H0)) * 0.9;
    cc = cc * exp(-od) + air * (1.0 - exp(-od)) * 0.8;
    // edge-on, the deck closes into a soft band
    col = mix(col, cc, d * smoothstep(0.0, 0.25, cosz + 0.05) * 0.92);
  }
  // inside the cloud: a bright, sunlit white-out as the camera punches through
  col = mix(col, vec3(0.38, 0.4, 0.45) + sunCol * 0.1, uInCloud * 0.92);

  // the lens: an anamorphic streak through the sun, a soft bloom, and ghosts strung through the frame's centre
  if (uSunScr.z > 0.001) {
    vec2 d = uv - uSunScr.xy;
    float streak = exp(-abs(d.y) * 260.0) * exp(-abs(d.x) * 1.6);
    float bloom = exp(-length(d) * 12.0);
    vec2 g1 = uv + uSunScr.xy * 0.55;
    vec2 g2 = uv + uSunScr.xy * 1.25;
    vec2 g3 = uv - uSunScr.xy * 0.3;
    float ghosts = smoothstep(0.05, 0.0, length(g1)) * 0.35 + smoothstep(0.028, 0.0, length(g2)) * 0.5 + smoothstep(0.09, 0.0, length(g3)) * 0.12;
    col += uSunScr.z * (vec3(1.0, 0.58, 0.28) * streak * 1.1 + vec3(1.0, 0.72, 0.45) * bloom * 0.18 + vec3(0.55, 0.72, 1.0) * ghosts * 0.09);
  }

  // grade: ACES, a filmic contrast curve, display gamma, a vignette, film grain
  col = tonemap(col * mix(0.82, 1.05, smoothstep(3.0, 40.0, h)));
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.35);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 vq = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - 0.55 * dot(vq, vq) * 1.6;
  col += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) * 0.035;
  gl_FragColor = vec4(col * uFade, 1.0);
}
`

type GL = WebGLRenderingContext | WebGL2RenderingContext

/** the noise every layer of the film is built from: 256 x 256 random bytes (the same ones on every visit) */
export const NOISE_SIZE = 256
export function filmNoise(): Uint8Array {
  const bytes = new Uint8Array(NOISE_SIZE * NOISE_SIZE)
  let seed = 0x9e3779b9
  for (let i = 0; i < bytes.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    bytes[i] = seed >>> 24
  }
  return bytes
}

/** what the film's shader is given for one frame */
export type FilmFrame = { time: number; alt: number; pitch: number; yaw: number; drift: number; sunEl: number; fade: number; inCloud: number; roll: number; fov: number; sunScr: [number, number, number] }

/**
 * The film's camera, without a canvas: its clock chasing the progress on a spring, the shot list, the bank, the air,
 * the dawn - one step a frame gives what the shader needs. The loader's film (createDescent) runs on it; so does the
 * page's closing ascent, which draws the same shader as a scene of the shared canvas (lib/ascentFilm).
 */
export function createFilmClock(opts: { reduce: boolean; free?: boolean }) {
  // the film's clock: u runs 0 → 1 through the shot list above, chasing the loading progress on a spring (so the
  // camera gathers speed and brakes like a body with weight, never at a constant rate)
  let u = 0
  let uVel = 0
  let uTarget = 0
  let roll = 0
  let prevYaw = KEYS.yaw[0]
  let drift = 0
  let time = 0
  let fadeIn = opts.reduce ? 1 : 0
  let leaving = 0 // 0 = not leaving; else ms of the exit
  let leaveT = 0
  let primed = false
  return {
    /** the target: loading progress 0..1 (the loader's film never runs backwards; a free one follows both ways) */
    target: (p: number) => {
      uTarget = opts.free ? filmAt(p) : Math.max(uTarget, filmAt(p))
    },
    /** the way out: tip the camera to nadir and drop, over `ms` */
    leave: (ms: number) => {
      leaving = Math.max(1, ms)
    },
    leaving: () => leaving > 0,
    /** `dt` seconds on. `whole`: the whole film's program is in, not only the opening's; `aspect`: width / height */
    step: (dt: number, whole: boolean, aspect: number): FilmFrame => {
      if (!opts.reduce) {
        time += dt
        // the opening beat belongs to the film: the sun cresting the limb plays out at its own pace, whatever the
        // loading (the film starts before the app that reports it). After the beat the camera follows the loading,
        // and while there is none yet it keeps creeping down its orbit rather than hanging still
        const beat = 0.16 * smooth(0, 1, time / 1.5)
        // (and it stays in orbit while only the opening's program is in)
        let target = time < 1.5 || !whole ? beat : Math.max(uTarget, 0.16 + 0.05 * (1 - Math.exp(-(time - 1.5) / 7)))
        if (opts.free) {
          // free: no opening beat and no floor; only orbit until the whole film's program is in (the small one has no ground)
          target = whole ? uTarget : Math.min(uTarget, 0.16)
          if (!primed) {
            primed = true
            u = target
          }
        }
        // a critically damped spring toward the target, its speed capped so the fall itself takes at least ~1.7 s
        const w = 2.8
        uVel += (w * w * (target - u) - 2 * w * uVel) * dt
        uVel = Math.min(Math.max(uVel, opts.free ? -0.5 : 0), 0.5)
        u = Math.max(0, Math.min(1, u + uVel * dt))
        fadeIn = Math.min(1, fadeIn + dt / 0.8)
      } else u = whole ? uTarget : 0
      const deg = Math.PI / 180
      let alt = Math.exp(curve(KEYS.u, KEYS.lnAlt, u))
      let pitch = curve(KEYS.u, KEYS.pitch, u) * deg
      let yaw = curve(KEYS.u, KEYS.yaw, u)
      let fov = curve(KEYS.u, KEYS.fov, u) * deg
      // bank into the turn like an aircraft (the roll follows the turn rate, eased), a breath of sway on top
      const yawRate = dt > 0 ? (yaw - prevYaw) / dt : 0
      prevYaw = yaw
      roll += (Math.max(-0.13, Math.min(0.13, -yawRate * 0.55)) - roll) * (1 - Math.exp(-dt / 0.35))
      let r = roll
      if (!opts.reduce) {
        // air: a whisper of handheld drift everywhere, a shudder through the cloud deck
        const buffet = 0.0018 + 0.012 * Math.exp(-(((alt - 4) / 1.1) ** 2))
        pitch += buffet * (Math.sin(time * 5.3) * 0.6 + Math.sin(time * 8.9 + 1.3) * 0.4)
        yaw += buffet * 0.7 * Math.sin(time * 4.1 + 0.7)
        r += buffet * 0.8 * Math.sin(time * 6.7 + 2.1) + 0.006 * Math.sin(time * 0.6)
      }
      if (leaving) {
        // the way out: tip straight down to the field, drop, and push the lens in a touch
        leaveT = Math.min(1, leaveT + (dt * 1000) / leaving)
        const k = leaveT * leaveT * (3 - 2 * leaveT)
        pitch = pitch + (-Math.PI / 2 + 0.001 - pitch) * k
        r *= 1 - k
        alt *= 1 - 0.35 * k
        fov *= 1 - 0.12 * k
      }
      const s = altitudeShare(alt) // 1 orbit … 0 field
      // ground speed: orbital at the top, an aircraft's at the bottom
      if (!opts.reduce) drift += 7.5 * Math.pow(alt / ORBIT_KM, 0.85) * dt
      // dawn as a time-lapse: the sun crests the limb at orbit and stands 11° up over the field
      const dip = Math.acos(6371 / (6371 + alt))
      const sunEl = (1 - s) * 11 * deg + s * (-dip + 2.2 * deg)
      // where the sun lands on the screen, for the lens flare (the shader's own camera, worked out here once)
      const sun = [-0.57 * Math.cos(sunEl), Math.sin(sunEl), 0.82 * Math.cos(sunEl)]
      const fw = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
      const rt0 = [Math.cos(yaw), 0, -Math.sin(yaw)]
      const up0 = [fw[1] * rt0[2] - fw[2] * rt0[1], fw[2] * rt0[0] - fw[0] * rt0[2], fw[0] * rt0[1] - fw[1] * rt0[0]]
      const rt = rt0.map((v, i) => v * Math.cos(r) + up0[i] * Math.sin(r))
      const up = up0.map((v, i) => v * Math.cos(r) - rt0[i] * Math.sin(r))
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
      const focal = 0.5 / Math.tan(fov / 2)
      const z = dot(sun, fw)
      const sx = z > 0.05 ? (-dot(sun, rt) / z) * focal : 9
      const sy = z > 0.05 ? (dot(sun, up) / z) * focal : 9
      const onScreen = 1 - smooth(aspect * 0.5, aspect * 0.5 + 0.25, Math.abs(sx)) * 1
      const aboveLimb = smooth(-dip - 0.4 * deg, -dip + 1.2 * deg, sunEl)
      return {
        time,
        alt,
        pitch,
        yaw,
        drift,
        sunEl,
        fade: smooth(0, 1, fadeIn),
        // the camera inside the deck: the one cloud over its own track (0.85 cover), within 0.7 km of the deck
        inCloud: 0.85 * (1 - smooth(0, 0.7, Math.abs(alt - 4))),
        roll: r,
        fov,
        sunScr: [sx, sy, Math.max(0, onScreen) * aboveLimb * (1 - smooth(0, 0.25, leaveT))],
      }
    },
  }
}

function compile(gl: GL, type: number, src: string, defer: boolean) {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!defer && !gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('[descent] shader:', gl.getShaderInfoLog(s))
    gl.deleteShader(s)
    return null
  }
  return s
}

/** Starts the film on a canvas; null when there is no WebGL (the loader's text carries on alone). */
export function createDescent(canvas: DescentCanvas, opts: DescentOptions): Descent | null {
  const attrs: WebGLContextAttributes = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }
  const gl = ((canvas as HTMLCanvasElement).getContext('webgl2', attrs) ?? (canvas as HTMLCanvasElement).getContext('webgl', attrs)) as GL | null
  if (!gl) return null
  // Two programs from one source. The whole film's shader takes the driver a second or two to compile the first
  // time a browser sees it; the opening - the orbit, where the ground is far below a pixel - needs a fraction of it
  // (LITE compiles the close-up ground out and is pixel-identical up there). So the small program is on screen
  // almost at once and the whole one takes over, unseen, as soon as it is in; the camera stays in orbit until then.
  // Both compile off the GPU's main thread where the driver allows it (KHR_parallel_shader_compile), and are only
  // asked for their result once it is in: a big shader would otherwise stall every canvas on the page.
  const par = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null
  type Uniforms = { res: WebGLUniformLocation | null; time: WebGLUniformLocation | null; alt: WebGLUniformLocation | null; pitch: WebGLUniformLocation | null; yaw: WebGLUniformLocation | null; drift: WebGLUniformLocation | null; sunEl: WebGLUniformLocation | null; fade: WebGLUniformLocation | null; inCloud: WebGLUniformLocation | null; roll: WebGLUniformLocation | null; fov: WebGLUniformLocation | null; sunScr: WebGLUniformLocation | null }
  type Prog = { prog: WebGLProgram; vs: WebGLShader; fs: WebGLShader; state: 'wait' | 'ok' | 'bad' }
  const build = (defines: string): Prog | null => {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT, !!par)
    const fs = compile(gl, gl.FRAGMENT_SHADER, defines + DESCENT_FRAG, !!par)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) return null
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.bindAttribLocation(prog, 0, 'aPos')
    gl.linkProgram(prog)
    return { prog, vs, fs, state: 'wait' }
  }
  const lite = build('#define LITE\n')
  const full = build('')
  if (!lite || !full) return null
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  // the noise every layer is built from: 256x256 random bytes, filtered and tiled by the GPU (one fetch an octave -
  // a fraction of the arithmetic, and a shader small enough to compile quickly on every driver)
  const tex = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  const N = NOISE_SIZE
  const bytes = filmNoise()
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, N, N, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  let U: Uniforms | null = null
  let active: Prog | null = null
  let failed = false
  /** has the driver finished this program? (never asks before it has, where it can tell us) */
  const poll = (p: Prog) => {
    if (p.state !== 'wait') return p.state
    if (par && !gl.getProgramParameter(p.prog, par.COMPLETION_STATUS_KHR)) return 'wait'
    p.state = gl.getProgramParameter(p.prog, gl.LINK_STATUS) ? 'ok' : 'bad'
    if (p.state === 'bad') console.warn('[descent] link:', gl.getProgramInfoLog(p.prog), gl.getShaderInfoLog(p.fs))
    return p.state
  }
  const use = (p: Prog) => {
    active = p
    gl.useProgram(p.prog)
    const u = (name: string) => gl.getUniformLocation(p.prog, name)
    U = { res: u('uRes'), time: u('uTime'), alt: u('uAlt'), pitch: u('uPitch'), yaw: u('uYaw'), drift: u('uDrift'), sunEl: u('uSunEl'), fade: u('uFade'), inCloud: u('uInCloud'), roll: u('uRoll'), fov: u('uFov'), sunScr: u('uSunScr') }
    gl.uniform1i(u('uNoise'), 0)
    resize()
  }
  /** a program is in use (false while the driver is still compiling the first one) */
  const ready = (): boolean => {
    if (failed) return false
    if (active === full) return true
    // (where the driver cannot compile in parallel, asking blocks: the small program gets on screen first)
    if (par || active === lite) {
      const f = poll(full)
      if (f === 'ok') use(full)
      else if (f === 'bad') {
        failed = true
        opts.onFail?.()
        return false
      }
    }
    if (!active && poll(lite) === 'ok') use(lite)
    return !!active
  }

  const raf = opts.raf ?? ((cb: (t: number) => void) => requestAnimationFrame(cb))
  const caf = opts.caf ?? ((id: number) => cancelAnimationFrame(id))
  let cssW = opts.width
  let cssH = opts.height
  let dpr = Math.min(opts.dpr, 1.25)
  // the film is soft (air, haze, distance) - it renders below CSS resolution and the GPU budget steers how far below
  let scale = 1
  const resize = () => {
    const w = Math.max(2, Math.round(cssW * dpr * scale))
    const hh = Math.max(2, Math.round(cssH * dpr * scale))
    if (canvas.width !== w || canvas.height !== hh) {
      canvas.width = w
      canvas.height = hh
    }
    if (!U) return
    gl.viewport(0, 0, w, hh)
    gl.uniform2f(U.res, w, hh)
  }

  // the camera (createFilmClock): its clock, the shot list, the air
  const clock = createFilmClock(opts)
  let raf0 = 0
  let last = 0
  let lastAlt = 0
  let drawn = false
  let disposed = false
  let dtSum = 0
  let dtN = 0
  let frameMs = 16.7

  const frame = (now: number) => {
    raf0 = 0
    if (disposed) return
    if (!ready() || !U) {
      // still compiling: look again next frame (the clock starts with the first real frame)
      if (!failed) raf0 = raf(frame)
      return
    }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
    last = now
    const f = clock.step(dt, active === full, canvas.width / Math.max(1, canvas.height))
    gl.uniform3f(U.sunScr, f.sunScr[0], f.sunScr[1], f.sunScr[2])
    gl.uniform1f(U.roll, f.roll)
    gl.uniform1f(U.fov, f.fov)
    gl.uniform1f(U.time, f.time)
    gl.uniform1f(U.alt, f.alt)
    gl.uniform1f(U.pitch, f.pitch)
    gl.uniform1f(U.yaw, f.yaw)
    gl.uniform1f(U.drift, f.drift)
    gl.uniform1f(U.sunEl, f.sunEl)
    gl.uniform1f(U.fade, f.fade)
    gl.uniform1f(U.inCloud, f.inCloud)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    if (!drawn) {
      drawn = true
      opts.onDrawn?.()
    }
    opts.onTick?.(f.alt)
    if (now - lastAlt > 100) {
      lastAlt = now
      opts.onAlt?.(f.alt, Math.round(frameMs * 10) / 10)
    }
    // adaptive resolution: a struggling GPU drops the backing scale a step at a time
    dtSum += dt
    dtN++
    frameMs = frameMs * 0.9 + dt * 1000 * 0.1
    if (dtN >= 30) {
      const mean = dtSum / dtN
      dtSum = 0
      dtN = 0
      if (mean > 0.024 && scale > 0.45) {
        scale = Math.max(0.45, scale - 0.12)
        resize()
      }
    }
    if (!opts.reduce || clock.leaving()) raf0 = raf(frame)
  }
  const kick = () => {
    if (!raf0 && !disposed) raf0 = raf(frame)
  }
  kick()

  return {
    progress: (p) => {
      // (the loader's film never runs backwards)
      clock.target(p)
      if (opts.reduce) kick()
    },
    size: (w, h, d) => {
      cssW = w
      cssH = h
      dpr = Math.min(d, 1.25)
      resize()
      kick()
    },
    leave: (ms) => {
      clock.leave(ms)
      kick()
    },
    dispose: () => {
      disposed = true
      if (raf0) caf(raf0)
      gl.deleteBuffer(buf)
      gl.deleteTexture(tex)
      for (const p of [lite, full]) {
        gl.deleteProgram(p.prog)
        gl.deleteShader(p.vs)
        gl.deleteShader(p.fs)
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

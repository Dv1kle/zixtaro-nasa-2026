import { motion, useSpring, useTransform } from 'motion/react'
import { useEffect } from 'react'
import { TALL_CROPS, type CutawayMonth } from '../lib/ghCutaway'
import type { GhResult } from '../lib/greenhouse'

// The flat cross-section: what the cutaway draws where WebGL is not available. The same month, the same numbers as the
// 3D section (lib/ghCutaway), as an SVG whose geometry moves only through transforms and motion values.

const GROUND = 380
const LEFT = 170
const RIGHT = 790
const GUTTER = 250
const RIDGE = 185
const SPAN = (RIGHT - LEFT) / 3
const SUN_X = 92
const HOUSE = `M${LEFT},${GROUND} L${LEFT},${GUTTER} ${[0, 1, 2].map((k) => `L${LEFT + SPAN * (k + 0.5)},${RIDGE} L${LEFT + SPAN * (k + 1)},${GUTTER}`).join(' ')} L${RIGHT},${GROUND} Z`
const PLANTS = Array.from({ length: 9 }, (_, i) => LEFT + 34 + i * ((RIGHT - LEFT - 68) / 8))
const STEM_MAX = 112
const BASE = GROUND - 16
// deterministic "random": rain streaks, stars, beams
const DROPS = Array.from({ length: 20 }, (_, i) => ({ x: 130 + ((i * 277) % 700), len: 10 + ((i * 7) % 12), dur: 0.75 + ((i * 0.31) % 0.55), d: ((i * 0.37) % 1.3).toFixed(2) }))
const STARS = Array.from({ length: 16 }, (_, i) => ({ x: 20 + ((i * 263) % 960), y: 14 + ((i * 97) % 150), r: 0.6 + ((i * 3) % 3) * 0.35, d: ((i * 0.53) % 3).toFixed(2) }))
const BEAMS = [0, 1, 2, 3].map((k) => ({ a: 250 + k * 150, b: 330 + k * 150 }))
const LEAF = 'M0,0 C5,-6 13,-6 18,-1 C13,4 5,5 0,0 Z'

export function GreenhouseCutawayFlat({ result, look }: { result: GhResult; look: CutawayMonth }) {
  const { m, inCrop, light, heat, lamps, shade, rainMm, level, growth, inside, hot, night } = look
  const crop = result.crop
  const spec = result.spec
  const maxDli = Math.max(...result.months.map((x) => x.dliOut), 1)
  const drops = Math.max(0, Math.min(DROPS.length, Math.round(rainMm / 5)))
  const plantH = (TALL_CROPS.has(crop.id) ? STEM_MAX : 40) * growth
  const sunY = 150 - light * 95
  // geometry glides through motion values: no attribute ever passes through an undefined first frame
  const sunMv = useSpring(sunY, { stiffness: 50, damping: 15 })
  const levelMv = useSpring(level, { stiffness: 70, damping: 18 })
  useEffect(() => sunMv.set(sunY), [sunY, sunMv])
  useEffect(() => levelMv.set(level), [level, levelMv])
  const sunShift = useTransform(sunMv, (v) => v - 100)
  const tankY = useTransform(levelMv, (v) => 378 - 96 * v)
  const tankH = useTransform(levelMv, (v) => 96 * v)
  const surface = useTransform(levelMv, (v) => -96 * v)

  return (
    <svg viewBox="0 0 1000 440" className="block h-auto w-full overflow-hidden rounded-xl" aria-hidden>
      <defs>
        <radialGradient id="gh-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff4c8" />
          <stop offset="0.35" stopColor="var(--color-wheat)" stopOpacity="0.6" />
          <stop offset="1" stopColor="var(--color-wheat)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gh-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a3442" />
          <stop offset="0.7" stopColor="#161b23" />
          <stop offset="1" stopColor="#0d1014" />
        </linearGradient>
        <linearGradient id="gh-beam" gradientUnits="userSpaceOnUse" x1={SUN_X} y1="100" x2="600" y2="480">
          <stop offset="0" stopColor="#fff1b8" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="var(--color-wheat)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--color-wheat)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gh-inside" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-wheat)" stopOpacity="0.2" />
          <stop offset="1" stopColor="var(--color-wheat)" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="gh-sheen" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gh-lamp" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffd08a" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--color-leaf)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="gh-floor-heat" cx="50%" cy="100%" r="70%">
          <stop offset="0" stopColor="var(--color-heat)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--color-heat)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gh-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#a6cdd1" stopOpacity="0.85" />
          <stop offset="1" stopColor="#3d6a70" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="gh-drop" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-water)" stopOpacity="0" />
          <stop offset="1" stopColor="#cfe3e5" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="gh-fruit" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="0.35" stopColor={crop.color} />
          <stop offset="1" stopColor={crop.color} stopOpacity="0.85" />
        </radialGradient>
        <pattern id="gh-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-wheat)" strokeOpacity="0.5" strokeWidth="2" />
        </pattern>
        <filter id="gh-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="gh-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        <clipPath id="gh-clip"><path d={HOUSE} /></clipPath>
        <clipPath id="gh-tank"><rect x="851" y="281" width="98" height="98" rx="7" /></clipPath>
      </defs>

      {/* sky: brighter with the month's sunlight; stars on dark months; clouds when it rains */}
      <rect x="0" y="0" width="1000" height={GROUND} fill="#0b0d11" />
      <motion.rect x="0" y="0" width="1000" height={GROUND} fill="url(#gh-sky)" animate={{ opacity: 0.2 + 0.8 * light }} transition={{ duration: 1.2 }} />
      <motion.g animate={{ opacity: night ? 1 : 0 }} transition={{ duration: 1 }}>
        {STARS.map((s, i) => <circle key={i} className="gh-twinkle" cx={s.x} cy={s.y} r={s.r} fill="#dfe4ec" style={{ animationDelay: `${s.d}s` }} />)}
      </motion.g>
      <motion.g animate={{ opacity: rainMm > 45 ? 0.9 : 0 }} transition={{ duration: 1.2 }}>
        <g className="gh-cloud" filter="url(#gh-soft)">
          <ellipse cx="300" cy="70" rx="120" ry="26" fill="#8e96a3" fillOpacity="0.35" />
          <ellipse cx="370" cy="58" rx="80" ry="24" fill="#a3aab5" fillOpacity="0.3" />
          <ellipse cx="720" cy="92" rx="140" ry="24" fill="#8e96a3" fillOpacity="0.28" />
        </g>
      </motion.g>

      {/* sun and its beams (they move with the sun; the ground below hides their ends) */}
      <motion.g style={{ y: sunShift }}>
        <motion.g animate={{ opacity: 0.25 + 0.75 * light }} transition={{ duration: 1 }} style={{ mixBlendMode: 'screen' }}>
          {BEAMS.map((b, k) => (
            <polygon key={k} className="gh-beam" points={`${SUN_X - 6},100 ${SUN_X + 6},100 ${b.b},480 ${b.a},480`} fill="url(#gh-beam)" style={{ animationDelay: `${k * 1.3}s` }} />
          ))}
        </motion.g>
        <motion.circle cx={SUN_X} cy="100" r="70" fill="url(#gh-sun)" animate={{ opacity: 0.35 + 0.65 * light, scale: 0.85 + 0.25 * light }} transition={{ duration: 1 }} />
        <circle cx={SUN_X} cy="100" r="17" fill="#fff6d6" filter="url(#gh-glow)" />
      </motion.g>

      {/* rain streaks */}
      {DROPS.slice(0, drops).map((d, i) => (
        <line key={i} className="gh-drop" x1={d.x} x2={d.x - 3} y1={-d.len} y2="0" stroke="url(#gh-drop)" strokeWidth="1.6" strokeLinecap="round" style={{ animationDuration: `${d.dur}s`, animationDelay: `${d.d}s` }} />
      ))}

      {/* inside: light through the cover, the floor warming, shade and night screens, lamps */}
      <g clipPath="url(#gh-clip)">
        <motion.rect x={LEFT} y={RIDGE} width={RIGHT - LEFT} height={GROUND - RIDGE} fill="url(#gh-inside)" animate={{ opacity: Math.min(1, (m.dliIn / maxDli) * 1.6) }} transition={{ duration: 1 }} />
        <motion.ellipse cx={(LEFT + RIGHT) / 2} cy={GROUND} rx={(RIGHT - LEFT) / 2} ry="90" fill="url(#gh-floor-heat)" className="gh-warm" animate={{ opacity: heat > 0 ? 0.35 + 0.65 * heat : 0 }} transition={{ duration: 1 }} />
        <motion.rect x={LEFT} width={RIGHT - LEFT} y={GUTTER + 6} height="10" fill="url(#gh-hatch)" initial={false} animate={{ opacity: shade ? 1 : 0, scaleX: shade ? 1 : 0 }} style={{ originX: 0 }} transition={{ duration: 0.8 }} />
        <motion.line x1={LEFT} x2={RIGHT} y1={GUTTER + 22} y2={GUTTER + 22} stroke="var(--color-orbit)" strokeOpacity="0.5" strokeDasharray="3 5" initial={false} animate={{ opacity: look.screen ? 1 : 0 }} transition={{ duration: 0.8 }} />
        {lamps && [0, 1, 2].flatMap((k) => [0.3, 0.7].map((f) => {
          const x = LEFT + SPAN * (k + f)
          return (
            <g key={`${k}-${f}`}>
              <polygon className="gh-lamp" points={`${x - 8},${GUTTER + 30} ${x + 8},${GUTTER + 30} ${x + 64},${GROUND} ${x - 64},${GROUND}`} fill="url(#gh-lamp)" />
              <rect x={x - 11} y={GUTTER + 26} width="22" height="5" rx="2.5" fill="#ffd08a" filter="url(#gh-glow)" />
            </g>
          )
        }))}
        {/* glass sheen sweeping across */}
        <g className="gh-sheen"><rect x="-160" y={RIDGE - 20} width="120" height={GROUND - RIDGE + 40} fill="url(#gh-sheen)" transform="skewX(-18)" /></g>
      </g>

      {/* the house */}
      <path d={HOUSE} fill="rgb(220 228 240 / 0.035)" stroke="rgb(225 232 240 / 0.55)" strokeWidth="2" strokeLinejoin="round" />
      {[0, 1, 2].map((k) => (
        <g key={k} stroke="rgb(220 228 240 / 0.13)">
          {[0.25, 0.5, 0.75].map((f) => {
            const x = LEFT + SPAN * (k + f)
            return <line key={f} x1={x} x2={x} y1={GUTTER - (GUTTER - RIDGE) * (1 - Math.abs(2 * f - 1))} y2={GROUND} />
          })}
        </g>
      ))}

      {/* heat escaping through the roof */}
      {heat > 0 && [0, 1, 2].map((k) => (
        <path
          key={k}
          className="gh-wisp"
          d={`M${LEFT + SPAN * (k + 0.5) - 10},${RIDGE - 6} q 10,-12 0,-24 q -10,-12 0,-24`}
          fill="none" stroke="var(--color-heat)" strokeWidth={2 + 3 * heat} strokeLinecap="round" filter="url(#gh-soft)"
          style={{ animationDelay: `${k * 0.6}s`, opacity: 0.35 + 0.65 * heat }}
        />
      ))}

      {/* heating pipes along the floor */}
      {[GROUND - 6, GROUND - 13].map((y) => (
        <motion.line key={y} x1={LEFT + 12} x2={RIGHT - 12} y1={y} y2={y} strokeWidth="4" strokeLinecap="round" filter={heat > 0 ? 'url(#gh-glow)' : undefined}
          animate={{ stroke: heat > 0 ? '#e8845c' : 'rgb(255 255 255 / 0.12)', opacity: heat > 0 ? 0.45 + 0.55 * heat : 1 }}
          transition={{ duration: 0.8 }} className={heat > 0 ? 'gh-pipe' : ''} />
      ))}

      {/* the crop: seedlings while establishing, swaying fruiting plants at harvest */}
      {PLANTS.map((x, i) => (
        <motion.g key={i} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }} initial={false} animate={{ scaleY: growth > 0 ? 1 : 0.001, opacity: growth > 0 ? 1 : 0 }} transition={{ type: 'spring', stiffness: 80, damping: 13, delay: i * 0.035 }}>
          <g className="gh-sway" style={{ animationDelay: `${(i % 4) * 0.4}s` }}>
            <motion.path
              d={`M${x},${BASE} C${x - 7},${BASE - STEM_MAX * 0.35} ${x + 7},${BASE - STEM_MAX * 0.7} ${x},${BASE - STEM_MAX}`}
              fill="none" stroke="#8fae64" strokeWidth="2.6" strokeLinecap="round"
              style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
              initial={false} animate={{ scaleY: Math.max(0.001, plantH / STEM_MAX) }} transition={{ duration: 0.9 }}
            />
            {[0.3, 0.52, 0.74, 0.94].map((f, k) => (
              <motion.g key={k} initial={false} animate={{ y: -plantH * f, opacity: plantH > 8 ? 1 : 0 }} transition={{ duration: 0.9 }}>
                <path d={LEAF} transform={`translate(${x},${BASE}) rotate(${k % 2 ? 200 : -20}) scale(${0.8 + 0.25 * growth})`} fill="var(--color-leaf)" fillOpacity="0.85" />
              </motion.g>
            ))}
            {m.state === 'harvest' && [0.4, 0.62, 0.82].map((f, k) => (
              <motion.circle key={`f${k}`} cx={x + (k % 2 ? -6 : 7)} cy={BASE - plantH * f} r={TALL_CROPS.has(crop.id) ? 5.5 : 4} fill="url(#gh-fruit)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.35 + i * 0.03 + k * 0.08 }} />
            ))}
          </g>
        </motion.g>
      ))}

      {/* gutter → downpipe → tank with a living water surface */}
      <path d={`M${RIGHT},${GUTTER} L${RIGHT + 30},${GUTTER} L${RIGHT + 30},290 L850,290`} fill="none" stroke="rgb(220 228 240 / 0.35)" strokeWidth="3" />
      {drops > 0 && <path className="gh-flow" d={`M${RIGHT},${GUTTER} L${RIGHT + 30},${GUTTER} L${RIGHT + 30},290 L850,290`} fill="none" stroke="var(--color-water)" strokeWidth="2" strokeDasharray="6 10" strokeLinecap="round" />}
      <rect x="850" y="280" width="100" height="100" rx="8" fill="rgb(127 176 182 / 0.05)" stroke="rgb(127 176 182 / 0.5)" />
      <g clipPath="url(#gh-tank)">
        <motion.rect x="850" y={tankY} width="100" height={tankH} fill="url(#gh-water)" />
        <motion.g style={{ y: surface }}>
          <g className="gh-wave">
            <path d="M850,378 q12,-5 24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 v10 h-192 z" fill="#cfe3e5" fillOpacity="0.55" />
          </g>
          {drops > 0 && [0, 1].map((k) => <ellipse key={k} className="gh-ripple" cx={878 + k * 38} cy="378" rx="10" ry="2.2" fill="none" stroke="#e4eff0" strokeWidth="1" style={{ animationDelay: `${k * 0.7}s` }} />)}
        </motion.g>
      </g>
      <text x="900" y="272" textAnchor="middle" className="fill-water font-mono text-[12px] max-sm:hidden">tank {Math.round(level * 100)}%</text>

      {/* thermometers */}
      <text x="40" y="330" className="fill-ink-3 font-mono text-[12px] max-sm:hidden">outside</text>
      <text x="40" y="358" className="fill-ink font-display-soft text-[30px] max-sm:hidden">{m.tOut.toFixed(0)}°</text>
      {inCrop && (() => {
        const label = hot ? `${inside.toFixed(0)}° inside by day - shade!` : `${inside.toFixed(0)}° inside by day${spec.heated && m.heatKwh >= 5 ? ' · heated' : ''}`
        const w = label.length * 7.9 + 24
        return (
          <g className="max-sm:hidden">
            <rect x={LEFT + SPAN * 1.5 - w / 2} y={GUTTER + 42} width={w} height="26" rx="13" fill="rgb(10 11 14 / 0.78)" stroke={hot ? 'var(--color-heat)' : 'rgb(255 255 255 / 0.15)'} />
            <text x={LEFT + SPAN * 1.5} y={GUTTER + 59} textAnchor="middle" className={`font-mono text-[13px] ${hot ? 'fill-heat' : 'fill-ink'}`}>{label}</text>
          </g>
        )
      })()}
      {!inCrop && (
        <text x={LEFT + SPAN * 1.5} y={GROUND - 40} textAnchor="middle" className="fill-ink-3 font-mono text-[13px] max-sm:hidden">
          {m.state === 'idle' ? (spec.heated ? 'left cold - heating would cost more than it earns' : 'empty') : `too cold: nights ≈ ${m.insideNight.toFixed(0)} °C inside`}
        </text>
      )}

      {/* ground */}
      <rect x="0" y={GROUND} width="1000" height="60" fill="#121110" />
      <line x1="0" x2="1000" y1={GROUND} y2={GROUND} stroke="rgb(255 255 255 / 0.12)" />
      <text x={LEFT} y={GROUND + 24} className="fill-ink-4 font-mono text-[11px] max-sm:hidden">{Math.round(result.spec.floorM2).toLocaleString('en-US')} m² floor</text>
    </svg>
  )
}

import { motion } from 'motion/react'
import { CloudRain, Snowflake, Sprout, Sun } from 'lucide-react'
import type { ClimateAnalysis } from '../lib/climate'
import { cropSeason, flowerMonth, type Crop } from '../lib/crops'
import type { DailyAnalysis } from '../lib/daily'
import { MONTHS_SHORT } from '../lib/format'
import { SSP_PLAIN, type WhatIf } from '../lib/scenario'
import { weighed, type CropRisk } from '../lib/water'

// The next season on one dial: the field's water balance month by month (NASA POWER, recent decade),
// the frost-free window (POWER daily), the crop from sowing to harvest with its water use, its
// heat-sensitive month, and a needle for today. It answers "when is my crop exposed?" at a glance.

const C = 200
const rad = (a: number) => (a * Math.PI) / 180
const pt = (r: number, a: number) => [C + r * Math.sin(rad(a)), C - r * Math.cos(rad(a))] as const
const dayAngle = (doy: number) => ((doy - 1) / 365) * 360

/** A stroked arc clockwise from a0 to a1 (degrees from 12 o'clock); spans over 359° become a circle. */
function arcPath(r: number, a0: number, a1: number): string {
  const span = Math.min(359.9, a1 - a0)
  const [x0, y0] = pt(r, a0)
  const [x1, y1] = pt(r, a0 + span)
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${span > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}

/** A filled ring sector. */
function sector(r0: number, r1: number, a0: number, a1: number): string {
  const [ax, ay] = pt(r1, a0)
  const [bx, by] = pt(r1, a1)
  const [cx, cy] = pt(r0, a1)
  const [dx, dy] = pt(r0, a0)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${ax},${ay} A${r1},${r1} 0 ${large} 1 ${bx},${by} L${cx},${cy} A${r0},${r0} 0 ${large} 0 ${dx},${dy} Z`
}

/** Day of season (north: from 1 Jan, south: from 1 Jul) → day of the calendar year. */
const toCalendar = (d: number, south: boolean) => (south ? ((d - 1 + 181) % 365) + 1 : d)

const dateLabel = (doy: number) =>
  new Date(Date.UTC(2001, 0, Math.round(doy))).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

type Props = { crop: Crop; climate: ClimateAnalysis; daily: DailyAnalysis | null; risk: CropRisk; warming: WhatIf }

export function SeasonWheel({ crop, climate, daily, risk, warming }: Props) {
  const hemi = climate.season.hemisphere
  const months = climate.monthly.recent
  const balance = months.map((m) => m.p - m.pet)
  const worst = Math.max(40, ...balance.map((b) => Math.abs(b)))
  const season = cropSeason(crop, hemi, climate.monthly.recent)
  const inSeason = new Map(season.map((s) => [s.month, s.kc]))
  const sowAngle = (season[0].month - 1) * 30
  const endAngle = season[season.length - 1].month * 30
  const span = ((endAngle - sowAngle + 360) % 360) || 360
  const tag = warming === 0 ? '' : typeof warming === 'number' ? ` re-run ${warming} °C warmer` : ` as projected for the 2050s (${SSP_PLAIN[warming]})`
  const heatMonth = crop.heat ? flowerMonth(crop, hemi, climate.monthly.recent) : null
  // the share of recent seasons past the limit (heat.recent is the mean damage the score reads, not a count of
  // seasons), mixed over both forms near a switch as the score is (water.ts formsOf)
  const seen = (r: typeof risk) => (r.heat.seasons ?? r.heat).recent
  const heatRisk = crop.heat ? weighed(risk, seen) : 0

  // frost-free window from daily data (recent decade means)
  const south = daily?.south ?? false
  const last = daily?.means.recent.lastSpringFrost ?? null
  const first = daily?.means.recent.firstAutumnFrost ?? null
  const frost = daily && daily.frostClimate && last !== null && first !== null
    ? { a0: dayAngle(toCalendar(last + 1, south)), a1: dayAngle(toCalendar(first - 1, south)), from: toCalendar(last + 1, south), to: toCalendar(first - 1, south) }
    : null
  const frostSpan = frost ? ((frost.a1 - frost.a0 + 360) % 360) : 0
  const ffNow = daily?.means.recent.frostFree ?? null
  const ffThen = daily?.means.baseline.frostFree ?? null

  // what the dial says, in words
  const dryInSeason = season.filter((s) => balance[s.month - 1] < 0 && s.kc >= 0.7)
  const driest = dryInSeason.length ? dryInSeason.reduce((a, b) => (balance[a.month - 1] < balance[b.month - 1] ? a : b)) : null
  const now = new Date()
  const todayAngle = dayAngle(Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 1)) / 86_400_000) + 1)
  const insights = [
    {
      icon: Sprout, tone: 'text-leaf',
      text: `Sow ${crop.name.toLowerCase()} in ${MONTHS_SHORT[season[0].month - 1]}, harvest in ${MONTHS_SHORT[season[season.length - 1].month - 1]} - ${season.length} months in the ground.`,
    },
    driest
      ? { icon: CloudRain, tone: 'text-heat', text: `It is thirstiest in ${dryInSeason.length} months when rain falls short of demand; the worst is ${MONTHS_SHORT[driest.month - 1]} (${Math.round(months[driest.month - 1].p)} mm rain vs ${Math.round(months[driest.month - 1].pet)} mm demand).` }
      : { icon: CloudRain, tone: 'text-water', text: 'Its thirstiest months fall when rain still keeps up with demand here.' },
    frost
      ? { icon: Snowflake, tone: 'text-orbit', text: `Frost-free from about ${dateLabel(frost.from)} to ${dateLabel(frost.to)}${ffNow !== null && ffThen !== null ? ` - ${Math.round(ffNow)} days, ${Math.abs(Math.round(ffNow - ffThen))} ${ffNow >= ffThen ? 'more' : 'fewer'} than in ${daily!.baseline.from}-${daily!.baseline.to}` : ''}.` }
      : { icon: Snowflake, tone: 'text-orbit', text: daily ? 'Frost is not a regular event here in recent years.' : 'Frost dates appear once the daily NASA POWER series has loaded.' },
    ...(heatMonth && crop.heat
      ? [{
        icon: Sun, tone: heatRisk >= 0.3 ? 'text-heat' : heatRisk >= 0.1 ? 'text-wheat' : 'text-leaf',
        text: heatRisk >= 0.1
          ? `Most heat-sensitive in ${MONTHS_SHORT[heatMonth - 1]}: mean highs passed ${crop.heat.tMax} °C in ${Math.round(heatRisk * 100)}% of recent seasons${tag}.`
          : `Heat-sensitive in ${MONTHS_SHORT[heatMonth - 1]}, but mean highs stayed under ${crop.heat.tMax} °C in recent seasons${tag} - no heat risk yet.`,
      }]
      : []),
  ]

  const draw = { initial: { pathLength: 0, opacity: 0 }, whileInView: { pathLength: 1, opacity: 1 }, viewport: { once: true, margin: '-10% 0px' } }
  return (
    <div className="grid items-center gap-6 md:grid-cols-[minmax(0,380px)_1fr]">
      <svg viewBox="-10 -10 420 420" className="mx-auto block w-full max-w-[380px]" role="img" aria-label={`Season dial for ${crop.name}: ${insights.map((i) => i.text).join(' ')}`}>
        <defs>
          <filter id="dial-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* outer ring: rain minus evaporative demand, month by month */}
        {balance.map((b, i) => {
          const dry = b < 0
          const k = Math.min(1, Math.abs(b) / worst)
          return (
            <motion.path
              key={i}
              d={sector(150, 178, i * 30 + 1, (i + 1) * 30 - 1)}
              fill={dry ? 'var(--color-heat)' : 'var(--color-water)'}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 0.12 + 0.6 * k }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, duration: 0.5 }}
            >
              <title>{`${MONTHS_SHORT[i]}: ${Math.round(months[i].p)} mm rain vs ${Math.round(months[i].pet)} mm demand (${dry ? '' : '+'}${Math.round(b)} mm)`}</title>
            </motion.path>
          )
        })}
        {MONTHS_SHORT.map((m, i) => {
          const [x, y] = pt(193, i * 30 + 15)
          return <text key={m} x={x} y={y + 3.5} textAnchor="middle" className={`font-mono text-[10px] ${inSeason.has(i + 1) ? 'fill-ink-2' : 'fill-ink-4'}`}>{m[0]}</text>
        })}

        {/* frost-free window */}
        <circle cx={C} cy={C} r="134" fill="none" stroke="rgb(159 178 138 / 0.1)" strokeWidth="8" />
        {frost ? (
          <motion.path d={arcPath(134, frost.a0, frost.a0 + frostSpan)} fill="none" stroke="var(--color-orbit)" strokeOpacity="0.55" strokeWidth="8" strokeLinecap="round" {...draw} transition={{ duration: 1.2, delay: 0.3 }} />
        ) : daily && !daily.frostClimate ? (
          <motion.path d={arcPath(134, 0, 360)} fill="none" stroke="var(--color-orbit)" strokeOpacity="0.4" strokeWidth="8" {...draw} transition={{ duration: 1.2, delay: 0.3 }} />
        ) : null}

        {/* the crop: sowing → harvest, thicker where it drinks most */}
        <circle cx={C} cy={C} r="108" fill="none" stroke="rgb(255 255 255 / 0.05)" strokeWidth="20" />
        {season.map((s, i) => (
          <motion.path
            key={`${s.month}-${i}`}
            d={arcPath(108, (s.month - 1) * 30 + 0.8, s.month * 30 - 0.8)}
            fill="none"
            stroke={crop.color}
            strokeWidth={8 + 12 * Math.min(1, s.kc / 1.15)}
            strokeOpacity={0.35 + 0.6 * Math.min(1, s.kc / 1.15)}
            filter="url(#dial-glow)"
            {...draw}
            transition={{ duration: 0.35, delay: 0.6 + i * 0.12 }}
          >
            <title>{`${MONTHS_SHORT[s.month - 1]}: crop water use ${Math.round(s.kc * 100)}% of reference${balance[s.month - 1] < 0 ? ' · rain falls short' : ''}`}</title>
          </motion.path>
        ))}
        {/* sow and harvest pins, heat flag */}
        {[
          { a: sowAngle + 3, label: 'sow' },
          { a: sowAngle + span - 3, label: 'harvest' },
        ].map((p) => {
          const [x, y] = pt(108, p.a)
          const [tx, ty] = pt(80, p.a)
          return (
            <motion.g key={p.label} initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.3 }} style={{ transformOrigin: `${x}px ${y}px`, transformBox: 'view-box' }}>
              <circle cx={x} cy={y} r="6" fill="#0a0b0e" stroke={crop.color} strokeWidth="2" />
              <text x={tx} y={ty + 3} textAnchor="middle" className="fill-ink-2 font-mono text-[10px]">{p.label}</text>
            </motion.g>
          )
        })}
        {heatMonth && heatRisk >= 0.1 && (() => {
          const [x, y] = pt(108, (heatMonth - 1) * 30 + 15)
          return (
            <g>
              <circle cx={x} cy={y} r="9" fill="#0a0b0e" stroke="var(--color-heat)" strokeWidth="1.5" />
              <circle cx={x} cy={y} r="2.6" fill="var(--color-heat)" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
                const [x1, y1] = [x + 4 * Math.sin(rad(a)), y - 4 * Math.cos(rad(a))]
                const [x2, y2] = [x + 6.2 * Math.sin(rad(a)), y - 6.2 * Math.cos(rad(a))]
                return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-heat)" strokeWidth="1.2" strokeLinecap="round" />
              })}
              <title>{`Heat-sensitive month: highs above ${crop.heat!.tMax} °C in ${Math.round(heatRisk * 100)}% of recent seasons`}</title>
            </g>
          )
        })()}

        {/* today */}
        <motion.g initial={{ rotate: 0 }} whileInView={{ rotate: todayAngle }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 40, damping: 12, delay: 0.4 }} style={{ transformOrigin: `${C}px ${C}px`, transformBox: 'view-box' }}>
          <line x1={C} y1={C - 62} x2={C} y2={C - 200} stroke="var(--color-ink)" strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray="2 3" />
          <circle cx={C} cy={C - 204} r="3.5" fill="var(--color-ink)" />
          <circle cx={C} cy={C - 204} r="3.5" fill="none" stroke="var(--color-ink)" className="site-pulse" />
        </motion.g>

        {/* centre */}
        <circle cx={C} cy={C} r="60" fill="#05080d" stroke="rgb(255 255 255 / 0.08)" />
        <text x={C} y={C - 6} textAnchor="middle" className="font-display-soft text-[40px]" fill="#fff">{crop.symbol}</text>
        <text x={C} y={C + 20} textAnchor="middle" className="fill-ink-3 font-mono text-[10px] uppercase tracking-widest">{crop.name.replace('Winter ', 'W. ')}</text>
        <text x={C} y={C + 36} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">dashed hand = today</text>
      </svg>

      <div>
        <ul className="space-y-3.5">
          {insights.map((l, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
              <l.icon className={`mt-1 h-4 w-4 shrink-0 ${l.tone}`} />
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-heat/60" />rain short of demand</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-water/60" />rain to spare</span>
          <span className="flex items-center gap-1.5"><i className="h-1 w-4 rounded-full bg-orbit/60" />frost-free</span>
          <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full" style={{ background: crop.color }} />crop, thicker = thirstier</span>
        </div>
        <p className="mt-3 text-xs text-ink-4">
          NASA POWER {climate.recent.from}-{climate.recent.to}: monthly rain vs FAO-56 demand, daily frost dates; crop calendar and water use (Kc) from FAO-56.
        </p>
      </div>
    </div>
  )
}

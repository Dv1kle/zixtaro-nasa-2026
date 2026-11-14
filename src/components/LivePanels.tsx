import { CloudRain, Snowflake, Sun, Tractor } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type PointerEvent } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import { cropSeason, MIN_SOW_T, type Crop } from '../lib/crops'
import type { DailyAnalysis } from '../lib/daily'
import { FROST_TENDER } from '../lib/extremes'
import { seasonDayLabel } from '../lib/daily'
import { drillCheck, isWorkable, weatherLabel, type Forecast } from '../lib/forecast'
import { pValue, signed } from '../lib/format'
import type { Loadable } from '../lib/hooks'
import { useMedia, useWidth } from '../lib/hooks'
import { useLang } from '../lib/i18n'
import { Chip, CountUp, Skeleton } from './ui'

// ---------- The next 16 days (Open-Meteo, live) ----------

/** A round axis maximum, so the gridlines carry readable millimetres. */
const niceMax = (v: number) => [2, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100].find((s) => s >= v) ?? Math.ceil(v / 20) * 20

// in the page's language: a weekday has no placeholder the dictionary could translate ("Wed {0} {m0}" for each day)
export const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions, lang = 'en') =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : lang, { ...opts, timeZone: 'UTC' })

const monthName = (m: number) => new Date(Date.UTC(2001, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })

/** next season's pick and its sowing month, for the drill check under the forecast */
export type SowCheck = { name: string; month: number; minT?: number; tender: boolean }
/** The crop's sowing month on this field (as the season dial shows it); spring-sown forms wait for warmth, frost-tender ones for no frost. */
export function sowCheckOf(crop: Crop, c: ClimateAnalysis): SowCheck | null {
  if (crop.family === 'none') return null // a bare fallow sows nothing
  const month = cropSeason(crop, c.season.hemisphere, c.monthly.recent)[0]?.month
  return month ? { name: crop.name, month, minT: crop.fao ? MIN_SOW_T[crop.id] : undefined, tender: FROST_TENDER.includes(crop.id) } : null
}

export function ForecastPanel({ state, sow }: { state: Loadable<Forecast>; sow?: SowCheck | null }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [sel, setSel] = useState(0)
  const lang = useLang()
  if (state.status === 'loading') return <Skeleton className="h-72" />
  if (state.status === 'error') return <div className="text-sm text-ink-3">Live forecast unavailable ({state.error}).</div>
  const f = state.data
  const n = f.days.length
  const axisW = 28
  const bw = (width - axisW - 4) / n
  const cx = (i: number) => axisW + bw * (i + 0.5)
  const every = bw >= 22 ? 1 : 2 // narrow phones: label every other day, the capsules still show them all
  // temperature capsules (daily low → high) on the 16-day range
  const tHi = Math.max(...f.days.map((d) => d.tmax))
  const tLo = Math.min(...f.days.map((d) => d.tmin))
  const span = Math.max(8, tHi - tLo)
  const T = (t: number) => 66 - ((t - tLo) / span) * 48
  // water: rain bars (paler = less likely) against the evaporative demand line
  const wMax = niceMax(Math.max(4, ...f.days.map((d) => Math.max(d.rain, d.et0))) * 1.05)
  const W0 = 188
  const Y = (v: number) => W0 - (v / wMax) * 88
  const H = 238
  const cap = Math.min(10, bw * 0.34)
  const et = f.days.map((d, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${Y(d.et0).toFixed(1)}`).join('')
  const balance = f.totals.rain - f.totals.et0
  const sm = f.days.map((d) => d.rootMoisture).filter((v): v is number => v !== null)
  const smDelta = sm.length > 1 ? sm[sm.length - 1] - sm[0] : 0
  const si = Math.min(sel, n - 1)
  const d = f.days[si]
  // can a drill go out inside the pick's sowing month? The window is tinted on the strip, its best run more strongly
  const dc = sow ? drillCheck(f.days, sow.month, sow.minT, sow.tender) : null
  const fit = `dry (< 1 mm), calm (< 25 km/h)${sow?.minT !== undefined ? `, at least ${sow.minT} °C on average` : ''}${sow?.tender ? ', no frost' : ''}`
  const short = (i: number) => dayLabel(f.days[i].date, { weekday: 'short', day: 'numeric', month: 'short' }, lang)
  // "Thu 15 Oct - Mon 19 Oct"; Russian short months end in a dot of their own ("19 окт."), so the sentence's is dropped
  const runLabel = dc?.run ? (dc.run[0] === dc.run[1] ? short(dc.run[0]) : `${short(dc.run[0])} - ${short(dc.run[1])}`) : ''
  const tiles = [
    { icon: CloudRain, k: 'Rain vs demand', v: `${Math.round(f.totals.rain)} / ${Math.round(f.totals.et0)} mm`, sub: balance < 0 ? `${Math.round(-balance)} mm short - soil keeps drying` : `${Math.round(balance)} mm surplus - soil recharges`, tone: balance < 0 ? 'text-heat' : 'text-water' },
    { icon: Tractor, k: 'Workable days', v: `${f.totals.workableDays} of ${n}`, sub: 'dry (< 1 mm) and calm (< 25 km/h)', tone: 'text-leaf' },
    { icon: Snowflake, k: 'Frost nights', v: String(f.totals.frostDays), sub: f.totals.frostDays ? 'protect emerging crops' : 'none forecast', tone: f.totals.frostDays ? 'text-orbit' : 'text-ink' },
    { icon: Sun, k: 'Root zone 27-81 cm', v: sm.length ? `${sm[0].toFixed(2)} → ${sm[sm.length - 1].toFixed(2)}` : '-', sub: sm.length ? `m³/m³ · ${smDelta < -0.005 ? 'drying' : smDelta > 0.005 ? 'wetting' : 'steady'}` : 'no soil forecast', tone: smDelta < -0.005 ? 'text-wheat' : 'text-water' },
  ]
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-[15px] text-ink">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-leaf" />
          </span>
          The next 16 days at this field
        </div>
        <Chip tone="info">
          live · Open-Meteo<span className="hidden sm:inline"> (DWD ICON, NOAA GFS, ECMWF)</span>
        </Chip>
      </div>
      <div
        ref={box}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setSel(Math.min(n - 1, si + 1))
          if (e.key === 'ArrowLeft') setSel(Math.max(0, si - 1))
        }}
        className="mt-4 w-full min-w-0 rounded-lg select-none"
        role="group"
        aria-label="Forecast days - arrow keys pick a day"
      >
        <svg width={width} height={H} className="block overflow-visible" role="img" aria-label="16-day forecast: daily temperature range, rain and evaporative demand">
          <defs>
            <linearGradient id="fc-temp" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={T(28)} y2={T(-2)}>
              <stop offset="0" stopColor="var(--color-heat)" />
              <stop offset="0.5" stopColor="var(--color-wheat)" />
              <stop offset="1" stopColor="var(--color-orbit)" />
            </linearGradient>
          </defs>
          {/* the picked day */}
          <rect x={axisW + bw * si + 1} y={0} width={bw - 2} height={H - 8} rx={8} fill="rgb(255 255 255 / 0.05)" />
          {dc?.inside.map((on, i) => on && (
            <rect key={i} x={axisW + bw * i} y={H - 36} width={bw} height={36} fill="var(--color-leaf)" opacity={dc.run && i >= dc.run[0] && i <= dc.run[1] ? 0.2 : 0.07} />
          ))}
          {tLo < 0 && tHi > 0 && (
            <g>
              <line x1={axisW} x2={width - 4} y1={T(0)} y2={T(0)} stroke="var(--color-orbit)" strokeOpacity={0.45} strokeDasharray="2 4" />
              <text x={axisW - 5} y={T(0) + 3} textAnchor="end" className="fill-orbit font-mono text-[10px]">0°</text>
            </g>
          )}
          {/* water axis */}
          {[0, wMax / 2, wMax].map((v) => (
            <g key={v}>
              <line x1={axisW} x2={width - 4} y1={Y(v)} y2={Y(v)} stroke="rgb(255 255 255 / 0.06)" />
              <text x={axisW - 5} y={Y(v) + 3} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">{v}</text>
            </g>
          ))}
          <text x={axisW - 5} y={Y(wMax) - 10} textAnchor="end" className="fill-ink-4 font-mono text-[10px]">mm</text>
          {f.days.map((day, i) => {
            const x = cx(i)
            const label = i % every === 0
            const on = i === si
            return (
              <g key={day.date}>
                {label && (
                  <text x={x} y={10} textAnchor="middle" className={`font-mono text-[10px] ${on ? 'fill-ink' : 'fill-ink-2'}`}>
                    {Math.round(day.tmax)}°
                  </text>
                )}
                <motion.rect
                  x={x - cap / 2}
                  width={cap}
                  rx={cap / 2}
                  fill="url(#fc-temp)"
                  initial={{ y: T((day.tmax + day.tmin) / 2), height: 0, opacity: 0 }}
                  whileInView={{ y: T(day.tmax), height: Math.max(cap, T(day.tmin) - T(day.tmax)), opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                />
                {label && (
                  <text x={x} y={82} textAnchor="middle" className={`font-mono text-[10px] ${day.tmin < 0 ? 'fill-orbit' : 'fill-ink-4'}`}>
                    {Math.round(day.tmin)}°
                  </text>
                )}
                <motion.rect
                  x={x - bw * 0.28}
                  width={bw * 0.56}
                  rx={Math.min(3, bw * 0.15)}
                  fill="var(--color-water)"
                  opacity={0.3 + 0.6 * Math.min(1, day.rainProb / 100)}
                  initial={{ y: Y(0), height: 0 }}
                  whileInView={{ y: Y(day.rain), height: Y(0) - Y(day.rain) }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.2 + i * 0.03 }}
                />
                <text x={x} y={H - 26} textAnchor="middle" className={`font-mono text-[10px] ${on ? 'fill-ink' : 'fill-ink-3'}`}>
                  {i === 0 ? '•' : dayLabel(day.date, { weekday: 'narrow' }, lang)}
                </text>
                {label && (
                  <text x={x} y={H - 14} textAnchor="middle" className="fill-ink-4 font-mono text-[10px]">
                    {Number(day.date.slice(8))}
                  </text>
                )}
                {isWorkable(day) && <circle cx={x} cy={H - 5} r={2} fill="var(--color-leaf)" opacity={0.8} />}
              </g>
            )
          })}
          <motion.path
            d={et}
            fill="none"
            stroke="var(--color-heat)"
            strokeWidth={2}
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: 0.3, ease: 'easeInOut' }}
          />
          {f.days.map((day, i) => (
            <circle key={i} cx={cx(i)} cy={Y(day.et0)} r={i === si ? 3.5 : 2.2} fill="var(--color-heat)" />
          ))}
          {/* hit areas: hover or tap a day */}
          {f.days.map((day, i) => (
            <rect key={day.date} x={axisW + bw * i} y={0} width={bw} height={H} fill="transparent" onPointerEnter={(e) => e.pointerType === 'mouse' && setSel(i)} onClick={() => setSel(i)} className="cursor-pointer" />
          ))}
        </svg>
      </div>
      <div className="mt-3 flex min-h-[40px] flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white/[0.035] px-3 py-2 text-[13px]" aria-live="polite">
        <span className="text-ink">{si === 0 ? 'Today' : dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' }, lang)}</span>
        <span className="text-ink-2">{weatherLabel(d.code)}</span>
        <span className="num text-ink-2">{Math.round(d.tmax)}° / <span className={d.tmin < 0 ? 'text-orbit' : ''}>{Math.round(d.tmin)}°</span></span>
        <span className="num text-water">rain {d.rain.toFixed(1)} mm · {Math.round(d.rainProb)}%</span>
        <span className="num text-heat">demand {d.et0.toFixed(1)} mm</span>
        <span className="num text-ink-3">wind {Math.round(d.windMax)} km/h</span>
        {isWorkable(d) ? <span className="text-leaf">workable</span> : <span className="text-ink-4">not workable</span>}
      </div>
      {sow && dc && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-leaf/20 bg-leaf/[0.05] px-3 py-2.5 text-[13.5px] leading-snug text-ink-2">
          <Tractor className="mt-0.5 h-4 w-4 shrink-0 text-leaf" aria-hidden />
          <p>
            <span className="text-ink">Drill check:</span> {sow.name.toLowerCase()}, next season&rsquo;s pick, is sown in {monthName(sow.month)}
            {dc.inWindow === 0
              ? dc.opensIn !== null && dc.opensIn <= 45 ? ` - its window opens in ${dc.opensIn} days, after this forecast.` : ' - outside these 16 days; the check comes back when its window is in reach.'
              : dc.run
                ? <>: <span className="text-leaf" title={`fit to drill: ${fit}`}>{dc.workable} of the {dc.inWindow} forecast days in it are fit to drill</span>; best run{' '}
                  <button onClick={() => setSel(dc.run![0])} className="text-ink underline decoration-leaf/50 underline-offset-2 hover:decoration-leaf">
                    {runLabel}
                  </button>{runLabel.endsWith('.') ? '' : '.'}</>
                : <>: none of the {dc.inWindow} forecast days in it is fit to drill ({fit}) - wait for a better spell.</>}
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-ink-3">
        <span className="flex items-center gap-2"><i className="h-3 w-1.5 rounded-full bg-gradient-to-b from-heat via-wheat to-orbit" />daily low → high °C</span>
        <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-water" />rain, mm/day (paler = less likely)</span>
        <span className="flex items-center gap-2"><i className="h-0.5 w-4 bg-heat" />evaporative demand ET₀</span>
        <span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-leaf" />workable day</span>
        {sow && dc && dc.inWindow > 0 && <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-leaf/20" />{sow.name.toLowerCase()} sowing month</span>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-xl bg-white/[0.035] px-3 py-3">
            <div className="flex items-center gap-1.5 kicker !text-[11px]"><t.icon className="h-3 w-3 shrink-0" />{t.k}</div>
            <div className={`mt-1.5 text-lg ${t.tone}`}>{t.v}</div>
            <div className="text-xs text-ink-3">{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Frost & heat calendar (NASA POWER daily) ----------

export function FrostPanel({ state, activeYear, onHover }: { state: Loadable<DailyAnalysis | null>; activeYear: number | null; onHover?: (year: number | null) => void }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const touch = useMedia('(hover: none)')
  if (state.status === 'loading') return <Skeleton className="h-80" />
  if (state.status === 'error' || !state.data) return <div className="text-sm text-ink-3">Daily NASA POWER data unavailable{state.status === 'error' ? ` (${state.error})` : ''}.</div>
  const a = state.data
  const H = 250
  const pad = { l: 40, r: 10, t: 10, b: 26 }
  const n = a.years.length
  const rowH = (H - pad.t - pad.b) / n
  // the row under the pointer, so the other charts can follow this year
  const yearAt = (e: PointerEvent<SVGSVGElement>) => {
    const i = Math.floor((e.clientY - e.currentTarget.getBoundingClientRect().top - pad.t) / rowH)
    return i >= 0 && i < n ? a.years[i].year : null
  }
  const yr = activeYear !== null ? a.years.find((y) => y.year === activeYear) : undefined
  const X = (day: number) => pad.l + ((day - 1) / 365) * (width - pad.l - pad.r)
  const monthTicks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(2001, (a.south ? 6 : 0) + i, 1))
    const day = Math.round((d.getTime() - Date.UTC(2001, a.south ? 6 : 0, 1)) / 86_400_000) + 1
    return { day, label: d.toLocaleDateString('en-GB', { month: 'narrow', timeZone: 'UTC' }) }
  })
  const b = a.means.baseline
  const r = a.means.recent
  const dFree = r.frostFree !== null && b.frostFree !== null ? r.frostFree - b.frostFree : null
  const stats = [
    a.frostClimate && dFree !== null
      ? { k: 'Frost-free season', v: dFree, unit: 'days', digits: 0, sub: `${Math.round(b.frostFree!)} → ${Math.round(r.frostFree!)} days`, t: a.trends.frostFree, tone: 'text-leaf' }
      : null,
    a.frostClimate && b.lastSpringFrost !== null && r.lastSpringFrost !== null
      ? { k: 'Last spring frost', v: r.lastSpringFrost - b.lastSpringFrost, unit: 'days', digits: 0, sub: `${seasonDayLabel(b.lastSpringFrost, a.south)} → ${seasonDayLabel(r.lastSpringFrost, a.south)}`, t: a.trends.lastSpringFrost, tone: 'text-orbit' }
      : null,
    { k: 'Hot days ≥ 30 °C', v: r.hotDays - b.hotDays, unit: 'per year', digits: 1, sub: `${b.hotDays.toFixed(1)} → ${r.hotDays.toFixed(1)} a year`, t: a.trends.hotDays, tone: 'text-heat' },
    { k: 'Longest dry spell', v: r.longestDrySpell - b.longestDrySpell, unit: 'days', digits: 1, sub: `${b.longestDrySpell.toFixed(0)} → ${r.longestDrySpell.toFixed(0)} days in the growing season`, t: a.trends.longestDrySpell, tone: 'text-wheat' },
  ].filter((x): x is NonNullable<typeof x> => x !== null)

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-[15px] text-ink">Frost & heat calendar</div>
        <div className="font-mono text-[11px] text-ink-3">NASA POWER daily · {a.years[0].year}-{a.years[n - 1].year} · each row a season</div>
      </div>
      <div ref={box} className="mt-4 w-full min-w-0">
        <svg
          width={width}
          height={H}
          className="block overflow-visible"
          onPointerMove={(e) => e.pointerType === 'mouse' && onHover?.(yearAt(e))}
          onPointerDown={(e) => e.pointerType !== 'mouse' && onHover?.(yearAt(e))}
          onPointerLeave={(e) => e.pointerType === 'mouse' && onHover?.(null)}
        >
          {monthTicks.map((m) => (
            <g key={m.day}>
              <line x1={X(m.day)} x2={X(m.day)} y1={pad.t} y2={H - pad.b} stroke="rgb(255 255 255 / 0.05)" />
              <text x={X(m.day) + 3} y={H - 8} className="fill-ink-4 font-mono text-[10px]">{m.label}</text>
            </g>
          ))}
          {a.years.map((y, i) => {
            const yy = pad.t + i * rowH
            const from = y.lastSpringFrost ?? 1
            const to = y.firstAutumnFrost ?? 366
            const recent = y.year >= a.recent.from
            const active = activeYear === y.year
            return (
              <g key={y.year} opacity={activeYear !== null && !active && y.year > activeYear ? 0.18 : 1}>
                <rect x={X(from)} width={Math.max(1, X(to) - X(from))} y={yy + rowH * 0.15} height={Math.max(1.5, rowH * 0.7)} rx={rowH * 0.35} fill={active ? 'var(--color-leaf)' : recent ? 'rgb(201 176 122 / 0.75)' : 'rgb(201 176 122 / 0.28)'} />
                {y.hotDays > 0 && <rect x={X(196) - y.hotDays} width={y.hotDays * 2} y={yy + rowH * 0.15} height={Math.max(1.5, rowH * 0.7)} rx={1} fill="var(--color-heat)" opacity={0.85} />}
                {/* decade labels make room for the active year's label */}
                {(active || ((y.year % 10 === 0 || i === 0 || i === n - 1) && !(activeYear !== null && Math.abs(y.year - activeYear) <= 3))) && (
                  <text x={pad.l - 6} y={yy + rowH * 0.8} textAnchor="end" className={`font-mono text-[10px] ${active ? 'fill-leaf' : 'fill-ink-4'}`}>{y.year}</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-2 min-h-5 font-mono text-[11px] text-ink-2" aria-live="polite">
        {!yr && <span className="text-ink-4">{touch ? 'Tap' : 'Point at'} a row to read that season - the stripes and the wetness chart follow.</span>}
        {yr && (
          <>
            <span className="text-leaf">{yr.year}</span>
            {yr.frostFree !== null && yr.lastSpringFrost !== null && yr.firstAutumnFrost !== null && (
              <> · frost-free {Math.round(yr.frostFree)} days ({seasonDayLabel(yr.lastSpringFrost, a.south)} → {seasonDayLabel(yr.firstAutumnFrost, a.south)})</>
            )}
            {' · '}<span className="text-heat">{yr.hotDays}</span> days ≥ 30 °C · longest dry spell {yr.longestDrySpell} days
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-ink-3">
        <span className="flex items-center gap-2"><i className="h-2 w-4 rounded-full bg-leaf/70" />frost-free season (last spring → first autumn frost)</span>
        <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-sm bg-heat" />days ≥ 30 °C (width)</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="rounded-xl bg-white/[0.035] px-3 py-3">
            <div className="kicker !text-[11px]">{s.k}</div>
            <div className={`mt-1 font-display-soft text-3xl leading-none ${s.tone}`}>
              <CountUp value={s.v} decimals={s.digits} signed />
              <span className="ml-1 font-mono text-[11px] text-ink-3">{s.unit}</span>
            </div>
            <div className="mt-1 text-xs text-ink-3">{s.sub}</div>
            {s.t && <div className="mt-1.5 font-mono text-[11px] text-ink-4">{signed(s.t.perDecade, 1)}/decade · {s.t.significant ? pValue(s.t.p) : 'n.s.'}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

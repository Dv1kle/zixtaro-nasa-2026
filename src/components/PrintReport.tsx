import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useState } from 'react'
import type { ClimateAnalysis } from '../lib/climate'
import { diverging } from '../lib/color'
import { airWarm, airWet } from '../lib/airCore'
import { seasonDayLabel, type DailyAnalysis } from '../lib/daily'
import type { Forecast } from '../lib/forecast'
import { coord, pct, pValue, signed } from '../lib/format'
import { formatArea, type Field } from '../lib/geo'
import type { Evaluation, FieldContext, Strategy } from '../lib/rotation'
import type { ChosenSeasons } from '../lib/strategyReading'
import type { SoilProfile } from '../lib/soil'
import { staticView, imageryCredit } from '../lib/staticmap'
import type { Terrain } from '../lib/terrain'
import { soilSuitability } from '../lib/gaez'
import { OTHER_NAMES, type LocalCrops } from '../lib/localCrops'
import type { Confidence } from '../lib/robust'
import { FAILURE_MODES, fieldValidity } from '../lib/validity'
import { MODEL_VERSION } from '../lib/version'
import { CROP_BY_ID, isCropId } from '../lib/crops'
import { riskAfter } from '../lib/water'
import { lastSeasonYear } from './FieldSection'
import { CropTile, Logo } from './ui'

type Props = {
  field: Field
  place: string | null
  climate: ClimateAnalysis
  daily: DailyAnalysis | null
  soil: SoilProfile
  terrain: Terrain | null
  forecast: Forecast | null
  ranking: Evaluation[]
  strategies: Strategy[]
  /**
   * The plan the farmer chose, when it is not the engine's own (lib/strategyReading chosenSeasons). The report then
   * states both: its recommendation stays the engine's pick, and the rotation plan it prints is the chosen one,
   * named as the farmer's choice.
   */
  plan?: ChosenSeasons | null
  ctx: FieldContext
  replay: number | null
  whatIf: string // explanation of the what-if, '' when the observed record is used
  scenarioUrl: string
  /** engine outputs the report can cite when they are ready */
  confidence?: Confidence | null
  local?: LocalCrops | null
  scenarioId?: string
}

/** FNV-1a → short base-36 id, so the same scenario always gets the same report number. */
export function reportId(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const d = new Date()
  return `RL-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${(h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(0, 6)}`
}

export function QR({ text, size = 96 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`
    return { d, n }
  }, [text])
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${path.n + 2} ${path.n + 2}`} shapeRendering="crispEdges">
      <rect x={-1} y={-1} width={path.n + 2} height={path.n + 2} fill="#fff" />
      <path d={path.d} fill="#111" />
    </svg>
  )
}

export function FieldMap({ field }: { field: Field }) {
  const W = 360
  const H = 220
  const pts = field.kind === 'area' ? field.ring.map(([lon, lat]) => ({ lat, lon })) : [{ lat: field.lat, lon: field.lon }]
  const v = staticView(pts, W, H, field.kind === 'area' ? 300 : 800, 0.2)
  // a round scale bar length close to 1/4 of the width
  const target = (W / 4) * v.metresPerPx
  const nice = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
  const barPx = nice / v.metresPerPx
  const [fx, fy] = v.project(field.lat, field.lon)
  return (
    <div className="rp-map">
      <img src={v.url} alt="Satellite image of the field" width={W} height={H} />
      <svg width={W} height={H} className="rp-map-overlay">
        {field.kind === 'area' ? (
          <polygon points={field.ring.map(([lon, lat]) => v.project(lat, lon).join(',')).join(' ')} fill="rgba(255,255,255,0.12)" stroke="#fff" strokeWidth={2} />
        ) : (
          <g>
            <circle cx={fx} cy={fy} r={7} fill="none" stroke="#fff" strokeWidth={2} />
            <circle cx={fx} cy={fy} r={2} fill="#fff" />
          </g>
        )}
        <g transform={`translate(${W - 26},26)`}>
          <circle r={14} fill="rgba(0,0,0,0.55)" />
          <path d="M0,-10 L5,4 L0,1 L-5,4 Z" fill="#fff" />
          <text y={-16} textAnchor="middle" fontSize={9} fill="#fff" fontFamily="Helvetica, Arial">N</text>
        </g>
        <g transform={`translate(12,${H - 16})`}>
          <rect x={-4} y={-12} width={barPx + 8} height={20} fill="rgba(0,0,0,0.55)" />
          <rect x={0} y={0} width={barPx} height={3} fill="#fff" />
          <text x={barPx / 2} y={-3} textAnchor="middle" fontSize={9} fill="#fff" fontFamily="Helvetica, Arial">{nice >= 1000 ? `${nice / 1000} km` : `${nice} m`}</text>
        </g>
      </svg>
      <div className="rp-caption">Imagery: {imageryCredit(field.lat, field.lon)} · outline and marker: Zixtaro</div>
    </div>
  )
}

export function PrintReport(p: Props) {
  const { field, place, climate: c, daily, soil, terrain, forecast, ranking, strategies, ctx, replay } = p
  const id = reportId(p.scenarioUrl)
  const issued = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const start = lastSeasonYear() + 1
  const top = ranking[0]
  const suit = soilSuitability(top.crop.id, soil)
  const flags = fieldValidity({ climate: c, soil, daily, elevation: terrain?.elevation ?? null }).filter((x) => x.level !== 'ok')
  const localRows = (p.local?.crops ?? []).slice(0, 6).map((x) => `${isCropId(x.id) ? CROP_BY_ID[x.id].name : OTHER_NAMES[x.id] ?? x.id} ${pct(x.share)}`)
  const tMax = Math.max(1, ...c.anomalies.map((x) => Math.abs(x.t)))
  const wMax = Math.max(60, ...c.anomalies.map((x) => Math.abs(x.cwb)))
  const mB = c.means.baseline
  const mR = c.means.recent
  const sig = (t: { significant: boolean; p: number }) => (t.significant ? `yes (${pValue(t.p)})` : 'no')
  const f = (x: number, d: number) => x.toFixed(d).replace('-', '−')
  const climateRows: [string, string, string, string, string, string][] = [
    ['Mean air temperature, °C', f(mB.t, 1), f(mR.t, 1), signed(mR.t - mB.t, 1), signed(c.trends.t.perDecade, 2), sig(c.trends.t)],
    [`Rain, ${c.season.label}, mm`, mB.pGS.toFixed(0), mR.pGS.toFixed(0), signed(mR.pGS - mB.pGS, 0), signed(c.trends.pGS.perDecade, 1), sig(c.trends.pGS)],
    [`Reference ET₀, ${c.season.label}, mm`, mB.petGS.toFixed(0), mR.petGS.toFixed(0), signed(mR.petGS - mB.petGS, 0), signed(c.trends.petGS.perDecade, 1), sig(c.trends.petGS)],
    [`Water balance, ${c.season.label}, mm`, f(mB.cwbGS, 0), f(mR.cwbGS, 0), signed(mR.cwbGS - mB.cwbGS, 0), signed(c.trends.cwbGS.perDecade, 1), sig(c.trends.cwbGS)],
    ['Root-zone wetness (0-1)', mB.wGS.toFixed(3), mR.wGS.toFixed(3), signed(mR.wGS - mB.wGS, 3), signed(c.trends.wGS.perDecade, 3), sig(c.trends.wGS)],
    ['Growing degree days > 10 °C', mB.gdd.toFixed(0), mR.gdd.toFixed(0), signed(mR.gdd - mB.gdd, 0), signed(c.trends.gdd.perDecade, 0), sig(c.trends.gdd)],
    ['Hottest day of the year, °C', mB.tMaxAbs.toFixed(1), mR.tMaxAbs.toFixed(1), signed(mR.tMaxAbs - mB.tMaxAbs, 1), signed(c.trends.tMaxAbs.perDecade, 2), sig(c.trends.tMaxAbs)],
  ]
  if (daily) {
    const b = daily.means.baseline
    const r = daily.means.recent
    const t = daily.trends
    if (daily.frostClimate && b.frostFree !== null && r.frostFree !== null) {
      climateRows.push(['Frost-free season, days', b.frostFree.toFixed(0), r.frostFree.toFixed(0), signed(r.frostFree - b.frostFree, 0), t.frostFree ? signed(t.frostFree.perDecade, 1) : '-', t.frostFree ? sig(t.frostFree) : '-'])
    }
    if (daily.frostClimate && b.lastSpringFrost !== null && r.lastSpringFrost !== null) {
      climateRows.push(['Last spring frost', seasonDayLabel(b.lastSpringFrost, daily.south), seasonDayLabel(r.lastSpringFrost, daily.south), `${signed(r.lastSpringFrost - b.lastSpringFrost, 0)} d`, t.lastSpringFrost ? signed(t.lastSpringFrost.perDecade, 1) : '-', t.lastSpringFrost ? sig(t.lastSpringFrost) : '-'])
    }
    climateRows.push(['Hot days ≥ 30 °C per year', b.hotDays.toFixed(1), r.hotDays.toFixed(1), signed(r.hotDays - b.hotDays, 1), t.hotDays ? signed(t.hotDays.perDecade, 1) : '-', t.hotDays ? sig(t.hotDays) : '-'])
    climateRows.push(['Longest dry spell (growing season), days', b.longestDrySpell.toFixed(0), r.longestDrySpell.toFixed(0), signed(r.longestDrySpell - b.longestDrySpell, 0), t.longestDrySpell ? signed(t.longestDrySpell.perDecade, 1) : '-', t.longestDrySpell ? sig(t.longestDrySpell) : '-'])
  }
  // the rotation plan the report prints: the farmer's choice where one was made, else the engine's own
  const chosen = p.plan ?? null
  const you = chosen ?? strategies[0]
  // the season that plan opens with (what will be sown): the roots line and the note under the recommendation
  const lead = chosen?.seq[0] ?? top
  const others = chosen ? strategies : strategies.slice(1)
  // the page's three crossings, as the report's opening lines (the same numbers the page states)
  const dT = mR.t - mB.t
  const dW = mR.cwbGS - mB.cwbGS
  const reach = ctx.risks[lead.crop.id]?.taw
  const goods = top.notes.filter((n) => n.tone === 'good')
  const risks = top.notes.filter((n) => n.tone !== 'good')

  return (
    <article className="print-only report">
      <header className="rp-head">
        <div className="rp-brand">
          <Logo tone="print" size={30} />
          <div>
            <div className="rp-wordmark">ZIXTARO</div>
            <div className="rp-sub">Climate-adaptive crop rotation · decision support</div>
          </div>
        </div>
        <table className="rp-meta">
          <tbody>
            <tr><th>Report No.</th><td translate="no">{id}</td></tr>
            <tr><th>Issued</th><td>{issued}</td></tr>
            <tr><th>Data vintage</th><td>NASA POWER {c.firstYear}-{c.lastYear}</td></tr>
            {chosen && <tr><th>Plan</th><td>{chosen.label} · the farmer’s choice</td></tr>}
          </tbody>
        </table>
      </header>

      <h1 className="rp-title">Crop Rotation Advisory Report</h1>
      <p className="rp-lede">
        Field-specific assessment of climate change signals, soil water capacity and crop suitability, with a recommended crop for the {start} season and {chosen ? `the four-season rotation plan chosen for this field (${chosen.label})` : 'a four-season rotation plan'}{replay ? `, stress-tested against a ${replay}-like season` : ''}
        {p.whatIf ? `. What-if scenario - crop water and heat risks assume ${p.whatIf}; the climate tables show the observed record` : ''}.
      </p>
      <div className="rp-descent rp-keep">
        <div>
          <div className="rp-k">The air · {c.lastYear - c.firstYear + 1} years of NASA sky</div>
          <div className="rp-v"><em>{signed(dT, 1, ' °C')}</em> warmer, each season <em>{Math.round(Math.abs(dW))} mm</em> {dW < 0 ? 'drier' : 'wetter'}</div>
        </div>
        <div>
          <div className="rp-k">The roots · {lead.crop.name.toLowerCase()}</div>
          <div className="rp-v">{reach !== undefined && lead.crop.family !== 'none' ? <><em>{Math.round(reach)} mm</em> of water within reach, <em>{lead.crop.rootDepth.toFixed(1)} m</em> down</> : <>{Math.round(soil.paw100)} mm held in the top metre</>}</div>
        </div>
        <div>
          <div className="rp-k">The answer · {start} season</div>
          <div className="rp-v">
            {chosen && lead.crop.id !== top.crop.id ? (
              <>The plan chosen sows <em>{lead.crop.name.toLowerCase()}</em>, score {Math.round(lead.score)}; recommended: {top.crop.name.toLowerCase()}, {Math.round(top.score)}</>
            ) : (
              <>Sow <em>{top.crop.name.toLowerCase()}</em>, score {Math.round(top.score)}</>
            )}
          </div>
        </div>
      </div>

      <section className="rp-sec rp-grid">
        <div>
          <h2><span>1</span>Field identification</h2>
          <table className="rp-kv">
            <tbody>
              <tr><th>Field</th><td>{field.label ?? place ?? 'Unnamed field'}</td></tr>
              <tr><th>Selection</th><td>{field.kind === 'area' ? `Outlined area, ${formatArea(field.areaHa)}` : 'Point location'}</td></tr>
              <tr><th>Centre</th><td translate="no">{coord(field.lat, field.lon)}</td></tr>
              {terrain && <tr><th>Terrain</th><td>{Math.round(terrain.elevation)} m a.s.l. · mean slope {terrain.slopePct.toFixed(1)} %{terrain.aspect ? ` · faces ${terrain.aspect}` : ''}</td></tr>}
              <tr><th>Soil (0-30 cm)</th><td>{soil.texture} · pH {soil.top.ph.toFixed(1)} · SOC {(soil.top.soc / 10).toFixed(1)} %</td></tr>
              <tr><th>Water in 1 m</th><td>{Math.round(soil.paw100)} mm plant-available{soil.variability ? ` (${Math.round(soil.variability.paw100[0])}-${Math.round(soil.variability.paw100[1])} mm across ${soil.variability.samples.length} samples)` : ''}</td></tr>
              <tr><th>Climate signal</th><td>{c.signal.label} · aridity index {c.aridity.index.toFixed(2)} ({c.aridity.klass})</td></tr>
              <tr><th>Water regime</th><td>{ctx.irrigated ? 'Irrigated - scored by irrigation demand' : 'Rainfed - scored by water-stress yield loss'}</td></tr>
            </tbody>
          </table>
          <div className="rp-qr">
            <QR text={p.scenarioUrl} />
            <div>
              <b>Live scenario</b>
              <br />
              Scan to open this exact analysis - every input is encoded in the link.
            </div>
          </div>
        </div>
        <FieldMap field={field} />
      </section>

      <section className="rp-sec">
        <h2><span>2</span>Climate assessment</h2>
        <svg viewBox={`0 0 ${c.anomalies.length} 1`} preserveAspectRatio="none" className="rp-stripes">
          {c.anomalies.map((x, i) => <rect key={x.year} x={i} y={0} width={1.02} height={0.66} fill={airWarm(diverging(x.t, tMax))} />)}
          {c.anomalies.map((x, i) => <rect key={`w${x.year}`} x={i} y={0.72} width={1.02} height={0.28} fill={airWet(diverging(x.cwb, wMax))} />)}
        </svg>
        <div className="rp-stripes-axis"><span>{c.firstYear}</span><span>each year against {c.baseline.from}-{c.baseline.to}: air temperature (slate colder · red warmer) over season water balance (earth drier · water wetter)</span><span>{c.lastYear}</span></div>
        <table className="rp-table">
          <thead>
            <tr><th>Indicator</th><th>{c.baseline.from}-{c.baseline.to}</th><th>{c.recent.from}-{c.recent.to}</th><th>Change</th><th>Trend / decade</th><th>Significant (<span style={{ textTransform: 'none' }}>α</span> = 0.05)</th></tr>
          </thead>
          <tbody>
            {climateRows.map((r) => (
              <tr key={r[0]}>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <p className="rp-note">Driest root-zone growing seasons since {c.firstYear}: {c.driest.slice(0, 5).map((d) => d.year).join(', ')}. Trend test: Mann-Kendall with Sen’s slope.</p>
      </section>

      <section className="rp-sec">
        <h2><span>3</span>Soil assessment</h2>
        <table className="rp-table">
          <thead><tr><th>Depth, cm</th><th>Sand %</th><th>Silt %</th><th>Clay %</th><th>SOC g/kg</th><th>pH</th><th>Bulk density</th><th>Plant-available water, mm</th></tr></thead>
          <tbody>
            {soil.layers.map((l) => (
              <tr key={l.top}>
                <td>{l.top}-{l.bottom}</td><td>{l.sand.toFixed(0)}</td><td>{l.silt.toFixed(0)}</td><td>{l.clay.toFixed(0)}</td><td>{l.soc.toFixed(1)}</td><td>{l.ph.toFixed(1)}</td><td>{l.bd.toFixed(2)}</td><td>{(l.paw * (l.bottom - l.top) * 10).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rp-note">Source: {soil.source === 'manual' ? 'representative profile for a user-selected texture class' : 'ISRIC SoilGrids 2.0 (250 m) mean predictions'}; water retention by Saxton & Rawls (2006).</p>
      </section>

      <section className="rp-sec rp-keep">
        <h2><span>4</span>Recommendation for the {start} season</h2>
        <div className="rp-reco">
          <CropTile crop={top.crop} size="lg" />
          <div className="rp-reco-crop">
            <div className="rp-reco-name">{top.crop.name}</div>
            <div className="rp-reco-latin">{top.crop.latin}</div>
            <div className="rp-reco-score">{Math.round(top.score)}<small>/100</small></div>
          </div>
          <table className="rp-kv rp-reco-parts">
            <tbody>
              <tr><th>Soil health</th><td>{top.parts.soil.toFixed(1)} pts</td></tr>
              <tr><th>Water</th><td>{top.parts.water.toFixed(1)} pts</td></tr>
              <tr><th>Profit</th><td>{top.parts.profit.toFixed(1)} pts</td></tr>
              <tr><th>Site fit</th><td>{top.parts.fit.toFixed(1)} pts</td></tr>
              <tr><th>Lost to rotation, risk & practice</th><td>−{top.parts.lost.toFixed(1)} pts</td></tr>
            </tbody>
          </table>
        </div>
        <div className="rp-two">
          <div>
            <h3>Rationale</h3>
            <ul>{goods.map((n, i) => <li key={i}>{n.text}</li>)}</ul>
          </div>
          <div>
            <h3>Risks to manage</h3>
            <ul>{risks.length ? risks.map((n, i) => <li key={i}>{n.text}</li>) : <li>No significant risks identified.</li>}</ul>
          </div>
        </div>
        {chosen && lead.crop.id !== top.crop.id && (
          <p className="rp-note">
            The plan chosen for this field ({chosen.label}) opens with {lead.crop.name.toLowerCase()} instead, score {Math.round(lead.score)}: section 6 sets it out. The recommendation above is the model’s; the choice is the farmer’s.
          </p>
        )}
      </section>

      <section className="rp-sec rp-keep">
        <h2><span>5</span>Crop ranking</h2>
        <table className="rp-table">
          <thead><tr><th>#</th><th>Crop</th><th>Score</th><th>{ctx.irrigated ? 'Irrigation need, mm' : 'Water-stress loss'} {c.recent.from}-{c.recent.to}</th><th>Change since {c.baseline.from}-{c.baseline.to}</th><th>Main constraint</th></tr></thead>
          <tbody>
            {ranking.slice(0, 8).map((e, i) => {
              const r = riskAfter(ctx.risks[e.crop.id], e.afterFallow)
              const worst = e.notes.find((n) => n.tone === 'bad') ?? e.notes.find((n) => n.tone === 'warn')
              return (
                <tr key={e.crop.id}>
                  <td>{i + 1}</td>
                  <td><span className="rp-crop"><CropTile crop={e.crop} size="xs" className="!h-5 !w-5" />{e.crop.name}</span></td>
                  <td>{Math.round(e.score)}</td>
                  <td>{ctx.irrigated ? Math.round(r.recent.deficit) : pct(r.recent.loss)}</td>
                  <td>{ctx.irrigated ? signed(r.recent.deficit - r.baseline.deficit, 0, ' mm') : `${signed((r.recent.loss - r.baseline.loss) * 100, 0)} pp`}</td>
                  <td className="rp-small">{worst?.text ?? '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {you && (
        <section className="rp-sec rp-keep">
          <h2><span>6</span>{chosen ? `Four-season rotation plan · ${chosen.label}, the farmer’s choice` : 'Four-season rotation plan'}</h2>
          <table className="rp-table">
            <thead><tr><th>Season</th><th>Crop</th><th>Score</th><th>Key reason</th></tr></thead>
            <tbody>
              {you.seq.map((e, i) => (
                <tr key={i}>
                  <td>{start + i}</td>
                  <td><span className="rp-crop"><CropTile crop={e.crop} size="xs" className="!h-5 !w-5" />{e.crop.name}</span></td>
                  <td>{Math.round(e.score)}</td>
                  <td className="rp-small">{e.notes.find((n) => n.tone === 'good')?.text ?? e.crop.blurb}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rp-note">
            Plan metrics - soil health {pct(you.metrics.soil)}, fertiliser N {Math.round(you.metrics.fertiliserN)} kg/ha over four seasons after legume credits, typical water-stress loss {pct(you.metrics.loss)}
            {you.metrics.stressLoss !== null ? `, in ${replay}-like seasons ${pct(you.metrics.stressLoss)}` : ''}. {chosen ? 'The model’s own plans, for comparison:' : 'Alternatives evaluated:'}{' '}
            {others.filter((s) => s.key !== chosen?.key).map((s) => `${s.label} (${s.seq.map((e) => e.crop.name).join(' → ')})`).join('; ') || 'none'}.
          </p>
        </section>
      )}

      {forecast && (
        <section className="rp-sec rp-keep">
          <h2><span>7</span>Short-term outlook (next 16 days)</h2>
          <p>
            Forecast rain {Math.round(forecast.totals.rain)} mm against {Math.round(forecast.totals.et0)} mm of reference evapotranspiration -{' '}
            {forecast.totals.rain < forecast.totals.et0 ? `a deficit of ${Math.round(forecast.totals.et0 - forecast.totals.rain)} mm, so the soil keeps drying` : `a surplus of ${Math.round(forecast.totals.rain - forecast.totals.et0)} mm`}.
            {' '}Frost nights: {forecast.totals.frostDays}. Days suitable for field work (&lt; 1 mm rain, wind &lt; 25 km/h): {forecast.totals.workableDays} of {forecast.days.length}.
            {' '}Source: Open-Meteo, retrieved {issued}.
          </p>
        </section>
      )}

      <section className="rp-sec rp-keep">
        <h2><span>{forecast ? 8 : 7}</span>Evidence, confidence & limits</h2>
        <p>
          {p.confidence
            ? <>{top.crop.name} ranked first in {pct(p.confidence.topShare)} of {p.confidence.runs} runs that varied {p.confidence.varied.join(', ')}. {p.confidence.topShare >= 0.5 ? `In an out-of-sample check on past fields, picks rated this sure held ${p.confidence.topShare >= 0.9 ? '≈ 100 %' : p.confidence.topShare >= 0.7 ? '≈ 75 %' : '≈ 60 %'} of the time once the next ten seasons were observed. ` : 'Below 50 % the field is a close call: treat the top crops as alternatives. '}</>
            : 'Confidence was not computed for this print. '}
          GAEZ v4 soil suitability of the pick on this topsoil (pH {soil.top.ph.toFixed(1)}, {soil.texture}): {pct(suit.rating)} of its yield potential{suit.limiting ? `, limited by ${suit.limiting === 'ph' ? 'pH' : 'texture'}` : ''}.
        </p>
        {localRows.length > 0 && (
          <p>
            What farms grow within the surrounding 0.5° cell (CROPGRIDS 2020, shown for comparison, not scored): {localRows.join(' · ')}.
          </p>
        )}
        {flags.length > 0 && (
          <ul className="rp-flags">
            {flags.map((x) => <li key={x.id}><b>{x.level === 'out' ? 'Outside the model' : 'Stretches the model'}:</b> {x.title} - {x.detail}</li>)}
          </ul>
        )}
        {flags.length === 0 && <p>None of the {FAILURE_MODES.length} documented failure modes that can be detected from the data is triggered on this field.</p>}
        <p>Scenario ID <b translate="no">{p.scenarioId ?? id}</b> · model <span translate="no">{MODEL_VERSION}</span> · the same inputs always give the same result.</p>
      </section>

      <section className="rp-sec rp-keep">
        <h2><span>{forecast ? 9 : 8}</span>Methods & references</h2>
        <ol className="rp-refs" translate="no">
          <li>NASA Langley Research Center, POWER Project - monthly and daily point data (MERRA-2 meteorology, CERES/SRB radiation). power.larc.nasa.gov</li>
          <li>Gelaro, R. et al. (2017). The Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2). <i>J. Climate</i> 30, 5419-5454.</li>
          <li>Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). <i>Crop evapotranspiration.</i> FAO Irrigation and Drainage Paper 56. FAO, Rome.</li>
          <li>Doorenbos, J., Kassam, A.H. (1979). <i>Yield response to water.</i> FAO Irrigation and Drainage Paper 33. FAO, Rome.</li>
          <li>Saxton, K.E., Rawls, W.J. (2006). Soil water characteristic estimates by texture and organic matter for hydrologic solutions. <i>SSSAJ</i> 70, 1569-1578.</li>
          <li>Poggio, L. et al. (2021). SoilGrids 2.0: producing soil information for the globe with quantified spatial uncertainty. <i>SOIL</i> 7, 217-240.</li>
          <li>Mann, H.B. (1945). Nonparametric tests against trend. <i>Econometrica</i> 13, 245-259. Sen, P.K. (1968). <i>JASA</i> 63, 1379-1389.</li>
          <li>Fischer, G. et al. (2021). <i>Global Agro-Ecological Zones v4 - Model documentation.</i> FAO & IIASA, Rome (soil pH/texture ratings, heat units).</li>
          <li>Tang, F.H.M. et al. (2024). CROPGRIDS: a global geo-referenced dataset of 173 crops. <i>Scientific Data</i> 11, 413.</li>
          <li>Renard, K.G. et al. (1997). <i>RUSLE.</i> USDA Agriculture Handbook 703 · Fryrear, D.W. et al. (1994) wind-erodible fraction.</li>
          <li>Saltelli, A. et al. (2010). Variance based sensitivity analysis of model output. <i>Comput. Phys. Commun.</i> 181, 259-270.</li>
          <li>NASA GIBS (SMAP L4, MODIS NDVI & LST, VIIRS) · Open-Meteo forecast API · AWS Terrain Tiles (SRTM) · Esri World Imagery · OpenStreetMap Nominatim.</li>
        </ol>
      </section>

      <section className="rp-sec rp-keep">
        <p className="rp-disclaimer">
          This report was generated automatically from open Earth-observation, reanalysis and soil datasets. It is decision support, not a guarantee of yields or
          margins: the climate signal is regional (~50 km), soil properties are modelled (250 m) and crop margins are illustrative. Verify with a qualified agronomist
          and local field records before acting. NASA data are used under NASA’s open data policy; this report is not endorsed by NASA.
        </p>
        <table className="rp-sign">
          <tbody>
            <tr>
              <td><div className="rp-line">Zixtaro decision-support system (automated)</div>Prepared by</td>
              <td><div className="rp-line" />Reviewed by (agronomist)</td>
              <td><div className="rp-line" />Date</td>
              <td><div className="rp-line" />Signature</td>
            </tr>
          </tbody>
        </table>
      </section>
    </article>
  )
}

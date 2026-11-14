import type { ClimateAnalysis } from '../lib/climate'
import { diverging } from '../lib/color'
import { airWarm, airWet } from '../lib/airCore'
import { coord, euro, MONTHS_SHORT, pct, signed, thousands } from '../lib/format'
import type { Field } from '../lib/geo'
import { carbonPerKg, COVERS, GH_CROP_BY_ID, insideByDay, planMargin, type GhRankOptions, type GhResult, type Prices } from '../lib/greenhouse'
import { marketLabel } from '../lib/ghMarket'
import { ghValidity } from '../lib/ghTrust'
import { MODEL_VERSION } from '../lib/version'
import { useGhTrust } from './GhTrustPanel'
import { FieldMap, QR, reportId } from './PrintReport'
import { CropTile, Logo } from './ui'

// The greenhouse counterpart of the field report: one A4 advisory document a grower, a bank or an energy
// adviser can file - the outdoor climate shift from NASA POWER, month-by-month light, heat and overheating,
// the planting calendar with its energy bill, the rain tank, and every method behind the numbers.

type Props = {
  field: Field
  place: string | null
  climate: ClimateAnalysis // observed record (the what-if never rewrites the climate tables)
  plan: ClimateAnalysis // the climate the advice is for (what-if applied)
  scenarioId?: string
  result: GhResult
  ranking: GhResult[]
  prices: Prices
  whatIf: string
  scenarioUrl: string
  /** the grower's priorities, crops and country - the ranking the page shows */
  opts?: GhRankOptions
}

const STATE = { establish: 'planted', harvest: 'harvest', idle: 'left empty', closed: 'too cold' } as const

export function GreenhouseReport(p: Props) {
  const { field, place, climate: c, result: r, ranking, prices, whatIf } = p
  const id = reportId(p.scenarioUrl)
  const issued = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const spec = r.spec
  const cov = COVERS[spec.cover]
  const A = spec.floorM2
  const plan = r.plan
  const tMax = Math.max(1, ...c.anomalies.map((x) => Math.abs(x.t)))
  const wMax = Math.max(60, ...c.anomalies.map((x) => Math.abs(x.cwb)))
  const mB = c.monthly.baseline
  const mR = c.monthly.recent
  const winter = (ms: typeof mB) => (ms[11].t + ms[0].t + ms[1].t) / 3
  const summerMax = (ms: typeof mB) => (ms[5].tMax + ms[6].tMax + ms[7].tMax) / 3
  const parIn = (ms: GhResult['months']) => ms.reduce((s, m, i) => s + m.dliIn * [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i], 0)
  const heatChange = r.baseline.heatKwh > 0 ? r.totals.heatKwh / r.baseline.heatKwh - 1 : 0
  const co2 = (plan.carbonKg * A) / 1000
  const kgCo2 = carbonPerKg(plan)
  const yearsPos = r.years.filter((y) => y.margin > 0).length
  const worst = r.years.length ? r.years.reduce((a, b) => (b.margin < a.margin ? b : a)) : null
  const allYearGap = r.allYear && plan.months.length < 12 ? plan.margin - r.allYear.margin : 0
  const w = r.water
  const f1 = (x: number) => x.toFixed(1).replace('-', '−')
  const trust = useGhTrust(p.plan, spec, prices, p.opts ?? {})
  const flags = ghValidity(c, r, ranking).filter((x) => x.level !== 'ok')
  const gh = (x: keyof typeof GH_CROP_BY_ID | null) => (x ? GH_CROP_BY_ID[x].name : 'no crop')

  return (
    <article className="print-only report">
      <header className="rp-head">
        <div className="rp-brand">
          <Logo tone="print" size={30} />
          <div>
            <div className="rp-wordmark">ZIXTARO</div>
            <div className="rp-sub">Protected cropping · climate, energy & water decision support</div>
          </div>
        </div>
        <table className="rp-meta">
          <tbody>
            <tr><th>Report No.</th><td translate="no">{id}</td></tr>
            <tr><th>Issued</th><td>{issued}</td></tr>
            <tr><th>Data vintage</th><td>NASA POWER {c.firstYear}-{c.lastYear}</td></tr>
          </tbody>
        </table>
      </header>

      <h1 className="rp-title">Greenhouse Climate &amp; Energy Report</h1>
      <p className="rp-lede">
        Site-specific assessment of how the outdoor climate drives light, heating, overheating and rainwater for a {cov.label.toLowerCase()} house of{' '}
        {thousands(A)} m² growing {r.crop.name.toLowerCase()}, with the planting calendar that leaves the most after energy, labour and plants
        {whatIf ? `. What-if scenario: ${whatIf}; the climate tables show the observed record` : ''}.
      </p>

      <section className="rp-sec rp-grid">
        <div>
          <h2><span>1</span>Site and house</h2>
          <table className="rp-kv">
            <tbody>
              <tr><th>Site</th><td>{field.label ?? place ?? 'Unnamed site'}</td></tr>
              <tr><th>Centre</th><td translate="no">{coord(field.lat, field.lon)}</td></tr>
              <tr><th>Cover</th><td>{cov.label} · PAR transmission {pct(cov.tau)} · U = {cov.u} W m⁻² K⁻¹ · cover/floor {cov.ratio}</td></tr>
              <tr><th>Floor area</th><td>{thousands(A)} m² ({(A / 10_000).toFixed(2)} ha)</td></tr>
              <tr><th>Systems</th><td>{spec.heated ? `heated to ${r.crop.dayT}/${r.crop.nightT} °C day/night` : 'unheated'} · {spec.lit ? 'LED top-light 180 µmol m⁻² s⁻¹' : 'no supplementary light'} · {spec.screen ? 'night energy screen' : 'no screen'}</td></tr>
              <tr><th>Crop</th><td>{r.crop.name} ({r.crop.latin}) · target light {r.crop.dli} mol m⁻² d⁻¹</td></tr>
              <tr><th>Energy prices</th><td>heat €{prices.heat.toFixed(3)}/kWh fuel · electricity €{prices.power.toFixed(3)}/kWh</td></tr>
              <tr><th>Climate signal</th><td>{c.signal.label} · {signed(c.means.recent.t - c.means.baseline.t, 1, ' °C')} since {c.baseline.from}-{c.baseline.to}</td></tr>
            </tbody>
          </table>
          <div className="rp-qr">
            <QR text={p.scenarioUrl} />
            <div>
              <b>Live scenario</b>
              <br />
              Scan to open this exact greenhouse analysis - every input is encoded in the link.
            </div>
          </div>
        </div>
        <FieldMap field={field} />
      </section>

      <section className="rp-sec">
        <h2><span>2</span>The outdoor climate the house works against</h2>
        <svg viewBox={`0 0 ${c.anomalies.length} 1`} preserveAspectRatio="none" className="rp-stripes">
          {c.anomalies.map((x, i) => <rect key={x.year} x={i} y={0} width={1.02} height={0.66} fill={airWarm(diverging(x.t, tMax))} />)}
          {c.anomalies.map((x, i) => <rect key={`w${x.year}`} x={i} y={0.72} width={1.02} height={0.28} fill={airWet(diverging(x.cwb, wMax))} />)}
        </svg>
        <div className="rp-stripes-axis"><span>{c.firstYear}</span><span>each year against {c.baseline.from}-{c.baseline.to}: air temperature (slate colder · red warmer) over season water balance (earth drier · water wetter)</span><span>{c.lastYear}</span></div>
        <table className="rp-table">
          <thead><tr><th>Indicator</th><th>{c.baseline.from}-{c.baseline.to}</th><th>{c.recent.from}-{c.recent.to}</th><th>Change</th><th>What it means under cover</th></tr></thead>
          <tbody>
            <tr><td>Winter mean air temperature (Dec-Feb), °C</td><td>{f1(winter(mB))}</td><td>{f1(winter(mR))}</td><td>{signed(winter(mR) - winter(mB), 1)}</td><td className="rp-small">less heat to buy per winter night</td></tr>
            <tr><td>Summer mean daily maximum (Jun-Aug), °C</td><td>{f1(summerMax(mB))}</td><td>{f1(summerMax(mR))}</td><td>{signed(summerMax(mR) - summerMax(mB), 1)}</td><td className="rp-small">more hours above the crop’s {r.crop.maxT} °C limit</td></tr>
            <tr><td>Light reaching the crop, mol m⁻² per year</td><td>{thousands(parIn(r.baselineMonths))}</td><td>{thousands(parIn(r.months))}</td><td>{signed((parIn(r.months) / parIn(r.baselineMonths) - 1) * 100, 1, ' %')}</td><td className="rp-small">yield potential (≈ 1 % light, 1 % yield)</td></tr>
            <tr><td>Heat demand, kWh m⁻² per year (heated all year)</td><td>{thousands(r.baseline.heatKwh)}</td><td>{thousands(r.totals.heatKwh)}</td><td>{signed(heatChange * 100, 0, ' %')}</td><td className="rp-small">same house, same set points, then vs now</td></tr>
            <tr><td>Months needing shade or cooling</td><td>{r.baselineMonths.filter((m) => m.shade !== 'none').length}</td><td>{r.totals.shadeMonths}</td><td>{signed(r.totals.shadeMonths - r.baselineMonths.filter((m) => m.shade !== 'none').length, 0)}</td><td className="rp-small">screens, whitewash or pad cooling</td></tr>
          </tbody>
        </table>
      </section>

      <section className="rp-sec rp-keep">
        <h2><span>3</span>Month by month</h2>
        <table className="rp-table">
          <thead>
            <tr><th>Month</th><th>Outside °C</th><th>Daylight out → in, mol m⁻² d⁻¹</th><th>Lamps</th><th>Heat kWh m⁻²</th><th>Inside by day °C</th><th>Shade</th><th>Rain mm</th><th>Plan</th><th>€ m⁻²</th></tr>
          </thead>
          <tbody>
            {r.months.map((m, i) => {
              const inCrop = m.state === 'establish' || m.state === 'harvest'
              return (
                <tr key={m.month}>
                  <td>{MONTHS_SHORT[i]}</td>
                  <td>{f1(m.tOut)}</td>
                  <td>{m.dliOut.toFixed(1)} → {m.dliIn.toFixed(1)}</td>
                  <td>{inCrop && m.supp > 0 ? `+${m.supp.toFixed(1)} (${m.lampHours.toFixed(1)} h)` : '-'}</td>
                  <td>{spec.heated && inCrop ? m.heatKwh.toFixed(0) : '-'}</td>
                  <td>{inCrop ? insideByDay(m, spec, r.crop).toFixed(0) : '-'}</td>
                  <td>{inCrop && m.shade !== 'none' ? (m.shade === 'month' ? 'all month' : 'hot days') : '-'}</td>
                  <td>{(m.catchMm / 0.85).toFixed(0)}</td>
                  <td>{STATE[m.state]}</td>
                  <td>{inCrop ? m.net.toFixed(1).replace('-', '−') : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="rp-note">Normals of {c.recent.from}-{c.recent.to}{whatIf ? ' with the what-if applied' : ''}. € per m² = crop revenue once harvesting minus heat and light for the month.</p>
      </section>

      <section className="rp-sec rp-keep">
        <h2><span>4</span>Planting calendar and energy</h2>
        <div className="rp-reco">
          <CropTile crop={r.crop} size="lg" />
          <div className="rp-reco-crop">
            <div className="rp-reco-name">{r.crop.name}</div>
            <div className="rp-reco-latin">{plan.plant ? `plant ${MONTHS_SHORT[plan.plant - 1]} · first harvest ${MONTHS_SHORT[plan.firstHarvest! - 1]} · clear ${MONTHS_SHORT[plan.clear! - 1]}` : 'no run pays for its energy at these prices'}</div>
            <div className="rp-reco-score">{euro(planMargin(r) * A)}<small> / year after running costs · score {Math.round(r.score.score)}</small></div>
          </div>
          <table className="rp-kv rp-reco-parts">
            <tbody>
              <tr><th>Yield</th><td>{plan.yieldKg.toFixed(plan.yieldKg < 10 ? 1 : 0)} kg m⁻² · {thousands((plan.yieldKg * A) / 1000)} t (calibrated on Eurostat harvests)</td></tr>
              <tr><th>Crop sells for</th><td>{plan.yieldKg > 0 ? `€${(plan.revenue / plan.yieldKg).toFixed(2)}/kg on average` : '-'} · {r.ownPrice ? 'your own price' : marketLabel(p.plan.lat)}</td></tr>
              <tr><th>Real years in profit</th><td>{r.years.length ? `${yearsPos} of ${r.years.length}${worst ? ` · worst ${worst.year}: €${worst.margin.toFixed(1)}/m²` : ''}` : '-'} (that year’s weather, crop and energy prices)</td></tr>
              <tr><th>Energy bill</th><td>{euro(plan.energyCost * A)} · {thousands((plan.heatKwh * A) / 1000)} MWh heat{plan.lightKwh > 0 ? ` · ${thousands((plan.lightKwh * A) / 1000)} MWh light` : ''}</td></tr>
              <tr><th>CO₂ from heat and light</th><td>{co2.toFixed(0)} t{kgCo2 !== null ? ` · ${kgCo2.toFixed(kgCo2 < 1 ? 2 : 1)} kg per kg harvested` : ''} (gas boiler 90 %, grid power 0.25 kg/kWh)</td></tr>
              {r.allYear && plan.months.length < 12 && <tr><th>vs heating all year</th><td>{euro(allYearGap * A)} a year more left by keeping {12 - plan.months.length} months cold</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="rp-note">“After running costs” is crop revenue minus energy, CO₂ dosing, young plants, substrate, crop care and picking labour - packaging, selling and capital are not included, so it is not a profit figure.</p>
      </section>

      <section className="rp-sec rp-keep">
        <h2><span>5</span>Rainwater from the roof</h2>
        <p>
          The roof collects about {thousands(w.catchM3)} m³ of rain a year (85 % runoff) against {thousands(w.demandM3)} m³ of drip water for the planned
          crop. A {thousands(w.tankM3)} m³ tank covers {pct(w.cover)} of that demand ({pct(w.maxCover)} with an unlimited tank); about {thousands(w.overflowM3)} m³
          a year still overflows in wet months. Simulated month by month over {c.recent.from}-{c.recent.to} NASA POWER rainfall.
        </p>
      </section>

      <section className="rp-sec rp-keep">
        <h2><span>6</span>The same house with other crops</h2>
        <table className="rp-table">
          <thead><tr><th>#</th><th>Crop</th><th>Score</th><th>Calendar</th><th>Yield kg m⁻²</th><th>Energy € m⁻²</th><th>Plants, substrate, picking € m⁻²</th><th>Left € m⁻²</th><th>Years in profit</th></tr></thead>
          <tbody>
            {ranking.map((x, i) => (
              <tr key={x.crop.id}>
                <td>{i + 1}</td>
                <td><span className="rp-crop"><CropTile crop={x.crop} size="xs" className="!h-5 !w-5" />{x.crop.name}{x.crop.id === r.crop.id ? ' (planned)' : ''}</span></td>
                <td>{Math.round(x.score.score)}</td>
                <td>{x.plan.plant ? `${MONTHS_SHORT[x.plan.plant - 1]} → ${MONTHS_SHORT[x.plan.clear! - 1]}` : '-'}</td>
                {/* a crop with no paying run has no plan: dashes, not a row of 0.0 that reads as missing data */}
                <td>{x.plan.plant ? x.plan.yieldKg.toFixed(x.plan.yieldKg < 10 ? 1 : 0) : '-'}</td>
                <td>{x.plan.plant ? x.plan.energyCost.toFixed(1) : '-'}</td>
                <td>{x.plan.plant ? x.plan.otherCost.toFixed(1) : '-'}</td>
                <td>{x.plan.plant ? planMargin(x).toFixed(1) : `${(x.bestRun?.margin ?? 0).toFixed(1)} (no run pays)`}</td>
                <td>{x.years.length ? `${x.years.filter((y) => y.margin > 0).length}/${x.years.length}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rp-note">Ranked by the score on the page (margin, CO₂ and steadiness, with the grower’s weights). Yields from light-use efficiency calibrated on Eurostat harvests; each month sells at that month’s farm-gate price in the DG AGRI record; costs from published budgets (Flemish and Dutch for heated glass, the Andalusian price observatory for plastic houses). A gross margin before capital, packing and selling - not profit.</p>
      </section>

      <section className="rp-sec rp-keep">
        <h2><span>7</span>Evidence, confidence &amp; limits</h2>
        {trust ? (
          <p>
            {trust.conf.topShare > 0
              ? <>{gh(trust.conf.top)} came first in {Math.round(trust.conf.topShare * 100)} % of {trust.conf.runs} re-runs that varied {trust.conf.varied.join(', ')}. </>
              : 'In no re-run did any crop pay for its energy. '}
            {trust.tip.ownPrice && ranking[0] ? <>{ranking[0].crop.name} stays first until its price falls {Math.round(trust.tip.ownPrice.drop * 100)} %, then {gh(trust.tip.ownPrice.to).toLowerCase()} leads. </> : null}
            {trust.tip.heat ? (trust.tip.heat.high === null && trust.tip.heat.low === null ? <>No gas price between ¼ and 4 times today’s changes the pick. </> : <>{trust.tip.heat.high !== null ? <>Above €{trust.tip.heat.high.toFixed(3)}/kWh gas, {trust.tip.heat.highTo ? gh(trust.tip.heat.highTo).toLowerCase() : 'no crop'} leads. </> : null}{trust.tip.heat.low !== null ? <>Below €{trust.tip.heat.low.toFixed(3)}/kWh, {gh(trust.tip.heat.lowTo).toLowerCase()} leads. </> : null}</>) : null}
            {trust.thenNow.topThen === trust.thenNow.topNow ? <>On the {c.baseline.from}-{c.baseline.to} climate the same house would have picked the same crop.</> : <>On the {c.baseline.from}-{c.baseline.to} climate it would have picked {gh(trust.thenNow.topThen).toLowerCase()}: the observed shift changed the pick.</>}
          </p>
        ) : <p>Confidence not yet computed for this print.</p>}
        {flags.length > 0 ? (
          <ul className="rp-flags">{flags.map((x) => <li key={x.id}><b>{x.level === 'out' ? 'Outside the model' : 'Stretches the model'}:</b> {x.title} - {x.detail}</li>)}</ul>
        ) : <p>None of the greenhouse failure modes that can be checked from the data is triggered here.</p>}
        <p>Not modelled: cold snaps (boiler sizing), humidity and disease control, CO₂ dosing, soil-borne disease and rotation, cover ageing, seasonal price premiums, capital, packing and selling. Benchmarks the model is tested against: heat use of a heated glass tomato house (more than measured Dutch practice with one screen, 38.9 m³ a.e./m² a year, in the colder Torgau climate; less than an unscreened house, 63.6) and tomato yield (47-73 kg/m² a year), Dutch practice; margins against Dutch and Flemish farm accounts. Scenario ID <b translate="no">{p.scenarioId ?? id}</b> · model <span translate="no">{MODEL_VERSION}</span>.</p>
      </section>

      <section className="rp-sec rp-keep">
        <h2><span>8</span>Methods &amp; references</h2>
        <ol className="rp-refs" translate="no">
          <li>NASA Langley Research Center, POWER Project - monthly point data: air temperature and range (MERRA-2), all-sky surface shortwave (CERES SYN1deg / SRB), precipitation. power.larc.nasa.gov</li>
          <li>Light: PAR = 48 % of shortwave, 4.57 mol photons per MJ of PAR; cover transmission as stated. McCree, K.J. (1972). <i>Agric. Meteorol.</i> 10, 443-453. Marcelis, L.F.M. et al. (2006). Quantification of the growth response to light quantity of greenhouse grown crops. <i>Acta Hort.</i> 711, 97-103.</li>
          <li>Heat: hourly steady-state balance U·A·ΔT + air leakage on a sinusoidal day from POWER mean and range, night screen, half the solar gain and lamp heat credited. U-values and air exchanges after ANSI/ASAE EP406.4 (2003), <i>Heating, Ventilating and Cooling Greenhouses</i>.</li>
          <li>Lamps: LED efficacy 2.8 µmol/J. Kusuma, P., Pattison, P.M., Bugbee, B. (2020). From physics to fixtures to food: current and potential LED efficacy. <i>Hortic. Res.</i> 7, 56.</li>
          <li>Water: crop transpiration ≈ 65 % of inside radiation (latent heat) + 15 % drain - a model assumption, not yet compared with measurements; tank simulated month by month on the recent decade.</li>
          <li>Benchmarks: Raaphorst, M., Benninga, J. (2019). <i>Kwantitatieve Informatie voor de Glastuinbouw 2019</i>. Wageningen UR Glastuinbouw. Raaphorst, M. (2018). <i>Energiebesparing door 2e scherm bij onbelichte tomaat</i>. Wageningen Plant Research, WPR-779. de Zwart, H.F. (1996). <i>Analyzing energy-saving options in greenhouse cultivation using a simulation model</i>. PhD thesis, Wageningen. De Samber, J. (2021). <i>Tomatenteelt in Vlaanderen. Resultaten uit het Landbouwmonitoringsnetwerk 2014-2018</i>. Departement Landbouw en Visserij. Wageningen Economic Research, Agrimatie BINternet, results per m² of glass.</li>
          <li>Emissions: IPCC (2006) Guidelines, Vol. 2 ch. 2 - natural gas 56.1 t CO₂ per TJ.</li>
          {whatIf.includes('CMIP6') && <li>Thrasher, B. et al. (2022). NASA Global Daily Downscaled Projections, CMIP6. <i>Scientific Data</i> 9, 262. Data via NASA NCCS THREDDS.</li>}
        </ol>
      </section>

      <section className="rp-sec rp-keep">
        <p className="rp-disclaimer">
          This report was generated automatically from open NASA reanalysis and satellite radiation data with a steady-state monthly greenhouse model. It is
          decision support, not an engineering design: it ignores humidity control, CO₂ dosing and heat storage, and yields and prices are illustrative. Verify
          with your climate-computer records and an energy adviser before investing. NASA data are used under NASA’s open data policy; this report is not
          endorsed by NASA.
        </p>
        <table className="rp-sign">
          <tbody>
            <tr>
              <td><div className="rp-line">Zixtaro decision-support system (automated)</div>Prepared by</td>
              <td><div className="rp-line" />Reviewed by (grower / adviser)</td>
              <td><div className="rp-line" />Date</td>
              <td><div className="rp-line" />Signature</td>
            </tr>
          </tbody>
        </table>
      </section>
    </article>
  )
}

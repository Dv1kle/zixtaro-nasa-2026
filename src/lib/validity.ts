// Where the model holds - and where it does not - for this field and these crops.
//
// Every method here was built for particular conditions: Saxton & Rawls for mineral soils below 8 % organic matter
// and 60 % clay; FAO-56 calendars and Kc curves for the regions its tables list; winter-crop parameters for climates
// with a real winter; one crop a year; a monthly water balance without waterlogging or salinity. The register below
// lists the known failure modes; `fieldValidity` checks this field's data against the ones that can be detected, so a
// result is never shown as more general than it is. What cannot be detected is still listed, as not modelled.

import type { ClimateAnalysis } from './climate'
import { CROP_BY_ID, CROPS, monsoonal, rainySeason, type Crop, type CropId } from './crops'
import type { DailyAnalysis } from './daily'
import { heightShift, LAPSE } from './height'
import type { ScaleNote } from './scale'
import type { SoilProfile } from './soil'
import { formOf } from './water'

export type Level = 'out' | 'stretch' | 'ok'

/** A known way the model can fail: what triggers it, what it breaks, and whether Zixtaro can tell. */
export type FailureMode = {
  id: string
  what: string
  effect: string
  /** detected: checked against this field's data; partial: a proxy is checked; not-modelled: stated only */
  handled: 'detected' | 'partial' | 'not-modelled'
}

export const FAILURE_MODES: FailureMode[] = [
  { id: 'tropics', what: 'Rainy-season calendars (tropics and monsoon belt)', effect: 'In the tropics, and beyond them on summer-rain fields without a cold winter, sowing follows the rains: found from monthly normals by FAO’s growing-period rule (rain ≥ ½ PET) - warm-season crops at the onset, cool-season crops after it, paddy rice once rain covers evaporation. The real onset moves by weeks from year to year, which monthly data cannot see; two rainy seasons (East Africa) are planned as one.', handled: 'partial' },
  { id: 'double', what: 'Two or three crops a year', effect: 'The model plans one main crop per year; where the frost-free season allows two, it undercounts the options.', handled: 'detected' },
  { id: 'springform', what: 'Winter crops where winters kill them', effect: 'Where the coldest month of most recent winters falls below a winter crop’s hardiness, the field is planned with its spring form (spring wheat, barley, rapeseed). Hardiness is judged on air temperature: snow cover, which insulates winter wheat on the prairies, is not modelled.', handled: 'partial' },
  { id: 'vernal', what: 'Winter crops without a winter', effect: 'Winter types need weeks near 0-10 °C to flower. Where the coldest month averages 10 °C or more, wheat, barley and rapeseed are planned as spring types sown in late autumn (rabi wheat, mustard); their season is timed by degree-days only - short winter days, which slow real crops, are not modelled. Rye and triticale keep winter parameters.', handled: 'detected' },
  { id: 'boreal', what: 'Short high-latitude summers', effect: 'Day length and a short season shift development in ways monthly degree-days miss.', handled: 'detected' },
  { id: 'southern', what: 'Southern-hemisphere calendars', effect: 'Calendars are the northern ones shifted six months - close for temperate Argentina or Australia, rough elsewhere.', handled: 'detected' },
  { id: 'arid', what: 'Arid climates', effect: 'Rainfed rankings mostly compare failures; the result hinges on the irrigation water, and salinity from irrigation is not modelled.', handled: 'detected' },
  { id: 'organic', what: 'Organic and peat soils', effect: 'Water holding comes from Saxton & Rawls, fitted for mineral soils up to 8 % organic matter.', handled: 'detected' },
  { id: 'clay', what: 'Very heavy clay', effect: 'Saxton & Rawls is fitted up to 60 % clay; shrink-swell and cracking are not modelled.', handled: 'detected' },
  { id: 'stones', what: 'Stony soils', effect: 'Water holding is scaled down by the stone volume SoilGrids reports; with many stones that estimate is loose.', handled: 'detected' },
  { id: 'waterlog', what: 'Waterlogging and poor drainage', effect: 'The water balance drains any surplus (paddy rice excepted: its bunds hold standing water); flat, heavy fields that stay wet in spring are not penalised.', handled: 'partial' },
  { id: 'saline', what: 'Salinity and sodicity', effect: 'Not modelled; a topsoil pH above 8.5 hints at it.', handled: 'partial' },
  { id: 'acid', what: 'Strongly acid soils', effect: 'Only each crop’s pH preference is used; aluminium and manganese toxicity below pH 5 are not modelled.', handled: 'partial' },
  { id: 'mountain', what: 'Mountain fields', effect: `The ≈ 50 km NASA POWER cell averages valleys and ridges at its mean height; its temperatures are moved to the field’s height at ${LAPSE} °C per km, which brought them closer to weather stations on held-out mountain fields, but one gradient misses cold-air pools in valleys and the sunny or shaded side of a slope, and rain and sunshine stay the cell’s.`, handled: 'partial' },
  { id: 'record', what: 'Short weather record', effect: 'With fewer than 30 years the baseline is not a full climate normal and trends are weaker.', handled: 'detected' },
  { id: 'nodaily', what: 'No daily weather', effect: 'Heat at flowering and late frost fall back to monthly proxies, which miss short extremes.', handled: 'detected' },
  { id: 'provisional', what: 'Provisional soil', effect: 'Until SoilGrids answers, every soil-based figure comes from a typical loam.', handled: 'detected' },
  { id: 'region', what: 'Region-sized outlines', effect: 'Many fields, soils and histories averaged into one recommendation.', handled: 'detected' },
  { id: 'storms', what: 'Hail and convective storms', effect: 'Reanalysis rain smooths short cloudbursts; storm damage and peak runoff are not predicted.', handled: 'not-modelled' },
  { id: 'pests', what: 'Pest and disease outbreaks', effect: 'Only rotation bridges and a wet-season proxy; outbreaks, resistance and spraying are not modelled.', handled: 'not-modelled' },
  { id: 'cultivar', what: 'Cultivar choice', effect: 'One parameter set per crop; maturity class, heat and drought tolerance differ between varieties.', handled: 'not-modelled' },
  { id: 'management', what: 'Tillage, fertilisation, sowing quality', effect: 'Assumed typical; only straw removal and catch crops can be switched.', handled: 'partial' },
  { id: 'markets', what: 'Prices, contracts and subsidies', effect: 'Reference prices are assumptions; markets, contracts and payments decide real margins.', handled: 'not-modelled' },
]

export type ValidityFlag = { id: string; level: Level; title: string; detail: string }

type Inputs = {
  climate: ClimateAnalysis
  soil: SoilProfile
  daily: DailyAnalysis | null
  scale?: ScaleNote | null
  /** field elevation from the terrain model, m (null when unknown) */
  elevation?: number | null
}

/** "a", "a and b", "a, b and c" */
const listOf = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '')

/** Mean temperature of the coldest calendar month in the recent decade, °C. */
export const coldestMonth = (c: ClimateAnalysis) => Math.min(...c.monthly.recent.map((m) => m.t))

/** The failure modes this field triggers (out / stretch), and the main assumptions it satisfies (ok). */
export function fieldValidity({ climate, soil, daily, scale, elevation }: Inputs): ValidityFlag[] {
  const out: ValidityFlag[] = []
  const lat = climate.lat
  const hemi = climate.season.hemisphere
  const cold = coldestMonth(climate)
  const top = soil.layers[0]
  const om = (soil.top.soc / 10) * 1.724
  const stones = top?.cfvo ?? 0

  // ---- climate and calendar ----
  if (hemi === 'tropics' || monsoonal(hemi, climate.monthly.recent)) {
    const rains = rainySeason(climate.monthly.recent)
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    out.push({
      id: 'tropics', level: 'stretch', title: rains && rains.months < 12 ? `Rainy season ${M[rains.onset - 1]}-${M[rains.end - 1]}: calendars follow it` : 'Tropical field without a clear dry season',
      detail: rains && rains.months < 12
        ? `From monthly NASA POWER normals by FAO’s growing-period rule (rain ≥ ½ PET): warm-season crops are sown in ${M[rains.onset - 1]}, cool-season crops in ${M[rains.end % 12]}. The real onset moves by weeks from year to year - check it locally.`
        : rains ? 'Rain covers evaporation in every month, so no sowing date is preferred; calendars stay as written.' : 'Rain never reaches half the evaporative demand: crops follow the wettest month, and irrigation decides.',
    })
  } else if (hemi === 'south') {
    out.push({ id: 'southern', level: 'stretch', title: 'Northern calendars shifted six months', detail: 'Close for temperate southern farming regions; check sowing dates against local practice.' })
  } else {
    out.push({ id: 'tropics', level: 'ok', title: 'Temperate calendar', detail: 'The sowing calendars and FAO-56 stage lengths were written for fields like this one.' })
  }
  if (Math.abs(lat) >= 58) {
    out.push({ id: 'boreal', level: 'stretch', title: 'High-latitude summer', detail: `At ${Math.abs(lat).toFixed(1)}° long days and a short season shift crop development beyond what monthly degree-days capture.` })
  }
  const frostFree = daily?.means.recent.frostFree ?? null
  if (hemi === 'tropics' || (frostFree !== null && frostFree >= 300)) {
    out.push({ id: 'double', level: 'stretch', title: 'Room for more than one crop a year', detail: `${frostFree !== null ? `About ${Math.round(frostFree)} frost-free days a year` : 'No frost season'}: double cropping is possible, while the model plans one main crop per year.` })
  }
  // winters that kill the winter forms: the field is planned with spring wheat, barley and rapeseed
  const spring = (['wheat', 'barley', 'rapeseed'] as CropId[]).filter((id) => formOf(CROP_BY_ID[id], climate).form === 'spring')
  if (spring.length) {
    out.push({
      id: 'springform', level: 'stretch', title: 'Winters too hard for the winter forms',
      detail: `Recent winters here would kill winter ${spring.map((id) => CROP_BY_ID[id].name.replace('Winter ', '').toLowerCase()).join(', ')} in most years, so the plan uses their spring forms. Snow cover is not modelled: under reliable snow a hardy winter variety may survive where the model says it would not.`,
    })
  }
  // winters too mild to vernalise: wheat, barley and rapeseed are planned as spring types sown in late autumn
  const mild = (['wheat', 'barley', 'rapeseed'] as CropId[]).filter((id) => formOf(CROP_BY_ID[id], climate).form === 'mild')
  if (mild.length) {
    out.push({
      id: 'vernal', level: 'stretch', title: 'Winters too mild for the winter forms',
      detail: `The coldest month averages ${cold.toFixed(1)} °C - too warm for winter types to vernalise, so ${listOf(mild.map((id) => CROP_BY_ID[id].name.replace('Winter ', '').toLowerCase()))} ${mild.length > 1 ? 'are' : 'is'} planned as spring types sown in late autumn, as growers here do. Their season is timed by degree-days alone; short winter days slow real crops, which ripen about a month later than planned in Morocco, Australia or northern Argentina (GGCMI calendars). Rye and triticale keep winter-type parameters.`,
    })
  } else if (cold > 12) {
    out.push({ id: 'vernal', level: cold > 16 ? 'out' : 'stretch', title: 'Mild winters for winter crops', detail: `The coldest month averages ${cold.toFixed(1)} °C. Winter wheat, barley, rye, triticale and rapeseed parameters are for types that need a cold spell to flower; local growers use spring or facultative types.` })
  }
  if (climate.aridity.index < 0.2) {
    out.push({ id: 'arid', level: 'stretch', title: `${climate.aridity.klass[0].toUpperCase()}${climate.aridity.klass.slice(1)} climate`, detail: `Rain covers ${Math.round(climate.aridity.index * 100)} % of evaporative demand. Rainfed results compare failures; irrigation decides, and salinity is not modelled.` })
  }
  const years = climate.lastYear - climate.firstYear + 1
  if (years < 30) out.push({ id: 'record', level: 'stretch', title: `${years} years of weather`, detail: 'Shorter than a 30-year climate normal: the baseline and trends are less certain.' })
  if (!daily) out.push({ id: 'nodaily', level: 'stretch', title: 'Daily weather not loaded', detail: 'Heat at flowering and late frost use monthly proxies until NASA POWER daily data arrives.' })
  // NASA POWER moved from its cell's mean height to the field's (height.ts): one lapse rate stands for every slope and season
  const h = climate.height
  const moved = h ? heightShift(h.cell, h.field) : 0
  if (h && (h.field >= 1000 || Math.abs(moved) >= 1)) {
    out.push({
      id: 'mountain', level: 'stretch', title: `A field at ${Math.round(h.field)} m, its NASA POWER cell at ${Math.round(h.cell)} m`,
      detail: `Temperatures moved to the field's height: ${moved >= 0 ? '+' : '−'}${Math.abs(moved).toFixed(1)} °C at ${LAPSE} °C per km. The real gradient changes with season, slope and cold-air pools; rain and sunshine stay the cell's.`,
    })
  } else if (elevation != null && elevation >= 1000) {
    out.push({ id: 'mountain', level: 'stretch', title: `A field at ${Math.round(elevation)} m`, detail: 'The NASA POWER cell averages a mountainous area; temperatures at the field can differ by several degrees.' })
  }

  // ---- soil ----
  if (soil.source === 'provisional') {
    out.push({ id: 'provisional', level: 'out', title: 'Soil not loaded yet', detail: 'Every soil figure is from a typical loam until SoilGrids answers.' })
  }
  if (om > 8) {
    out.push({ id: 'organic', level: 'out', title: 'Organic or peaty topsoil', detail: `About ${om.toFixed(0)} % organic matter - outside the 0-8 % Saxton & Rawls was fitted for, so the water holding is uncertain.` })
  }
  if (soil.top.clay > 60) {
    out.push({ id: 'clay', level: 'stretch', title: 'Very heavy clay', detail: `${Math.round(soil.top.clay)} % clay, beyond the 60 % Saxton & Rawls covers; cracking and swelling are not modelled.` })
  }
  if (om <= 8 && soil.top.clay <= 60 && soil.source !== 'provisional') {
    out.push({ id: 'organic', level: 'ok', title: 'Soil within the water model’s range', detail: `${Math.round(soil.top.clay)} % clay and ${om.toFixed(1)} % organic matter - inside the Saxton & Rawls calibration.` })
  }
  if (stones >= 35) {
    out.push({ id: 'stones', level: 'stretch', title: 'Stony topsoil', detail: `SoilGrids puts stones at ${Math.round(stones)} % of the volume; the water estimate is loose.` })
  }
  if (soil.top.clay >= 40 && climate.aridity.index >= 0.65) {
    out.push({ id: 'waterlog', level: 'stretch', title: 'Heavy soil in a wet climate', detail: 'Spring waterlogging can delay sowing and harm roots; the water balance drains every surplus and does not see it.' })
  }
  if (soil.top.ph > 8.5) out.push({ id: 'saline', level: 'stretch', title: `Topsoil pH ${soil.top.ph.toFixed(1)}`, detail: 'Above 8.5 sodium or salt may be present; test the soil - salinity is not modelled.' })
  if (soil.top.ph < 5) out.push({ id: 'acid', level: 'stretch', title: `Topsoil pH ${soil.top.ph.toFixed(1)}`, detail: 'Below pH 5 aluminium becomes toxic to most crops; only each crop’s pH preference is used.' })

  // ---- scale ----
  if (scale?.scale === 'region') out.push({ id: 'region', level: 'out', title: scale.title, detail: 'One recommendation for many fields - read it as the picture for a typical field here.' })
  else if (scale?.scale === 'farm') out.push({ id: 'region', level: 'stretch', title: scale.title, detail: 'Fields with different soils or histories deserve their own plan.' })

  const order: Record<Level, number> = { out: 0, stretch: 1, ok: 2 }
  return out.sort((a, b) => order[a.level] - order[b.level])
}

/** Crops sown in autumn that rely on a winter (the vernalization check applies to them). */
export const WINTER_TYPES: CropId[] = CROPS.filter((c) => c.hardiness !== undefined && c.sow >= 8 && !c.perennial).map((c) => c.id)

/** Why a crop's parameters may not hold on this field - for the ranking's small print. */
export function cropValidity(crop: Crop, climate: ClimateAnalysis): { level: Level; reasons: { text: string; level: Level }[] } {
  const reasons: { text: string; level: Level }[] = []
  const cold = coldestMonth(climate)
  if (WINTER_TYPES.includes(crop.id) && cold > 12) {
    reasons.push({ text: `winter type where the coldest month averages ${cold.toFixed(0)} °C`, level: cold > 16 ? 'out' : 'stretch' })
  }
  if (crop.kyAssumed) reasons.push({ text: 'yield response to water (Ky) assumed - not tabulated in FAO-33', level: 'stretch' })
  const level: Level = reasons.some((r) => r.level === 'out') ? 'out' : reasons.length ? 'stretch' : 'ok'
  return { level, reasons }
}

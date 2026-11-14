// Versions and reproducibility. MODEL_VERSION names the science a recommendation came from; SCHEMA versions what is
// stored in shared links and in the browser, so older ones can be migrated instead of silently changing meaning.
import type { CropId } from './crops'
import { EXTRA_IDS } from './cropsExtra'

// 2026.10-region (page mode C = the regional prior, check I) + the silage form of maize (H5) and the cycle's start, N2c
// (H6) - both joined the page engine by their pre-registered decision rules; -heat: heat at flowering by
// its degree-days, a season that ripens a share of a month sooner in a warmer climate (development check only -
// passed held-out check J, registered 0fd7803); -fill: under a what-if only, a shorter grain fill for
// cool-season grain crops and C4 cereals (scenario.ts grainFill) - observed-climate scores unchanged; -glass:
// greenhouse economics recalibrated on Dutch and Flemish farm accounts (P2.7) - field scores unchanged;
// -onset: winter kill as a ramp around the hardiness, the rains' onset and a warm-season wait for warmth read
// continuously (GGCMI sowing error 29 → 26 days where the rains set it)
// -fallow: a bare fallow as a season of its own that stores rain for the next crop (FAO-56 bare-soil
// evaporation; P2.8) - off by default except where it is the local practice (the Kansas demo field); mode C's plausible
// bar set by crops that are sold only (a cover crop or fallow had set it)
// -paddy: the Monte Carlo and the backtest grow rice in its paddy, as the score does (they ran it as a
// field crop) - scores unchanged, "How sure" and backtest verdicts move where rice competes
// -forms: near the line where a crop switches form (winter/spring, the autumn-sown spring type, silage)
// the field is scored on both forms, weighted; a rainy season holding the coldest month and not the warmest is no
// monsoon; the Monte Carlo and the backtest simulate the form the field grows (they took the base form)
// -wet: wet-season disease as a ramp ±10 % around the crop's rain limit, as winter kill around the hardiness
// -chp: greenhouse only - Dutch boiler gas at the glasshouse tariff, optional combined heat and power
// -sow: a summer-rain field's sowing rule weighted across 10-11 °C, a cool-season sowing blended within
// ±1 °C of its seed-bed minimum, a sowing between two months run on both calendars (held-out check L kept it)
// -rains: a month inside the rains at ½ PET that splits the season counts both ways (check N kept it)
// -nest: a field near more than one line (form, sowing rule, split) is scored on every combination - a
// crop carried only the first line that applied
// -monsoon: every month within 0.1 of ½ PET counts wet by its share of the band, over every combination:
// whether the rains keep a monsoon's shape (a weighted sowing rule) and which rainy season the field has (every season a
// variant); a forced season's onset reads continuously - a few per cent more rain switched rule or season at once
// -field: in the USA, Canada, France and Denmark mode C reads the crop maps of the field and the fields
// around it (fieldWindow.ts, fieldPractice.ts) - the practice layer experiment H8 judged on new fields
// -soyearly: a 95-day soybean beside GAEZ's 105-150-day ones, as grown at its cold margin (gaez.ts
// SOYBEAN_EARLY; held-out check U kept it)
// -height: NASA POWER's temperatures moved from its cell's mean height to the field's at 5.0 °C per km
// (height.ts; live fields only - the demo bundles and the evaluation cells keep the cell's). At 6.5 °C per km held-out
// check S did not confirm it as registered and it left the page; check T confirmed 5.0 on fresh stations
export const MODEL_VERSION = '2026.10-region-n2c-heat-fill-glass-onset-fallow-paddy-forms-wet-chp-sow-rains-nest-monsoon-field-soyearly-height'
/** 1: before the world crops · 2: rice, cassava … exist · 3: the all-crops plan's crops exist · 4: bare fallow */
export const SCHEMA = 4
export const WORLD_CROPS: CropId[] = ['rice', 'cassava', 'sweetpotato', 'groundnut', 'cowpea', 'drybean', 'cotton', 'pearlmillet']
/** The crops a state saved under `schema` did not know: its crop list meant them switched off. */
export const addedSince = (schema: number): CropId[] => [...(schema < 2 ? WORLD_CROPS : []), ...(schema < 3 ? [...EXTRA_IDS] : []), ...(schema < 4 ? (['fallow'] as CropId[]) : [])]

/** JSON with object keys sorted, so equal inputs always serialise the same way. */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`
  if (x && typeof x === 'object') {
    return `{${Object.keys(x as object).filter((k) => (x as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(x ?? null)
}

/** FNV-1a, 32 bit, as 8 hex digits. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Same inputs + same model version → same ID → the same recommendation (the engine is deterministic and seeded). */
export const scenarioId = (inputs: unknown) => fnv1a(canonical({ model: MODEL_VERSION, inputs }))

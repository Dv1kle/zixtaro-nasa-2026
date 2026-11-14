// The air core's two ramps: the 45 years of a field's air read as the strata of a core, in the page's own world.
// Still diverging, still readable as science (colder ↔ warmer, drier ↔ wetter, a neutral bone at zero), but built
// from the Core Sample palette - slate-teal water for cold, bone at the normal, wheat into the one red for heat;
// oxide earth for a dry season, the water tone for a wet one - instead of the cold pastel RdBu/BrBG that clashed
// with the graphite and straw around it.
import { ramp } from './color'

/** air temperature anomaly: 0 = the coldest end of the scale, 0.5 = the normal, 1 = the hottest */
export const airWarm = ramp(['#1f3a40', '#2f5a62', '#4f7f86', '#93aeab', '#d8cfbd', '#ddb47a', '#d6893f', '#e05a2b', '#8e2a12'])

/** growing-season water balance: 0 = the driest, 0.5 = the normal, 1 = the wettest */
export const airWet = ramp(['#3b2412', '#5e3a1d', '#7a4a2a', '#b08758', '#d6cbb2', '#a7c4c2', '#7fb0b6', '#4f8a92', '#2a5d66'])

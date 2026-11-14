// Field, farm or region? A drawn outline can be anything from a paddock to half a province. The science underneath
// has fixed resolutions - NASA POWER ≈ 50 km, SoilGrids 250 m, one crop history per field - so the plan must say
// what it is valid for, and warn before a district-sized outline reads like a field prescription.

import type { Field } from './geo'
import type { SoilProfile } from './soil'

export type Scale = 'point' | 'field' | 'farm' | 'region'
export type ScaleNote = { scale: Scale; tone: 'ok' | 'warn' | 'bad'; title: string; text: string }

/** A single field rarely exceeds this; larger outlines are farms or landscapes (ha). */
export const FIELD_MAX_HA = 200
/** Above this an outline spans many farms (ha) - 20 km². */
export const REGION_MIN_HA = 2000
/** NASA POWER's MERRA-2 cell, 0.5° × 0.625° (km², at mid-latitudes) - for scale comparisons in words. */
export const POWER_CELL_KM2 = 55 * 45

export function scaleNote(field: Field, soil: SoilProfile | null): ScaleNote {
  const v = soil?.variability
  const spread = v ? v.paw100[1] - v.paw100[0] : 0
  const mixed = v ? v.textures.length > 1 || spread >= 40 : false
  const soilLine = v
    ? ` Soil across the ${v.samples.length} samples: ${Math.round(v.paw100[0])}-${Math.round(v.paw100[1])} mm of water in the top metre${v.textures.length > 1 ? `, ${v.textures.join(' / ')}` : ''}.`
    : ''
  if (field.kind === 'point') {
    return { scale: 'point', tone: 'ok', title: 'One point', text: 'Soil for the 250 m around the pin; climate for its ≈ 50 km NASA POWER cell. Draw the outline to sample the soil across the whole field.' }
  }
  const ha = field.areaHa
  const km2 = ha / 100
  if (ha > REGION_MIN_HA) {
    return {
      scale: 'region',
      tone: 'bad',
      title: `A landscape, not a field (${km2 >= 100 ? Math.round(km2) : km2.toFixed(0)} km²)`,
      text: `The outline is ${km2 >= POWER_CELL_KM2 ? 'as large as' : `${Math.round((100 * km2) / POWER_CELL_KM2)} % of`} a NASA climate cell and holds many fields with their own soils and histories. Read this as the picture for a typical field here, not a prescription - draw one field for a field plan.${soilLine}`,
    }
  }
  if (ha > FIELD_MAX_HA) {
    return { scale: 'farm', tone: 'warn', title: `Farm-sized (${Math.round(ha)} ha)`, text: `One recommendation for a typical field inside it; fields with different soils or histories deserve their own plan.${soilLine}` }
  }
  return {
    scale: 'field',
    tone: mixed ? 'warn' : 'ok',
    title: `One field (${ha < 10 ? ha.toFixed(1) : Math.round(ha)} ha)`,
    text: mixed ? `The soil changes across this field.${soilLine} Consider splitting it where the soil changes.` : `Soil sampled across the outline; the climate is the same ≈ 50 km NASA POWER cell for every field around.${soilLine}`,
  }
}

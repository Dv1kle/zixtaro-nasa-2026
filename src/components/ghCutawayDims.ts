// The cutaway's model in metres, shared by the house (GreenhouseCutaway3D) and the site around it (ghCutawaySite).
// A four-bay Venlo glasshouse cut open at its front gable (z = 0), x across the bays, z into the house, y up.
export const SPAN = 4
export const BAYS = 4
export const W = SPAN * BAYS
export const GH = 4.6 // gutter height
export const RH = 5.4 // ridge height
export const D = 14 // the house's depth behind the cut
export const roofY = (x: number) => {
  const r = ((x % SPAN) + SPAN) % SPAN
  return GH + (RH - GH) * (1 - Math.abs(r - SPAN / 2) / (SPAN / 2))
}
/** the landscaped base the model stands on (its sides are cut, showing the soil) */
export const BASE = { x0: -10, x1: 29.5, z0: -22.5, z1: 7.5, depth: 1.5 }
/** the rainwater tank, cut open toward the viewer to show its level */
export const TANK = { x: 18.5, z: -1.9, r: 1.55, h: 2.9 }
/** the packing hall beside the house, its loading dock facing the yard */
export const HALL = { x0: 17.6, x1: 26.2, z0: -14.6, z1: -6.4, h: 4.8 }
export const DOCK_X = 22.4
/** the boiler house behind the hall, its chimney and the heat buffer */
export const BOILER = { x0: 18.2, x1: 22.6, z0: -21, z1: -16.6, h: 4.2, chx: 21.6, chz: -19.6, chH: 13 }
export const ROAD = { z0: 2.9, z1: 6.1 }

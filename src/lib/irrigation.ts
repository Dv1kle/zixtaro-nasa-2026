// How much of the cropland around a field is irrigated: FAO GMIA v5 (area equipped for irrigation) over the
// CROPGRIDS 2020 harvested area, on the 0.5° grid (scripts/irrigation.py → public/data/irrigation/share.bin).
// The model runs rainfed unless told otherwise; where most of the cropland is irrigated, rainfed is not what
// farmers there do, and the page starts irrigated.

/** Above this share of irrigated cropland a field starts irrigated. */
export const MOSTLY_IRRIGATED = 0.5

/** Irrigated share (0-1) of the harvested area in the field's 0.5° cell; null where no cropland is recorded. */
export function irrigatedShare(grid: Uint8Array, lat: number, lon: number): number | null {
  const r = Math.min(359, Math.max(0, Math.floor((90 - lat) / 0.5)))
  const c = ((Math.floor((lon + 180) / 0.5) % 720) + 720) % 720
  const v = grid[r * 720 + c]
  return v === undefined || v === 255 ? null : v / 100
}

let loading: Promise<Uint8Array | null> | null = null
/** The grid, fetched once (259 kB); null when it cannot be loaded. */
export function loadIrrigation(): Promise<Uint8Array | null> {
  loading ??= fetch(`${import.meta.env.BASE_URL}data/irrigation/share.bin`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => new Uint8Array(b))
    .catch(() => null)
  return loading
}

/**
 * € per mm per hectare (10 m³) of canal water from rivers and reservoirs: mostly a water fee. Surface irrigation water
 * charges are typically 0.002-0.05 US$/m³ (Molle & Berkoff 2007, Irrigation Water Pricing; OECD 2010, Sustainable
 * Management of Water Resources in Agriculture); 0.03 €/m³ is taken. Pumped groundwater costs the energy as well:
 * rotation.ts IRRIGATION_COST, 1.5 €/mm (0.15 €/m³). A judgement, listed in the evidence register. Earlier,
 * every millimetre was priced as pumped: Peru's canal-fed coastal rice lost €2 000/ha to pumping it never does.
 */
export const SURFACE_WATER_COST = 0.3

/** Irrigation price for a field whose irrigated area around it draws `groundwater` (0-1) from wells, €/mm/ha. */
export const irrigationCostFor = (groundwater: number | null, pumped: number) =>
  groundwater === null ? pumped : SURFACE_WATER_COST + (pumped - SURFACE_WATER_COST) * Math.min(1, Math.max(0, groundwater))

let loadingGw: Promise<Uint8Array | null> | null = null
/** FAO GMIA v5: % of the irrigated area supplied from groundwater per 0.5° cell (scripts/irrigation-source.py). */
export function loadGroundwater(): Promise<Uint8Array | null> {
  loadingGw ??= fetch(`${import.meta.env.BASE_URL}data/irrigation/groundwater.bin`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => new Uint8Array(b))
    .catch(() => null)
  return loadingGw
}

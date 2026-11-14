// Transcriptions of the FAO tables behind every crop's water parameters, kept apart from the model so the model
// can be checked against them (see decision.test.ts: "crop parameters match the FAO tables").
//
// FAO-56 - Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). Crop evapotranspiration: guidelines for
//   computing crop water requirements. FAO Irrigation and Drainage Paper 56. Rome.
//   Table 12: single crop coefficients Kc ini / mid / end (sub-humid climate, RHmin ≈ 45 %, u2 ≈ 2 m/s).
//   Table 22: maximum effective rooting depth Zr (m) and the soil-water depletion fraction p for no stress
//   (for ETc ≈ 5 mm/day). Zixtaro uses the upper Zr value, as FAO-56 advises for rainfed modelling.
// FAO-33 - Doorenbos, J., Kassam, A.H. (1979). Yield response to water. FAO Irrigation and Drainage Paper 33.
//   Seasonal yield response factor Ky, as reprinted in FAO-66 (Steduto et al. 2012), chapter 2.
//
// Values are transcribed from the published tables; the link next to each table lets anyone re-check them.

export const FAO56_URL = 'https://www.fao.org/4/x0490e/x0490e00.htm'
export const FAO56_T12_URL = 'https://www.fao.org/4/x0490e/x0490e0b.htm'
export const FAO56_T22_URL = 'https://www.fao.org/4/x0490e/x0490e0e.htm'
export const FAO33_URL = 'https://www.fao.org/4/i2800e/i2800e02.pdf'

export type Fao56Row = { name: string; kc: [number, number | [number, number], number | [number, number]]; zr: [number, number]; p: number }

/** FAO-56 Table 12 (Kc) and Table 22 (Zr, p), by the table's own crop names. */
export const FAO56: Record<string, Fao56Row> = {
  'Winter wheat': { name: 'Wheat, winter', kc: [0.7, 1.15, [0.25, 0.4]], zr: [1.5, 1.8], p: 0.55 },
  'Spring wheat': { name: 'Wheat, spring', kc: [0.3, 1.15, [0.25, 0.4]], zr: [1.0, 1.5], p: 0.55 },
  Barley: { name: 'Barley', kc: [0.3, 1.15, 0.25], zr: [1.0, 1.5], p: 0.55 },
  Oats: { name: 'Oats', kc: [0.3, 1.15, 0.25], zr: [1.0, 1.5], p: 0.55 },
  Maize: { name: 'Maize, field (grain)', kc: [0.3, 1.2, [0.35, 0.6]], zr: [1.0, 1.7], p: 0.55 },
  Sorghum: { name: 'Sorghum, grain', kc: [0.3, [1.0, 1.1], 0.55], zr: [1.0, 2.0], p: 0.55 },
  Millet: { name: 'Millet', kc: [0.3, 1.0, 0.3], zr: [1.0, 2.0], p: 0.55 },
  Sunflower: { name: 'Sunflower', kc: [0.35, [1.0, 1.15], 0.35], zr: [0.8, 1.5], p: 0.45 },
  Canola: { name: 'Canola (rapeseed)', kc: [0.35, [1.0, 1.15], 0.35], zr: [1.0, 1.5], p: 0.6 },
  Flax: { name: 'Flax', kc: [0.35, 1.1, 0.25], zr: [1.0, 1.5], p: 0.5 },
  Soybeans: { name: 'Soybeans', kc: [0.5, 1.15, 0.5], zr: [0.6, 1.3], p: 0.5 },
  Peas: { name: 'Peas, dry seed', kc: [0.5, 1.15, 0.3], zr: [0.6, 1.0], p: 0.4 },
  Fababean: { name: 'Faba bean, broad bean (dry)', kc: [0.5, 1.15, 0.3], zr: [0.5, 0.7], p: 0.45 },
  Lentil: { name: 'Lentil', kc: [0.4, 1.1, 0.3], zr: [0.6, 0.8], p: 0.5 },
  Chickpea: { name: 'Chick pea', kc: [0.4, 1.0, 0.35], zr: [0.6, 1.0], p: 0.5 },
  'Sugar beet': { name: 'Sugar beet', kc: [0.35, 1.2, 0.7], zr: [0.7, 1.2], p: 0.55 },
  Potato: { name: 'Potato', kc: [0.5, 1.15, 0.75], zr: [0.4, 0.6], p: 0.35 },
  'Grazing pasture': { name: 'Grazing pasture, rotated grazing', kc: [0.4, [0.85, 1.05], 0.85], zr: [0.5, 1.5], p: 0.6 },
  'Clover hay': { name: 'Clover hay, berseem', kc: [0.4, 0.9, 0.85], zr: [0.6, 0.9], p: 0.5 },
  Rice: { name: 'Rice', kc: [1.05, 1.2, [0.6, 0.9]], zr: [0.5, 1.0], p: 0.2 },
  Cassava: { name: 'Cassava, year 1', kc: [0.3, 0.8, 0.3], zr: [0.5, 0.8], p: 0.35 },
  'Sweet potato': { name: 'Sweet potato', kc: [0.5, 1.15, 0.65], zr: [1.0, 1.5], p: 0.65 },
  Groundnut: { name: 'Groundnut (peanut)', kc: [0.4, 1.15, 0.6], zr: [0.5, 1.0], p: 0.5 },
  Cowpeas: { name: 'Green gram and cowpeas (dry)', kc: [0.4, 1.05, [0.35, 0.6]], zr: [0.6, 1.0], p: 0.45 },
  'Beans dry': { name: 'Beans, dry (pulses)', kc: [0.4, 1.15, 0.35], zr: [0.6, 0.9], p: 0.45 },
  Cotton: { name: 'Cotton', kc: [0.35, [1.15, 1.2], [0.5, 0.7]], zr: [1.0, 1.7], p: 0.65 },
  // the all-crops plan: Table 12 checked against fao.org/4/x0490e/x0490e0b.htm
  Sesame: { name: 'Sesame', kc: [0.35, 1.1, 0.25], zr: [1.0, 1.5], p: 0.6 },
  Safflower: { name: 'Safflower', kc: [0.35, [1.0, 1.15], 0.25], zr: [1.0, 2.0], p: 0.6 },
  Castorbean: { name: 'Castorbean (Ricinus)', kc: [0.35, 1.15, 0.55], zr: [1.0, 2.0], p: 0.5 },
  'Sugar cane': { name: 'Sugar cane', kc: [0.4, 1.25, 0.75], zr: [1.2, 2.0], p: 0.65 },
  Tomato: { name: 'Tomato', kc: [0.6, 1.15, [0.7, 0.9]], zr: [0.7, 1.5], p: 0.4 },
  'Sweet peppers': { name: 'Sweet peppers (bell)', kc: [0.6, 1.05, 0.9], zr: [0.5, 1.0], p: 0.3 },
  Eggplant: { name: 'Egg plant', kc: [0.6, 1.05, 0.9], zr: [0.7, 1.2], p: 0.45 },
  Cabbage: { name: 'Cabbage', kc: [0.7, 1.05, 0.95], zr: [0.5, 0.8], p: 0.45 },
  'Onions dry': { name: 'Onions, dry', kc: [0.7, 1.05, 0.75], zr: [0.3, 0.6], p: 0.3 },
  Watermelon: { name: 'Watermelon', kc: [0.4, 1.0, 0.75], zr: [0.8, 1.5], p: 0.4 },
  'Rye grass hay': { name: 'Rye grass hay (averaged cutting effects)', kc: [0.95, 1.05, 1.0], zr: [0.6, 1.0], p: 0.6 },
  'Sorghum sweet': { name: 'Sorghum, sweet', kc: [0.3, 1.2, 1.05], zr: [1.0, 2.0], p: 0.5 },
}

/** The same rows in pyfao56's independent transcription (fao56-pyfao56.ts), which the tests hold ours to. */
export const PYFAO56_KEY: Record<string, string> = {
  'Winter wheat': 'winter wheat', 'Spring wheat': 'spring wheat', Barley: 'barley', Oats: 'oats', Maize: 'maize', Sorghum: 'sorghum',
  Millet: 'millet', Sunflower: 'sunflower', Canola: 'canola', Flax: 'flax', Soybeans: 'soybeans', Peas: 'peas dry', Fababean: 'faba bean dry',
  Lentil: 'lentil', Chickpea: 'chickpea', 'Sugar beet': 'sugar beet', Potato: 'potato', 'Grazing pasture': 'grazing pasture', 'Clover hay': 'clover hay',
  Rice: 'rice', Cassava: 'cassava year 1', 'Sweet potato': 'sweet potato', Groundnut: 'groundnut', Cowpeas: 'cowpeas dry', 'Beans dry': 'beans dry', Cotton: 'cotton',
  Sesame: 'sesame', Safflower: 'safflower', Castorbean: 'castorbean', 'Sugar cane': 'sugarcane', Tomato: 'tomato', 'Sweet peppers': 'sweet peppers',
  Eggplant: 'eggplant', Cabbage: 'cabbage', 'Onions dry': 'onions dry', Watermelon: 'watermelon', 'Rye grass hay': 'rye grass hay',
  // 'Sorghum sweet': pyfao56 transcribes its Table 22 row only, so there is nothing to hold our Kc to
}

/** FAO-33 seasonal Ky (as reprinted in FAO-66, ch. 2). */
export const FAO33_KY: Record<string, number> = {
  'Winter wheat': 1.05, 'Spring wheat': 1.15, Maize: 1.25, Sorghum: 0.9, Sunflower: 0.95, Soybeans: 0.85,
  Peas: 1.15, Beans: 1.15, 'Sugar beet': 1.0, Potato: 1.1, Alfalfa: 1.1, Groundnut: 0.7, Cotton: 0.85, Safflower: 0.8,
  // the all-crops plan: as FAO-66 (Steduto et al. 2012) Table 1 reproduces FAO-33
  Cabbage: 0.95, Onion: 1.1, Pepper: 1.1, Sugarcane: 1.2, Tomato: 1.05, Watermelon: 1.1,
}

/**
 * Which FAO row stands behind each Zixtaro crop. `null` = FAO-56/FAO-33 have no row: the value comes from the
 * literature or from the nearest tabulated crop, and `note` says which.
 */
export const CROP_FAO: Record<string, { fao56: string | null; ky: string | null; note?: string }> = {
  wheat: { fao56: 'Winter wheat', ky: 'Winter wheat' },
  barley: { fao56: 'Barley', ky: null, note: 'Ky: FAO-33 has no barley row; 1.0 assumed, between winter wheat (1.05) and small-grain responses in FAO-66.' },
  rye: { fao56: null, ky: null, note: 'Not in FAO-56 Table 12/22: Kc and depletion as winter wheat, rooting depth as winter wheat’s upper value (rye roots at least as deep); Ky assumed.' },
  triticale: { fao56: null, ky: null, note: 'Not tabulated: parameters of winter wheat, Ky assumed.' },
  oats: { fao56: 'Oats', ky: null, note: 'Ky: no FAO-33 row; 1.0 assumed.' },
  maize: { fao56: 'Maize', ky: 'Maize' },
  sorghum: { fao56: 'Sorghum', ky: 'Sorghum' },
  millet: { fao56: 'Millet', ky: null, note: 'Ky: no FAO-33 row; 0.8 assumed (drought-tolerant C4, below sorghum’s 0.9).' },
  sunflower: { fao56: 'Sunflower', ky: 'Sunflower' },
  rapeseed: { fao56: 'Canola', ky: null, note: 'Ky: no FAO-33 row; 1.0 assumed.' },
  linseed: { fao56: 'Flax', ky: null, note: 'Ky: no FAO-33 row; 1.0 assumed.' },
  soybean: { fao56: 'Soybeans', ky: 'Soybeans' },
  pea: { fao56: 'Peas', ky: 'Peas' },
  faba: { fao56: 'Fababean', ky: 'Beans', note: 'Ky: FAO-33 “beans”.' },
  lentil: { fao56: 'Lentil', ky: null, note: 'Ky: no FAO-33 row; 1.0 assumed.' },
  chickpea: { fao56: 'Chickpea', ky: null, note: 'Ky: no FAO-33 row; 0.85 assumed (drought-hardy pulse).' },
  lupin: { fao56: null, ky: null, note: 'Not in FAO-56: Kc and p from other grain legumes, rooting depth 1.2 m (narrow-leafed lupin taproot); Ky assumed.' },
  buckwheat: { fao56: null, ky: null, note: 'Not in FAO-56: Kc from small grains, shallow rooting; Ky assumed.' },
  sugarbeet: { fao56: 'Sugar beet', ky: 'Sugar beet' },
  potato: { fao56: 'Potato', ky: 'Potato' },
  clover: { fao56: 'Grazing pasture', ky: 'Alfalfa', note: 'A grass-clover ley: FAO-56 grazing pasture (the grass sets the rooting); Ky of FAO-33 alfalfa, the tabulated forage legume.' },
  cover: { fao56: null, ky: null, note: 'A green fallow is not harvested: no Ky; Kc a generic cover-crop curve.' },
  fallow: { fao56: null, ky: null, note: 'A bare fallow: no crop, Kc 0.15 (FAO-56 basal Kc of bare soil); evaporation from the surface layer only (FAO-56 ch. 7).' },
  rice: { fao56: 'Rice', ky: null, note: 'Ky: FAO-33 has no rice row; 1.0 assumed. Lowland rice grows in standing water, which the root-zone bucket does not model.' },
  cassava: { fao56: 'Cassava', ky: null, note: 'Ky: no FAO-33 row; 0.8 assumed (drought-tolerant root crop). Kc of the first year.' },
  sweetpotato: { fao56: 'Sweet potato', ky: null, note: 'Ky: no FAO-33 row; 1.0 assumed.' },
  groundnut: { fao56: 'Groundnut', ky: 'Groundnut' },
  cowpea: { fao56: 'Cowpeas', ky: null, note: 'Ky: no FAO-33 row; 0.9 assumed (drought-hardy pulse).' },
  drybean: { fao56: 'Beans dry', ky: 'Beans', note: 'Ky: FAO-33 “beans”.' },
  cotton: { fao56: 'Cotton', ky: 'Cotton' },
  pearlmillet: { fao56: 'Millet', ky: null, note: 'Ky: no FAO-33 row; 0.8 assumed, as proso millet.' },
  // the all-crops plan (docs/audit/new-crops.md): an FAO row with a note is an analogue - the crop is not
  // tabulated and the research table took that row's numbers, which the test then holds it to
  sesame: { fao56: 'Sesame', ky: null, note: 'Ky: no FAO-33 row; 0.9 assumed (drought-tolerant oilseed).' },
  pigeonpea: { fao56: null, ky: null, note: 'Not in FAO-56: rooting depth and p of green gram and cowpeas (Table 22), Kc mid of the grain legumes (1.15); Ky 0.9 assumed.' },
  safflower: { fao56: 'Safflower', ky: 'Safflower' },
  yam: { fao56: null, ky: null, note: 'Not in FAO-56: Kc and rooting from the root crops (cassava, sweet potato), a 9-month season; Ky 0.9 assumed.' },
  taro: { fao56: 'Potato', ky: null, note: 'Analogue: not in FAO-56; the research table used potato’s Kc, shallow rooting and p. Ky 1.1 assumed (a wet-soil crop).' },
  fonio: { fao56: null, ky: null, note: 'Not in FAO-56: Kc and p of millet, rooting 1.0 m (fine, shallow roots); Ky 0.8 assumed, as millet.' },
  bambara: { fao56: 'Groundnut', ky: null, note: 'Analogue: not in FAO-56; groundnut’s Kc, rooting and p. Ky 0.7 assumed (groundnut’s FAO-33 value).' },
  quinoa: { fao56: null, ky: null, note: 'Not in FAO-56: small-grain Kc, rooting 1.5 m; Ky 0.8 assumed (low sensitivity reported by Geerts et al. 2009).' },
  sugarcane: { fao56: 'Sugar cane', ky: 'Sugarcane', note: 'A one-year ratoon cycle; FAO-56 Table 11 gives 280-320 days for ratoon cane in the tropics.' },
  tobacco: { fao56: 'Tomato', ky: null, note: 'Analogue: not in FAO-56; the research table used tomato’s row (Solanaceae). Ky 0.9 assumed - FAO-66 Table 1 has no tobacco.' },
  castor: { fao56: 'Castorbean', ky: null, note: 'Ky: no FAO-33 row; 0.9 assumed.' },
  jute: { fao56: 'Flax', ky: null, note: 'Analogue: not in FAO-56; flax’s row (the other bast-fibre crop). Ky 0.9 assumed.' },
  vetch: { fao56: 'Clover hay', ky: 'Alfalfa', note: 'Analogue: a forage legume; FAO-56 berseem clover hay and FAO-33 alfalfa, the tabulated forage legumes.' },
  silagemaize: { fao56: 'Maize', ky: 'Maize', note: 'Kc end 0.6: FAO-56 maize harvested wet, as for silage.' },
  grassley: { fao56: 'Rye grass hay', ky: null, note: 'Kc 0.4 at sowing and 0.85 over winter: a ley sown into bare soil (FAO-56 averages established rye grass hay at 0.95-1.05). Ky 1.2 assumed: FAO-33 has no grass.' },
  foragesorghum: { fao56: 'Sorghum sweet', ky: 'Sorghum', note: 'A fodder sorghum cut green: FAO-56 sweet sorghum, which stays green to the end.' },
  tomato: { fao56: 'Tomato', ky: 'Tomato' },
  onion: { fao56: 'Onions dry', ky: 'Onion' },
  cabbage: { fao56: 'Cabbage', ky: 'Cabbage' },
  chilli: { fao56: 'Sweet peppers', ky: 'Pepper', note: 'FAO-56 tabulates the bell pepper; chilli shares it.' },
  watermelon: { fao56: 'Watermelon', ky: 'Watermelon' },
  okra: { fao56: 'Eggplant', ky: null, note: 'Analogue: not in FAO-56; egg plant’s row (Table 12/22). Ky 1.0 assumed.' },
}

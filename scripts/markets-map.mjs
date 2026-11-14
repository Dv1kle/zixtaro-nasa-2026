// Zixtaro crop ids ↔ FAOSTAT item names (Prices, Trade, Production use the same item list), and how long each keeps.
// Shelf life: days of saleable life under the standard storage for the trade (USDA Agriculture Handbook 66, 2016;
// FAO "Prevention of post-harvest food losses"). Dry goods are capped at 365: they are never the binding constraint.
export const FAO_ITEM = {
  wheat: 'Wheat', barley: 'Barley', rye: 'Rye', maize: 'Maize (corn)', sorghum: 'Sorghum', sunflower: 'Sunflower seed',
  rapeseed: 'Rape or colza seed', soybean: 'Soya beans', pea: 'Peas, dry', lupin: 'Lupins', sugarbeet: 'Sugar beet',
  potato: 'Potatoes', oats: 'Oats', triticale: 'Triticale', faba: 'Broad beans and horse beans, dry', lentil: 'Lentils, dry',
  chickpea: 'Chick peas, dry', buckwheat: 'Buckwheat', millet: 'Millet', linseed: 'Linseed', rice: 'Rice',
  cassava: 'Cassava, fresh', sweetpotato: 'Sweet potatoes', groundnut: 'Groundnuts, excluding shelled', cowpea: 'Cow peas, dry',
  drybean: 'Beans, dry', cotton: 'Seed cotton, unginned', pearlmillet: 'Millet',
  tomato: 'Tomatoes', cherry: 'Tomatoes', cucumber: 'Cucumbers and gherkins', pepper: 'Chillies and peppers, green (Capsicum spp. and Pimenta spp.)',
  eggplant: 'Eggplants (aubergines)', courgette: 'Pumpkins, squash and gourds', lettuce: 'Lettuce and chicory', strawberry: 'Strawberries',
  // all-crops plan; item names checked against FAOSTAT's Production item list
  sesame: 'Sesame seed', pigeonpea: 'Pigeon peas, dry', sugarcane: 'Sugar cane', yam: 'Yams', tobacco: 'Unmanufactured tobacco',
  safflower: 'Safflower seed', castor: 'Castor oil seeds', jute: 'Jute, raw or retted', fonio: 'Fonio', quinoa: 'Quinoa',
  taro: 'Taro', bambara: 'Bambara beans, dry', vetch: 'Vetches', onion: 'Onions and shallots, dry (excluding dehydrated)',
  cabbage: 'Cabbages', watermelon: 'Watermelons', okra: 'Okra',
  chilli: 'Chillies and peppers, green (Capsicum spp. and Pimenta spp.)', // the field crop; 'pepper' is the greenhouse one
}
/** Not traded as a commodity: priced at home only (forage, cover, fresh herbs). */
export const NO_MARKET = ['clover', 'cover', 'basil']
export const SHELF_DAYS = {
  wheat: 365, barley: 365, rye: 365, maize: 365, sorghum: 365, sunflower: 270, rapeseed: 270, soybean: 365, pea: 365,
  lupin: 365, sugarbeet: 60, potato: 150, oats: 365, triticale: 365, faba: 365, lentil: 365, chickpea: 365, buckwheat: 365,
  millet: 365, linseed: 270, rice: 365, cassava: 3, sweetpotato: 120, groundnut: 180, cowpea: 365, drybean: 365, cotton: 365,
  pearlmillet: 365, tomato: 14, cherry: 14, cucumber: 12, pepper: 18, eggplant: 10, courgette: 10, lettuce: 14, strawberry: 5,
  sesame: 365, pigeonpea: 365, sugarcane: 2, yam: 120, tobacco: 365, safflower: 270, castor: 365, jute: 365, fonio: 365,
  quinoa: 365, taro: 30, bambara: 365, vetch: 365, onion: 180, cabbage: 60, watermelon: 21, okra: 7, chilli: 18,
}
export const PERISHABLE = Object.keys(SHELF_DAYS).filter((k) => SHELF_DAYS[k] <= 30)
export const UNIONS = {
  EU: ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'],
  MERCOSUR: ['ARG', 'BRA', 'PRY', 'URY'], EAEU: ['RUS', 'BLR', 'KAZ', 'KGZ', 'ARM'], USMCA: ['USA', 'CAN', 'MEX'],
  SACU: ['ZAF', 'BWA', 'LSO', 'NAM', 'SWZ'], EAC: ['KEN', 'UGA', 'TZA', 'RWA', 'BDI', 'SSD', 'COD', 'SOM'],
}
/** Trade and production list some crops under another item: rice trades milled (paddy equivalent), cotton as lint,
 *  groundnuts shelled. The import-dependence ratio then mixes units a little (×0.67-0.7); it only nudges ±10 %. */
export const TRADE_ITEM = { rice: 'Rice, paddy (rice milled equivalent)', cotton: 'Cotton lint, ginned', groundnut: 'Groundnuts, shelled' }
export const PROD_ITEM = { cotton: 'Seed cotton, unginned' }

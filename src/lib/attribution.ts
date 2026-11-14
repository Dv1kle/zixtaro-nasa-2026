// Everything in Zixtaro that its authors did not make: data, imagery, software, typefaces, scanned objects, voices -
// each with who made it, how it is used here, and the terms it comes under. One list, shown on the legal pages
// (Sources, Licence) and mirrored in THIRD_PARTY.md at the repository root; attribution.test.ts keeps the two and
// package.json in step.
//
// `terms` is deliberately blunt, because the rule it is checked against is: the NASA Space Apps Challenge asks that
// non-NASA materials be "freely and publicly available without restriction or, at a minimum, ... licensed as open
// source", that every licence be named, and that every source be cited.
//   open        - public domain, CC0, or an OSI-approved licence
//   credit      - free to use and pass on with attribution (CC BY, ODbL, OFL, government open licences)
//   restricted  - terms beyond credit: non-commercial, no redistribution, or a provider's own terms of use
//   unconfirmed - the licence was not confirmed when this list was last checked (see CHECKED)
// Nothing here is legal advice; where a line says "restricted" or "unconfirmed" the owner has a decision to make
// before the project is published (docs/SPACE-APPS-COMPLIANCE.md lists them).

export const CHECKED = '2026-11-14'

export type Terms = 'open' | 'credit' | 'restricted' | 'unconfirmed'
/** live: asked by the visitor's browser; bundled: a file in this repository; check: validation only, not in the page; optional: off unless configured; build: used to make the site, not shipped */
export type Use = 'live' | 'bundled' | 'live + bundled' | 'check' | 'optional' | 'build'

export type Credit = {
  name: string
  by: string
  what: string
  licence: string
  terms: Terms
  use: Use
  url: string
  note?: string
}

export const TERMS_LABEL: Record<Terms, string> = {
  open: 'open',
  credit: 'credit required',
  restricted: 'terms apply',
  unconfirmed: 'not confirmed',
}

/** NASA and its mission partners: the challenge's own data. */
export const NASA_DATA: Credit[] = [
  { name: 'NASA POWER', by: 'NASA Langley Research Center, POWER Project', what: 'Rain, temperature, sunshine, humidity and wind, monthly and daily since 1981 - the record every season is re-run on', licence: 'NASA open data, no restrictions; acknowledgement requested', terms: 'open', use: 'live + bundled', url: 'https://power.larc.nasa.gov' },
  { name: 'MERRA-2', by: 'NASA Global Modeling and Assimilation Office', what: 'The reanalysis behind POWER’s meteorology; its root-zone wetness checks the water balance', licence: 'NASA open data', terms: 'open', use: 'live + bundled', url: 'https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/' },
  { name: 'GPM IMERG', by: 'NASA Goddard, Global Precipitation Measurement mission', what: 'Rain measured from orbit since 2001: the second rain record beside POWER’s, and yesterday’s rain on the map', licence: 'NASA open data', terms: 'open', use: 'live', url: 'https://gpm.nasa.gov/data/imerg', note: 'Read through NASA POWER (point series) and NASA GIBS (map layer).' },
  { name: 'NASA GIBS', by: 'NASA EOSDIS, Global Imagery Browse Services', what: 'Map layers: VIIRS true colour, SMAP root-zone soil moisture, MODIS vegetation and surface heat, IMERG rain', licence: 'NASA open data; acknowledgement requested', terms: 'open', use: 'live', url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api' },
  { name: 'SMAP L4', by: 'NASA Jet Propulsion Laboratory', what: 'Root-zone soil moisture, as a map layer and time-lapse', licence: 'NASA open data', terms: 'open', use: 'live', url: 'https://smap.jpl.nasa.gov' },
  { name: 'MODIS and VIIRS', by: 'NASA LP DAAC and ORNL DAAC', what: 'Vegetation index and land-surface temperature layers; a field’s past seasons read from the index', licence: 'NASA open data', terms: 'open', use: 'live + bundled', url: 'https://modis.ornl.gov' },
  { name: 'GRACE and GRACE-FO', by: 'NASA JPL and the University of Texas Center for Space Research', what: 'The region’s total water storage since 2002', licence: 'NASA open data', terms: 'open', use: 'bundled', url: 'https://grace.jpl.nasa.gov' },
  { name: 'NEX-GDDP-CMIP6', by: 'NASA Earth Exchange, NASA Center for Climate Simulation', what: 'Month-by-month temperature and rain changes for the 2050s (demo fields)', licence: 'CC0 1.0 since September 2022 (some model files were first labelled CC BY-SA 4.0)', terms: 'open', use: 'bundled', url: 'https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6' },
  { name: 'SRTM', by: 'NASA and NGA, Shuttle Radar Topography Mission', what: 'Elevation, slope and aspect under the field (through AWS Terrain Tiles)', licence: 'public domain', terms: 'open', use: 'live', url: 'https://www.earthdata.nasa.gov/data/instruments/srtm' },
  { name: 'Harmonized Landsat Sentinel-2 (HLS)', by: 'NASA and USGS, with ESA Copernicus Sentinel-2', what: 'A check of crop vigour on real fields', licence: 'NASA open data; Copernicus open licence', terms: 'open', use: 'check', url: 'https://www.earthdata.nasa.gov/data/projects/hls' },
]

/** Open data from other makers. */
export const OPEN_DATA: Credit[] = [
  { name: 'SoilGrids 2.0', by: 'ISRIC - World Soil Information', what: 'Sand, silt, clay, organic carbon, pH and bulk density to 2 m', licence: 'CC BY 4.0', terms: 'credit', use: 'live + bundled', url: 'https://soilgrids.org' },
  { name: 'FAOSTAT', by: 'Food and Agriculture Organization of the United Nations', what: 'Farm-gate prices, yields, production and trade by country', licence: 'CC BY 4.0 (FAO statistical databases, from 1 July 2024)', terms: 'credit', use: 'bundled', url: 'https://www.fao.org/faostat/' },
  { name: 'FAO Irrigation and Drainage Papers 56 and 33', by: 'FAO (Allen et al. 1998; Doorenbos and Kassam 1979)', what: 'The water balance and the yield response to water: methods and crop coefficients', licence: 'published FAO papers, cited; coefficient tables through pyfao56 (USDA-ARS, public domain)', terms: 'credit', use: 'bundled', url: 'https://www.fao.org/4/x0490e/x0490e00.htm' },
  { name: 'GAEZ v4', by: 'FAO and IIASA', what: 'Crop temperature and season requirements; where tree and bush crops fit', licence: 'CC BY-NC-SA 3.0 IGO (model documentation); CC BY-NC-SA 4.0 (data, FAO catalogue)', terms: 'restricted', use: 'bundled', url: 'https://gaez.fao.org', note: 'Named by NASA among this challenge’s own resources. The tables transcribed from it (src/lib/gaez-tables.ts, src/data/perennials.json) stay under its licence - non-commercial, share-alike - and are not covered by the project’s Apache 2.0.' },
  { name: 'Global Map of Irrigation Areas v5', by: 'FAO AQUASTAT and the University of Bonn (Siebert et al. 2013)', what: 'The share of cropland around a field that is irrigated, and from what source', licence: 'CC BY 4.0 (FAO catalogue record)', terms: 'credit', use: 'bundled', url: 'https://www.fao.org/aquastat/en/geospatial-information/global-maps-irrigated-areas' },
  { name: 'CROPGRIDS', by: 'Tang, Nguyen, Conchedda, Casse, Tubiello and Maggi (2024)', what: 'What farms grow in each cell around the field', licence: 'CC BY 4.0', terms: 'credit', use: 'bundled', url: 'https://doi.org/10.6084/m9.figshare.22491997' },
  { name: 'MIRCA-OS', by: 'Kebede et al. (2025)', what: 'Irrigated and rain-fed crop areas by month', licence: 'CC BY 4.0', terms: 'credit', use: 'bundled', url: 'https://www.hydroshare.org/resource/60a890eb841c460192c03bb590687145/' },
  { name: 'Travel time to cities', by: 'Nelson et al. (2019)', what: 'Hours from the field to the nearest city of 50 000 or more', licence: 'CC BY 4.0', terms: 'credit', use: 'bundled', url: 'https://doi.org/10.1038/s41597-019-0265-5' },
  { name: 'Eurostat and the DG AGRI agri-food data portal', by: 'European Commission', what: 'Greenhouse vegetable prices, glasshouse yields and areas, gas and electricity prices', licence: 'reuse authorised with the source named (Commission Decision 2011/833/EU; CC BY 4.0)', terms: 'credit', use: 'bundled', url: 'https://agridata.ec.europa.eu' },
  { name: 'Open-Meteo', by: 'Open-Meteo, with the national weather services it draws on', what: 'Weather now and the 16-day outlook', licence: 'data CC BY 4.0; the free API is for non-commercial use only', terms: 'restricted', use: 'live', url: 'https://open-meteo.com', note: 'A commercial use of this site needs Open-Meteo’s paid plan or its self-hosted server (AGPL).' },
  { name: 'Cropland Data Layer', by: 'USDA National Agricultural Statistics Service', what: 'What grew on and around a field in the United States', licence: 'US federal work, public domain', terms: 'open', use: 'live', url: 'https://croplandcros.scinet.usda.gov' },
  { name: 'Annual Crop Inventory', by: 'Agriculture and Agri-Food Canada', what: 'What grew on and around a field in Canada', licence: 'Open Government Licence - Canada', terms: 'credit', use: 'live', url: 'https://open.canada.ca/data/en/dataset/ba2645d5-4458-414d-b196-6303ac06c1c9' },
  { name: 'Registre parcellaire graphique', by: 'IGN and ASP, France', what: 'Declared crops on and around a field in France', licence: 'Licence Ouverte 2.0 (Etalab)', terms: 'credit', use: 'live', url: 'https://geoservices.ign.fr/rpg' },
  { name: 'Marker', by: 'Landbrugsstyrelsen, Denmark', what: 'Declared crops on and around a field in Denmark', licence: 'CC0 1.0', terms: 'open', use: 'live', url: 'https://geodata.fvm.dk' },
  { name: 'Global Dataset of Historical Yields', by: 'Iizumi and Sakai (2020)', what: 'Reported yields near the demo fields; validation of the yield response', licence: 'CC BY 4.0', terms: 'credit', use: 'bundled', url: 'https://doi.org/10.1594/PANGAEA.909132' },
  { name: 'GGCMI crop calendars', by: 'Jägermeyr et al. (2021)', what: 'Sowing and harvest dates the model’s calendars are checked against', licence: 'CC BY 4.0', terms: 'credit', use: 'check', url: 'https://doi.org/10.5281/zenodo.5062513' },
  { name: 'NIST Randomness Beacon', by: 'US National Institute of Standards and Technology', what: 'The public random numbers that draw each held-out validation set', licence: 'US federal work, public domain', terms: 'open', use: 'check', url: 'https://beacon.nist.gov' },
]

/** The map under the field. */
export const MAPS: Credit[] = [
  { name: 'Sentinel-2 cloudless 2016', by: 'EOX IT Services, from Copernicus Sentinel-2 data (ESA)', what: 'The satellite picture of the field and of the world', licence: 'CC BY 4.0', terms: 'credit', use: 'live', url: 'https://s2maps.eu' },
  { name: 'ORT10LT orthophoto', by: 'Nacionalinė žemės tarnyba (National Land Service of Lithuania), through geoportal.lt', what: 'The close-up picture of fields in Lithuania', licence: 'CC BY 4.0 (Lithuania’s open data portal, a high-value dataset)', terms: 'credit', use: 'live', url: 'https://data.gov.lt/datasets/2564/', note: 'Read through geoportal.lt’s map service, which asks to be told when it is used in another system: pagalba@geoportal.lt.' },
  { name: 'Place names overlay', by: 'EOX, from OpenStreetMap data', what: 'Names and borders over the picture', licence: 'ODbL (data)', terms: 'credit', use: 'live', url: 'https://maps.eox.at' },
  { name: 'Terrain Tiles', by: 'Mapzen, hosted in the AWS Open Data programme', what: 'The elevation model, from SRTM and national surveys', licence: 'open, with the sources credited', terms: 'credit', use: 'live', url: 'https://registry.opendata.aws/terrain-tiles/' },
  { name: 'Nominatim', by: 'OpenStreetMap contributors', what: 'Place search, place names and boundaries', licence: 'ODbL 1.0; Nominatim usage policy', terms: 'credit', use: 'live', url: 'https://nominatim.openstreetmap.org' },
  { name: 'Street View', by: 'Google', what: 'The roadside view of the field', licence: 'Google Maps Platform terms (not an open licence)', terms: 'restricted', use: 'optional', url: 'https://www.google.com/streetview/', note: 'Off unless the site is built with a key; without one the page links out to Google Maps.' },
]

/** Software in the pages a visitor loads (package.json "dependencies"), and what was used to make them. */
export const SOFTWARE: Credit[] = [
  { name: 'react, react-dom', by: 'Meta Platforms and contributors', what: 'The interface', licence: 'MIT', terms: 'open', use: 'bundled', url: 'https://react.dev' },
  { name: 'three', by: 'three.js authors', what: 'The 3D scenes and the crop specimens', licence: 'MIT', terms: 'open', use: 'bundled', url: 'https://threejs.org' },
  { name: 'postprocessing', by: 'Raoul van Rüschen', what: 'Depth of field, bloom and tone mapping of the scenes', licence: 'Zlib', terms: 'open', use: 'bundled', url: 'https://github.com/pmndrs/postprocessing' },
  { name: 'maplibre-gl', by: 'MapLibre contributors', what: 'The globe and the map', licence: 'BSD-3-Clause', terms: 'open', use: 'bundled', url: 'https://maplibre.org' },
  { name: 'motion', by: 'Matt Perry and contributors', what: 'Interface animation', licence: 'MIT', terms: 'open', use: 'bundled', url: 'https://motion.dev' },
  { name: 'lenis', by: 'darkroom.engineering', what: 'Smooth scrolling on desktop', licence: 'MIT', terms: 'open', use: 'bundled', url: 'https://lenis.darkroom.engineering' },
  { name: 'lucide-react', by: 'Lucide contributors', what: 'Icons', licence: 'ISC', terms: 'open', use: 'bundled', url: 'https://lucide.dev' },
  { name: 'geotiff', by: 'geotiff.js contributors', what: 'Reading crop-map rasters in the browser', licence: 'MIT', terms: 'open', use: 'bundled', url: 'https://geotiffjs.github.io' },
  { name: 'qrcode-generator', by: 'Kazuhiko Arase', what: 'The QR code of a shared scenario', licence: 'MIT', terms: 'open', use: 'bundled', url: 'https://github.com/kazuhikoarase/qrcode-generator' },
  { name: '@googlemaps/js-api-loader', by: 'Google', what: 'Loads Street View when a key is configured', licence: 'Apache-2.0', terms: 'open', use: 'optional', url: 'https://github.com/googlemaps/js-api-loader' },
  { name: 'vite, @vitejs/plugin-react, tailwindcss, typescript, vitest', by: 'their authors', what: 'Build, styles, types and tests', licence: 'MIT (typescript: Apache-2.0)', terms: 'open', use: 'build', url: 'https://vite.dev' },
  { name: 'mapshaper, searoute-js, meshoptimizer, axe-core', by: 'their authors', what: 'Data bakes: boundaries, sea routes, packed meshes; accessibility checks', licence: 'MPL-2.0 (mapshaper, axe-core), MIT', terms: 'open', use: 'build', url: 'https://github.com/mbloch/mapshaper' },
  { name: 'pyfao56', by: 'USDA Agricultural Research Service', what: 'The FAO-56 crop-coefficient tables the model’s were transcribed from', licence: 'public domain', terms: 'open', use: 'build', url: 'https://github.com/kthorp/pyfao56' },
]

/** Typefaces, served from the site itself (Fontsource packages): no font service is asked. */
export const FONTS: Credit[] = [
  { name: 'Archivo', by: 'Omnibus-Type', what: 'Headlines and text', licence: 'SIL Open Font License 1.1', terms: 'open', use: 'bundled', url: 'https://fontsource.org/fonts/archivo' },
  { name: 'Instrument Serif', by: 'Instrument', what: 'The italic voice in a headline', licence: 'SIL Open Font License 1.1', terms: 'open', use: 'bundled', url: 'https://fontsource.org/fonts/instrument-serif' },
  { name: 'Geist Mono', by: 'Vercel', what: 'Labels and figures', licence: 'SIL Open Font License 1.1', terms: 'open', use: 'bundled', url: 'https://fontsource.org/fonts/geist-mono' },
  { name: 'Geist and Fraunces', by: 'Vercel; Undercase Type', what: 'Installed with an earlier design; no page loads them now', licence: 'SIL Open Font License 1.1', terms: 'open', use: 'build', url: 'https://fontsource.org/fonts/fraunces' },
]

/** Found objects, skies and voices. */
export const ASSETS: Credit[] = [
  { name: 'Scanned props and evening skies', by: 'Poly Haven', what: 'Sacks, drums, tyres, crates, cans, barriers and a spade in the yards; the sky two scenes reflect', licence: 'CC0 1.0', terms: 'open', use: 'bundled', url: 'https://polyhaven.com', note: 'The list of files and what was repainted is in src/assets/cc0/README.md.' },
]

export const ALL_CREDITS: Credit[] = [...NASA_DATA, ...OPEN_DATA, ...MAPS, ...SOFTWARE, ...FONTS, ...ASSETS]

/** What is not plainly open - the owner's list before publishing. */
export const OPEN_QUESTIONS = ALL_CREDITS.filter((c) => c.terms === 'restricted' || c.terms === 'unconfirmed')

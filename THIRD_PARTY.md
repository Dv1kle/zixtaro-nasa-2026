# Third-party materials

Everything in Zixtaro that its authors did not make - data, imagery, software, typefaces, scanned objects, voices -
with who made it, how it is used here and the terms it comes under. Zixtaro's own code and text are under the
Apache License 2.0 (see [LICENSE](LICENSE)); nothing below is covered by that licence.

This file is generated: `node scripts/third-party.mjs` writes it from `src/lib/attribution.ts` (the list the
site's own Sources and Licence pages show) and `package-lock.json`. Do not edit it by hand.

Last checked: **2026-11-14**.

**Use**: *live* - asked by the visitor's browser; *bundled* - a file in this repository; *check* - validation only,
not in the page; *optional* - off unless configured; *build* - used to make the site, not shipped.

**Terms**: *open* - public domain, CC0, or a licence approved by the Open Source Initiative; *credit required* - free
to use and pass on with attribution; *terms apply* - conditions beyond credit (non-commercial, no redistribution, or
a provider's own terms of use); *not confirmed* - the licence was not confirmed when this list was last checked.

## Not plainly open

The NASA Space Apps Challenge asks that non-NASA materials be "freely and publicly available without restriction
or, at a minimum, ... licensed as open source". These 3 are not, or were not confirmed. Each
needs a decision before the project is published; [docs/SPACE-APPS-COMPLIANCE.md](docs/SPACE-APPS-COMPLIANCE.md)
says what the choices are.

- **GAEZ v4** (terms apply, bundled): CC BY-NC-SA 3.0 IGO (model documentation); CC BY-NC-SA 4.0 (data, FAO catalogue). Named by NASA among this challenge’s own resources. The tables transcribed from it (src/lib/gaez-tables.ts, src/data/perennials.json) stay under its licence - non-commercial, share-alike - and are not covered by the project’s Apache 2.0.
- **Open-Meteo** (terms apply, live): data CC BY 4.0; the free API is for non-commercial use only. A commercial use of this site needs Open-Meteo’s paid plan or its self-hosted server (AGPL).
- **Street View** (terms apply, optional): Google Maps Platform terms (not an open licence). Off unless the site is built with a key; without one the page links out to Google Maps.

## NASA and its missions

| Material | By | Used for | Use | Terms | Licence |
| --- | --- | --- | --- | --- | --- |
| [NASA POWER](https://power.larc.nasa.gov) | NASA Langley Research Center, POWER Project | Rain, temperature, sunshine, humidity and wind, monthly and daily since 1981 - the record every season is re-run on | live + bundled | open | NASA open data, no restrictions; acknowledgement requested |
| [MERRA-2](https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/) | NASA Global Modeling and Assimilation Office | The reanalysis behind POWER’s meteorology; its root-zone wetness checks the water balance | live + bundled | open | NASA open data |
| [GPM IMERG](https://gpm.nasa.gov/data/imerg) | NASA Goddard, Global Precipitation Measurement mission | Rain measured from orbit since 2001: the second rain record beside POWER’s, and yesterday’s rain on the map *Read through NASA POWER (point series) and NASA GIBS (map layer).* | live | open | NASA open data |
| [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api) | NASA EOSDIS, Global Imagery Browse Services | Map layers: VIIRS true colour, SMAP root-zone soil moisture, MODIS vegetation and surface heat, IMERG rain | live | open | NASA open data; acknowledgement requested |
| [SMAP L4](https://smap.jpl.nasa.gov) | NASA Jet Propulsion Laboratory | Root-zone soil moisture, as a map layer and time-lapse | live | open | NASA open data |
| [MODIS and VIIRS](https://modis.ornl.gov) | NASA LP DAAC and ORNL DAAC | Vegetation index and land-surface temperature layers; a field’s past seasons read from the index | live + bundled | open | NASA open data |
| [GRACE and GRACE-FO](https://grace.jpl.nasa.gov) | NASA JPL and the University of Texas Center for Space Research | The region’s total water storage since 2002 | bundled | open | NASA open data |
| [NEX-GDDP-CMIP6](https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6) | NASA Earth Exchange, NASA Center for Climate Simulation | Month-by-month temperature and rain changes for the 2050s (demo fields) | bundled | open | CC0 1.0 since September 2022 (some model files were first labelled CC BY-SA 4.0) |
| [SRTM](https://www.earthdata.nasa.gov/data/instruments/srtm) | NASA and NGA, Shuttle Radar Topography Mission | Elevation, slope and aspect under the field (through AWS Terrain Tiles) | live | open | public domain |
| [Harmonized Landsat Sentinel-2 (HLS)](https://www.earthdata.nasa.gov/data/projects/hls) | NASA and USGS, with ESA Copernicus Sentinel-2 | A check of crop vigour on real fields | check | open | NASA open data; Copernicus open licence |

## Open data

| Material | By | Used for | Use | Terms | Licence |
| --- | --- | --- | --- | --- | --- |
| [SoilGrids 2.0](https://soilgrids.org) | ISRIC - World Soil Information | Sand, silt, clay, organic carbon, pH and bulk density to 2 m | live + bundled | credit required | CC BY 4.0 |
| [FAOSTAT](https://www.fao.org/faostat/) | Food and Agriculture Organization of the United Nations | Farm-gate prices, yields, production and trade by country | bundled | credit required | CC BY 4.0 (FAO statistical databases, from 1 July 2024) |
| [FAO Irrigation and Drainage Papers 56 and 33](https://www.fao.org/4/x0490e/x0490e00.htm) | FAO (Allen et al. 1998; Doorenbos and Kassam 1979) | The water balance and the yield response to water: methods and crop coefficients | bundled | credit required | published FAO papers, cited; coefficient tables through pyfao56 (USDA-ARS, public domain) |
| [GAEZ v4](https://gaez.fao.org) | FAO and IIASA | Crop temperature and season requirements; where tree and bush crops fit *Named by NASA among this challenge’s own resources. The tables transcribed from it (src/lib/gaez-tables.ts, src/data/perennials.json) stay under its licence - non-commercial, share-alike - and are not covered by the project’s Apache 2.0.* | bundled | terms apply | CC BY-NC-SA 3.0 IGO (model documentation); CC BY-NC-SA 4.0 (data, FAO catalogue) |
| [Global Map of Irrigation Areas v5](https://www.fao.org/aquastat/en/geospatial-information/global-maps-irrigated-areas) | FAO AQUASTAT and the University of Bonn (Siebert et al. 2013) | The share of cropland around a field that is irrigated, and from what source | bundled | credit required | CC BY 4.0 (FAO catalogue record) |
| [CROPGRIDS](https://doi.org/10.6084/m9.figshare.22491997) | Tang, Nguyen, Conchedda, Casse, Tubiello and Maggi (2024) | What farms grow in each cell around the field | bundled | credit required | CC BY 4.0 |
| [MIRCA-OS](https://www.hydroshare.org/resource/60a890eb841c460192c03bb590687145/) | Kebede et al. (2025) | Irrigated and rain-fed crop areas by month | bundled | credit required | CC BY 4.0 |
| [Travel time to cities](https://doi.org/10.1038/s41597-019-0265-5) | Nelson et al. (2019) | Hours from the field to the nearest city of 50 000 or more | bundled | credit required | CC BY 4.0 |
| [Eurostat and the DG AGRI agri-food data portal](https://agridata.ec.europa.eu) | European Commission | Greenhouse vegetable prices, glasshouse yields and areas, gas and electricity prices | bundled | credit required | reuse authorised with the source named (Commission Decision 2011/833/EU; CC BY 4.0) |
| [Open-Meteo](https://open-meteo.com) | Open-Meteo, with the national weather services it draws on | Weather now and the 16-day outlook *A commercial use of this site needs Open-Meteo’s paid plan or its self-hosted server (AGPL).* | live | terms apply | data CC BY 4.0; the free API is for non-commercial use only |
| [Cropland Data Layer](https://croplandcros.scinet.usda.gov) | USDA National Agricultural Statistics Service | What grew on and around a field in the United States | live | open | US federal work, public domain |
| [Annual Crop Inventory](https://open.canada.ca/data/en/dataset/ba2645d5-4458-414d-b196-6303ac06c1c9) | Agriculture and Agri-Food Canada | What grew on and around a field in Canada | live | credit required | Open Government Licence - Canada |
| [Registre parcellaire graphique](https://geoservices.ign.fr/rpg) | IGN and ASP, France | Declared crops on and around a field in France | live | credit required | Licence Ouverte 2.0 (Etalab) |
| [Marker](https://geodata.fvm.dk) | Landbrugsstyrelsen, Denmark | Declared crops on and around a field in Denmark | live | open | CC0 1.0 |
| [Global Dataset of Historical Yields](https://doi.org/10.1594/PANGAEA.909132) | Iizumi and Sakai (2020) | Reported yields near the demo fields; validation of the yield response | bundled | credit required | CC BY 4.0 |
| [GGCMI crop calendars](https://doi.org/10.5281/zenodo.5062513) | Jägermeyr et al. (2021) | Sowing and harvest dates the model’s calendars are checked against | check | credit required | CC BY 4.0 |
| [NIST Randomness Beacon](https://beacon.nist.gov) | US National Institute of Standards and Technology | The public random numbers that draw each held-out validation set | check | open | US federal work, public domain |

## Maps and imagery

| Material | By | Used for | Use | Terms | Licence |
| --- | --- | --- | --- | --- | --- |
| [Sentinel-2 cloudless 2016](https://s2maps.eu) | EOX IT Services, from Copernicus Sentinel-2 data (ESA) | The satellite picture of the field and of the world | live | credit required | CC BY 4.0 |
| [ORT10LT orthophoto](https://data.gov.lt/datasets/2564/) | Nacionalinė žemės tarnyba (National Land Service of Lithuania), through geoportal.lt | The close-up picture of fields in Lithuania *Read through geoportal.lt’s map service, which asks to be told when it is used in another system: pagalba@geoportal.lt.* | live | credit required | CC BY 4.0 (Lithuania’s open data portal, a high-value dataset) |
| [Place names overlay](https://maps.eox.at) | EOX, from OpenStreetMap data | Names and borders over the picture | live | credit required | ODbL (data) |
| [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | Mapzen, hosted in the AWS Open Data programme | The elevation model, from SRTM and national surveys | live | credit required | open, with the sources credited |
| [Nominatim](https://nominatim.openstreetmap.org) | OpenStreetMap contributors | Place search, place names and boundaries | live | credit required | ODbL 1.0; Nominatim usage policy |
| [Street View](https://www.google.com/streetview/) | Google | The roadside view of the field *Off unless the site is built with a key; without one the page links out to Google Maps.* | optional | terms apply | Google Maps Platform terms (not an open licence) |

## Typefaces, objects, voices

| Material | By | Used for | Use | Terms | Licence |
| --- | --- | --- | --- | --- | --- |
| [Archivo](https://fontsource.org/fonts/archivo) | Omnibus-Type | Headlines and text | bundled | open | SIL Open Font License 1.1 |
| [Instrument Serif](https://fontsource.org/fonts/instrument-serif) | Instrument | The italic voice in a headline | bundled | open | SIL Open Font License 1.1 |
| [Geist Mono](https://fontsource.org/fonts/geist-mono) | Vercel | Labels and figures | bundled | open | SIL Open Font License 1.1 |
| [Geist and Fraunces](https://fontsource.org/fonts/fraunces) | Vercel; Undercase Type | Installed with an earlier design; no page loads them now | build | open | SIL Open Font License 1.1 |
| [Scanned props and evening skies](https://polyhaven.com) | Poly Haven | Sacks, drums, tyres, crates, cans, barriers and a spade in the yards; the sky two scenes reflect *The list of files and what was repainted is in src/assets/cc0/README.md.* | bundled | open | CC0 1.0 |

The scanned objects and skies are listed file by file in [src/assets/cc0/README.md](src/assets/cc0/README.md).

## Software

| Material | By | Used for | Use | Terms | Licence |
| --- | --- | --- | --- | --- | --- |
| [react, react-dom](https://react.dev) | Meta Platforms and contributors | The interface | bundled | open | MIT |
| [three](https://threejs.org) | three.js authors | The 3D scenes and the crop specimens | bundled | open | MIT |
| [postprocessing](https://github.com/pmndrs/postprocessing) | Raoul van Rüschen | Depth of field, bloom and tone mapping of the scenes | bundled | open | Zlib |
| [maplibre-gl](https://maplibre.org) | MapLibre contributors | The globe and the map | bundled | open | BSD-3-Clause |
| [motion](https://motion.dev) | Matt Perry and contributors | Interface animation | bundled | open | MIT |
| [lenis](https://lenis.darkroom.engineering) | darkroom.engineering | Smooth scrolling on desktop | bundled | open | MIT |
| [lucide-react](https://lucide.dev) | Lucide contributors | Icons | bundled | open | ISC |
| [geotiff](https://geotiffjs.github.io) | geotiff.js contributors | Reading crop-map rasters in the browser | bundled | open | MIT |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | Kazuhiko Arase | The QR code of a shared scenario | bundled | open | MIT |
| [@googlemaps/js-api-loader](https://github.com/googlemaps/js-api-loader) | Google | Loads Street View when a key is configured | optional | open | Apache-2.0 |
| [vite, @vitejs/plugin-react, tailwindcss, typescript, vitest](https://vite.dev) | their authors | Build, styles, types and tests | build | open | MIT (typescript: Apache-2.0) |
| [mapshaper, searoute-js, meshoptimizer, axe-core](https://github.com/mbloch/mapshaper) | their authors | Data bakes: boundaries, sea routes, packed meshes; accessibility checks | build | open | MPL-2.0 (mapshaper, axe-core), MIT |
| [pyfao56](https://github.com/kthorp/pyfao56) | USDA Agricultural Research Service | The FAO-56 crop-coefficient tables the model’s were transcribed from | build | open | public domain |

### Every package in the built site

54 packages are installed for the site itself (`dependencies` of package.json and what they bring).
By licence: MIT × 26, ISC × 9, OFL-1.1 × 5, Apache-2.0 × 3, BSD-3-Clause × 3, BSD-2-Clause × 2, (MIT OR Apache-2.0) × 1, (MIT AND Zlib) × 1, Zlib × 1, 0BSD × 1, CC0-1.0 × 1, MIT AND BSD-3-Clause × 1.

| Package | Version | Licence |
| --- | --- | --- |
| @fontsource-variable/archivo | 5.3.0 | OFL-1.1 |
| @fontsource-variable/fraunces | 5.3.0 | OFL-1.1 |
| @fontsource-variable/geist | 5.3.0 | OFL-1.1 |
| @fontsource-variable/geist-mono | 5.3.0 | OFL-1.1 |
| @fontsource/instrument-serif | 5.3.0 | OFL-1.1 |
| @googlemaps/js-api-loader | 2.1.3 | Apache-2.0 |
| @mapbox/jsonlint-lines-primitives | 2.0.3 | MIT |
| @mapbox/point-geometry | 1.1.0 | ISC |
| @mapbox/tiny-sdf | 2.2.0 | BSD-2-Clause |
| @mapbox/unitbezier | 1.0.0 | BSD-2-Clause |
| @mapbox/vector-tile | 3.0.0 | BSD-3-Clause |
| @maplibre/geojson-vt | 6.1.1 | ISC |
| @maplibre/maplibre-gl-style-spec | 26.4.4 | ISC |
| @maplibre/mlt | 1.3.0 | (MIT OR Apache-2.0) |
| @maplibre/vt-pbf | 4.3.2 | MIT |
| @petamoriken/float16 | 3.9.3 | MIT |
| @types/geojson | 7946.0.16 | MIT |
| @types/google.maps | 3.66.4 | MIT |
| bidi-js | 1.1.0 | MIT |
| earcut | 3.2.3 | ISC |
| framer-motion | 13.4.3 | MIT |
| geotiff | 3.0.5 | MIT |
| gl-matrix | 3.4.4 | MIT |
| json-stringify-pretty-compact | 4.0.0 | MIT |
| kdbush | 4.1.0 | ISC |
| lenis | 1.3.27 | MIT |
| lerc | 3.0.0 | Apache-2.0 |
| lucide-react | 1.48.0 | ISC |
| maplibre-gl | 6.11.2 | BSD-3-Clause |
| minimist | 1.2.8 | MIT |
| motion | 13.4.3 | MIT |
| motion-dom | 13.4.2 | MIT |
| motion-utils | 13.3.0 | MIT |
| murmurhash-js | 1.0.0 | MIT |
| pako | 2.2.0 | (MIT AND Zlib) |
| parse-headers | 2.0.6 | MIT |
| pbf | 5.1.2 | BSD-3-Clause |
| postprocessing | 6.39.6 | Zlib |
| potpack | 2.1.0 | ISC |
| protocol-buffers-schema | 3.6.1 | MIT |
| qrcode-generator | 2.0.4 | MIT |
| quick-lru | 6.1.2 | MIT |
| quickselect | 3.0.0 | ISC |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| require-from-string | 2.0.2 | MIT |
| resolve-protobuf-schema | 2.1.0 | MIT |
| scheduler | 0.28.0 | MIT |
| three | 0.187.0 | MIT |
| tinyqueue | 3.0.0 | ISC |
| tslib | 2.8.1 | 0BSD |
| web-worker | 1.5.0 | Apache-2.0 |
| xml-utils | 1.10.2 | CC0-1.0 |
| zstddec | 0.2.0 | MIT AND BSD-3-Clause |

### Development tools

405 more packages are installed only to build and test the site and are not shipped.
By licence: MIT × 338, ISC × 27, MPL-2.0 × 14, Apache-2.0 × 9, BSD-3-Clause × 7, BSD-2-Clause × 4, CC-BY-4.0 × 1, (MIT OR WTFPL) × 1, (MIT OR Apache-2.0) × 1, MIT OR Apache2 × 1, (BSD-2-Clause OR MIT OR Apache-2.0) × 1, Unlicense × 1.

## Scientific literature

The papers and handbooks behind each parameter of the model are cited one by one in the parameter registry
(`src/lib/evidence.ts`; on the site: Method, Every number), with a DOI or a link for each.

## Tools used to make the site

- **Claude** (Anthropic), an AI coding assistant: the site's code and interface text were written with it, directed
  and reviewed by the authors. The commits it took part in are marked `Co-Authored-By` in the history.
- The tour is read aloud by the visitor's browser (the Web Speech API): no recorded or generated voice is shipped.
- The crop pictures and the 3D scenes are drawn by the site's own code (three.js), not by an image generator.

No machine-learned or generative model produces a score, a plan or a sentence of advice in the running site.

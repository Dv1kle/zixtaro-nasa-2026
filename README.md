# Zixtaro — from orbit to root zone

Pick any field or greenhouse on Earth. Zixtaro reads 45 years of NASA climate data and the soil beneath it, ranks the
crops that field can grow next, plans a rotation that keeps the soil alive as the climate shifts (or, under glass, the
planting calendar, energy and water), and explains every point of every score.

Started as a prototype for the NASA Space Apps Challenge 2026 challenge *"Field Shift: Adapting Farms with NASA Data"*.

## Quick start

Requirements: Node.js 22.3+ and npm. Nothing else is needed to run the site.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 585 tests on bundled real data (~15 s; on a slow machine add --testTimeout=120000)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Optional: copy `.env.example` to `.env.local` and add a Google Maps JavaScript API key to get inline Street View.
Without it the page links out to Google Maps instead. No other keys are needed: every other source is open.

## What is in the page

The page is a descent from orbit to the root zone; each section sits at the altitude where its data is measured.

| Section | What it shows |
| --- | --- |
| **Orbit** | 3D globe (MapLibre) that flies to the field: pick a point, draw an outline or use a district boundary; satellite layers (VIIRS, SMAP, MODIS NDVI and surface heat). |
| **Ground** | Street View, terrain (elevation, slope, aspect), weather now. |
| **Air** | Climate stripes 1981→today, trends with significance, 16-day forecast with a drill check, two NASA rain records side by side (reanalysis and GPM IMERG), frost and heat calendar, monthly water balance. |
| **Field** | Crop history, priority faders, which crops are allowed, irrigation. |
| **Roots** | SoilGrids profile to 2 m, water per layer, texture triangle, lab-test input. |
| **Plan** | Next-season pick with reasons and risks, every crop scored, 4-season strategies beside the rotation the field is on (each read out: why, evidence, gains, gaps, what to check), what-if +1…+3 °C, CMIP6 2050s, nitrogen/CO₂e, backtest, A4 report. |
| **Market** | Prices by country, logistics (sea routes, tariffs, shelf life), "who pays most". |
| **Greenhouse** | Same descent, a different model under the roof: light, heat, CO₂, rain tank, planting calendar, real EU prices; A4 report. |
| **Method** (`?page=method`) | How it works, every data source, limits, the evidence registry, a page for farmers, the words explained. |
| **Legal** (`?page=legal`; also `/legal`, `/privacy`, `/terms`) | What the tool is not (advice, an oracle, NASA), privacy, terms, every source with its licence, the project's own licence. |

Also: one farm with fields and greenhouses on one map, GeoJSON/KML export, a 3-minute guided tour read by the browser's
voice, a QR code that opens the scenario on a
phone, and offline use of a field once opened (production builds register a service worker, `public/sw.js`).

Four demo fields in Lithuania (Joniškis, where the page opens, Vilkaviškis, Telšiai, Šalčininkai) are offered on the
first screen; eight more sites (Torgau ×3 including a glasshouse, Poltava, Iowa, Kansas, Pergamino) stay bundled for
the farm, the method page and the tests. All ship pre-baked, so the demo
works offline; any other place is fetched live and cached in the browser.

## Repository map

```
.
├── index.html, vite.config.ts, tsconfig.json, package.json   app entry and build config
├── src/
│   ├── App.tsx              the page: data loading, staged mounting, sections in order
│   ├── components/          one file per section or panel (PlanSection, SoilSection, MethodPage …)
│   ├── lib/                 the science engine and helpers, framework-free and tested (*.test.ts next to the code)
│   │   └── data/            the field dossier: metric registry and open-data fetchers
│   └── data/                baked JSON the engine imports (markets, calibration, greenhouse, validation …)
├── public/
│   ├── data/                pre-baked data loaded at runtime (demo presets, crops, CMIP6, GRACE, MODIS, markets …)
├── scripts/                 data bakes and evaluation tooling (see scripts/README.md)
│   ├── eval/                validation experiments (blind draws, pre-registered checks H3–H7)
├── validation/              receipts: frozen baselines and the outputs of every reported run
└── docs/                    methods and audits (see docs/README.md)
```

## Documentation

- [docs/SCIENCE.md](docs/SCIENCE.md): methods, data, evidence and limits.
- [docs/FARMERS.md](docs/FARMERS.md): the plain-language version for growers.
- [docs/ANALOGS.md](docs/ANALOGS.md): existing tools compared with Zixtaro, and what it does better and worse.
- [scripts/README.md](scripts/README.md): what every script does.
- [THIRD_PARTY.md](THIRD_PARTY.md): every third-party material and software package, with its licence.
- [docs/SPACE-APPS-COMPLIANCE.md](docs/SPACE-APPS-COMPLIANCE.md): the project against the NASA Space Apps rules, and the decisions still open.

## Data sources

**In the app:** NASA POWER (monthly and daily), NASA GPM IMERG (through POWER and GIBS), NASA GIBS (SMAP, MODIS,
VIIRS), NASA NEX-GDDP-CMIP6,
NASA GRACE/GRACE-FO, ORNL DAAC MODIS subsets; ISRIC SoilGrids 2.0; FAO GAEZ v4, FAO-56, FAOSTAT, FAO GMIA;
CROPGRIDS 2020, MIRCA-OS; Eurostat and DG AGRI (greenhouses); Open-Meteo; AWS Terrain Tiles (SRTM);
Sentinel-2 cloudless (Copernicus/ESA, by EOX) and, over Lithuania, the national orthophoto (geoportal.lt); OSM Nominatim; Google Street View (optional key).

**For validation only:** GDHY yields, GGCMI calendars, USDA CDL, AAFC ACI, French RPG, Danish field parcels,
HLS (GCVI), NIST randomness beacon.

The app's Method page lists each source with its resolution and use; `docs/audit/LINEAGE.md` traces every input of
the crop score back to its source.

## Acknowledgements the data providers ask for

- **NASA POWER.** The data was obtained from the National Aeronautics and Space Administration (NASA) Langley Research
  Center's Prediction Of Worldwide Energy Resources (POWER) project funded through the NASA Earth Science Division.
- **NASA GIBS.** We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services
  (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).
- **MODIS/VIIRS subsets.** ORNL DAAC. 2018. Terrestrial Ecology Subsetting & Visualization Services (TESViS) Global
  Subsets Tool. ORNL DAAC, Oak Ridge, Tennessee, USA. https://doi.org/10.3334/ORNLDAAC/1379
- **GRACE / GRACE-FO.** CSR RL06 mascon solutions, downloaded from http://www2.csr.utexas.edu/grace: Save, Bettadpur
  and Tapley (2016), doi:10.1002/2016JB013007; Save (2020), doi:10.15781/cgq9-nh24.
- **NEX-GDDP-CMIP6.** Accessed from https://registry.opendata.aws/nex-gddp-cmip6 (Thrasher et al. 2022).
- **Open-Meteo.** [Weather data by Open-Meteo.com](https://open-meteo.com/), CC BY 4.0; the free API is used
  non-commercially.
- **OpenStreetMap.** Place search by Nominatim, © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  ODbL. One request per search, sent on Enter, as its usage policy asks.
- **Terrain Tiles.** Elevation from the Mapzen/Tilezen terrain tiles in the AWS Open Data registry; the sources they
  combine (SRTM, GMTED2010, 3DEP, EU-DEM, ArcticDEM and national surveys) are credited in
  [their attribution list](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).

Every other source, with its licence, is in [THIRD_PARTY.md](THIRD_PARTY.md).

## Use of AI

The NASA Space Apps Challenge asks every team to say where AI tools ("SI" in the 2026 guides) were used. In Zixtaro:

| Part | AI used? | How |
| --- | --- | --- |
| Source code, tests and build scripts | **Yes** | Written with an AI coding assistant (Claude, by Anthropic), directed and reviewed by the team. Every commit it took part in carries a `Co-Authored-By: Claude` trailer in the git history. |
| Interface text and this documentation | **Yes** | Drafted with the same assistant and edited by the team. |
| The recommendation itself (scores, plans, reasons) | **No** | An explainable written model: a FAO-56 water balance, crop requirements, rotation rules and prices. No machine-learned or generative model produces a score, a plan or a sentence of advice; every parameter is listed with its source (Method, "Every number"). |
| Crop pictures and 3D scenes | **No image generator** | Drawn at run time by the site's own three.js code (`src/lib/specimen.ts`, `src/lib/objects/`). The scanned props are CC0 photogrammetry from Poly Haven. |
| The guided tour's voice | **Synthetic, not shipped** | Read aloud by the visitor's browser through the Web Speech API. No recorded or generated audio file is in the repository. |
| Data | **No** | NASA and other open records, fetched or baked by the scripts in `scripts/`. None of it is AI-generated. |

The same statement is on the site (`?page=legal`, "Where AI was used") and in `THIRD_PARTY.md`.

## Licence, credits and the small print

Zixtaro's own code, text and drawings are open source under the [Apache License 2.0](LICENSE) - the licence the
NASA Space Apps Challenge itself applies to work that names none.

The licence does not cover what the site borrows. Every data set, map, typeface, scanned object and software
package is listed with its maker and its terms in [THIRD_PARTY.md](THIRD_PARTY.md) (generated by
`node scripts/third-party.mjs`); the credits that travel with the code are in [NOTICE](NOTICE). Ten of those
materials are not under plainly open terms: [docs/SPACE-APPS-COMPLIANCE.md](docs/SPACE-APPS-COMPLIANCE.md) lists
them and what there is to decide.

Zixtaro is an independent project. It is not affiliated with, sponsored by or endorsed by NASA. It is decision
support, not agronomic advice: the site's own notices, privacy statement and terms are at `?page=legal`.

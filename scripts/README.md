# scripts/

Everything that is not the page itself: data bakes that produce the files in `src/data/` and `public/data/`. The site does **not** need any of these to run; they are
for refreshing the data.

How to run:

- TypeScript: `npx tsx scripts/<file>.ts` (tsx is fetched by npx; run from the repository root).
- Node: `node scripts/<file>.mjs`.
- Python 3.11+: `python3 scripts/<file>.py`. Packages used across the scripts: `numpy`, `scipy`, `h5py`, `tifffile`.
  Put them in a virtual environment (`python3 -m venv .venv && .venv/bin/pip install numpy scipy h5py tifffile`).

Large downloads and intermediate results go to `node_modules/.cache/` (git-ignored). Several scripts pull hundreds of
megabytes (CROPGRIDS, FAOSTAT bulk files, GAEZ rasters, HLS scenes); the header comment of each file says what it
fetches and from where.

## Data bakes

| Script | Produces |
| --- | --- |
| `prebake.mjs` (`npm run prebake`) | NASA POWER monthly + daily and SoilGrids for the demo fields → `public/data/presets/` (≈2 min, SoilGrids allows 5 requests/min) |
| `cmip6.mjs` | NASA NEX-GDDP-CMIP6 2050s deltas for the demo fields → `public/data/cmip6/` |
| `modis.mjs` | ORNL DAAC MODIS/VIIRS subsets for the demo fields → `public/data/modis/` |
| `grace.py` | NASA GRACE / GRACE-FO water storage → `public/data/grace/` |
| `belts.mjs` | Crop belts: the field model run over every POWER cell of a region → `public/data/belts/` |
| `cropgrids.py` | CROPGRIDS 2020 harvested areas folded into a 0.5° grid ("what farms grow here") |
| `irrigation.py`, `irrigation-source.py`, `mirca.py` | Irrigated share and its source (FAO GMIA v5, MIRCA-OS) on the 0.5° grid |
| `access.py` | Travel time to the nearest city ≥ 50 000 people (market access) |
| `perennials.ts`, `perennials-grid.py`, `perennials-check.py` | Tree and bush crops: GAEZ v4 suitability and where they grow |
| `yields.py` | Reported yields around the demo fields (GDHY, Argentina MAGyP) |
| `markets_fao.py`, `markets_official.py`, `markets.mjs`, `markets-clean.mjs`, `markets-map.mjs`, `markets-append.mjs` | FAOSTAT prices, trade and production → `src/data/markets.json` and `public/data/markets/` |
| `ghdata.mjs`, `ghvalidate.mjs` | Greenhouse prices, yields and energy from Eurostat / DG AGRI, and the check against real glasshouses |
| `fao56.py`, `gaez.py` | Transcribed FAO-56 and GAEZ v4 tables → `src/lib/fao56-pyfao56.ts`, `src/lib/gaez-tables.ts` |
| `crops-extra.mjs` | `docs/audit/new-crops.json` + FAOSTAT → `src/lib/cropsExtra.ts` (generated, do not edit by hand) |
| `validate.mjs`, `reality/check.ts` | Demo-field checks against real harvests and against what the county grows |

"""Where the irrigation water comes from: FAO GMIA v5 groundwater share of the irrigated area, on the 0.5° grid.

GMIA v5 (Siebert et al. 2013) maps, per 5-arc-minute cell, the area equipped for irrigation (AEI, % of the cell) and
the share of it irrigated from groundwater (AEI_GW, % of AEI). Pumped groundwater costs energy; canal water from rivers
and reservoirs is mostly a water fee - the engine prices irrigation by that mix (rotation.ts, irrigation.ts). This
script sums groundwater-irrigated and all irrigated km² per 0.5° cell.

  python3 scripts/irrigation-source.py   # downloads GMIA v5, all layers (29 MB), into node_modules/.cache/gmia

Writes public/data/irrigation/groundwater.bin: 720 × 360 bytes, rows from 90° N, cols from 180° W; % of the cell's
irrigated area supplied from groundwater (0-100), 255 where GMIA records no irrigation.
"""

import json
import pathlib
import urllib.request
import zipfile

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / 'node_modules' / '.cache' / 'gmia'
OUT = ROOT / 'public' / 'data' / 'irrigation'
URL = 'https://storage.googleapis.com/fao-maps-catalog-data/geonetwork/aquamaps/gmia_v5_all.zip'

CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
allzip = CACHE / 'gmia_v5_all.zip'
if not allzip.exists():
    urllib.request.urlretrieve(URL, allzip)


def layer(name: str) -> np.ndarray:
    """One GMIA ASCII grid (2160 × 4320, rows from 90° N), negative no-data set to 0."""
    asc = CACHE / f'{name}.asc'
    if not asc.exists():
        inner = CACHE / f'{name}_asc.zip'
        if not inner.exists():
            with zipfile.ZipFile(allzip) as z:
                inner.write_bytes(z.read(f'{name}_asc.zip'))
        zipfile.ZipFile(inner).extractall(CACHE)
    a = np.loadtxt(asc, skiprows=6, dtype=np.float32)
    a[a < 0] = 0
    return a


aei_pct = layer('gmia_v5_aei_pct')
gw_pct = layer('gmia_v5_aeigw_pct_aei')
rows5 = aei_pct.shape[0]
lat5 = 90 - (np.arange(rows5) + 0.5) * (180 / rows5)
cell5_km2 = (111.32 * (1 / 12)) ** 2 * np.cos(np.radians(lat5))
aei = aei_pct / 100 * cell5_km2[:, None]
gw = aei * gw_pct / 100
aei05 = aei.reshape(360, 6, 720, 6).sum(axis=(1, 3))
gw05 = gw.reshape(360, 6, 720, 6).sum(axis=(1, 3))

share = np.full((360, 720), 255, dtype=np.uint8)
has = aei05 > 0.01  # at least 1 ha irrigated
share[has] = np.clip(np.round(100 * gw05[has] / aei05[has]), 0, 100).astype(np.uint8)
(OUT / 'groundwater.bin').write_bytes(share.tobytes())
(OUT / 'groundwater.json').write_text(json.dumps({
    'source': 'FAO GMIA v5 (Siebert et al. 2013): area equipped for irrigation from groundwater, % of all equipped area',
    'url': 'https://www.fao.org/aquastat/en/geospatial-information/global-maps-irrigated-areas/latest-version',
    'layout': '720 × 360 u8, rows from 90° N, cols from 180° W; % of the irrigated area supplied from groundwater, 255 = none irrigated',
}))
for name, lat, lon in [('Punjab (IN)', 30.5, 75.5), ('Nile delta', 30.8, 31.0), ('Finney KS', 37.98, -100.87),
                       ('Peru coast', -6.75, -79.75), ('North China', 37.0, 115.0), ('Bundelkhand', 25.25, 78.75)]:
    r, c = int((90 - lat) / 0.5), int((lon + 180) / 0.5) % 720
    print(f'{name:12} {share[r, c]:3d} % groundwater')
print(f'{has.sum()} irrigated cells, median groundwater share {np.median(share[has]):.0f} %')

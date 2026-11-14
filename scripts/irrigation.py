"""How much of the cropland around a field is irrigated: FAO GMIA v5 on the CROPGRIDS 0.5° grid.

FAO's Global Map of Irrigation Areas v5 (Siebert et al. 2013; 5 arc-minutes, % of each cell equipped for irrigation)
is summed to irrigated km² per 0.5° cell and divided by the cell's harvested area from CROPGRIDS 2020 (the grid the
app ships). The model runs rainfed unless told otherwise; where most cropland is irrigated (the Punjab, the Nile,
the North China Plain, the western Kansas pivots) the page says so and starts irrigated.

  python3 scripts/irrigation.py   # downloads GMIA (2.4 MB) into node_modules/.cache/gmia

Writes public/data/irrigation/share.bin: 720 × 360 bytes, rows from 90° N, cols from 180° W; the irrigated share of
the harvested area in % (0–100), 255 where CROPGRIDS has no cropland.
"""

import json
import math
import pathlib
import struct
import urllib.request
import zipfile

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / 'node_modules' / '.cache' / 'gmia'
OUT = ROOT / 'public' / 'data' / 'irrigation'
URL = 'https://storage.googleapis.com/fao-maps-catalog-data/geonetwork/aquamaps/gmia_v5_aei_pct_asc.zip'

CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
asc = CACHE / 'gmia_v5_aei_pct.asc'
if not asc.exists():
    urllib.request.urlretrieve(URL, CACHE / 'gmia.zip')
    zipfile.ZipFile(CACHE / 'gmia.zip').extractall(CACHE)

pct = np.loadtxt(asc, skiprows=6, dtype=np.float32)  # 2160 × 4320, rows from 90° N
pct[pct < 0] = 0
rows5 = pct.shape[0]
lat5 = 90 - (np.arange(rows5) + 0.5) * (180 / rows5)
cell5_km2 = (111.32 * (1 / 12)) ** 2 * np.cos(np.radians(lat5))  # km² of a 5′ cell by row
irrigated = pct / 100 * cell5_km2[:, None]
irr05 = irrigated.reshape(360, 6, 720, 6).sum(axis=(1, 3))  # km² per 0.5° cell

# harvested area per 0.5° cell from the app's CROPGRIDS grid
harvest = np.zeros((360, 720), dtype=np.float32)
buf = (ROOT / 'public' / 'data' / 'crops' / 'grid.bin').read_bytes()
o = 0
while o + 7 <= len(buf):
    row, col, total, n = struct.unpack_from('<HHHB', buf, o)
    harvest[row, col] = total
    o += 7 + 2 * n

share = np.full((360, 720), 255, dtype=np.uint8)
has = harvest > 0
share[has] = np.clip(np.round(100 * irr05[has] / harvest[has]), 0, 100).astype(np.uint8)
(OUT / 'share.bin').write_bytes(share.tobytes())
(OUT / 'share.json').write_text(json.dumps({
    'source': 'FAO GMIA v5 (Siebert et al. 2013), area equipped for irrigation, ÷ CROPGRIDS 2020 harvested area',
    'url': 'https://www.fao.org/aquastat/en/geospatial-information/global-maps-irrigated-areas/latest-version',
    'layout': '720 × 360 u8, rows from 90° N, cols from 180° W; % of harvested area irrigated, 255 = no cropland',
}))
for name, lat, lon in [('Punjab (IN)', 30.5, 75.5), ('Nile delta', 30.8, 31.0), ('Finney KS', 37.98, -100.87),
                       ('Story IA', 42.03, -93.47), ('Torgau', 51.52, 13.05), ('Niger', 13.8, 3.8)]:
    r, c = int((90 - lat) / 0.5), int((lon + 180) / 0.5) % 720
    print(f'{name:12} {share[r, c]:3d} %')
print(f'{has.sum()} cropland cells, {(share[has] >= 50).sum()} mostly irrigated')

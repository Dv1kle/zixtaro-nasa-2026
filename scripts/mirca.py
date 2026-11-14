"""Irrigated share by season group: MIRCA-OS 2015 (Kebede et al. 2025, Scientific Data), 0.5° grid.

GMIA says how much of a cell is equipped for irrigation, for all crops at once; but in a monsoon or dry-winter
climate the water goes to the dry-season crops - India's rabi wheat is ~90 % irrigated where GMIA's all-crop share
is 22 %. MIRCA-OS maps irrigated and rainfed harvested area per crop. Taken crop by crop it would leak what farms grow
into the score (a crop farms grow would get its real irrigation, any other crop the all-crop figure), so the areas are
pooled by SEASON GROUP: the irrigated share of all cool-season crops in the cell, and of all warm-season crops. Any
cool-season crop the model scores gets the cell's cool-season share - a property of the cell's water in that season,
not of one crop's prevalence.

  python3 scripts/mirca.py   # needs node_modules/.cache/mirca/2015/*.tif (MIRCA-OS annual harvested area, 30′)
  (HydroShare 10.4211/hs.60a890eb841c460192c03bb590687145, Annual_Harvested_Area_Grids.rar, 172 MB; extract the
   2015/30-arcminute folder)

Writes public/data/irrigation/season.bin: 720 × 360 × 2 bytes (cool, warm) per cell, rows from 90° N, cols from
180° W; irrigated % of the group's harvested area, 255 where the group has under 100 ha.
"""

import json
import pathlib
import struct

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'node_modules' / '.cache' / 'mirca' / '2015'
OUT = ROOT / 'public' / 'data' / 'irrigation'

# MIRCA-OS classes by season group (crops.ts COOL_SEASON for the model's own crops)
COOL = ['Wheat', 'Barley', 'Rye', 'Rapeseed', 'Potatoes', 'Sugar_beet', 'Pulses']
WARM = ['Maize', 'Rice', 'Sorghum', 'Millet', 'Soybeans', 'Sunflower', 'Groundnuts', 'Cotton', 'Cassava']


def read_tif(path: pathlib.Path) -> np.ndarray:
    """A minimal reader for MIRCA-OS's uncompressed single-band float32 GeoTIFFs (strips or one block)."""
    b = path.read_bytes()
    bo = '<' if b[:2] == b'II' else '>'
    (ifd,) = struct.unpack(bo + 'I', b[4:8])
    (n,) = struct.unpack(bo + 'H', b[ifd:ifd + 2])
    tags = {}
    for i in range(n):
        tag, typ, cnt, val = struct.unpack(bo + 'HHII', b[ifd + 2 + 12 * i: ifd + 14 + 12 * i])
        size = {1: 1, 3: 2, 4: 4, 12: 8, 16: 8}.get(typ, 4)
        if cnt * size <= 4:
            raw = b[ifd + 2 + 12 * i + 8: ifd + 2 + 12 * i + 8 + cnt * size]
        else:
            raw = b[val: val + cnt * size]
        fmt = {1: 'B', 3: 'H', 4: 'I', 12: 'd', 16: 'Q'}.get(typ, 'I')
        tags[tag] = struct.unpack(bo + fmt * cnt, raw)
    w, h = tags[256][0], tags[257][0]
    assert tags.get(259, (1,))[0] == 1, f'{path.name}: compressed'
    bits = tags[258][0]
    fmt = tags.get(339, (1,))[0]
    dtype = {(32, 3): 'f4', (64, 3): 'f8', (32, 1): 'u4', (16, 1): 'u2', (32, 2): 'i4'}[(bits, fmt)]
    offs, counts = tags.get(273) or tags[324], tags.get(279) or tags[325]
    data = b''.join(b[o:o + c] for o, c in zip(offs, counts))
    a = np.frombuffer(data, dtype=np.dtype(bo + dtype))[: w * h].reshape(h, w).astype(np.float64)
    a[~np.isfinite(a) | (a < 0)] = 0
    if (h, w) == (360, 720):
        return a
    # a few files cover only their crop's extent: place them on the global grid by the GeoTIFF tie point and scale
    sx, sy = tags[33550][0], tags[33550][1]
    x0, y0 = tags[33922][3], tags[33922][4]
    assert abs(sx - 0.5) < 1e-6 and abs(sy - 0.5) < 1e-6, f'{path.name}: scale {sx}, {sy}'
    c0, r0 = round((x0 + 180) / 0.5), round((90 - y0) / 0.5)
    full = np.zeros((360, 720))
    full[r0:r0 + h, c0:c0 + w] = a
    return full


def group(names: list[str]) -> tuple[np.ndarray, np.ndarray]:
    ir = np.zeros((360, 720))
    rf = np.zeros((360, 720))
    for c in names:
        ir += read_tif(SRC / f'MIRCA-OS_{c}_2015_ir_30arcmin.tif')
        rf += read_tif(SRC / f'MIRCA-OS_{c}_2015_rf_30arcmin.tif')
    return ir, rf


OUT.mkdir(parents=True, exist_ok=True)
grid = np.full((360, 720, 2), 255, dtype=np.uint8)
for k, names in enumerate([COOL, WARM]):
    ir, rf = group(names)
    tot = ir + rf
    has = tot >= 100
    grid[has, k] = np.clip(np.round(100 * ir[has] / tot[has]), 0, 100).astype(np.uint8)
(OUT / 'season.bin').write_bytes(grid.tobytes())
(OUT / 'season.json').write_text(json.dumps({
    'source': 'MIRCA-OS 2015 v0.1 (Kebede et al. 2025, Sci. Data), annual irrigated and rainfed harvested area, 30′',
    'url': 'https://doi.org/10.4211/hs.60a890eb841c460192c03bb590687145',
    'groups': {'cool': COOL, 'warm': WARM},
    'layout': '720 × 360 × 2 u8 (cool, warm), rows from 90° N, cols from 180° W; irrigated % of the group, 255 = under 100 ha',
}))
for name, lat, lon in [('Bundelkhand', 25.25, 78.75), ('Punjab (IN)', 30.75, 75.75), ('Peru coast', -6.75, -79.75),
                       ('Gansu', 35.75, 105.25), ('Free State', -27.75, 26.25), ('Iowa', 42.25, -93.75),
                       ('Torgau', 51.75, 13.25), ('Nile delta', 30.75, 31.25)]:
    r, c = int((90 - lat) / 0.5), int((lon + 180) / 0.5) % 720
    print(f'{name:12} cool {grid[r, c, 0]:3d} %  warm {grid[r, c, 1]:3d} %')

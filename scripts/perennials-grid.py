"""Where tree and bush crops grow: CROPGRIDS 2020 harvested areas of the plantation and orchard crops on the 0.5° grid.

The long-term planting view (src/lib/perennials.ts) sets FAO GAEZ v4's suitability rating next to what the farmland
around a field actually grows. public/data/crops/grid.bin pools these crops as one "orchards & plantations" group (and
the validation reads that file, so it stays as it is); this file keeps them apart.

  python3 scripts/perennials-grid.py path/to/CG-HA        # the unzipped CROPGRIDS v2 folder (figshare file 56138933)

Writes public/data/crops/trees.bin + trees.json. Needs numpy and tifffile (+ imagecodecs). Shares are of the cell's
whole harvested area - every CROPGRIDS layer, the same denominator as grid.bin - so the two files agree.
Binary layout, little-endian, one record per cell where one of these crops covers >= 1 % of the harvested area:
  u16 row, u16 col (0.5° grid from 90° N / 180° W), u8 n, n × (u8 crop, u8 share %)
"""
import json
import pathlib
import struct
import sys

import numpy as np
import tifffile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'crops'

# the nine GAEZ v4 rates, then the largest it does not (CROPGRIDS world harvested area, 2020)
TREES = {
    'oilpalm': ['oilpalm'], 'rubber': ['rubber'], 'cocoa': ['cocoa'], 'olive': ['olive'], 'coconut': ['coconut'],
    'coffee': ['coffee'], 'banana': ['banana', 'plantain'], 'tea': ['tea'],
    'citrus': ['orange', 'tangetc', 'citrusnes', 'lemonlime', 'grapefruit'],
    'grape': ['grape'], 'mango': ['mango'], 'apple': ['apple'], 'plum': ['plum'], 'almond': ['almond'],
}
IDS = list(TREES)


def block_sum(a: np.ndarray) -> np.ndarray:
    a = np.nan_to_num(a, nan=0.0)
    a[a < 0] = 0
    return a.reshape(360, 10, 720, 10).sum(axis=(1, 3))


def main(folder: str):
    files = sorted(pathlib.Path(folder).glob('2020_*.tif'))
    if not files:
        sys.exit(f'no CROPGRIDS tifs in {folder}')
    names = {f.stem.split('2020_')[1] for f in files}
    missing = [n for ns in TREES.values() for n in ns if n not in names]
    assert not missing, f'missing CROPGRIDS layers: {missing}'
    layer_of = {n: k for k, ns in TREES.items() for n in ns}
    total = np.zeros((360, 720))
    per = {k: np.zeros((360, 720)) for k in IDS}
    for i, f in enumerate(files):
        name = f.stem.split('2020_')[1]
        a = block_sum(tifffile.imread(f).astype(np.float64))
        total += a
        if name in layer_of:
            per[layer_of[name]] += a
        if i % 40 == 0:
            print(f'  {i + 1}/{len(files)} {name}')
    buf = bytearray()
    n_cells = 0
    with np.errstate(divide='ignore', invalid='ignore'):
        share = {k: np.where(total > 0, per[k] / total, 0) for k in IDS}
    keep = np.zeros((360, 720), dtype=bool)
    for k in IDS:
        keep |= share[k] >= 0.01
    for r, c in zip(*np.nonzero(keep)):
        cell = [(i, share[k][r, c]) for i, k in enumerate(IDS) if share[k][r, c] >= 0.01]
        cell.sort(key=lambda x: -x[1])
        buf += struct.pack('<HHB', r, c, len(cell))
        for i, s in cell:
            buf += struct.pack('<BB', i, int(min(100, round(s * 100))))
        n_cells += 1
    (OUT / 'trees.bin').write_bytes(bytes(buf))
    (OUT / 'trees.json').write_text(json.dumps({
        'crops': IDS,
        'cells': n_cells,
        'd': 0.5,
        'source': 'CROPGRIDS v2 (Tang et al. 2024), harvested area around 2020, 0.05° folded to 0.5°, CC BY 4.0',
        'url': 'https://doi.org/10.6084/m9.figshare.29532806',
        'layout': 'u16 row, u16 col, u8 n, n × (u8 crop, u8 share % of all harvested area) - rows from 90° N, cols from 180° W',
    }, indent=1))
    print(f'  {n_cells} cells, {len(buf) / 1e3:.0f} kB')


if __name__ == '__main__':
    main(sys.argv[1])

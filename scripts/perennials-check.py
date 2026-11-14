"""How far FAO GAEZ v4's suitability for tree crops agrees with where farms grow them (CROPGRIDS 2020).

For each crop GAEZ rates, every 0.05° CROPGRIDS pixel's harvested area is attributed to the GAEZ 5′ pixel its centre falls
in, and summed by GAEZ's suitability class there (1981-2010, rain-fed, high inputs; the pixel's current cropland, or
all its land where GAEZ maps no cropland). The share of the world's harvested area GAEZ rates suitable at all (index
> 0) and at least moderately (> 25) is how far to trust its rating for that crop - shown in the long-term view.

  python3 scripts/perennials-check.py path/to/CG-HA [gaez-dir]

GAEZ rasters (suHr_*/sxHr_* 1981-2010, ~1 MB each) are downloaded to gaez-dir (default node_modules/.cache/gaez).
Writes validation/runs/<date>-gaez-trees.json and the per-crop agreement into src/data/perennials.json. Needs numpy and
tifffile (+ imagecodecs).
"""
import datetime
import json
import pathlib
import sys
import urllib.request

import numpy as np
import tifffile

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = 'https://s3.eu-west-1.amazonaws.com/data.gaezdev.aws.fao.org/res05/CRUTS32/Hist/8110H/{}.tif'
# Zixtaro id -> (GAEZ code, CROPGRIDS layers) - the codes are the suffixes of the layer names in src/data/perennials.json
CROPS = {
    'oilpalm': ['oilpalm'], 'rubber': ['rubber'], 'cocoa': ['cocoa'], 'olive': ['olive'], 'coconut': ['coconut'],
    'coffee': ['coffee'], 'banana': ['banana', 'plantain'], 'tea': ['tea'],
    'citrus': ['orange', 'tangetc', 'citrusnes', 'lemonlime', 'grapefruit'],
}
CLASSES = [(85, 1), (70, 2), (55, 3), (40, 4), (25, 5), (10, 6), (0, 7)]


def gaez(name: str, folder: pathlib.Path) -> np.ndarray:
    path = folder / f'{name}.tif'
    if not path.exists():
        urllib.request.urlretrieve(URL.format(name), path)
    return tifffile.imread(path)


def main(cg: str, gdir: str):
    folder = pathlib.Path(gdir)
    folder.mkdir(parents=True, exist_ok=True)
    data = json.loads((ROOT / 'src/data/perennials.json').read_text())
    now = {(l['crop'], l['land']): l['name'] for l in data['layers'] if l['when'] == 'now'}
    # CROPGRIDS 0.05° pixel centres -> GAEZ 1/12° pixel indices
    i = np.arange(3600)
    j = np.arange(7200)
    gr = np.floor((0.025 + 0.05 * i) * 12).astype(int)
    gc = np.floor((0.025 + 0.05 * j) * 12).astype(int)
    out = {}
    for crop, layers in CROPS.items():
        area = np.zeros((3600, 7200))
        for name in layers:
            a = tifffile.imread(pathlib.Path(cg) / f'2020_{name}.tif').astype(np.float64)
            area += np.where(np.isfinite(a) & (a > 0), a, 0)
        su = gaez(now[(crop, 'cropland')], folder)[gr[:, None], gc[None, :]]
        sx = gaez(now[(crop, 'all')], folder)[gr[:, None], gc[None, :]]
        si = np.where(su >= 0, su, sx).astype(np.float64) / 100  # no cropland in the GAEZ pixel: all its land
        nodata = si < 0
        total = area.sum()
        by = {'nodata': float(area[nodata].sum() / total), 'not suitable': float(area[(si == 0)].sum() / total)}
        for above, k in CLASSES:
            hi = 100 if k == 1 else [a for a, n in CLASSES if n == k - 1][0]
            by[f'class {k}'] = float(area[(si > above) & (si <= hi)].sum() / total)
        out[crop] = {
            'harvestedKm2': round(float(total)),
            'suitable': round(float(area[si > 0].sum() / total), 3),
            'moderate': round(float(area[si > 25].sum() / total), 3),
            'noCropland': round(float(area[(su < 0) & (sx >= 0)].sum() / total), 3),
            'byClass': {k: round(v, 4) for k, v in by.items()},
        }
        print(f"  {crop:8s} {out[crop]['harvestedKm2']:>7} km²  suitable {out[crop]['suitable']:.0%}  >=moderate {out[crop]['moderate']:.0%}")
    day = datetime.date.today().isoformat()
    (ROOT / f'validation/runs/{day}-gaez-trees.json').write_text(json.dumps({
        'what': 'share of each crop’s world harvested area (CROPGRIDS 2020) by FAO GAEZ v4 suitability class of the 5′ pixel it lies in '
                '(1981-2010, rain-fed, high inputs; current cropland, all land where GAEZ maps none)',
        'run': day, 'crops': out,
    }, indent=1))
    data['agreement'] = {k: {'suitable': v['suitable'], 'moderate': v['moderate']} for k, v in out.items()}
    (ROOT / 'src/data/perennials.json').write_text(json.dumps(data))
    print(f'  -> validation/runs/{day}-gaez-trees.json, src/data/perennials.json (agreement)')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else str(ROOT / 'node_modules/.cache/gaez'))

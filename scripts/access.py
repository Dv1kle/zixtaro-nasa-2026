"""Market access: travel time to the nearest city of 50 000 people or more, and how far from such a city farms grow
perishable crops.

Source: Nelson, A. et al. (2019), A suite of global accessibility indicators, Scientific Data 6:266 - travel time in
2015 to cities of >= 50 000 (layer 11 of figshare 7638134, 30″, minutes, 85° N to 60° S; CC BY 4.0).

  python3 scripts/access.py path/to/travel_time_to_cities_11.tif path/to/CG-HA

1. Folds the 30″ travel times to 0.05° (mean of the land pixels) and attributes CROPGRIDS 2020 harvested areas to
   them: for each crop, the share of its world harvested area within 1, 2, 4 … hours of such a city (P50, P90, P95).
   A perishable crop grown beyond its P95 is out of the reach most of the world's growers have.
2. Writes the page's grid at 0.25°: the travel time of the farmland in each cell (mean weighted by CROPGRIDS harvested
   area; all land where the cell has none), u8 in 10-minute steps, 254 = 42 h 20 min or more, 255 = no data.

Writes public/data/access/cities50k.bin + .json, src/data/access.json (the percentiles) and
validation/runs/<date>-market-access.json. Needs numpy and tifffile (+ imagecodecs); ~3 GB of memory.
"""
import datetime
import json
import pathlib
import sys

import numpy as np
import tifffile

ROOT = pathlib.Path(__file__).resolve().parent.parent
NODATA = 65535
# Zixtaro crop -> CROPGRIDS layers; the field model's perishable vegetables first, then references
CROPS = {
    # chilli = green chillies and peppers (fresh, the field model's crop); dried ones store and are kept apart
    'tomato': ['tomato'], 'chilli': ['chilleetc'], 'chillidry': ['pimento'], 'okra': ['okra'], 'watermelon': ['watermelon'],
    'cabbage': ['cabbage'], 'onion': ['onion'], 'vegetables': ['cucumberetc', 'lettuce', 'vegetablenes', 'eggplant',
    'cauliflower', 'carrot', 'spinach', 'greenbean', 'greenpea'],
    'wheat': ['wheat'], 'maize': ['maize'], 'rice': ['rice'], 'soybean': ['soybean'],
}


def fold(a: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
    """Sum and count of the valid values in k×k blocks, strip by strip (the 30″ grid is 1.9 GB)."""
    rows, cols = a.shape[0] // k, a.shape[1] // k
    s = np.zeros((rows, cols), np.float64)
    n = np.zeros((rows, cols), np.int32)
    step = 100
    for r0 in range(0, rows, step):
        r1 = min(rows, r0 + step)
        blk = a[r0 * k:r1 * k].astype(np.float32)
        ok = blk != NODATA
        blk[~ok] = 0
        s[r0:r1] = blk.reshape(r1 - r0, k, cols, k).sum(axis=(1, 3))
        n[r0:r1] = ok.reshape(r1 - r0, k, cols, k).sum(axis=(1, 3))
    return s, n


def weighted_percentiles(t: np.ndarray, w: np.ndarray, qs=(0.5, 0.9, 0.95)) -> dict:
    ok = np.isfinite(t) & (w > 0)
    tv, wv = t[ok], w[ok]
    order = np.argsort(tv)
    tv, wv = tv[order], wv[order]
    cum = np.cumsum(wv) / wv.sum()
    out = {f'p{int(q * 100)}': round(float(tv[np.searchsorted(cum, q)]) / 60, 2) for q in qs}
    for h in (1, 2, 4, 8):
        out[f'within{h}h'] = round(float(wv[tv <= h * 60].sum() / wv.sum()), 3)
    out['areaKm2'] = round(float(w.sum()))
    return out


def main(tif: str, cg: str):
    print('reading travel times …')
    a = tifffile.imread(tif)
    # the layer spans 85° N to 60° S (origin -180, 85; 30″; GDAL no-data -1 = 65535 as u16)
    assert a.shape == (17400, 43200), a.shape
    s05, n05 = fold(a, 6)  # 30″ -> 0.05°
    del a
    t05 = np.full((3600, 7200), np.nan)
    t05[100:100 + s05.shape[0]] = np.where(n05 > 0, s05 / np.maximum(n05, 1), np.nan)
    print('crops …')
    files = sorted(pathlib.Path(cg).glob('2020_*.tif'))
    total = np.zeros((3600, 7200))
    per = {k: np.zeros((3600, 7200)) for k in CROPS}
    layer_of = {n: k for k, ns in CROPS.items() for n in ns}
    for f in files:
        name = f.stem.split('2020_')[1]
        x = tifffile.imread(f).astype(np.float64)
        x = np.where(np.isfinite(x) & (x > 0), x, 0)
        total += x
        if name in layer_of:
            per[layer_of[name]] += x
    stats = {k: weighted_percentiles(t05, v) for k, v in per.items()}
    stats['all cropland'] = weighted_percentiles(t05, total)
    for k, v in stats.items():
        print(f"  {k:13s} P50 {v['p50']:5.2f} h  P90 {v['p90']:5.2f} h  P95 {v['p95']:5.2f} h  within 2 h {v['within2h']:.0%}")

    # the page's grid: 0.25° = 5×5 cells of 0.05°, farmland-weighted where there is farmland
    w = total.reshape(720, 5, 1440, 5)
    t = np.nan_to_num(t05, nan=0).reshape(720, 5, 1440, 5)
    has = np.isfinite(t05).reshape(720, 5, 1440, 5)
    wsum = (w * has).sum(axis=(1, 3))
    farm = np.where(wsum > 0, (t * w * has).sum(axis=(1, 3)) / np.maximum(wsum, 1e-9), np.nan)
    cnt = has.sum(axis=(1, 3))
    land = np.where(cnt > 0, (t * has).sum(axis=(1, 3)) / np.maximum(cnt, 1), np.nan)
    t25 = np.where(np.isfinite(farm), farm, land)
    u8 = np.where(np.isfinite(t25), np.minimum(254, np.round(t25 / 10)), 255).astype(np.uint8)
    out = ROOT / 'public' / 'data' / 'access'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'cities50k.bin').write_bytes(u8.tobytes())
    (out / 'cities50k.json').write_text(json.dumps({
        'source': 'Nelson, A. et al. (2019). A suite of global accessibility indicators. Scientific Data 6, 266 - travel time to the nearest city of 50 000 or more in 2015 (layer 11), CC BY 4.0',
        'url': 'https://doi.org/10.6084/m9.figshare.7638134.v4',
        'd': 0.25, 'rows': 720, 'cols': 1440,
        'layout': 'u8 per 0.25° cell, rows from 90° N, cols from 180° W: travel time of the cell’s farmland (CROPGRIDS-weighted mean; all land where none) in 10-minute steps; 254 = 42 h 20 min or more; 255 = no data',
    }, indent=1))
    day = datetime.date.today().isoformat()
    (ROOT / 'src' / 'data' / 'access.json').write_text(json.dumps({
        'source': 'Nelson et al. (2019) travel time to cities >= 50 000 (2015) × CROPGRIDS 2020 harvested area, 0.05°',
        'built': day, 'hours': stats,
    }, indent=1))
    (ROOT / 'validation' / 'runs' / f'{day}-market-access.json').write_text(json.dumps({
        'what': 'share of each crop’s world harvested area (CROPGRIDS 2020) by travel time to the nearest city of >= 50 000 (Nelson 2019, 2015), 0.05°',
        'run': day, 'crops': stats,
    }, indent=1))
    print(f'  -> public/data/access/cities50k.bin ({u8.nbytes / 1e6:.1f} MB), src/data/access.json')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

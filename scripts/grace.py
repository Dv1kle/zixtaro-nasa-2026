"""Pre-bakes NASA GRACE / GRACE-FO water storage for Zixtaro.

What the twin satellites weighed: the monthly change in all water stored on and under the land (soil moisture,
groundwater, snow, lakes, ice), from the CSR RL06.3 mascon solution (University of Texas Center for Space
Research, public download, no login). Writes

  public/data/grace/<preset>.json   the monthly series in the demo fields' cells, with the trend
  public/data/grace/trend.png       the 2002–now trend of every land cell, Web-Mercator, for the globe
  public/data/grace/trend.json      how to read the picture
  node_modules/.cache/zixtaro-landmask.json   a land mask on the NASA POWER grid, for scripts/belts.mjs

  python3 scripts/grace.py path/to/CSR_GRACE_GRACE-FO_RL0603_Mascons_all-corrections.nc path/to/..._LandMask.nc

Needs numpy, h5py and pillow. Download both files from
https://download.csr.utexas.edu/outgoing/grace/RL0603_mascons/ (≈110 MB + 4 MB).
"""

import datetime as dt
import json
import math
import pathlib
import re
import sys

import h5py
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'grace'
OUT.mkdir(parents=True, exist_ok=True)


def presets():
    """(id, lat, lon) of every demo preset that carries its own climate bundle — read straight from presets.ts."""
    src = (ROOT / 'src' / 'lib' / 'presets.ts').read_text(encoding='utf-8')
    out = []
    for block in re.split(r"\n  \{\n", src)[1:]:
        pid = re.search(r"id: '([^']+)'", block)
        if not pid or 'bundle:' in block:
            continue
        pts = re.findall(r"\[(-?\d+\.\d+), (-?\d+\.\d+)\]", block)
        if pts:
            lons = [float(a) for a, _ in pts]
            lats = [float(b) for _, b in pts]
            out.append((pid.group(1), sum(lats) / len(lats), sum(lons) / len(lons)))
            continue
        m = re.search(r"(?:point|circle)\((-?\d+\.\d+), (-?\d+\.\d+)", block)
        if m:
            out.append((pid.group(1), float(m.group(1)), float(m.group(2))))
    return out


def sen(x, y):
    """Theil–Sen slope and a Mann–Kendall p-value (normal approximation, no tie correction needed for floats)."""
    n = len(x)
    slopes = [(y[j] - y[i]) / (x[j] - x[i]) for i in range(n) for j in range(i + 1, n) if x[j] != x[i]]
    s = sum(np.sign(y[j] - y[i]) for i in range(n) for j in range(i + 1, n))
    var = n * (n - 1) * (2 * n + 5) / 18
    z = (s - np.sign(s)) / math.sqrt(var) if s else 0.0
    p = math.erfc(abs(z) / math.sqrt(2))
    return float(np.median(slopes)), p


def main(mascon_path, land_path):
    f = h5py.File(mascon_path, 'r')
    lwe = f['lwe_thickness']  # (time, lat, lon) cm
    lat = f['lat'][:]
    lon = f['lon'][:]  # 0.125 … 359.875
    days = f['time'][:]
    t0 = dt.datetime(2002, 1, 1)
    when = [t0 + dt.timedelta(days=float(d)) for d in days]
    years = np.array([w.year + (w.timetuple().tm_yday - 0.5) / 365.25 for w in when])
    months = [f'{w.year:04d}-{w.month:02d}' for w in when]
    land = h5py.File(land_path, 'r')['LO_val'][:] > 0.5

    # ---- the demo cells ----
    index = []
    for pid, plat, plon in presets():
        i = int(np.argmin(abs(lat - plat)))
        j = int(np.argmin(abs(lon - (plon % 360))))
        series = lwe[:, i, j].astype(float)
        slope, p = sen(years, series)
        # the mean of the first and last full years, for "since 2003" statements
        first = series[(years >= 2003) & (years < 2004)].mean()
        last_year = int(years.max()) - 1
        last = series[(years >= last_year) & (years < last_year + 1)].mean()
        out = {
            'id': pid,
            'lat': float(lat[i]),
            'lon': float(((lon[j] + 180) % 360) - 180),
            'source': 'NASA/DLR GRACE & NASA/GFZ GRACE-FO · CSR RL06.3 mascons (UT Austin)',
            'note': '0.25° grid, native resolution ≈ 300 km: a regional signal, not a well level',
            'months': months,
            'cm': [round(v, 2) for v in series],
            'trendCmPerYear': round(slope, 3),
            'p': round(p, 4),
            'change': {'from': 2003, 'to': last_year, 'cm': round(float(last - first), 1)},
        }
        (OUT / f'{pid}.json').write_text(json.dumps(out, separators=(',', ':')))
        index.append(pid)
        print(f'  {pid}: {slope:+.2f} cm/yr (p={p:.3f}), {last - first:+.1f} cm 2003→{last_year}')
    (OUT / 'index.json').write_text(json.dumps({'ids': index}))

    # ---- the global trend picture (land only), Web-Mercator so MapLibre can drape it on the globe ----
    data = lwe[:].astype(np.float32)  # (t, 720, 1440)
    xm = years - years.mean()
    slope = (data * xm[:, None, None]).sum(0) / (xm ** 2).sum()  # least squares per cell, cm/yr
    slope[~land] = np.nan
    # mascon cells are 1°: average 2×2 → 0.5°, plenty for a ≈300 km signal
    s2 = np.nanmean(slope.reshape(360, 2, 720, 2), axis=(1, 3))
    s2 = np.roll(s2, 360, axis=1)  # 0…360 → −180…180
    lat2 = (lat.reshape(360, 2).mean(1))
    W, H = 1440, 1440
    MAXLAT = 85.0511
    ymax = math.log(math.tan(math.pi / 4 + math.radians(MAXLAT) / 2))
    img = np.zeros((H, W, 4), dtype=np.uint8)
    LIMIT = 2.0  # cm/yr at full colour
    loss = np.array([176, 102, 42], dtype=float)   # dry brown
    gain = np.array([60, 150, 220], dtype=float)   # water blue
    for r in range(H):
        y = ymax - (r + 0.5) / H * 2 * ymax
        phi = math.degrees(2 * math.atan(math.exp(y)) - math.pi / 2)
        i = int(np.argmin(abs(lat2 - phi)))
        row = s2[i]
        cols = ((np.arange(W) + 0.5) / W * 720).astype(int)
        v = row[cols]
        ok = np.isfinite(v)
        k = np.clip(np.abs(np.nan_to_num(v)) / LIMIT, 0, 1)
        col = np.where((np.nan_to_num(v) < 0)[:, None], loss, gain)
        img[r, :, :3] = col.astype(np.uint8)
        # near-zero trends stay nearly clear, so the eye goes to where water is really changing; no Antarctica
        img[r, :, 3] = np.where(ok & (phi > -60), 215 * np.clip((k - 0.06) / 0.94, 0, 1) ** 0.75, 0).astype(np.uint8)
    # two halves: MapLibre can't drape one image across all 360° of longitude
    Image.fromarray(img[:, : W // 2], 'RGBA').save(OUT / 'trend-w.png', optimize=True)
    Image.fromarray(img[:, W // 2 :], 'RGBA').save(OUT / 'trend-e.png', optimize=True)
    (OUT / 'trend.json').write_text(json.dumps({
        'source': 'NASA/DLR GRACE & NASA/GFZ GRACE-FO · CSR RL06.3 mascons (UT Austin)',
        'from': months[0], 'to': months[-1],
        'limitCmPerYear': LIMIT,
        'images': [
            {'url': 'trend-w.png', 'coordinates': [[-180, MAXLAT], [0, MAXLAT], [0, -MAXLAT], [-180, -MAXLAT]]},
            {'url': 'trend-e.png', 'coordinates': [[0, MAXLAT], [180, MAXLAT], [180, -MAXLAT], [0, -MAXLAT]]},
        ],
        'note': 'Least-squares trend of total water storage per land cell; brown = losing water, blue = gaining. Ice sheets count too.',
    }))
    print(f'  trend-w/e.png {W}×{H}')

    # ---- every land cell's trend and change, 1° grid, so any field on Earth gets its number ----
    change = np.full(slope.shape, np.nan, dtype=np.float32)
    early = (years >= 2003) & (years < 2004)
    last_year = int(years.max()) - 1
    late = (years >= last_year) & (years < last_year + 1)
    change = data[late].mean(0) - data[early].mean(0)
    change[~land] = np.nan
    def coarse(a):  # 0.25° → 1°, lon 0…360 → −180…180, north up
        c = np.nanmean(a.reshape(180, 4, 360, 4), axis=(1, 3))
        return np.roll(c, 180, axis=1)[::-1]
    t1 = coarse(slope)
    c1 = coarse(change)
    enc = lambda a, k: np.where(np.isfinite(a), np.clip(np.round(a * k), -32767, 32767), -32768).astype('<i2').tobytes()
    import base64
    (OUT / 'grid.json').write_text(json.dumps({
        'rows': 180, 'cols': 360, 'lat0': 89.5, 'lon0': -179.5, 'd': 1,
        'trendMmPerYear': base64.b64encode(enc(t1, 100)).decode(),  # cm/yr × 100 = mm/yr × 10
        'changeCm': base64.b64encode(enc(c1, 10)).decode(),  # cm × 10
        'change': {'from': 2003, 'to': last_year},
        'scale': 'trend: int16 = cm/yr × 100; change: int16 = cm × 10; −32768 = sea',
    }, separators=(',', ':')))
    print('  grid.json (1°, every land cell)')

    # ---- land mask on the NASA POWER / MERRA-2 grid (0.5° × 0.625°) for the belt maps ----
    plat = np.arange(-90, 90.001, 0.5)
    plon = np.arange(-180, 180, 0.625)
    lm = np.zeros((len(plat), len(plon)), dtype=np.uint8)
    for a, la in enumerate(plat):
        i = int(np.argmin(abs(lat - la)))
        js = [int(np.argmin(abs(lon - (lo % 360)))) for lo in plon]
        lm[a] = land[i, js]
    cache = ROOT / 'node_modules' / '.cache'
    cache.mkdir(parents=True, exist_ok=True)
    (cache / 'zixtaro-landmask.json').write_text(json.dumps({'lat0': -90, 'lon0': -180, 'dlat': 0.5, 'dlon': 0.625, 'rows': [''.join(map(str, r)) for r in lm]}))
    print('  land mask for the POWER grid written')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

"""Pre-bakes reported crop yields around the demo fields, so Zixtaro can check its water model against real harvests.

Sources (no login):
  * GDHY v1.2+v1.3 — Global Dataset of Historical Yields (Iizumi & Sakai 2020, Scientific Data 7:97), 0.5° grid,
    1981–2016, built from agricultural census statistics. PANGAEA doi:10.1594/PANGAEA.909132
  * Argentina, Ministerio de Agricultura (MAGyP) — Estimaciones agrícolas, yields by department, 1969/70 → today.

  python3 scripts/yields.py path/to/gdhy-folder [path/to/estimaciones-agricolas.csv]

The GDHY folder is the unzipped https://store.pangaea.de/Publications/IizumiT_2019/gdhy_v1.2_v1.3_20190128.zip (16 MB);
the MAGyP CSV is found through datos.magyp.gob.ar (package "estimaciones-agricolas"). Needs numpy and h5py.
"""

import csv
import json
import math
import pathlib
import re
import sys

import h5py
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'yields'
OUT.mkdir(parents=True, exist_ok=True)

GDHY = {'maize': 'maize', 'soybean': 'soybean', 'wheat': 'wheat'}  # Zixtaro crop → GDHY folder
MAGYP = {'maíz': 'maize', 'soja total': 'soybean', 'trigo total': 'wheat', 'girasol': 'sunflower', 'sorgo': 'sorghum'}
# departments with official statistics that cover a demo field
DEPARTMENTS = {'pergamino': ('Buenos Aires', 'Pergamino')}


def presets():
    src = (ROOT / 'src' / 'lib' / 'presets.ts').read_text(encoding='utf-8')
    out = []
    for block in re.split(r"\n  \{\n", src)[1:]:
        pid = re.search(r"id: '([^']+)'", block)
        name = re.search(r"name: '([^']+)'", block)
        region = re.search(r"region: '([^']+)'", block)
        if not pid or 'bundle:' in block:
            continue
        pts = re.findall(r"\[(-?\d+\.\d+), (-?\d+\.\d+)\]", block)
        if pts:
            lat = sum(float(b) for _, b in pts) / len(pts)
            lon = sum(float(a) for a, _ in pts) / len(pts)
        else:
            m = re.search(r"(?:point|circle)\((-?\d+\.\d+), (-?\d+\.\d+)", block)
            if not m:
                continue
            lat, lon = float(m.group(1)), float(m.group(2))
        out.append((pid.group(1), lat, lon, f"{name.group(1) if name else pid.group(1)}, {region.group(1) if region else ''}"))
    return out


def cell(lat, lon):
    return f'{math.floor((lat + 90) / 0.5)},{math.floor((lon % 360) / 0.5)}'


def gdhy_series(folder, crop, lat, lon):
    years, vals = [], []
    for y in range(1981, 2017):
        p = folder / crop / f'yield_{y}.nc4'
        if not p.exists():
            continue
        f = h5py.File(p, 'r')
        la = f['lat'][:]
        lo = f['lon'][:]
        i = int(np.argmin(abs(la - lat)))
        j = int(np.argmin(abs(lo - (lon % 360))))
        v = float(f['var'][i, j])
        if v > -1e8 and v > 0:
            years.append(y)
            vals.append(round(v, 3))
    return years, vals


def magyp(csv_path, province, department):
    rows = {}
    with open(csv_path, encoding='utf-8', errors='replace') as f:
        for r in csv.DictReader(f):
            if r['provincia'] != province or r['departamento'] != department or r['cultivo'] not in MAGYP:
                continue
            try:
                y = float(r['rendimiento_kgxha'])
            except ValueError:
                continue
            if y <= 0:
                continue
            # campaign 2022/2023 → harvested in 2023 (summer crops) or Dec 2022–Jan 2023 (wheat); Zixtaro's
            # southern-hemisphere seasons end in the second calendar year for all of them
            harvest = int(r['campania'][:4]) + 1
            rows.setdefault(MAGYP[r['cultivo']], {})[harvest] = round(y / 1000, 3)
    return {c: (sorted(s), [s[y] for y in sorted(s)]) for c, s in rows.items()}


def main(gdhy_dir, magyp_csv=None):
    folder = pathlib.Path(gdhy_dir)
    index = []
    for pid, lat, lon, label in presets():
        out = {'id': pid, 'lat': lat, 'lon': lon, 'sources': [], 'crops': {}}
        if pid in DEPARTMENTS and magyp_csv:
            prov, dept = DEPARTMENTS[pid]
            out['sources'].append({
                'name': 'Argentina MAGyP · Estimaciones agrícolas',
                'scale': f'{dept} department, {prov} (official estimates)',
                'url': 'https://datos.magyp.gob.ar/dataset/estimaciones-agricolas',
            })
            for crop, (ys, vs) in magyp(magyp_csv, prov, dept).items():
                out['crops'][crop] = {'src': 0, 'years': ys, 't': vs}
        g = len(out['sources'])
        added = False
        for crop, folder_name in GDHY.items():
            if crop in out['crops']:
                continue
            ys, vs = gdhy_series(folder, folder_name, lat, lon)
            if len(ys) >= 15:
                out['crops'][crop] = {'src': g, 'years': ys, 't': vs}
                added = True
        if added:
            out['sources'].append({
                'name': 'GDHY v1.2+v1.3 (Iizumi & Sakai 2020)',
                'scale': '0.5° grid cell, from agricultural census statistics',
                'url': 'https://doi.org/10.1594/PANGAEA.909132',
            })
        if not out['crops']:
            print(f'  {pid}: no yields')
            continue
        (OUT / f'{pid}.json').write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
        index.append({'id': pid, 'cell': cell(lat, lon), 'label': label})
        print(f"  {pid}: " + ', '.join(f"{c} {len(v['years'])}y" for c, v in out['crops'].items()))
    (OUT / 'index.json').write_text(json.dumps({'cellSize': 0.5, 'cells': index}, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main(*sys.argv[1:])

"""Lithuania's soil evaluation, summed to municipalities: src/data/lithuania/regions.json.

Source: Dirv_DR10LT evaluation layers (VERTINIMAS, VIETOVE), Zemes ukio duomenu centras, distributed by geoportal.lt:
  https://www.geoportal.lt/download/opendata/Dirv_vert_DR10LT/DIRV_vert.zip   (6.7 GB; holds DIRV_vert_shp.zip)
The archive carries no licence file and its metadata names none. See THIRD_PARTY.md before shipping what this writes.

  python -I scripts/lt-soil-regions.py <path to DIRV_vert_shp.zip>

Reads the ten county tables straight out of the zip (nothing is unpacked), keeps no geometry, and writes one row per
municipality. Every share is by polygon area. Class codes (pH, P2O5, K2O, humus, drainage, texture) are passed
through exactly as the dataset writes them: this script does not interpret them.
"""
import json, math, re, struct, sys, zipfile
from collections import defaultdict

SRC = sys.argv[1]
OUT = 'src/data/lithuania/regions.json'
CLASS_FIELDS = ['pH_I', 'P2O5', 'K2O', 'Humusas', 'DREKINAM', 'TIPAS', 'BUKLE']


def dbf(fh):
    """Yield one dict per record of a dBase table, strings stripped."""
    head = fh.read(32)
    n, hlen, rlen = struct.unpack('<IHH', head[4:12])
    desc, fields = fh.read(hlen - 32), []
    for i in range(0, len(desc) - 31, 32):
        d = desc[i:i + 32]
        if d[0] == 0x0D:
            break
        fields.append((d[:11].split(b'\0')[0].decode(), d[16]))
    spans, off = {}, 1
    for name, ln in fields:
        spans[name] = (off, off + ln); off += ln
    block = rlen * 4096
    left = n
    while left > 0:
        buf = fh.read(min(block, left * rlen))
        if not buf:
            break
        for i in range(0, len(buf) - rlen + 1, rlen):
            if buf[i] == 0x2A:  # deleted
                continue
            yield spans, buf[i:i + rlen]
        left -= len(buf) // rlen


def text(spans, rec, name):
    a, b = spans[name]
    return rec[a:b].decode('utf-8', 'replace').strip()


def num(spans, rec, name):
    try:
        return float(text(spans, rec, name))
    except ValueError:
        return -1.0


def lks94_to_wgs84(e, n):
    """LKS-94 (transverse Mercator on GRS80, central meridian 24 E, scale 0.9998) to degrees."""
    a, f, k0, lon0, fe = 6378137.0, 1 / 298.257222101, 0.9998, math.radians(24), 500000.0
    e2 = f * (2 - f)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    m = n / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    p1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
          + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    ep2 = e2 / (1 - e2)
    c1, t1 = ep2 * math.cos(p1) ** 2, math.tan(p1) ** 2
    n1 = a / math.sqrt(1 - e2 * math.sin(p1) ** 2)
    r1 = a * (1 - e2) / (1 - e2 * math.sin(p1) ** 2) ** 1.5
    d = (e - fe) / (n1 * k0)
    lat = p1 - (n1 * math.tan(p1) / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
                                           + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon = lon0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6
                  + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(p1)
    return round(math.degrees(lat), 4), round(math.degrees(lon), 4)


def key(name):
    """A municipality's name as both layers can agree on it: one space, no trailing dot."""
    return ' '.join(name.split()).rstrip('. ')


def shares(counter, total, keep=8):
    rows = sorted(counter.items(), key=lambda kv: -kv[1])[:keep]
    return {k: round(v / total, 4) for k, v in rows if total > 0 and v / total >= 0.0005}


z = zipfile.ZipFile(SRC)
names = z.namelist()

# Municipality outlines: only their bounding boxes are read, for a centre point.
centre = {}
if 'vietove_sav.shp' in names:
    shp = z.read('vietove_sav.shp')
    recs = list(dbf(z.open('vietove_sav.dbf')))
    pos, i = 100, 0
    while pos < len(shp) and i < len(recs):
        clen = struct.unpack('>i', shp[pos + 4:pos + 8])[0] * 2
        x0, y0, x1, y1 = struct.unpack('<4d', shp[pos + 12:pos + 44])
        spans, rec = recs[i]
        label = next((text(spans, rec, k) for k in spans if k.upper().startswith('SAV')), '')
        if label:
            centre[key(label)] = lks94_to_wgs84((x0 + x1) / 2, (y0 + y1) / 2)
        pos += 8 + clen; i += 1

acc = defaultdict(lambda: {'area': 0.0, 'scored': 0.0, 'score': 0.0, 'base': 0.0, 'county': defaultdict(float), 'meta': '',
                           'climate': 0.0, 'cls': {f: defaultdict(float) for f in CLASS_FIELDS},
                           'known': {f: 0.0 for f in CLASS_FIELDS}, 'soil': defaultdict(float),
                           'top': defaultdict(float), 'sub': defaultdict(float), 'typed': 0.0})
for name in sorted(n for n in names if n.startswith('vertinimas_') and n.endswith('.dbf')):
    county = name[len('vertinimas_'):-len('_apskritis.dbf')]
    count = 0
    with z.open(name) as fh:
        for spans, rec in dbf(fh):
            count += 1
            area = num(spans, rec, 'Shape_Area')
            sav = text(spans, rec, 'SAVIVALDYB')
            if area <= 0 or not sav:
                continue
            r = acc[sav]
            r['area'] += area; r['county'][county] += area
            r['climate'] += area * max(num(spans, rec, 'KLIMATO_K'), 0)
            r['meta'] = max(r['meta'], text(spans, rec, 'META'))
            score = num(spans, rec, 'BALAS')
            if score > 0:
                r['scored'] += area; r['score'] += area * score
                r['base'] += area * max(num(spans, rec, 'BAZ_BALAS'), 0)
            for f in CLASS_FIELDS:
                v = text(spans, rec, f)
                if v and v != '-1':
                    r['cls'][f][v] += area; r['known'][f] += area
            # Main soil component, e.g. "RDg8-k2/sp/sp": type / topsoil texture / subsoil texture.
            parts = text(spans, rec, 'SNS_KOM1_T').split('/')
            if parts[0]:
                r['typed'] += area
                m = re.match(r'[A-Z]+', parts[0])
                r['soil'][m.group(0) if m else parts[0]] += area
                if len(parts) > 1 and parts[1]:
                    r['top'][parts[1]] += area
                if len(parts) > 2 and parts[2]:
                    r['sub'][parts[2]] += area
    print(f'{county}: {count} polygons', file=sys.stderr)

regions = []
for sav, r in sorted(acc.items()):
    lat, lon = centre.get(key(sav), (None, None))
    regions.append({
        'name': sav, 'county': max(r['county'], key=r['county'].get), 'lat': lat, 'lon': lon,
        'areaKha': round(r['area'] / 1e7, 2),
        'scoredKha': round(r['scored'] / 1e7, 2),
        'productivityScore': round(r['score'] / r['scored'], 1) if r['scored'] else None,
        'baseScore': round(r['base'] / r['scored'], 1) if r['scored'] else None,
        'climateFactor': round(r['climate'] / r['area'], 3),
        'soilGroup': shares(r['soil'], r['typed']),
        'topsoilTexture': shares(r['top'], r['typed']),
        'subsoilTexture': shares(r['sub'], r['typed']),
        'pH': shares(r['cls']['pH_I'], r['known']['pH_I']),
        'P2O5': shares(r['cls']['P2O5'], r['known']['P2O5']),
        'K2O': shares(r['cls']['K2O'], r['known']['K2O']),
        'humus': shares(r['cls']['Humusas'], r['known']['Humusas']),
        'DREKINAM': {k: round(v / r['area'], 4) for k, v in sorted(r['cls']['DREKINAM'].items())},
        'TIPAS': {k: round(v / r['area'], 4) for k, v in sorted(r['cls']['TIPAS'].items())},
        'BUKLE': {k: round(v / r['area'], 4) for k, v in sorted(r['cls']['BUKLE'].items())},
        'surveyed': r['meta'],
    })

import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({
    'source': 'Dirv_DR10LT evaluation layers (VERTINIMAS), Zemes ukio duomenu centras, via geoportal.lt',
    'url': 'https://www.geoportal.lt/download/opendata/Dirv_vert_DR10LT/DIRV_vert.zip',
    'licence': 'none stated in the archive or its metadata',
    'note': 'Area-weighted per municipality. Class codes are the dataset\'s own, not interpreted. DREKINAM, TIPAS and BUKLE are source fields, as shares of all area.',
    'regions': regions,
}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(regions)} municipalities -> {OUT}', file=sys.stderr)

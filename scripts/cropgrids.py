"""What farms actually grow, everywhere: CROPGRIDS 2020 harvested areas folded into a compact 0.5° grid.

CROPGRIDS (Tang et al. 2024, Scientific Data 11:413; v2 on figshare, CC BY 4.0) maps the harvested area of 173
crops around 2020 at 0.05°. Zixtaro uses it two ways:
  * the reality check — does the ranking put what a region really grows near the top? (scripts/reality)
  * "what's grown around here" next to every plan, so a recommendation is always read against local practice

  python3 scripts/cropgrids.py path/to/CG-HA        # the unzipped CG-HA folder (figshare file 56138933, 225 MB)

Writes public/data/crops/grid.bin + grid.json (the crop list). Needs numpy and tifffile (+ imagecodecs).
Binary layout, little-endian, one record per cropland cell (total harvested area ≥ 0.5 % of the cell):
  u16 row, u16 col (0.5° grid from 90° N / 180° W), u16 total (km², capped), u8 n, n × (u8 crop, u8 share %)
"""

import json
import pathlib
import struct
import sys

import numpy as np
import tifffile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'data' / 'crops'
OUT.mkdir(parents=True, exist_ok=True)

# Zixtaro crop → CROPGRIDS layers (harvested area, same unit everywhere, so shares are exact)
CROPS = {
    'wheat': ['wheat'], 'barley': ['barley'], 'rye': ['rye'], 'maize': ['maize'], 'sorghum': ['sorghum'],
    'sunflower': ['sunflower'], 'rapeseed': ['rapeseed', 'mustard'], 'soybean': ['soybean'], 'pea': ['pea'],
    'lupin': ['lupin'], 'sugarbeet': ['sugarbeet'], 'potato': ['potato'], 'clover': ['clover', 'alfalfa'],
    'oats': ['oats'], 'triticale': ['triticale'], 'faba': ['broadbean'], 'lentil': ['lentil'], 'chickpea': ['chickpea'],
    'buckwheat': ['buckwheat'], 'millet': ['millet'], 'linseed': ['linseed'],
    # crops Zixtaro does not model (yet) — kept so a region's reality is complete
    'rice': ['rice'], 'cotton': ['cotton'], 'sugarcane': ['sugarcane'], 'groundnut': ['groundnut'], 'bean': ['bean'],
    'cassava': ['cassava'], 'pigeonpea': ['pigeonpea'], 'cowpea': ['cowpea'], 'sesame': ['sesame'], 'oilpalm': ['oilpalm'],
    'coffee': ['coffee'], 'cocoa': ['cocoa'],
    # other vegetables (the six largest have layers of their own below)
    'vegetables': ['cucumberetc', 'lettuce', 'vegetablenes', 'eggplant', 'garlic', 'pumpkinetc', 'cauliflower', 'carrot',
                   'spinach', 'asparagus', 'greenonion', 'artichoke', 'melonetc', 'greenpea', 'greenbean', 'greencorn',
                   'stringbean', 'greenbroad', 'mushroom', 'chicory'],
    # appended so the indices above never move: sweet potato is a model crop but had no layer here,
    # so every cell growing it read as "not grown" in the validation (the test pool's membership stays on
    # the 34 crops above, so earlier seeded draws reproduce exactly)
    'sweetpotato': ['sweetpotato'],
    # added (all-crops plan): every remaining layer, so the truth knows what a cell grows even where the
    # model has no crop for it
    'tomato': ['tomato'], 'onion': ['onion'], 'cabbage': ['cabbage'], 'chilli': ['chilleetc', 'pimento'],
    'watermelon': ['watermelon'], 'okra': ['okra'],
    'yam': ['yam'], 'tobacco': ['tobacco'], 'safflower': ['safflower'], 'castor': ['castor'], 'jute': ['jute', 'jutelikefiber'],
    'fonio': ['fonio'], 'quinoa': ['quinoa'], 'taro': ['taro', 'yautia'], 'bambara': ['bambara'], 'vetch': ['vetch'],
    'silagemaize': ['maizefor'], 'grassley': ['mixedgrass', 'grassnes'], 'foragesorghum': ['sorghumfor'],
    'forage': ['fornes', 'vegfor', 'oilseedfor', 'ryefor', 'beetfor', 'turnipfor', 'swedefor', 'cabbagefor', 'carrotfor'],
    'trees': ['rubber', 'olive', 'coconut', 'grape', 'mango', 'tea', 'banana', 'plantain', 'fruitnes', 'apple', 'orange',
              'tropicalnes', 'tangetc', 'plum', 'almond', 'peachetc', 'citrusnes', 'lemonlime', 'areca', 'pear', 'date',
              'pineapple', 'walnut', 'hazelnut', 'persimmon', 'nutnes', 'pistachio', 'avocado', 'clove', 'karite', 'pepper',
              'chestnut', 'kolanut', 'apricot', 'papaya', 'nutmeg', 'cashewapple', 'cherry', 'strawberry', 'grapefruit',
              'cinnamon', 'mate', 'carob', 'fig', 'sourcherry', 'kapokfiber', 'kapokseed', 'tung', 'abaca', 'currant',
              'rasberry', 'berrynes', 'blueberry', 'kiwi', 'vanilla', 'quince', 'hop', 'gooseberry', 'stonefruit', 'agave',
              'cranberry', 'peppermint', 'pyrethrum', 'brazil', 'sisal', 'ramie'],
    'otherannual': ['cerealnes', 'mixedgrain', 'pulsenes', 'legumenes', 'rootnes', 'oilseednes', 'spicenes', 'aniseetc',
                    'melonseed', 'canaryseed', 'flax', 'hemp', 'hempseed', 'poppy', 'ginger', 'sugarnes', 'popcorn'],
}
IDS = list(CROPS)


def block_sum(a: np.ndarray) -> np.ndarray:
    a = np.nan_to_num(a, nan=0.0)
    a[a < 0] = 0
    return a.reshape(360, 10, 720, 10).sum(axis=(1, 3))


def main(folder: str):
    src = pathlib.Path(folder)
    files = sorted(src.glob('2020_*.tif'))
    if not files:
        sys.exit(f'no CROPGRIDS tifs in {src}')
    names = {f.stem.split('2020_')[1] for f in files}
    claimed = [n for ns in CROPS.values() for n in ns]
    assert len(claimed) == len(set(claimed)), 'a CROPGRIDS layer is mapped twice'
    assert names <= set(claimed), f'unmapped CROPGRIDS layers: {sorted(names - set(claimed))}'
    total = np.zeros((360, 720))
    per = {k: np.zeros((360, 720)) for k in IDS}
    layer_of = {n: k for k, ns in CROPS.items() for n in ns}
    for i, f in enumerate(files):
        name = f.stem.split('2020_')[1]
        a = block_sum(tifffile.imread(f).astype(np.float64))
        total += a
        if name in layer_of:
            per[layer_of[name]] += a
        if i % 20 == 0:
            print(f'  {i + 1}/{len(files)} {name}')
    # cells: 0.5° ≈ 3,000 km² at mid-latitudes; keep those with ≥ 0.5 % harvested
    lat_c = 90 - (np.arange(360) + 0.5) * 0.5
    cell_km2 = (111.32 * 0.5) ** 2 * np.cos(np.radians(lat_c))[:, None] * np.ones((1, 720))
    keep = total >= 0.005 * cell_km2
    buf = bytearray()
    n_cells = 0
    for r, c in zip(*np.nonzero(keep)):
        t = total[r, c]
        shares = [(k, per[IDS[k]][r, c] / t) for k in range(len(IDS))]
        shares = [(k, s) for k, s in shares if s >= 0.01]
        shares.sort(key=lambda x: -x[1])
        buf += struct.pack('<HHHB', r, c, int(min(65535, round(t))), len(shares))
        for k, s in shares:
            buf += struct.pack('<BB', k, int(min(100, round(s * 100))))
        n_cells += 1
    (OUT / 'grid.bin').write_bytes(bytes(buf))
    (OUT / 'grid.json').write_text(json.dumps({
        'crops': IDS,
        'cells': n_cells,
        'd': 0.5,
        'source': 'CROPGRIDS v2 (Tang et al. 2024), harvested area around 2020, 173 crops at 0.05°, CC BY 4.0',
        'url': 'https://doi.org/10.6084/m9.figshare.29532806',
        'layout': 'u16 row, u16 col, u16 total km², u8 n, n × (u8 crop, u8 share %) — rows from 90° N, cols from 180° W',
    }, indent=1))
    print(f'  {n_cells} cropland cells, {len(buf) / 1e6:.2f} MB')


if __name__ == '__main__':
    main(sys.argv[1])

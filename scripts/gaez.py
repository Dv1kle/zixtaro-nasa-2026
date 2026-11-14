"""Transcribe the FAO/IIASA GAEZ v4 soil-requirement tables the crop model uses → src/lib/gaez-tables.ts

Source: Fischer, G. et al. (2021). Global Agro-Ecological Zones v4 – Model documentation, appendices
(GAEZ4_Appendices.xlsx), Table A6-3.1 (chemical soil characteristics: pH) and Table A6-3.2 (soil texture ratings),
rain-fed crops. Run:  python3 scripts/gaez.py [path/to/GAEZ4_Appendices.xlsx]   (downloads it when no path is given)
Needs openpyxl.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

import openpyxl

URL = 'https://s3.eu-west-1.amazonaws.com/data.gaezdev.aws.fao.org/documentation/GAEZ4_Appendices.xlsx'
CROPS = [
    'Wheat', 'Wetland Rice', 'Dryland Rice', 'Maize', 'Barley', 'Sorghum', 'Rye', 'Pearl Millet', 'Foxtail Millet', 'Oat',
    'Buckwheat', 'White Potato', 'Sweet Potato', 'Cassava', 'Sugar Beet', 'Phaseolus Bean', 'Chickpea', 'Cowpea', 'Dry Pea',
    'Gram', 'Pigeonpea', 'Groundnut', 'Soybean', 'Sunflower', 'Rape', 'Cotton', 'Flax', 'Pasture Legume', 'Sugarcane',
    # the all-crops plan: the added crops GAEZ v4 rates itself
    'White Yam', 'Cocoyam', 'Tobacco', 'Tomato', 'Onion', 'Cabbage', 'Grass', 'Sorghum Biomass',
]
# A4-6.1 cultivar groups whose heat-unit requirements the crop model uses (sum of daily mean temperature over the cycle)
HEAT_GROUPS = [
    'Maize (temperate and subtropical cultivars', 'Maize (tropical lowland  cultivars)', 'Sorghum (temperate and subtropical cultiva',
    'Sorghum (tropical lowland  cultivars)', 'Soybean (temperate and subtropical cultiva', 'Soybean (tropical and subtropical cultivar',
    'Sunflower (temperate and subtropical culti', 'Chickpea', 'Dry pea', 'Buckwheat', 'White potato', 'Sugar beet', 'Spring oat', 'Flax',
    'Groundnut', 'Cowpea', 'Phaseolus bean (temperate and subtropical', 'Phaseolus bean (tropical lowland  cultivar',
    'Cotton (temperate and subtropical cultivar', 'Cotton (tropical cultivars)', 'Japonica wetland rice', 'Indica wetland rice',
    'Cassava', 'Sweet potato', 'Pearl millet', 'Sugarcane',
    # the all-crops plan; hibernating onions (two-part cycles) are skipped below as before
    'White yam', 'Cocoyam', 'Pigeon pea', 'Cabbage', 'Tobacco (temperate and subtropical cultivars)', 'Tobacco (tropical cultivars)',
    'Tomato (temperate and subtropical cultivars)', 'Tomato (tropical and subtropical cultivars)',
    'Onion (temperate and subtropical cultivars)', 'Onion (tropical cultivars)',
    'Biomass sorghum (temperate and subtropical cu', 'Biomass sorghum (tropical lowland cultivars)',
    # wheat, barley and rapeseed's own rows (spring oat's stood in for them); winter-type rows (35+105 …) skipped
    'Spring wheat', 'Wheat (tropical highland cultivars)', 'Spring barley', 'Barley (tropical highland cultivars)',
    'Spring rape', 'Rabi rape',
    # GAEZ's own silage maize (whole plant at about 30-35 % dry matter) - maize's silage form where the
    # summers are too cool to ripen grain (Danish maize, experiment H4)
    'Silage maize (temperate and subtropical cultivars)',
]
TEXTURES = ['clay (heavy)', 'silty clay', 'clay (light)', 'silty clay loam', 'clay loam', 'silt', 'silt loam', 'sandy clay',
            'loam', 'sandy clay loam', 'sandy loam', 'loamy sand', 'sand']


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/tmp/GAEZ4_Appendices.xlsx')
    if not path.exists():
        urllib.request.urlretrieve(URL, path)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

    ph = {}
    for r in wb['A6-3.1'].iter_rows(min_row=8, values_only=True):
        if r[2] is None or str(r[2]).strip() not in CROPS:
            continue
        name = str(r[2]).strip()
        # columns: acid thresholds for ratings 100/90/70/50/30/10 (high input), then alkaline (999 = not applicable)
        ph[name] = {'acid': list(r[15:21]), 'alk': list(r[27:33])}

    tex = {}
    for r in wb['A6-3.2'].iter_rows(min_row=7, values_only=True):
        if r[2] is None or str(r[2]).strip() not in CROPS:
            continue
        name = str(r[2]).strip()
        # SQ3 rooting conditions (all input levels), SQ7 workability (high), SQ2 nutrient retention (high)
        tex[name] = {'rooting': list(r[16:29]), 'workability': list(r[42:55]), 'retention': list(r[55:68])}

    heat = {}
    for r in wb['A4-6.1'].iter_rows(min_row=4, values_only=True):
        # the source spells some names with doubled spaces or a stray bracket ('Onion  (…', 'Onion) (tropical…')
        name = re.sub(r'\s+', ' ', str(r[2] or '').replace(')', '')).strip()
        group = next((g for g in HEAT_GROUPS if name.startswith(re.sub(r'\s+', ' ', g).rstrip(')'))), None)
        if not group or '+' in str(r[3]):
            continue
        key = group.split(' (')[0] + (' tropical highland' if 'highland' in group else ' tropical' if 'tropical' in group and 'temperate' not in group else '')
        heat.setdefault(key, []).append({'days': int(str(r[3]).strip()), 'tmin': r[20], 'hu': [r[27], r[28], r[29], r[30]]})

    missing = [c for c in CROPS if c not in ph or c not in tex]
    if missing:
        raise SystemExit(f'not found: {missing}')

    out = Path(__file__).resolve().parent.parent / 'src/lib/gaez-tables.ts'
    lines = [
        '// Generated by scripts/gaez.py from the FAO/IIASA GAEZ v4 appendices (GAEZ4_Appendices.xlsx) - do not edit by hand.',
        f'// {URL}',
        '// Table A6-3.1: soil pH (H2O) at which a rain-fed crop under high inputs reaches 100, 90, 70, 50, 30 and 10 % of its',
        '//   yield potential - acid side (falling pH) and alkaline side (rising pH); 999 in the source = not applicable (dropped).',
        '// Table A6-3.2: texture ratings (% of yield potential) by USDA class - SQ3 rooting conditions, SQ7 workability and',
        '//   SQ2 nutrient retention, high inputs.',
        '',
        f'export const GAEZ_TEXTURES = {json.dumps(TEXTURES)} as const',
        'export type GaezTexture = (typeof GAEZ_TEXTURES)[number]',
        'export type GaezPh = { acid: number[]; alk: number[] }',
        'export type GaezTexture3 = { rooting: number[]; workability: number[]; retention: number[] }',
        '',
        'export const GAEZ_PH: Record<string, GaezPh> = {',
    ]
    for c in CROPS:
        acid = [v for v in ph[c]['acid'] if v != 999]
        alk = [v for v in ph[c]['alk'] if v != 999]
        lines.append(f"  '{c}': {{ acid: {json.dumps(acid)}, alk: {json.dumps(alk)} }},")
    lines += ['}', '', '/** Ratings in the order of GAEZ_TEXTURES. */', 'export const GAEZ_TEXTURE: Record<string, GaezTexture3> = {']
    for c in CROPS:
        t = tex[c]
        lines.append(f"  '{c}': {{ rooting: {json.dumps(t['rooting'])}, workability: {json.dumps(t['workability'])}, retention: {json.dumps(t['retention'])} }},")
    lines += ['}', '']
    lines += [
        '/**',
        ' * Table A4-6.1: accumulated heat units (Σ daily mean temperature, °C·d) a cultivar with a `days`-long cycle needs -',
        ' * [lower limit, lower optimum, upper optimum, upper limit] - and its minimum temperature for growth (°C).',
        ' */',
        'export const GAEZ_HEAT: Record<string, { days: number; tmin: number; hu: [number, number, number, number] }[]> = {',
    ]
    for k, rows in heat.items():
        lines.append(f"  '{k}': {json.dumps(rows)},")
    lines += ['}', '']
    out.write_text('\n'.join(lines))
    print(f'wrote {out} ({len(CROPS)} crops)')


if __name__ == '__main__':
    main()

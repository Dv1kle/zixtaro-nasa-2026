# Shrink the FAOSTAT bulk CSVs (prices 0.2 GB, production 0.5 GB, trade 2.4 GB) to the items Zixtaro prices, as one
# small JSON the market bake reads. Run from the repo root after the zips are in node_modules/.cache/markets
# (scripts/markets.mjs downloads and unpacks them): python3 scripts/markets_fao.py
import csv, json, sys
from collections import defaultdict

C = 'node_modules/.cache/markets/'
items = json.load(sys.stdin)  # {"price": [...], "trade": [...], "prod": [...]} item names wanted in each file
PRICE_YEARS = set(str(y) for y in range(2015, 2025))
TRADE_YEARS = set(str(y) for y in range(2019, 2024))

def m49(r):
    return r['Area Code (M49)'].lstrip("'")

# USD where FAOSTAT converted it; many countries stop reporting USD after 2017 but keep local currency (LCU),
# which the bake converts at the World Bank's annual rate
prices = defaultdict(lambda: defaultdict(dict))
lcu = defaultdict(lambda: defaultdict(dict))
want = set(items['price'])
# India and ~20 other countries stopped publishing price levels years ago but still publish the producer price index
# (2014-2016 = 100, local currency): their level is chained from the last published level year by the index
lcu_all = defaultdict(lambda: defaultdict(dict))
index = defaultdict(lambda: defaultdict(dict))
for r in csv.DictReader(open(C + 'Prices_E_All_Data_(Normalized).csv', encoding='latin1')):
    if r['Item'] in want and r['Months'] == 'Annual value' and r['Value']:
        if r['Element'] == 'Producer Price (USD/tonne)' and r['Year'] in PRICE_YEARS:
            prices[m49(r)][r['Item']][r['Year']] = float(r['Value'])
        elif r['Element'] == 'Producer Price (LCU/tonne)':
            lcu_all[m49(r)][r['Item']][r['Year']] = float(r['Value'])
        elif r['Element'].startswith('Producer Price Index'):
            index[m49(r)][r['Item']][r['Year']] = float(r['Value'])
chained = 0
for m in set(lcu_all) | set(index):
    for item in set(lcu_all[m]) | set(index[m]):
        lv, ix = lcu_all[m][item], index[m][item]
        for y in PRICE_YEARS:
            if y in lv:
                lcu[m][item][y] = lv[y]
                continue
            base = max((b for b in lv if b in ix and ix[b] > 0), default=None, key=int)
            if base and y in ix:
                lcu[m][item][y] = lv[base] * ix[y] / ix[base]
                chained += 1
print(f'{chained} country-crop-years chained from the price index')

prod = defaultdict(lambda: defaultdict(float))
# observed yield (kg/ha → t/ha) and harvested area (ha), each averaged over the years reported in 2019-2023
yld = defaultdict(lambda: defaultdict(list))
area = defaultdict(lambda: defaultdict(list))
want = set(items['prod'])
for r in csv.DictReader(open(C + 'Production_Crops_Livestock_E_All_Data_(Normalized).csv', encoding='latin1')):
    if r['Item'] in want and r['Year'] in TRADE_YEARS and r['Value']:
        if r['Element'] == 'Production':
            prod[m49(r)][r['Item']] += float(r['Value']) / len(TRADE_YEARS)
        elif r['Element'] == 'Yield' and r['Unit'] == 'kg/ha':
            yld[m49(r)][r['Item']].append(float(r['Value']) / 1000)
        elif r['Element'] == 'Area harvested':
            area[m49(r)][r['Item']].append(float(r['Value']))
mean = lambda xs: sum(xs) / len(xs)
yields = {m: {i: [round(mean(v), 2), round(mean(area[m][i])) if area[m][i] else 0] for i, v in it.items() if v} for m, it in yld.items()}

trade = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))
want = set(items['trade'])
for r in csv.DictReader(open(C + 'Trade_CropsLivestock_E_All_Data_(Normalized).csv', encoding='latin1')):
    e = r['Element']
    if (e == 'Import quantity' or e == 'Export quantity') and r['Item'] in want and r['Year'] in TRADE_YEARS and r['Value']:
        trade[m49(r)][r['Item']][0 if e == 'Import quantity' else 1] += float(r['Value']) / len(TRADE_YEARS)

json.dump({'prices': prices, 'lcu': lcu, 'prod': prod, 'trade': trade, 'yields': yields}, open(C + 'fao.json', 'w'))
print(f'fao.json: {len(prices)} areas with USD prices, {len(lcu)} with LCU, {len(prod)} with production, {len(trade)} with trade')

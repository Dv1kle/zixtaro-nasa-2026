# Which FAOSTAT producer-price years are official levels (USD or local currency per tonne published for that year) and
# which the market bake chains from the producer price index (an estimate): node_modules/.cache/markets/official.json,
# {M49: {item: [years]}}, read by scripts/markets-clean.mjs. Run from the repo root: python3 scripts/markets_official.py
import csv, json
from collections import defaultdict

C = 'node_modules/.cache/markets/'
out = defaultdict(lambda: defaultdict(set))
for r in csv.DictReader(open(C + 'Prices_E_All_Data_(Normalized).csv', encoding='latin1')):
    if r['Months'] == 'Annual value' and r['Value'] and r['Element'] in ('Producer Price (USD/tonne)', 'Producer Price (LCU/tonne)') and '2015' <= r['Year'] <= '2024':
        out[r['Area Code (M49)'].lstrip("'")][r['Item']].add(int(r['Year']))
json.dump({m: {i: sorted(y) for i, y in it.items()} for m, it in out.items()}, open(C + 'official.json', 'w'))
print(f'official.json: {len(out)} areas')

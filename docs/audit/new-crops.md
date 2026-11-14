# New crop parameters (sourced table)

Companion to `new-crops.json` (same values, same source strings). Nothing under `src/` or `scripts/` was changed.

**Used with corrections** (kept here as delivered; the generator `scripts/crops-extra.mjs` applies them,
each against its source): watermelon Ky 0.85 → 1.1 (FAO-66 Table 1
reproduces FAO-33); tobacco, okra and grass Ky marked assumed (not in that table); sugarcane residue dry matter 1 → 0.3
(the yield is fresh cane); yam stage lengths scaled to GAEZ v4's 225-day white-yam cycle; GAEZ v4's own soil and
heat-unit rows replace the stand-ins for yam, taro (cocoyam), pigeon pea, tobacco, tomato, onion, cabbage, forage
sorghum and grass; prices and yields are not this table's but FAOSTAT's on the older crops' reference basis, costs
moved into the older crops' cost-share range where outside it.

Verification status: FAO-56 Tables 11, 12 and 22 were fetched live from fao.org and read directly. Everything else is marked: values labelled `assumed:` are judgement; FAO-33 Ky values, IPCC residue classes, FAOSTAT item codes and the cited stress-temperature papers are **recalled from memory and not re-verified this session**. No prices were pulled from FAOSTAT (no 2019-2023 series was fetched); all `econ` numbers are order-of-magnitude assumptions.


## sesame

| field | value | source |
|---|---|---|
| latin / family / group | Sesamum indicum / pedaliaceae / oilseed | taxonomy |
| fao.sow | [6, 1] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Sesame row: 20/30/40/20 = 110 d, June, China (sowing date taken from the row) |
| fao.days | [20, 30, 40, 20] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Sesame row, China |
| fao.kc | [0.35, 1.1, 0.25] | FAO-56 Table 12 (fetched), Oil crops group Kc ini 0.35; Sesame Kc mid 1.10, Kc end 0.25 |
| rootDepth | 1.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Sesame 1.0-1.5 m (upper) |
| p | 0.6 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Sesame p 0.60 |
| ky (assumed) | 0.9 | assumed: not tabulated in FAO-33/FAO-66 for sesame; 0.9 as typical oilseed value |
| heatMonthOffset | 2 | assumed: flowering starts around day 50 (end of development stage), ~2 months |
| tMax | 36 | assumed: sesame optimum 25-35 C (ECOCROP), mean Tmax limit set 1 C above |
| tCrit | 40 | assumed: extension/review literature report capsule/flower loss above ~40 C; not re-verified |
| minSowT | 18 | assumed: ECOCROP/extension: sow into soil >= 18-20 C |
| frostTender | True | sesame is killed by frost (ECOCROP) |
| nFix | 0 | assumed: non-legume |
| nDemand | 60 | assumed: extension ranges 40-80 kg N/ha |
| carbon | 0.3 | assumed: proxy 'grains' residue class; stalks are woody |
| N_RESIDUAL | 30 | assumed: by analogy with sunflower/linseed 35-40, slightly lower |
| coverGap | 0.5 | assumed: slow canopy closure, 6 weeks of open soil |
| minBreak / maxRun | 3 / 1 | assumed: soil-borne Fusarium wilt/Phytophthora blight, extension rule of 3 years |
| diseases | Fusarium wilt, Phytophthora blight, Macrophomina charcoal rot | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 1.2 | assumed: attainable under good management 1.0-1.5 t/ha; world average ~0.5 t/ha (FAOSTAT, not re-pulled) |
| econ.price EUR/t | 1500 | assumed: EU/US import unit values 1400-1800 EUR/t, no EU/US farm-gate series; not re-verified |
| econ.cost EUR/ha | 700 | assumed: input + harvest labour estimate |
| gaez | {"phGroup": {"reuse": "Sunflower"}, "textureGroup": {"reuse": "Sunflower"}, "heat": {"reuse": "Cowpea"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (oil-seed crop with similar acid/alkaline tolerance; heat rows of cowpea 80-120 d, tmin 10) |
| faostat | 289 Sesame seed | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | sesame | layer name as supplied in the brief |
| contract | True | assumed: seed buyer/crusher contract; shatter-resistant cultivar logistics |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.94, "slope": 1.09, "intercept": 0.88, "rbg": 0.22} | IPCC 2006 generic 'Grains' class used as proxy (assumed) |

**Caveats**
- No GAEZ group; sunflower pH/texture and cowpea heat are proxies.
- Ky and tCrit are assumed.

## pigeonpea

| field | value | source |
|---|---|---|
| latin / family / group | Cajanus cajan / fabaceae / legume | taxonomy |
| fao.sow | [5, 20] | assumed: tropical sowing; Central Europe too cool - reference taken as cowpea date |
| fao.days | [25, 45, 60, 40] | assumed: not in FAO-56 Table 11; medium-duration cultivar 150-180 d (ICRISAT), 170 d |
| fao.kc | [0.4, 1.15, 0.35] | FAO-56 Table 12 (fetched), Beans, dry and Pulses (legume group Kc ini 0.4; mid 1.15; end 0.35) used as analogue |
| rootDepth | 1.0 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Green Gram and Cowpeas 0.6-1.0 m (upper), analogue; true rooting deeper |
| p | 0.45 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Green Gram and Cowpeas p 0.45, analogue |
| ky (assumed) | 0.9 | assumed: not tabulated; drought-tolerant pulse |
| heatMonthOffset | 3 | assumed: flowering ~90-100 d after sowing in medium cultivars |
| tMax | 35 | assumed: literature: pod set falls above ~35 C |
| tCrit | 35 | assumed: analogue to cowpea 35 (existing T_CRIT) |
| minSowT | 18 | assumed: ECOCROP: min germination temp ~15-18 |
| frostTender | True | killed by frost |
| nFix | 40 | assumed: literature range 20-70 kg N/ha net benefit; ICRISAT figure recalled |
| nDemand | 20 | assumed: starter N only |
| carbon | 0.35 | assumed: woody stalks, deep roots |
| N_RESIDUAL | 60 | assumed: same as cowpea/drybean 60 in N_RESIDUAL |
| coverGap | 0.4 | assumed: slow early growth |
| minBreak / maxRun | 2 / 1 | assumed: Fusarium wilt/Phytophthora; rotation 2 y |
| diseases | Fusarium wilt, sterility mosaic virus, Phytophthora blight | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 1.5 | assumed: rainfed 0.8-1.0 t/ha; 1.5-2 t/ha attainable |
| econ.price EUR/t | 600 | assumed: India/Africa producer prices, not EU/US; FAOSTAT not re-pulled |
| econ.cost EUR/ha | 500 | assumed: estimate |
| gaez | {"phGroup": {"reuse": "Pigeonpea"}, "textureGroup": {"reuse": "Pigeonpea"}, "heat": {"reuse": "Cowpea"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (GAEZ has pigeonpea pH and texture; heat rows of cowpea (120 d, tmin 10) as nearest legume) |
| faostat | 197 Pigeon peas, dry | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | pigeonpea | layer name as supplied in the brief |
| contract | False | - |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.91, "slope": 0.36, "intercept": 0.68, "rbg": 0.19} | IPCC 2006 'Beans & pulses' class (same as repo PULSES) |

**Caveats**
- Does not mature in Central Europe; tropical/subtropical only.
- Table 11/12 have no row: stage lengths assumed, Kc from dry-pulse group.
- does not mature in Central Europe; tropics/subtropics only

## sugarcane

| field | value | source |
|---|---|---|
| latin / family / group | Saccharum officinarum / poaceae / sugar | taxonomy |
| fao.sow | [2, 1] | assumed: ratoon crop restarts after harvest; Feb start for NH subtropics |
| fao.days | [30, 90, 175, 70] | assumed: Table 11 ratoon rows: Low lat 25/70/135/50=280, Tropics 35/105/210/70=420; scaled to 365 d to fit the 12-month occupancy |
| fao.kc | [0.4, 1.25, 0.75] | FAO-56 Table 12 (fetched), k. Sugar Cane Kc ini 0.40, mid 1.25, end 0.75 |
| rootDepth | 2.0 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Sugar Cane 1.2-2.0 m (upper) |
| p | 0.65 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Sugar Cane p 0.65 |
| ky | 1.2 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (sugarcane 1.20) |
| heatMonthOffset | 6 | assumed: peak canopy/stem elongation ~ half-way through the 12 months |
| tMax | 38 | assumed: optimum 25-33 C (ECOCROP); growth declines above ~35 C |
| tCrit | None | null: sugarcane is harvested vegetatively, no flowering/fruit set stage matters |
| minSowT | 18 | assumed: ECOCROP/extension: ratoon sprouting and growth slow below ~15-18 C |
| frostTender | True | frost kills leaves; ratoon survives light frost, yield lost |
| nFix | 0 | assumed: non-legume |
| nDemand | 150 | assumed: extension ranges 100-200 kg N/ha, higher for ratoons |
| carbon | 0.5 | assumed: trash blanket 8-15 t DM/ha plus stubble roots; assumed |
| N_RESIDUAL | 40 | assumed: assumed |
| coverGap | 0.1 | assumed: perennial ratoon, year-round cover |
| minBreak / maxRun | 1 / 5 | assumed: 1 plant cane + up to 4 ratoons in the same field; then replant |
| diseases | ratoon stunting disease, smut, red rot, borers | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 85 | assumed: world avg ~70-75 t/ha (FAOSTAT, not re-pulled); irrigated attainable 85-100 |
| econ.price EUR/t | 35 | assumed: mill-gate cane price ~25-45 EUR/t; EU (Spain/Madeira) and US (Louisiana/Florida) tiny |
| econ.cost EUR/ha | 2500 | assumed: estimate incl. harvest, fertiliser; excludes planting stock amortised |
| gaez | {"phGroup": {"reuse": "Sugarcane"}, "textureGroup": {"reuse": "Sugarcane"}, "heat": {"reuse": "Sugarcane"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (GAEZ has sugarcane in all three tables) |
| faostat | 156 Sugar cane | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | sugarcane | layer name as supplied in the brief |
| contract | True | assumed: mill contract; 12-month occupancy, cane must be hauled <~24 h |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 1, "slope": 0.5, "intercept": 0, "rbg": 0.2} | assumed (trash+stubble); IPCC 2006 Table 11.2 lacks sugarcane |

**Caveats**
- Days are Table 11 ratoon rows scaled to 365 d (no row sums to 365). tCrit null by design (vegetative harvest).
- Mill contract essential; heat group 'Sugarcane' has one 330-d cultivar row.

## yam

| field | value | source |
|---|---|---|
| latin / family / group | Dioscorea spp. (D. rotundata, D. alata) / dioscoreaceae / root | taxonomy |
| fao.sow | [4, 15] | assumed: tropical rains; reference = cassava date in repo |
| fao.days | [30, 60, 120, 60] | assumed: not in FAO-56 Table 11; yam cycle 7-10 months, 270 d |
| fao.kc | [0.4, 1.1, 0.5] | assumed: not in FAO-56 Table 12; analogue Cassava year 2 (Kc ini 0.3, mid 1.10, end 0.50) with ini raised for staked yam |
| rootDepth | 1.0 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Cassava year 2 0.7-1.0 m (upper), analogue |
| p | 0.4 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Cassava year 2 p 0.40, analogue |
| ky (assumed) | 0.9 | assumed: not tabulated |
| heatMonthOffset | 4 | assumed: tuber bulking half-way through the cycle |
| tMax | 35 | assumed: optimum 25-30 C (ECOCROP) |
| tCrit | None | null: tuber crop, no flowering-stage limit |
| minSowT | 20 | assumed: tubers sprout poorly below ~20 C; extension |
| frostTender | True | frost kills vines |
| nFix | 0 | assumed: non-legume |
| nDemand | 80 | assumed: extension 60-100 kg N/ha, often unfertilised |
| carbon | 0.25 | assumed: vine residue only; tubers removed |
| N_RESIDUAL | 40 | assumed: by analogy with sweetpotato 40 |
| coverGap | 0.5 | assumed: slow canopy closure |
| minBreak / maxRun | 3 / 1 | assumed: anthracnose and nematodes; 3+ year rotation |
| diseases | anthracnose, yam mosaic virus, nematodes, tuber rots | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 20 | assumed: FAOSTAT world avg ~9 t/ha (rainfed, not re-pulled); staked irrigated 20-25 |
| econ.price EUR/t | 400 | assumed: West-Africa producer 250-400 USD/t; EU/US retail much higher; not re-verified |
| econ.cost EUR/ha | 2500 | assumed: estimate: seed-tuber and staking costs heavy |
| gaez | {"phGroup": {"reuse": "Sweet Potato"}, "textureGroup": {"reuse": "Sweet Potato"}, "heat": {"reuse": "Sweet potato"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (root/tuber with similar pH and texture sensitivity; heat rows of sweet potato 150-165 d, tmin 10) |
| faostat | 137 Yams | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | yam | layer name as supplied in the brief |
| contract | False | - |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.22, "slope": 0.1, "intercept": 1.06, "rbg": 0.2} | IPCC 2006 'Tubers' class proxy (same as repo TUBERS) |

**Caveats**
- Cycle, Kc and Ky are analogues (cassava year 2); low confidence.
- consider degree-day rule (gddNeed ~1800-2200 base 10 C, assumed) as for cassava

## tobacco

| field | value | source |
|---|---|---|
| latin / family / group | Nicotiana tabacum / solanaceae / stimulant | taxonomy |
| fao.sow | [5, 10] | assumed: transplant date after last frost |
| fao.days | [25, 35, 40, 30] | assumed: not in FAO-56 Table 11; 130 d from transplanting (FAO-33 growing-period range 130-160 d, recalled) |
| fao.kc | [0.6, 1.15, 0.8] | FAO-56 Table 12 (fetched), b. Solanum Family group row (ini 0.6, mid 1.15, end 0.80) applied by analogy; tobacco has no own row |
| rootDepth | 1.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Tomato 0.7-1.5 m (upper), analogue |
| p | 0.4 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Tomato p 0.40, analogue |
| ky | 0.9 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (tobacco 0.90) |
| heatMonthOffset | 2 | assumed: rapid growth and topping ~ 60 d after transplanting |
| tMax | 35 | assumed: leaf quality declines above ~35 C |
| tCrit | None | null: leaf crop, flowers are topped off |
| minSowT | 12 | assumed: extension: transplant into soil >= 12-15 C |
| frostTender | True | frost kills transplants and leaves |
| nFix | 0 | assumed: non-legume |
| nDemand | 100 | assumed: extension: flue-cured 60-120, burley 150+ kg N/ha |
| carbon | 0.3 | assumed: stalks and roots |
| N_RESIDUAL | 40 | assumed: assumed |
| coverGap | 0.5 | assumed: open soil until 4-5 weeks after transplanting |
| minBreak / maxRun | 3 / 1 | assumed: Solanaceae: black root rot, nematodes, TMV; shares hosts with potato/tomato |
| diseases | black root rot, blue mould, TMV, nematodes, bacterial wilt | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 2.5 | assumed: cured leaf 2.0-3.0 t/ha in EU and US |
| econ.price EUR/t | 3500 | assumed: EU raw-leaf contract prices ~3000-4500 EUR/t; US ~4000 USD/t; not re-verified |
| econ.cost EUR/ha | 3500 | assumed: estimate incl. curing and labour |
| gaez | {"phGroup": {"reuse": "White Potato"}, "textureGroup": {"reuse": "White Potato"}, "heat": {"reuse": "White potato"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (solanaceous leaf crop, similar acid-sensitivity; heat rows of white potato 120-150 d) |
| faostat | 826 Tobacco, unmanufactured | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | tobacco | layer name as supplied in the brief |
| contract | True | assumed: sold only under processor/auction contract; EU CAP coupled-support history |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.9, "slope": 1.0, "intercept": 0.8, "rbg": 0.2} | assumed (grain-like proxy) |

**Caveats**
- No FAO-56 row; Solanum-family group Kc used. Legal/public-health aspects outside this audit.
- legal and public-health considerations - include only if the product line is wanted

## safflower

| field | value | source |
|---|---|---|
| latin / family / group | Carthamus tinctorius / asteraceae / oilseed | taxonomy |
| fao.sow | [4, 1] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Safflower row, April, California |
| fao.days | [20, 35, 45, 25] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Safflower row 20/35/45/25 = 125 d, California |
| fao.kc | [0.35, 1.1, 0.25] | FAO-56 Table 12 (fetched), Oil crops group ini 0.35; Safflower Kc mid 1.0-1.15 (range; midpoint rounded to 1.10), Kc end 0.25 |
| rootDepth | 2.0 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Safflower 1.0-2.0 m (upper) |
| p | 0.6 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Safflower p 0.60 |
| ky | 0.8 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (safflower 0.80) |
| heatMonthOffset | 2 | assumed: flowering after ~55-60 d (end of development stage) |
| tMax | 35 | assumed: ECOCROP optimum 20-30 C; heat-tolerant, limit set at 35 |
| tCrit | 36 | assumed: literature: seed set impaired above ~35-38 C; not re-verified |
| minSowT | 5 | assumed: seeds germinate at ~5 C; rosette tolerates frost |
| frostTender | False | rosette stage hardy to about -7 C; frost matters only after stem elongation |
| nFix | 0 | assumed: non-legume |
| nDemand | 70 | assumed: extension 60-90 kg N/ha |
| carbon | 0.3 | assumed: proxy 'grains' residue |
| N_RESIDUAL | 35 | assumed: by analogy with sunflower/linseed |
| coverGap | 0.5 | assumed: slow rosette stage |
| minBreak / maxRun | 4 / 1 | assumed: shares Sclerotinia/Alternaria with sunflower and rapeseed |
| diseases | Alternaria leaf spot, Sclerotinia, Fusarium wilt, Phytophthora root rot, rust | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 2.2 | assumed: US avg ~1.5, irrigated 2.5-3 t/ha |
| econ.price EUR/t | 500 | assumed: US ~500-600 USD/t; EU none; not re-verified |
| econ.cost EUR/ha | 600 | assumed: estimate |
| gaez | {"phGroup": {"reuse": "Sunflower"}, "textureGroup": {"reuse": "Sunflower"}, "heat": {"reuse": "Sunflower"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (same family (Asteraceae) and similar oilseed requirements; sunflower heat rows 105-150 d, tmin 5) |
| faostat | 280 Safflower seed | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | safflower | layer name as supplied in the brief |
| contract | True | assumed: small market: crusher/bird-seed contract |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.92, "slope": 1.09, "intercept": 0.88, "rbg": 0.22} | IPCC 2006 generic 'Grains' proxy (assumed) |

**Caveats**
- Kc mid given as a range 1.0-1.15 in Table 12; 1.10 chosen.

## castor

| field | value | source |
|---|---|---|
| latin / family / group | Ricinus communis / euphorbiaceae / oilseed | taxonomy |
| fao.sow | [5, 1] | assumed: Table 11 gives March for semi-arid climates; temperate NH planted May |
| fao.days | [25, 40, 65, 50] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Castor beans row 25/40/65/50 = 180 d, March, (Semi) arid climates |
| fao.kc | [0.35, 1.15, 0.55] | FAO-56 Table 12 (fetched), Oil crops group ini 0.35; Castorbean Kc mid 1.15, Kc end 0.55 |
| rootDepth | 2.0 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Castorbean (Ricinus) 1.0-2.0 m (upper) |
| p | 0.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Castorbean p 0.50 |
| ky (assumed) | 0.9 | assumed: not tabulated for castor |
| heatMonthOffset | 2 | assumed: raceme initiation/flowering ~60-65 d |
| tMax | 36 | assumed: optimum 20-30 C (ECOCROP) |
| tCrit | 38 | assumed: literature: female flower loss above ~38 C; not re-verified |
| minSowT | 15 | assumed: ECOCROP min germination temperature |
| frostTender | True | frost-sensitive (killed by light frost) |
| nFix | 0 | assumed: non-legume |
| nDemand | 80 | assumed: extension 60-100 kg N/ha |
| carbon | 0.35 | assumed: large stalks and roots |
| N_RESIDUAL | 40 | assumed: assumed |
| coverGap | 0.5 | assumed: slow early growth |
| minBreak / maxRun | 3 / 1 | assumed: grey mould and Fusarium wilt; 3-year rotation |
| diseases | grey mould (Amphobotrys), Fusarium wilt, Alternaria | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 2.0 | assumed: world avg ~1.1 t/ha (FAOSTAT, not re-pulled); irrigated 2.5-3 |
| econ.price EUR/t | 550 | assumed: India producer ~600 USD/t; EU/US none; not re-verified |
| econ.cost EUR/ha | 600 | assumed: estimate |
| gaez | {"phGroup": {"reuse": "Sunflower"}, "textureGroup": {"reuse": "Sunflower"}, "heat": {"reuse": "Cowpea"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (warm-season oilseed, acid-sensitive; heat rows of cowpea 100-120 d) |
| faostat | 265 Castor oil seeds | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | castor | layer name as supplied in the brief |
| contract | True | assumed: industrial (oleochemical) contract only |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.92, "slope": 1.09, "intercept": 0.88, "rbg": 0.22} | IPCC 2006 generic 'Grains' proxy (assumed) |

**Caveats**
- Ricin hazard: advise NOT adding to a default menu.
- ricin: toxic seed, handling/legal restrictions in EU and US states - recommend NOT adding to a default farmer menu

## jute

| field | value | source |
|---|---|---|
| latin / family / group | Corchorus olitorius / C. capsularis / malvaceae / fibre | taxonomy |
| fao.sow | [5, 1] | assumed: warm, wet season; reference NH sowing |
| fao.days | [20, 30, 50, 20] | assumed: not in FAO-56 Table 11; 120-day cycle (BJRI/Indian extension) |
| fao.kc | [0.35, 1.1, 0.85] | assumed: not in FAO-56 Table 12; fibre group ini 0.35, mid analogue Flax 1.10, end 0.85 (harvest green at small-pod stage) |
| rootDepth | 1.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Flax 1.0-1.5 m (upper), analogue |
| p | 0.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Flax p 0.50, analogue |
| ky (assumed) | 0.9 | assumed: not tabulated |
| heatMonthOffset | 2 | assumed: peak vegetative growth ~ day 50-60 |
| tMax | 36 | assumed: optimum 24-37 C (ECOCROP) |
| tCrit | None | null: harvested before seed set |
| minSowT | 18 | assumed: ECOCROP/extension: germinates poorly below ~18 C |
| frostTender | True | frost-sensitive |
| nFix | 0 | assumed: non-legume |
| nDemand | 60 | assumed: extension 40-80 kg N/ha |
| carbon | 0.3 | assumed: fallen leaves and roots, stems retted off-field |
| N_RESIDUAL | 35 | assumed: assumed |
| coverGap | 0.5 | assumed: fast canopy |
| minBreak / maxRun | 2 / 1 | assumed: stem rot (Macrophomina), root knot nematode |
| diseases | stem rot, anthracnose, nematodes | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 3.0 | assumed: India/Bangladesh avg ~2.2-2.5 t/ha dry fibre (FAOSTAT, not re-pulled) |
| econ.price EUR/t | 700 | assumed: India producer ~600-750 USD/t; not re-verified |
| econ.cost EUR/ha | 800 | assumed: estimate; retting labour excluded |
| gaez | {"phGroup": {"reuse": "Cotton"}, "textureGroup": {"reuse": "Cotton"}, "heat": {"reuse": "Cowpea"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (fibre crop of warm humid lowlands; heat rows of cowpea 120 d, tmin 10) |
| faostat | 780 Jute, raw or retted | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | jute | layer name as supplied in the brief |
| contract | True | assumed: mill contract; needs retting water |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.9, "slope": 1.0, "intercept": 0.5, "rbg": 0.2} | assumed (fibre stems removed, leaves+roots stay) |

**Caveats**
- Advise NOT adding for EU/US: retting water and mill logistics; no market. Sound only for South Asian deltas.
- NOT recommended for EU/US fields: needs 2-3 weeks of ponded retting water and a jute mill within reach; no market

## fonio

| field | value | source |
|---|---|---|
| latin / family / group | Digitaria exilis / poaceae / c4-cereal | taxonomy |
| fao.sow | [5, 25] | assumed: sown at start of rains; reference May |
| fao.days | [15, 25, 40, 25] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Millet row 15/25/40/25 = 105 d, June, Pakistan (analogue; fonio 90-120 d per extension) |
| fao.kc | [0.3, 1.0, 0.3] | FAO-56 Table 12 (fetched), Millet Kc ini 0.30, mid 1.00, end 0.30 (analogue) |
| rootDepth | 1.0 | assumed: fonio is shallow fibrous-rooted; Table 22 millet upper value 2.0 m judged too deep |
| p | 0.55 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Millet p 0.55, analogue |
| ky (assumed) | 0.8 | assumed: same as repo millet/pearlmillet assumed 0.8; drought-tolerant |
| heatMonthOffset | 2 | assumed: flowering ~day 45-50 |
| tMax | 36 | assumed: analogue pearlmillet heat tMax 36 in repo |
| tCrit | 38 | assumed: analogue pearlmillet 38 (repo T_CRIT, itself an analogue) |
| minSowT | 15 | assumed: analogue pearlmillet 15 (repo MIN_SOW_T) |
| frostTender | True | frost-sensitive |
| nFix | 0 | assumed: non-legume |
| nDemand | 40 | assumed: extension 30-60 kg N/ha on poor soils |
| carbon | 0.3 | assumed: small residue |
| N_RESIDUAL | 30 | assumed: by analogy with millet 35 |
| coverGap | 0.5 | assumed: slow early growth |
| minBreak / maxRun | 0 / 2 | assumed: cereal; no specific disease constraint known |
| diseases | head smut, leaf spots | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 0.8 | assumed: West Africa 0.6-0.9 t/ha; attainable 1.2 |
| econ.price EUR/t | 500 | assumed: speciality grain, local 400-600 USD/t, organic EU imports far higher; not re-verified |
| econ.cost EUR/ha | 350 | assumed: estimate |
| gaez | {"phGroup": {"reuse": "Pearl Millet"}, "textureGroup": {"reuse": "Pearl Millet"}, "heat": {"reuse": "Pearl millet"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (same Poaceae C4 millet-type cereal; heat rows 70-90 d, tmin 15) |
| faostat | 94 Fonio | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | fonio | layer name as supplied in the brief |
| contract | True | assumed: niche market; no commodity price |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.9, "slope": 1.43, "intercept": 0.14, "rbg": 0.22} | IPCC 2006 'Millet' class proxy (same as repo pearlmillet) |

**Caveats**
- Everything except the millet-analogue stage lengths is assumed; keep low confidence.
- data thin (no GAEZ/FAO-56 entry, no Ky); keep for West-Africa sites only, confidence low

## quinoa

| field | value | source |
|---|---|---|
| latin / family / group | Chenopodium quinoa / amaranthaceae / pseudo-cereal | taxonomy |
| fao.sow | [4, 25] | assumed: spring sowing temperate NH |
| fao.days | [15, 25, 50, 30] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Barley/Oats/Wheat row 15/25/50/30 = 120 d used as analogue for a 120-130 d spring cereal-like crop; quinoa has no own row |
| fao.kc | [0.3, 1.0, 0.4] | assumed: not in FAO-56 Table 12; cereal-like 0.30/1.00/0.40 (Table 12 small grains ini 0.30). Published quinoa Kc (Geerts et al. 2008) not checked |
| rootDepth | 1.5 | assumed: Table 22 small-grain upper 1.0-1.5 m analogue |
| p | 0.55 | assumed: Table 22 cereals p 0.55 analogue |
| ky (assumed) | 0.8 | assumed: quinoa-specific Ky from Geerts et al. 2009 recalled as 0.6-0.9; not verified |
| heatMonthOffset | 2 | assumed: flowering ~ 55-65 d |
| tMax | 30 | assumed: optimum 15-20 C; yield drop above ~30 C |
| tCrit | 35 | assumed: Hinojosa et al. 2018/2019 pollen sterility above ~35 C; recalled, not re-verified |
| minSowT | 6 | assumed: germinates from ~3-5 C; set 6 |
| frostTender | False | seedlings tolerate light frost; flowering stage sensitive |
| nFix | 0 | assumed: non-legume |
| nDemand | 80 | assumed: EU trials 60-100 kg N/ha |
| carbon | 0.3 | assumed: small stover |
| N_RESIDUAL | 35 | assumed: by analogy with buckwheat 35 |
| coverGap | 0.5 | assumed: slow early growth |
| minBreak / maxRun | 3 / 1 | assumed: Amaranthaceae: shares Heterodera/Cercospora with beet; downy mildew |
| diseases | downy mildew (Peronospora variabilis), leaf spots, birds | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 2.0 | assumed: EU/Andes trials 1.5-3 t/ha; Bolivia avg ~0.7 |
| econ.price EUR/t | 2500 | assumed: EU organic grain ~2000-3500 EUR/t; not re-verified |
| econ.cost EUR/ha | 900 | assumed: estimate |
| gaez | {"phGroup": {"reuse": "Buckwheat"}, "textureGroup": {"reuse": "Buckwheat"}, "heat": {"reuse": "Buckwheat"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (pseudo-cereal of cool climates; buckwheat heat rows 75-90 d, tmin 5) |
| faostat | 92 Quinoa | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | quinoa | layer name as supplied in the brief |
| contract | True | assumed: premium food-chain contract needed; saponin removal |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.89, "slope": 1.09, "intercept": 0.88, "rbg": 0.22} | IPCC 2006 generic 'Grains' proxy (as buckwheat in repo) |

**Caveats**
- Published quinoa Kc/Ky (Geerts et al. 2008/2009) were not retrieved; analogues used.

## taro

| field | value | source |
|---|---|---|
| latin / family / group | Colocasia esculenta / araceae / root | taxonomy |
| fao.sow | [4, 25] | assumed: tropical rains; reference April/May |
| fao.days | [30, 60, 120, 60] | assumed: not in FAO-56 Table 11; upland taro 6-9 months, 270 d |
| fao.kc | [0.6, 1.15, 0.9] | assumed: not in FAO-56 Table 12; assumed from broad-leaved wet-loving crop: ini 0.6, mid 1.15, end 0.9 |
| rootDepth | 0.6 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Potato 0.4-0.6 m (upper), analogue for shallow tuber crop |
| p | 0.3 | assumed: below potato 0.35: taro is water-loving |
| ky (assumed) | 1.1 | assumed: not tabulated; hygrophilous, high water sensitivity assumed |
| heatMonthOffset | 4 | assumed: corm bulking after ~4 months |
| tMax | 33 | assumed: optimum 21-27 C (ECOCROP) |
| tCrit | None | null: corm crop |
| minSowT | 18 | assumed: ECOCROP/extension: corms sprout above ~18-20 C |
| frostTender | True | frost kills foliage |
| nFix | 0 | assumed: non-legume |
| nDemand | 100 | assumed: extension 80-120 kg N/ha |
| carbon | 0.25 | assumed: leaf residue only |
| N_RESIDUAL | 40 | assumed: assumed |
| coverGap | 0.5 | assumed: slow early growth |
| minBreak / maxRun | 3 / 1 | assumed: taro leaf blight (Phytophthora colocasiae) and Pythium rots |
| diseases | taro leaf blight, Pythium corm rot, dasheen mosaic virus | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 20 | assumed: world avg ~6.5 t/ha (FAOSTAT, not re-pulled); irrigated 20-30 |
| econ.price EUR/t | 450 | assumed: Hawaii/US ~1000 USD/t, W-Africa 200-400; not re-verified |
| econ.cost EUR/ha | 3000 | assumed: estimate: planting-material heavy |
| gaez | {"phGroup": {"reuse": "Sweet Potato"}, "textureGroup": {"reuse": "Sweet Potato"}, "heat": null} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (root crop of humid tropics; no GAEZ heat row, use degree-day rule) |
| faostat | 136 Taro | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | taro | layer name as supplied in the brief |
| contract | False | - |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.22, "slope": 0.1, "intercept": 1.06, "rbg": 0.2} | IPCC 2006 'Tubers' class proxy |

**Caveats**
- Upland taro assumed; paddy taro would need a rice-like water model.
- data thin: low confidence outside tropics
- no GAEZ heat row; degree-day rule (gddNeed ~1800, base 10 C, assumed)

## bambara

| field | value | source |
|---|---|---|
| latin / family / group | Vigna subterranea / fabaceae / legume | taxonomy |
| fao.sow | [5, 15] | assumed: tropical rains; reference = groundnut date in repo |
| fao.days | [35, 45, 35, 25] | assumed: not in FAO-56 Table 11; groundnut row used as analogue (Bambara 110-150 d) |
| fao.kc | [0.4, 1.15, 0.6] | FAO-56 Table 12 (fetched), Groundnut (Peanut) Kc ini 0.4, mid 1.15, end 0.60 as analogue |
| rootDepth | 1.0 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Groundnut 0.5-1.0 m (upper), analogue |
| p | 0.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Groundnut p 0.50, analogue |
| ky (assumed) | 0.7 | assumed: FAO-33 groundnut 0.70 used as analogue (Bambara is drought-tolerant) |
| heatMonthOffset | 2 | assumed: flowering ~35-45 d |
| tMax | 35 | assumed: optimum 20-28 C (ECOCROP) |
| tCrit | 38 | assumed: analogue to groundnut 39 (Hatfield et al. 2011 in repo T_CRIT), 1 C lower |
| minSowT | 18 | assumed: ECOCROP: soil >= 18 C, seeds rot in cold wet soil |
| frostTender | True | frost kills |
| nFix | 30 | assumed: fixation capacity reported higher; net 30 kept as for groundnut in repo |
| nDemand | 20 | assumed: low; legume |
| carbon | 0.3 | assumed: analogue groundnut |
| N_RESIDUAL | 60 | assumed: analogue groundnut 60 in N_RESIDUAL |
| coverGap | 0.5 | assumed: moderate canopy |
| minBreak / maxRun | 2 / 1 | assumed: Cercospora leaf spot, Fusarium wilt; 2-year break |
| diseases | Cercospora leaf spot, Fusarium wilt, Sclerotium rot | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 1.5 | assumed: world avg ~0.5-0.7 t/ha (FAOSTAT, not re-pulled); attainable 1.5-2.5 |
| econ.price EUR/t | 800 | assumed: local 600-1000 USD/t; no EU/US market series |
| econ.cost EUR/ha | 500 | assumed: estimate |
| gaez | {"phGroup": {"reuse": "Groundnut"}, "textureGroup": {"reuse": "Groundnut"}, "heat": {"reuse": "Groundnut"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (same pod-setting underground legume; groundnut heat rows 90-120 d, tmin 10) |
| faostat | 203 Bambara beans, dry | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | bambara | layer name as supplied in the brief |
| contract | True | assumed: niche food market, thin demand |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 0.94, "slope": 1.07, "intercept": 1.54, "rbg": 0.2} | IPCC 2006 'Peanut with pod' class as analogue (as repo groundnut) |

**Caveats**
- Entire parameter set is the groundnut analogue except tCrit/minSowT.
- data thin: keep, low confidence

## vetch

| field | value | source |
|---|---|---|
| latin / family / group | Vicia sativa / fabaceae / forage | taxonomy |
| fao.sow | [3, 25] | assumed: spring sowing; autumn-sown winter vetch not covered |
| fao.days | [20, 30, 40, 10] | assumed: not in FAO-56 Table 11; 100 d to cut at pod set (assumed) |
| fao.kc | [0.4, 0.9, 0.85] | FAO-56 Table 12 (fetched), Clover hay, Berseem averaged cutting effects: Kc ini 0.40, mid 0.90, end 0.85 |
| rootDepth | 0.9 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Clover hay, Berseem 0.6-0.9 m (upper), analogue |
| p | 0.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Clover hay, Berseem p 0.50 |
| ky | 1.1 | FAO-33 alfalfa 1.1 used as analogue (recalled) |
| heatMonthOffset | 2 | assumed: flowering/pod fill ~60 d |
| tMax | 28 | assumed: cool-season legume; yield falls in hot summers |
| tCrit | 30 | assumed: analogue to pea/faba/lupin 30 (repo T_CRIT) |
| minSowT | 4 | assumed: analogue pea 4 (repo MIN_SOW_T) |
| frostTender | False | hardy to about -10 C once established; spring sowing avoids kill |
| nFix | 60 | assumed: green-manure/forage vetch 60-100 kg N/ha recalled; set conservative |
| nDemand | 0 | assumed: legume |
| carbon | 0.3 | assumed: cut forage; stubble+roots |
| N_RESIDUAL | 80 | assumed: analogue pea/faba 80 |
| coverGap | 0.5 | assumed: cut early |
| minBreak / maxRun | 4 / 1 | assumed: shares Ascochyta/Aphanomyces/Fusarium with pea and faba - 4 y break |
| diseases | Ascochyta, Aphanomyces root rot, Fusarium, pea rots | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 5.0 | assumed: extension 4-7 t DM/ha for spring vetch/cereal-vetch silage |
| econ.price EUR/t | 150 | assumed: equal to clover ley price in repo; forage |
| econ.cost EUR/ha | 450 | assumed: estimate: seed 80 kg/ha dominant |
| gaez | {"phGroup": {"reuse": "Pasture Legume"}, "textureGroup": {"reuse": "Pasture Legume"}, "heat": {"reuse": "Dry pea"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (annual forage legume; heat rows of dry pea 90-120 d, tmin 5) |
| faostat | 205 Vetches | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | vetch | layer name as supplied in the brief |
| contract | True | assumed: livestock-farm contract |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 1, "slope": 0.3, "intercept": 0, "rbg": 0.4} | IPCC 2006 'N-fixing forages' class (as repo clover) |

**Caveats**
- Spring-sown forage vetch only; cereal-vetch mixes and winter vetch not modelled.
- faostat 205 is Vetches (grain); no separate forage-vetch item.

## silagemaize

| field | value | source |
|---|---|---|
| latin / family / group | Zea mays (whole plant) / poaceae / forage | taxonomy |
| fao.sow | [5, 1] | assumed: same as repo maize [5,1] |
| fao.days | [30, 40, 50, 15] | Repo maize 30/40/50/30 (Table 11 style) with the late stage cut to 15 d (harvest at 30-35 % DM, ~2-3 weeks earlier than grain): assumed |
| fao.kc | [0.3, 1.2, 0.6] | FAO-56 Table 12 (fetched), Maize, Field (grain) Kc ini 0.30, mid 1.20; Kc end 0.60 = value for harvest at high grain moisture (Table 12 footnote) |
| rootDepth | 1.7 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Maize, Field (grain) 1.0-1.7 m (upper) |
| p | 0.55 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Maize, Field p 0.55 |
| ky | 1.25 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (maize 1.25) |
| heatMonthOffset | 2 | assumed: silking ~ day 70-75 after sowing, same as grain maize |
| tMax | 31 | same as repo maize tMax 31 |
| tCrit | 35 | same as repo T_CRIT maize 35 |
| minSowT | 10 | same as repo MIN_SOW_T maize 10 |
| frostTender | True | frost kills |
| nFix | 0 | assumed: non-legume |
| nDemand | 150 | assumed: extension: 120-180 kg N/ha fertiliser, plus manure credit; German DueV style demand 200 minus soil N |
| carbon | 0.2 | assumed: only stubble+roots stay (whole plant removed): well below grain maize 0.75 |
| N_RESIDUAL | 40 | assumed: grain maize 60; silage removes the stover |
| coverGap | 0.9 | assumed: late sowing, wide rows, bare until June (repo maize 0.6, silage cut earlier) |
| minBreak / maxRun | 0 / 4 | assumed: repo maize minBreak 0, maxRun 2; silage monoculture longer in practice but rootworm limit retained 4 |
| diseases | western corn rootworm, Fusarium, eyespot | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 16 | assumed: EU/US silage maize 15-20 t DM/ha (Germany ~45 t FM at 33 % DM) |
| econ.price EUR/t | 120 | assumed: DE farm-gate silage maize 35-50 EUR/t fresh = 110-150 EUR/t DM; not re-verified |
| econ.cost EUR/ha | 1200 | assumed: estimate: seed, N, chopping/harvest contract |
| gaez | {"phGroup": {"reuse": "Maize"}, "textureGroup": {"reuse": "Maize"}, "heat": {"reuse": "Maize"}} | reuse existing GAEZ Maize rows (pH, texture, heat: 'Maize' 120-150 d) |
| faostat | 636 Maize, forage | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | maizefor | layer name as supplied in the brief |
| contract | True | assumed: silage is for own livestock/biogas: no cash market |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 1, "slope": 0.05, "intercept": 0.3, "rbg": 0.22} | assumed: stubble 5 % of DM yield plus 0.3 t, rbg from IPCC maize 0.22 |

**Caveats**
- Overlaps grain maize: should share rootworm accounting.
- FAOSTAT 636 recalled, verify.

## grassley

| field | value | source |
|---|---|---|
| latin / family / group | Lolium perenne + Phleum/Dactylis (mixed grasses) / poaceae / forage | taxonomy |
| fao.sow | [3, 15] | assumed: perennial/temporary ley: treated as year-round like repo clover; spring establishment |
| fao.days | [10, 20, 200, 60] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Grass Pasture row: init 10, dev 20, mid/late not fixed ('--'); mid-season set to remainder of 365 d (assumed) |
| fao.kc | [0.4, 0.95, 0.85] | FAO-56 Table 12 (fetched), Grazing Pasture rotated: Kc ini 0.40, Kc mid 0.85-1.05, Kc end 0.85; Rye Grass hay averaged: 0.95/1.05/1.00. Mid = 0.95 mid-range (assumed) |
| rootDepth | 1.0 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Rye Grass hay 0.6-1.0 m (upper); Rotated Grazing goes to 1.5 |
| p | 0.6 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Rye Grass hay p 0.60 |
| ky | 1.2 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (grass 1.20) |
| heatMonthOffset | 4 | assumed: peak growth May-July; month 4 after March sowing |
| tMax | 28 | assumed: cool-season grass; growth slows above ~25-28 C |
| tCrit | None | null: no flowering-stage limit for vegetative forage |
| minSowT | 5 | assumed: ryegrass germinates above ~5 C |
| frostTender | False | fully hardy, repo clover hardiness -20 C |
| nFix | 0 | assumed: non-legume |
| nDemand | 200 | assumed: RB209/DueV-type cut-ley demand 150-250 kg N/ha |
| carbon | 0.9 | assumed: dense root mat; repo clover 1.0 |
| N_RESIDUAL | 30 | assumed: repo clover 20; ley break releases more (repo LEY_BREAK_N 90 applies only to clover) |
| coverGap | 0 | assumed: perennial cover all year |
| minBreak / maxRun | 0 / 4 | assumed: 2-4 year ley; green bridge for take-all/wireworm to the next cereal |
| diseases | take-all green bridge, crown rust, leatherjackets | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 11 | assumed: intensive cut ley 10-14 t DM/ha |
| econ.price EUR/t | 120 | assumed: hay/silage 100-150 EUR/t DM; not re-verified |
| econ.cost EUR/ha | 700 | assumed: estimate: N 200 kg, cutting contract |
| gaez | {"phGroup": {"reuse": "Pasture Legume"}, "textureGroup": {"reuse": "Pasture Legume"}, "heat": null} | no GAEZ grass group: pasture-legume pH/texture reused; no heat row (gddNeed 0, never limiting) |
| faostat | 639 Grasses nes for forage; silage | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | mixedgrass | layer name as supplied in the brief |
| contract | True | assumed: livestock farm or hay buyer |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 1, "slope": 0.3, "intercept": 0, "rbg": 0.54} | IPCC 2006 Table 11.2 'Non-N-fixing forages' (rbg recalled, not re-fetched) |
| kcMonthly | [0.4, 0.4, 0.6, 0.85, 1.0, 1.0, 0.95, 0.95, 0.9, 0.7, 0.5, 0.4] | assumed: seasonal shape of FAO-56 Table 12 grazing pasture, scaled like repo clover |

**Caveats**
- Perennial: engine needs the monthly kc array (kcMonthly) like clover; fao block is only a Table-11-style triple.
- FAOSTAT 639 recalled, verify. GAEZ has no grass group.

## sorghumforage

| field | value | source |
|---|---|---|
| latin / family / group | Sorghum bicolor x S. sudanense / poaceae / forage | taxonomy |
| fao.sow | [5, 10] | assumed: same as repo sorghum [5,10] |
| fao.days | [20, 35, 40, 15] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Sorghum row 20/35/40/30 with late stage cut to 15 d (cut at soft dough, assumed) |
| fao.kc | [0.3, 1.2, 1.05] | FAO-56 Table 12 (fetched), Sorghum - sweet: Kc ini 0.30 mid 1.20 end 1.05 (green harvest) |
| rootDepth | 2.0 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Sorghum sweet 1.0-2.0 m (upper) |
| p | 0.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Sorghum sweet p 0.50 |
| ky | 0.9 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (sorghum 0.9); forage-specific value not tabulated |
| heatMonthOffset | 2 | assumed: flowering ~ day 55-60, as grain sorghum |
| tMax | 35 | same as repo sorghum 35 |
| tCrit | 36 | same as repo T_CRIT sorghum 36 |
| minSowT | 13 | same as repo MIN_SOW_T sorghum 13 |
| frostTender | True | frost kills |
| nFix | 0 | assumed: non-legume |
| nDemand | 100 | assumed: extension 80-120 kg N/ha |
| carbon | 0.25 | assumed: stubble and roots; whole plant removed |
| N_RESIDUAL | 35 | same as repo sorghum 45 reduced for stover removal (assumed) |
| coverGap | 0.9 | assumed: same logic as silage maize |
| minBreak / maxRun | 0 / 3 | assumed: repo sorghum minBreak 0; forage stand 3-year cap assumed |
| diseases | anthracnose, charcoal rot, prussic acid (frost/drought) hazard | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 13 | assumed: EU/US forage sorghum 10-16 t DM/ha |
| econ.price EUR/t | 100 | assumed: forage DM 80-120 EUR/t; not re-verified |
| econ.cost EUR/ha | 800 | assumed: estimate |
| gaez | {"phGroup": {"reuse": "Sorghum"}, "textureGroup": {"reuse": "Sorghum"}, "heat": {"reuse": "Sorghum"}} | reuse existing GAEZ Sorghum rows |
| faostat | 637 Sorghum, forage | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | sorghumfor | layer name as supplied in the brief |
| contract | True | assumed: own livestock/biogas |
| perishableDays | None | n/a (not a perishable vegetable) |
| residue (dry/slope/intercept/rbg) | {"dry": 1, "slope": 0.05, "intercept": 0.3, "rbg": 0.22} | assumed as silage maize; IPCC sorghum rbg 0.22 |

**Caveats**
- Prussic acid risk after frost/drought stress; not modelled.

## tomato

| field | value | source |
|---|---|---|
| latin / family / group | Solanum lycopersicum / solanaceae / vegetable | taxonomy |
| fao.sow | [4, 25] | assumed: transplant date, Mediterranean row April/May |
| fao.days | [30, 40, 45, 30] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Tomato row 30/40/45/30 = 145 d, April/May, Mediterranean |
| fao.kc | [0.6, 1.15, 0.8] | FAO-56 Table 12 (fetched), b. Solanum Family ini 0.6; Tomato Kc mid 1.15, Kc end 0.70-0.90 (midpoint 0.80) |
| rootDepth | 1.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Tomato 0.7-1.5 m (upper) |
| p | 0.4 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Tomato p 0.40 |
| ky | 1.05 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (tomato 1.05) |
| heatMonthOffset | 2.5 | fruit set at start of mid-season = (30+40)/30 = 2.3 months; rounded |
| tMax | 30 | assumed: optimum day temp 21-29 C; fruit set declines when Tmax > ~30-32 C |
| tCrit | 32 | assumed: Sato et al. 2000 (Ann. Bot.) and Peet/Willits: pollen viability and fruit set fall above ~32 C; recalled, not re-verified |
| minSowT | 12 | assumed: transplant when soil >= 12-15 C |
| frostTender | True | killed by frost |
| nFix | 0 | assumed: non-legume |
| nDemand | 180 | assumed: extension 150-220 kg N/ha, processing crop |
| carbon | 0.2 | assumed: vines; fruit removed, IPCC has no tomato class |
| N_RESIDUAL | 80 | assumed: vegetable residues are N-rich 60-100 kg N/ha; assumed |
| coverGap | 0.6 | assumed: transplanted, wide spacing |
| minBreak / maxRun | 3 / 1 | assumed: Solanaceae: Fusarium/Verticillium wilt, nematodes, blight shared with potato; 3-4 y break |
| diseases | late blight, Fusarium wilt, Verticillium wilt, bacterial canker, TYLCV (south) | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 80 | assumed: processing tomato EU/California 70-100 t/ha fresh |
| econ.price EUR/t | 90 | assumed: Italy processing contract 85-110 EUR/t; fresh market 500-1000 EUR/t; not re-verified |
| econ.cost EUR/ha | 6500 | assumed: estimate: processing crop with mechanical harvest; fresh market with labour 15000+ |
| gaez | {"phGroup": {"reuse": "Phaseolus Bean"}, "textureGroup": {"reuse": "Phaseolus Bean"}, "heat": {"reuse": "Phaseolus bean"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (no GAEZ vegetables; warm-season fruit crop with similar acid/alkaline limits; bean heat rows 105-150 d, tmin 5) |
| faostat | 388 Tomatoes | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | tomato | layer name as supplied in the brief |
| contract | True | assumed: processing crop only under tomato-factory contract; fresh needs packer |
| perishableDays | 10 | extension: typical shelf life at recommended cold-chain temperature |
| residue (dry/slope/intercept/rbg) | {"dry": 0.06, "slope": 0.8, "intercept": 0.5, "rbg": 0.2} | assumed: water content 94 %; vine residue ~0.8 t DM per t fruit DM + 0.5 |

**Caveats**
- Economics are processing-tomato; fresh market labour/price differ ~5x.

## onion

| field | value | source |
|---|---|---|
| latin / family / group | Allium cepa / amaryllidaceae / vegetable | taxonomy |
| fao.sow | [4, 1] | assumed: spring sowing, Mediterranean row April |
| fao.days | [15, 25, 70, 40] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Onion (dry) row 15/25/70/40 = 150 d, April, Mediterranean |
| fao.kc | [0.7, 1.05, 0.75] | FAO-56 Table 12 (fetched), a. Small Vegetables ini 0.7; Onions dry Kc mid 1.05, Kc end 0.75 |
| rootDepth | 0.6 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Onions dry 0.3-0.6 m (upper) |
| p | 0.3 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Onions dry p 0.30 |
| ky | 1.1 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (onion 1.10) |
| heatMonthOffset | 1.5 | bulbing starts at end of development stage (15+25)/30 = 1.3 months |
| tMax | 30 | assumed: bulbing hastened and bulbs smaller above ~30 C; recalled extension |
| tCrit | None | null: bulb crop; no flowering-stage limit (bolting is a quality defect) |
| minSowT | 6 | assumed: seeds germinate from ~2-5 C; set 6 |
| frostTender | False | hardy to about -7 C as seedlings |
| nFix | 0 | assumed: non-legume |
| nDemand | 120 | assumed: extension 100-150 kg N/ha |
| carbon | 0.1 | assumed: tops only |
| N_RESIDUAL | 40 | assumed: assumed; onion leaves little residue |
| coverGap | 0.7 | assumed: shallow roots, sparse canopy, slow emergence |
| minBreak / maxRun | 4 / 1 | assumed: white rot (Sclerotium cepivorum) persists 15+ years; Fusarium basal rot; 4-year break (7+ where white rot) |
| diseases | white rot, downy mildew, Fusarium basal rot, thrips | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 60 | assumed: EU/US field yields 50-75 t/ha fresh |
| econ.price EUR/t | 160 | assumed: NL/DE 120-200 EUR/t, US ~250 USD/t; not re-verified |
| econ.cost EUR/ha | 6500 | assumed: estimate: seed/sets, herbicide, harvest |
| gaez | {"phGroup": {"reuse": "Sugar Beet"}, "textureGroup": {"reuse": "Sugar Beet"}, "heat": {"reuse": "White potato"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (biennial bulb crop of cool climates with acid sensitivity; potato heat rows 120-150 d, tmin 5) |
| faostat | 403 Onions and shallots, dry | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | onion | layer name as supplied in the brief |
| contract | False | - |
| perishableDays | 150 | extension: typical shelf life at recommended cold-chain temperature |
| residue (dry/slope/intercept/rbg) | {"dry": 0.12, "slope": 0.8, "intercept": 0.5, "rbg": 0.2} | assumed: water content 88 % |

**Caveats**
- Dry storage onion; green onion Table 11 row is much shorter.

## cabbage

| field | value | source |
|---|---|---|
| latin / family / group | Brassica oleracea var. capitata / brassicaceae / vegetable | taxonomy |
| fao.sow | [4, 15] | assumed: spring transplanting for a summer-autumn crop |
| fao.days | [40, 60, 50, 15] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Cabbage row 40/60/50/15 = 165 d, September, Calif. Desert (only row available) |
| fao.kc | [0.7, 1.05, 0.95] | FAO-56 Table 12 (fetched), a. Small Vegetables ini 0.7; Cabbage Kc mid 1.05, Kc end 0.95 |
| rootDepth | 0.8 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Cabbage 0.5-0.8 m (upper) |
| p | 0.45 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Cabbage p 0.45 |
| ky | 0.95 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (cabbage 0.95) |
| heatMonthOffset | 3.3 | head formation at start of mid-season (40+60)/30 = 3.3 months |
| tMax | 28 | assumed: cool-season crop; heading problems above ~25-28 C |
| tCrit | None | null: leaf/head crop, no fruit-set stage |
| minSowT | 5 | assumed: transplants/seed at ~5 C |
| frostTender | False | hardy: tolerates -5 C |
| nFix | 0 | assumed: non-legume |
| nDemand | 220 | assumed: extension 200-280 kg N/ha (DueV allowance 280) |
| carbon | 0.2 | assumed: outer leaves and stump are large |
| N_RESIDUAL | 100 | assumed: Brassica vegetable residues 80-130 kg N/ha; assumed |
| coverGap | 0.5 | assumed: transplanted |
| minBreak / maxRun | 4 / 1 | assumed: clubroot (Plasmodiophora) spores last 15+ y, shared with rapeseed; Sclerotinia; 4-year break |
| diseases | clubroot, Sclerotinia, black rot, cabbage root fly, caterpillars | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 65 | assumed: EU/US 40-65 t/ha fresh; storage white cabbage up to 80 |
| econ.price EUR/t | 130 | assumed: DE white cabbage 100-200 EUR/t; not re-verified |
| econ.cost EUR/ha | 6500 | assumed: estimate |
| gaez | {"phGroup": {"reuse": "Rape"}, "textureGroup": {"reuse": "Rape"}, "heat": {"reuse": "Sugar beet"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (Brassicaceae relative, similar acid/alkaline limits; sugar beet heat rows 120-165 d, tmin 5) |
| faostat | 358 Cabbages | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | cabbage | layer name as supplied in the brief |
| contract | False | - |
| perishableDays | 100 | extension: typical shelf life at recommended cold-chain temperature |
| residue (dry/slope/intercept/rbg) | {"dry": 0.08, "slope": 0.8, "intercept": 0.5, "rbg": 0.2} | assumed: water content 92 %; slope raised in practice, kept simple |

**Caveats**
- Table 11 has a single row (California desert, September): the calendar is shifted to April to suit NH sowing.

## chilli

| field | value | source |
|---|---|---|
| latin / family / group | Capsicum annuum / solanaceae / vegetable | taxonomy |
| fao.sow | [4, 25] | assumed: transplant after last frost, 'April/June' Europe row |
| fao.days | [25, 35, 40, 20] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Sweet peppers (bell) row 25(30)/35/40/20 = 125 d, April/June, Europe and Mediterranean (25 used) |
| fao.kc | [0.6, 1.05, 0.9] | FAO-56 Table 12 (fetched), b. Solanum ini 0.6; Sweet Peppers (bell) Kc mid 1.05, Kc end 0.90 |
| rootDepth | 1.0 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Sweet Peppers (bell) 0.5-1.0 m (upper) |
| p | 0.3 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Sweet Peppers (bell) p 0.30 |
| ky | 1.1 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (pepper 1.10) |
| heatMonthOffset | 2 | flowering ~ (25+35)/30 = 2 months |
| tMax | 32 | assumed: optimum day 20-30 C; flower drop above ~32 C |
| tCrit | 33 | assumed: Erickson & Markhart 2002 and extension: flower/fruit drop above ~32-33 C; recalled, not re-verified |
| minSowT | 14 | assumed: transplant at soil >= 14-15 C; ECOCROP Tmin 10 for growth |
| frostTender | True | killed by frost |
| nFix | 0 | assumed: non-legume |
| nDemand | 160 | assumed: extension 120-200 kg N/ha |
| carbon | 0.15 | assumed: small stems |
| N_RESIDUAL | 60 | assumed: assumed |
| coverGap | 0.6 | assumed: transplanted |
| minBreak / maxRun | 3 / 1 | assumed: Phytophthora capsici, Verticillium, bacterial spot, virus; 3-4 y Solanaceae break |
| diseases | Phytophthora capsici, Verticillium wilt, bacterial spot, viruses, aphids | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 30 | assumed: Spain/Mexico field 25-40 t/ha fresh; green chillies world avg ~18 |
| econ.price EUR/t | 600 | assumed: EU fresh peppers 500-900 EUR/t; not re-verified |
| econ.cost EUR/ha | 9000 | assumed: estimate: hand harvest dominates |
| gaez | {"phGroup": {"reuse": "White Potato"}, "textureGroup": {"reuse": "White Potato"}, "heat": {"reuse": "Soybean"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (solanaceous crop, acid-sensitive; soybean heat rows 105-150 d, tmin 10) |
| faostat | 401 Chillies and peppers, green (Capsicum and Pimenta) | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | chilleetc | layer name as supplied in the brief |
| contract | False | - |
| perishableDays | 10 | extension: typical shelf life at recommended cold-chain temperature |
| residue (dry/slope/intercept/rbg) | {"dry": 0.08, "slope": 0.8, "intercept": 0.5, "rbg": 0.2} | assumed: water content 92 % |

**Caveats**
- Green pepper basis; dried chilli (paprika) economics differ.
- dried-chilli (paprika) variant has different yield (3-5 t dry/ha) and price

## watermelon

| field | value | source |
|---|---|---|
| latin / family / group | Citrullus lanatus / cucurbitaceae / vegetable | taxonomy |
| fao.sow | [4, 25] | assumed: Italy April row used as NH reference |
| fao.days | [20, 30, 30, 30] | FAO-56 Table 11 (fetched fao.org/3/x0490e/x0490e0b.htm), Water melons row 20/30/30/30 = 110 d, April, Italy |
| fao.kc | [0.4, 1.0, 0.75] | FAO-56 Table 12 (fetched), c. Cucurbit group ini 0.5 -> Watermelon Kc ini 0.4, mid 1.00, end 0.75 |
| rootDepth | 1.5 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Watermelon 0.8-1.5 m (upper) |
| p | 0.4 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Watermelon p 0.40 |
| ky | 0.85 | FAO-33 (Doorenbos & Kassam 1979) whole-season Ky, value NOT re-checked against the source table (watermelon 0.85) |
| heatMonthOffset | 1.7 | fruit set at start of mid-season (20+30)/30 = 1.7 months |
| tMax | 36 | assumed: hot-climate crop; optimum 24-30 C, heat limit assumed |
| tCrit | 38 | assumed: cucurbit pollen viability falls above ~38-40 C; recalled, not re-verified |
| minSowT | 16 | assumed: sow into soil >= 16-18 C; ECOCROP Tmin growth 10-15 |
| frostTender | True | killed by frost, chill below 10 C |
| nFix | 0 | assumed: non-legume |
| nDemand | 100 | assumed: extension 80-120 kg N/ha |
| carbon | 0.15 | assumed: vines |
| N_RESIDUAL | 50 | assumed: assumed |
| coverGap | 0.6 | assumed: runners cover soil only after 5-6 weeks |
| minBreak / maxRun | 5 / 1 | assumed: Fusarium oxysporum f.sp. niveum persists; 5-7 y break unless grafted |
| diseases | Fusarium wilt, gummy stem blight, powdery mildew, viruses | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 50 | assumed: Spain/US 40-60 t/ha fresh; world avg ~30 |
| econ.price EUR/t | 250 | assumed: Spain 200-300 EUR/t, US ~250 USD/t; not re-verified |
| econ.cost EUR/ha | 7000 | assumed: estimate: transplants, mulch/drip, harvest labour |
| gaez | {"phGroup": {"reuse": "Cowpea"}, "textureGroup": {"reuse": "Cowpea"}, "heat": {"reuse": "Cowpea"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (warm-season annual, sandy-soil preference similar; cowpea heat rows 80-120 d, tmin 10) |
| faostat | 567 Watermelons | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | watermelon | layer name as supplied in the brief |
| contract | False | - |
| perishableDays | 14 | extension: typical shelf life at recommended cold-chain temperature |
| residue (dry/slope/intercept/rbg) | {"dry": 0.07, "slope": 0.8, "intercept": 0.5, "rbg": 0.2} | assumed: water content 93 % |

**Caveats**
- Grafting changes rotation interval 5 -> 2-3 y.

## okra

| field | value | source |
|---|---|---|
| latin / family / group | Abelmoschus esculentus / malvaceae / vegetable | taxonomy |
| fao.sow | [5, 10] | assumed: sown after soil warms; reference May |
| fao.days | [20, 30, 40, 20] | assumed: not in FAO-56 Table 11; 110 d cycle with picking over ~60 d (extension). Pepper/aubergine Table 11 rows (125-130 d) give the same order |
| fao.kc | [0.6, 1.05, 0.9] | assumed: not in FAO-56 Table 12; analogue Egg Plant: ini 0.6, mid 1.05, end 0.90 |
| rootDepth | 1.2 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Egg Plant 0.7-1.2 m (upper), analogue |
| p | 0.45 | FAO-56 Table 22 (fetched fao.org/3/x0490e/x0490e0e.htm), Egg Plant p 0.45, analogue |
| ky | 1.0 | assumed: not tabulated; moderate |
| heatMonthOffset | 2 | assumed: flowering ~ day 45-55, picking begins a week later |
| tMax | 36 | assumed: optimum 25-35 C (ECOCROP) |
| tCrit | 40 | assumed: okra tolerates heat: flower drop from ~40 C; literature recalled, not verified |
| minSowT | 18 | assumed: ECOCROP/extension: seeds rot below ~16-18 C |
| frostTender | True | frost-killed; chilling injury below 10 C |
| nFix | 0 | assumed: non-legume |
| nDemand | 100 | assumed: extension 80-120 kg N/ha |
| carbon | 0.2 | assumed: woody stalks |
| N_RESIDUAL | 40 | assumed: assumed |
| coverGap | 0.6 | assumed: sown wide |
| minBreak / maxRun | 3 / 1 | assumed: root-knot nematode, Fusarium wilt, yellow-vein mosaic; 3 y break |
| diseases | root-knot nematode, Fusarium wilt, yellow vein mosaic virus, powdery mildew | extension/peer-reviewed literature, general knowledge (no single citation) |
| econ.yield t/ha | 12 | assumed: US 8-12 t/ha; world avg ~8 (FAOSTAT, not re-pulled) |
| econ.price EUR/t | 1000 | assumed: US fresh okra ~1000-1500 USD/t; not re-verified |
| econ.cost EUR/ha | 8000 | assumed: estimate: pods picked every 1-2 days |
| gaez | {"phGroup": {"reuse": "Cotton"}, "textureGroup": {"reuse": "Cotton"}, "heat": {"reuse": "Cowpea"}} | GAEZ v4 has no group for this crop; existing group reused as agronomic proxy (both Malvaceae, warm-season; cowpea heat rows 80-120 d, tmin 10) |
| faostat | 430 Okra | FAOSTAT QCL item code recalled from memory, not re-verified live (verify before use) |
| cropgridsLayers | okra | layer name as supplied in the brief |
| contract | False | - |
| perishableDays | 7 | extension: typical shelf life at recommended cold-chain temperature |
| residue (dry/slope/intercept/rbg) | {"dry": 0.1, "slope": 0.8, "intercept": 0.5, "rbg": 0.2} | assumed: water content 90 % |

**Caveats**
- No FAO-56 or GAEZ rows; aubergine analogues.

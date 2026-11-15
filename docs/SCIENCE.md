# Zixtaro — methods, evidence and limits

*For judges, agronomists and Earth scientists. Every number in the app has a row in the evidence registry
(`src/lib/evidence.ts`, shown in the app under Method → “Where every number comes from”) that states what kind of
evidence it is, where it comes from, how far to trust it and whether a unit test holds the code to its source.*

## 1. What the tool answers

For one field — anywhere on Earth — Zixtaro ranks what to grow next season and proposes a four-season rotation that
balances soil health, water and margin, weighted by the farmer's own priorities. Every recommendation answers ten
questions (the “What this recommendation rests on” panel): the evidence behind it, the NASA observation that
affected it, the local soil, the farmer's priorities, the agronomic rules, published science vs rules of thumb,
sensitivity, when another crop would win, limits, and sources.

### Three views of a field, kept apart

- **A - the scientific score.** Climate, soil, water, money and the rotation; nothing about what farms grow. The page
  shows it under "show science only", and beside every practice-informed score ("science alone").
- **B - observed practice.** What farms around the field grow (CROPGRIDS 2020), shown beside A, never mixed into it.
- **C - practice-informed (the page's default, labelled; "show science only" returns to A).** The
  science pushed toward what farms around grow by a bounded log-prior (src/lib/prior.ts): log score = log A + push,
  push = clamp(lambda x log(share / uniform), +-log cap), the share being the crop's part of the harvested area in a
  ring 100-250 km around the field (CROPGRIDS 2020; the field's own 0.5-degree cell and its neighbours left out),
  lambda 1, cap x16; where CROPGRIDS has no cropland around, the country's FAOSTAT mix with lambda 0.3, cap x2. In the USA, Canada, France and Denmark, the share is instead what farms around sow after the field's last
  two crops (§8c), blended with the field's own cycle (0.15) and with what the fields of a crop-map window around it
  sowed after the same crops in 2019-2023 (0.6; CDL or ACI 6 km, RPG or Marker 2 km, read by the page), with the bar at
  0.3 of the best score (src/lib/fieldPractice.ts) - the setting pre-registered experiment H8 judged on 85 new fields:
  mean rank 1.85, top three 90.4 % [87.1-93.0], catastrophic 0.57 %. A crop
  the science rates under half of the best score of a crop that is sold here gains on no plausible crop - practice
  reorders what the science allows, it never rescues what the science rules out (a cover crop or a bare fallow sells
  nothing and is in no crop map, so it sets neither the bar nor its floor). On the page the prior enters as the "Local practice" factor
  (each score times e^(push - the largest push), the loss shown with the other losses), so the explanations name it.
  Why the prior, not more science: the best leave-country-out combination of all 34 features of A adds 0.01-0.03 of a
  rank to the country's mix - at 0.5 degrees A carries almost no information on what
  farms grow beyond their country's mix, while a regional mix does. Pre-registered check I (48 fresh
  places): the crop grown most ranks 1.50 [1.25-1.81] on average, top 3 in 98 %, no catastrophic miss; the country's
  mix as the prior 2.04 / 85 % on the same places; A alone 4.81 / 44 %. What this claims: the default view reproduces
  regional practice. It does not claim better science or better advice (experiment H3 asks that).
  Earlier, view C was A x the national proof (1 at scale, 0.8 niche, 0.5 world-only); on the development
  cells it ranked the crop grown most 3.12 on average, top 3 in 69 %.

The national proof used to be a gate inside the scientific score. The forensic audit found that this is
observed practice (FAOSTAT harvested areas), and that a large part of the model's apparent agreement with CROPGRIDS
came from it: on pre-registered run A, removing the niche part alone took the mean rank from 3.29 to 4.63, and the
model's scores followed the *country's* crop shares (Spearman 0.53-0.61) more closely than the *cell's* (0.45-0.50),
so the within-country signal (cell share − country share vs the model's centred score) was negative (ρ ≈ −0.35).
Earlier blind results measured view C with the national proof only; from now on A and C are reported
separately. The niche cap on the expected harvest stays in A: it is a judgement about the
national yield being unrepresentative of an ordinary field, not about ranking.

## 2. Data

| Data | Used for | Kind |
|---|---|---|
| NASA POWER monthly & daily (MERRA-2, CERES/SRB) since 1981 | rain, ET₀ (FAO-56 Penman–Monteith), temperature, daily heat & frost, storm rain - temperatures moved from the cell's mean height to the field's at 5.0 °C per km (`height.ts`, live fields; held-out check T) | modelled (reanalysis) |
| NASA MERRA-2 GWETROOT | independent check of the soil-water model | modelled |
| NASA GRACE / GRACE-FO | regional groundwater trend behind irrigation advice | observed |
| NASA NEX-GDDP-CMIP6 (3 models) | 2050s what-if scenarios (delta change) | projection |
| ISRIC SoilGrids 2.0 (1–5 samples per field) | texture, organic carbon, pH, bulk density, stones to 2 m | modelled |
| CROPGRIDS 2020 (0.5° cells, bundled) | what farms around the field actually grow — shown, never scored | modelled (census-based) |
| NASA MODIS Terra 16-day vegetation index (GIBS tiles, ≈ 300 m) | crop type of past seasons, confirmed by the farmer | observed |
| Farmer | crop history, priorities, water budget, lab soil test (topsoil) | farmer |

## 3. The engine

* **Water** — a FAO-56 root-zone bucket in 10-day steps on monthly NASA POWER rain and ET₀; plant-available water
  from Saxton & Rawls (2006) on SoilGrids texture and carbon; FAO-56 Kc curves, stage lengths, rooting depths and
  depletion fractions (our transcription is held by tests to pyfao56's independent one — which caught two errors);
  yield loss from FAO-33 Ky. Validated against MERRA-2 GWETROOT (ρ 0.51–0.87 by month on the demo fields).
* **Soil suitability** — FAO/IIASA GAEZ v4 ratings of pH and texture (share of yield potential, high inputs),
  transcribed from the official appendices by `scripts/gaez.py`; the more limiting of the two scales yield and site
  fit. Overrides only where crop research is stronger: sugar beet (BBRO, optimum pH 7), rapeseed (AHDB).
* **Warmth to ripen** — GAEZ v4 heat units: from the sowing date, each GAEZ cultivar length of the crop is tried and
  the best one counts (0 at GAEZ's lower limit, 1 from its lower optimum); on tropical fields the temperate cultivars
  count too (tropical highlands). Cassava uses degree-days (~8 months at 18 °C) instead of GAEZ's table.
* **Paddy rice** — bunds hold up to 100 mm of standing water, which percolates at 1.5-8 mm/day by topsoil sand
  (FAO-56 ch. 7); the paddy is transplanted flooded; its irrigation need counts the seepage.
* **Calendars** — FAO-56 Table 11; six months later in the south; in the tropics, and beyond them on summer-rain
  fields without a cold winter (the monsoon belt, the Mexican plateau), the rainy season by FAO's growing-period rule
  (rain ≥ ½ PET): warm-season crops at its onset, cool-season crops after it (kharif / rabi), paddy rice in the first
  month with rain ≥ PET. Elsewhere a spring sowing waits (≤ 3 months) until the day's mean air temperature reaches
  the crop's seed-bed minimum. Where the recent winters kill a winter crop in at least half the years, the field grows
  its spring form (wheat, barley, rapeseed: FAO-56 calendars, FAO-33 Ky).
* **Extremes** — daily heat at flowering against published critical temperatures (Porter & Gawith 1999, Hatfield et
  al. 2011 …), killing frost after emergence, winter kill.
* **Rotation** — break intervals and disease bridges from extension guidance (AHDB clubroot, PGRO pulses, BSPP
  potato cyst nematode, EU rootworm recommendation); the same crop past its usual break but inside a disease's
  break costs half the penalty, because the model cannot know whether the disease is present.
* **Soil health** — carbon from IPCC 2006 residue relations and ICBM humification (RothC/IPCC climate factor);
  nitrogen balance kg for kg after the previous crop's credit (Preissel et al. 2015); nitrate within reach of deeper
  roots (Burns 1974 profile, Thorup-Kristensen 2006); field erodibility from RUSLE R·K·LS (Renard & Freimund, EPIC K,
  McCool LS) and the Fryrear wind-erodible fraction; nitrate leaching over winter (Burns 1974, EU 50 mg/L).
* **Score** — 100 × rotation × viability × (0.25 site fit + 0.75 weighted soil / water / profit). Profit is the
  expected margin; water is, rainfed, the drought risk - the money the driest 30 % of recent seasons put at stake: their
  mean yield loss × the crop's reference revenue at this market's price, but at least the field's revenue level (the
  best reference revenue among the field crops grown here without a contract or a herd), so a cheap crop does not look
  drought-safe for being cheap - and, irrigated, the margin per mm of irrigation water. The rainfed water axis used to be the dry-year margin
  itself, a second copy of profit (see "Drought, path by path" below). Default weights soil 60 / water 15 / profit 45.
  The weights are a design choice; exact Shapley values show how much each part contributed to any comparison.

## 4. How sure — and is that honest?

* A seeded Monte Carlo (240 runs) varies soil water ±20 %, which recent seasons occur, Ky ±15–25 %, prices ±20 % and
  the priorities ±15; the share of first places is the confidence. One-at-a-time flips and an irrigation ladder show
  what would change the pick; a counterfactual without the observed climate shift shows whether NASA's record decided it.
* **Calibration (out of sample):** 85 decisions on the five demo fields (2000–2016), each with data only up to two
  years before, re-ranked once the next ten seasons were observed. Rated 50–70 %: held 60 %; 70–90 %: held 75 %;
  90–100 %: held 100 % (Brier 0.071 vs 0.076 for the base rate). Resampling the weather alone was over-confident —
  the past decade cannot show a trend coming — which is why the app varies the other inputs too.
* **Backtest without leakage:** each past season re-decided on the record a farmer could have had.

## 5. Changes made because the evidence said so

| Was | Now | Why |
|---|---|---|
| erosion risk = 0.4 + sand/100 + slope/10 | RUSLE bare-soil potential R·K·LS + Fryrear wind fraction | published, field-specific |
| any root-depth difference rewarded (even shallower) | nitrate below the last crop's roots within this crop's reach | the old rule rewarded the wrong thing |
| fixed N counted 4× fertiliser N | kg for kg, with the pre-crop credit also in the margin | no basis for 4× |
| hand-set pH ranges, 0–1 texture tolerances | GAEZ v4 ratings | institutional source, tested transcription |
| degree-day needs set by hand | GAEZ v4 heat units, best cultivar | institutional source |
| potato cyst nematode gap 3 | 5 (≥ 6 years between potatoes, BSPP) | extension guidance |
| soybean Kc ini 0.4, dry pea p 0.35 | 0.5 and 0.40 | FAO-56 as transcribed by pyfao56 |
| baseline 1981–2010 even for records cut short | baseline kept clear of the recent decade | backtests compared a decade with itself |
| Central-European sowing dates north of 23.5° | spring sowing waits for the seed-bed to warm | oats sown on 25 March on the Saskatchewan prairie (thermal fit 0.05) |
| winter wheat, barley, rapeseed only | spring forms where winters kill the winter form | Kazakh wheat ranked #24 with viability 0.27; Saskatchewan rapeseed #23 |
| monsoon calendars only south of 23.5° | on any summer-rain field with a mild winter | rice sown into the dry May heat at 24° N in India |
| rice as a thirsty field crop | a bunded paddy, transplanted flooded | rice lost water points under 3.3 m of seasonal rain (Guinea) |
| water axis = share of the crop's own potential kept in dry years | what the dry years still pay, in money | low-ceiling crops (proso millet, groundnut) won it everywhere |
| irrigated water axis against the thirstiest crop | margin per mm of water used | one crop was always last by definition (irrigated rice ranked 23rd-26th) |
| auto market chases any big neighbour | only crops the country exports (≥ 5 % of production) | Guinea's rice "sold" in Niger at 2.6× |
| European seed and field-pass costs everywhere | they follow the country's observed intensity | staples earned nothing in low-yield countries |
| tropical fields: GAEZ tropical cultivars only | tropical and temperate cultivars | Mexican plateau maize (80 % of the land) had thermal fit 0 |
| page ranked without observed yields | the country's FAOSTAT yields, as every evaluation | the page was not the validated model |
| drought risk = dry-year loss × the crop's own reference revenue | × at least the field's revenue level | a crop earning 150 €/ha looked drought-safe for being cheap (Bambara groundnut topped Sahel cells); on 169 development cells mode A 6.75 → 6.22, C 3.69 → 3.63, catastrophic 25 → 21, top-3 (A) 53 → 50 % |
| the drought-risk axis also subtracted 0.8 × the rise of the mean loss since the baseline | the recent period's dry-year loss only | counted the climate shift twice, and not monotone: less rain raised the axis of crops near total loss (sugarcane and taro in Kansas); it moved no top pick at ±50 % |
| heat at flowering: a season hit or not (≥ 3 days at or above the critical temperature) | the loss grows with the degree-days above it, a full hit at 7 | 2 hot days cost nothing and the 3rd the full 30 %: the warming scenario moved yields in steps; same mean loss (0.32 → 0.31 on the development cells) |
| a crop that ripens sooner in a warmer climate drops whole months from its season and moves its heat window a month | the two neighbouring whole-month calendars blended by where in its month the need is met | +0.5 °C cut July from Torgau's winter wheat (water-stress loss 16 % → 6 %) and its heat at flowering 20 % → 0; it also put triticale a month ahead of winter wheat by rounding. Kinks in the warming response −28 % on the development cells, ranking neutral (mode A 4.22 → 4.25, C 3.11 → 3.12) |
| a what-if shortened the season (less water stress) but not the grain fill | under a what-if only, yield × (T − Tb) / (T + ΔT − Tb) over flowering to maturity: Tb 0 °C for cool-season grain crops, 8 °C for C4 cereals (CERES-Maize); not rice, soybean or other warm-season grain crops | winter wheat scored higher at +2 °C on 24 of 216 development cells; median at +1 °C wheat −1.3 → −6.1 %, maize −2.1 → −8.4 % (literature −6.0 / −7.4 %, Asseng et al. 2015, Zhao et al. 2017); soybean and rice left at −1.5 % (−3.1 / −3.2 %) because the term overshot them (−7.6 / −7.5 %) - scope chosen on the development cells. Wheat higher at +2 °C on 14 cells, mostly form switches and eased winter kill; observed-climate scores identical |
| greenhouse: heated fruit vegetables at a full Flemish cost price; cucumber and pepper at the tomato's northern premium; tomato yield of all types; 1 air change an hour, a screen leaving 60 % | farm-account direct costs; each crop's own Dutch premium (DG AGRI); round and truss tomato yield (LEI 2016-068); measured leakage, screen and boiler | a Westland glasshouse lost money on every heated fruit vegetable in every year 2016-2024 where Dutch farms profit; now on the Dutch calendar 2016-2021 tomato pays 6 of 6 years (€2-8/m²; farm accounts €4-13 net), pepper 4, cucumber 3 - still below the accounts (no combined heat and power, general gas tariff) |
| greenhouse: Dutch boiler gas at Eurostat's band I3 price, which carries the general energy tax; no combined heat and power | the price before taxes plus the reduced glasshouse energy tax (band 170 001-1 000 000 m³ a year, assumed); an optional gas engine (43 % power, 47 % heat) run month by month when it beats the boiler, power to the lamps first and the rest at the day-ahead price | Westland on the Dutch calendar 2016-2021: tomato €2-8 → €5-11/m² (farm accounts €4-13 net), pepper 4 → 6 of 6 years, cucumber 3 → 5 of 6; with the engine, unlit tomato sells €0-8 of power a m² in 2016-2020 against the €4-12 of energy Dutch tomato farms sold |
| winter kill all or nothing per winter; the rains' onset and a warm-season wait for warmth rounded to whole months | a kill share ramping over ±1 °C around the hardiness; the onset where rain/PET crosses ½ between mid-month normals, and the wait blended, as shares of a month | sowing closer to GGCMI where the rains set it (median 29 → 26 days); a warmer scenario no longer moves the season's water by whole months; ranking neutral |
| mode C's plausible bar at half the best science score of any candidate, a cover crop or bare fallow included | of the crops that are sold | at the Kansas demo the fallow (66) and before it the cover crop (59.1) put the region's main crop, wheat (39 % of the harvested area around; science 28.8), under the bar; the evaluations switch both off, so no measured result moves |
| a crop switched form all at once - winter to spring wheat at half the winters killed, to the autumn-sown spring type at a 10.0 °C coldest month, grain to silage maize at half the summers unripe | within a band around each line (±0.15 of the share, ±1 °C) the field is scored on both forms, weighted by where it sits | a 0.5-degree what-if swapped a whole crop and its calendar; on the development cells form-switch steps 40 -> 6, ranking unchanged (mode A 4.18, mode C 3.14 -> 3.13) |
| a rainy season starting in the warm half counted as a monsoon wherever the winter was mild | not when it holds the coldest month and not the warmest (autumn rains lasting through winter) | an Adriatic field at +2.5 °C turned "monsoonal" and sowed soybean in September (the only development cell the rule changes); sowing-month steps on the development cells 262 -> 234 |
| the Monte Carlo ("How sure", sensitivity, Sobol), the backtest, the plan's fertiliser N, soil-carbon outlook, nitrate and cover, the heat-wave panel, the forecast's drill check and the daily water check took a crop's base form; silage maize read grain maize's residue and N rows | the form the field grows, as the score does (rotation.ts formIn, crops.ts tableId) | spring wheat on the prairies, silage maize in Denmark, the autumn-sown wheat of Punjab were drawn, fertilised and dated as winter wheat and grain maize |
| a summer-rain field's sowing switched from warmth to the rains where the coldest month reached 10 °C; a cool-season crop waited for warmth in whole months | both rules weighted from 10 to 11 °C (the band starts at the line: the rains' calendar is a rule on rain); the two months around a cool-season sowing blended within ±1 °C of its seed-bed minimum | at the three development cells that cross the line under warming the median crop's largest 0.1-degree move 8.5 / 43.4 / 23.0 % -> 1.9 / 4.3 / 3.7 %; ranking mode A 4.18 -> 4.11, mode C 3.14 -> 3.11 |
| a few per cent more rain switched the summer-rain sowing rule (2-8 rainy months) or the rainy season at once; several months at ½ PET together defeated one deciding month at a time | every month within 0.1 of ½ PET counts wet by its share of the band, over every combination: the rule weighted by its share, the season a mixture of every season it can be | at 10 development sites largest 1 % rain steps over 10 % 168 -> 26 (+0 °C), 230 -> 61 (+2 °C); ranking all but unchanged |
| a field near two lines (a form, the sowing rule, a split) kept only the first that applied and stepped on the other | every combination is scored, weighted (water.ts formsOf) | Cordoba's largest 0.1-degree move 9.5 -> 2.0 %, five line sites over 10 % 75 -> 35; ranking unchanged; check O's cells reached none |
| a month inside the rains that dried a little split the rainy season, moving a rain-set sowing two months or more at once | a month within 0.1 of ½ PET that splits the season counts both ways, the field scored on both seasons, weighted | warming steps by the sowing month 134 -> 100 on the development cells; ranking unchanged |
| a sowing between two months: one water balance on the two calendars' blended crop coefficients, starting with the earlier month; the heat-at-flowering window slid by days | the water balance and the flowering window run on both calendars, the results weighed | a 2 % weight had moved Saskatchewan lentils' water loss 0.58 -> 0.50; warming steps 1 213 -> 1 144, kinks -0.8 points per cell [-1.3, -0.2] |
| wet-season disease: a season over the crop's rain limit counted fully, 1 mm under it not at all | a hit from none 10 % under the limit to full 10 % over it | the last yes/no rule in the yield; ranking neutral on the development cells (mode C 3.13 -> 3.14) |
| 30 crops; 21 % of an average cell's area in crops the model did not have | 52 (tobacco, forage and vegetables only when switched on), each against FAO-56, FAO-33, GAEZ v4 and FAOSTAT or marked assumed | what farms grow; on the development cells the main crop's absolute rank fell (A 6.07 → 7.11) while the share of candidates above it fell too (20.4 → 18.0 %) |
| no bare fallow: the Kansas demo's wheat-sorghum-fallow history had a cover crop standing in for it, and the next crop always started on the soil a crop had left | a "Bare fallow" season (off by default): 12 bare months evaporating in FAO-56's two stages (eq. 73-74), the next crop starting on the water stored | dryland practice from the Great Plains to the steppe; checked, not fitted, against western Kansas trials - the model stores 15 % of the fallow year's rain against 26-27 % measured and lifts wheat ×1.36 against ≈ ×2 (Gwin et al. 1984), because monthly rain is spread over the month |

A canopy × NASA-storm C-factor was also built and **rejected**: at Torgau it ranked winter wheat above maize, against
measured German C-factors (0.12 vs 0.35). It is documented, not used.

## 6. Limits (the app checks the detectable ones per field)

22 known failure modes are listed in the app's validity panel: tropical onset varies by weeks; one main crop per
year (double cropping not modelled); winter crops need a winter; peat and heavy clay are outside Saxton & Rawls;
waterlogging, salinity and aluminium toxicity only by proxy; mountain cells; short records; provisional soil;
region-sized outlines; storms, pests, cultivars, management and markets are not modelled. Prices and yields are
labelled assumptions — replace them with local ones. Published farmer studies are supporting evidence, not a
description of any particular farmer; our own farmer interview is separate primary research.

### What regions actually grow: observed yields help, farm-gate price levels do not

`npx tsx scripts/reality/check.ts` ranks each site with no field history and even priorities, three ways: reference
yields and prices; the country's observed FAOSTAT yield (2019–2023) scaled by the field's conditions; and that plus
the field's own market.

| Site (area record) | Dominant crops | Reference | Observed yields | + market (relative) |
|---|---|---|---|---|
| Story County, Iowa (USDA CDL 2021–23) | maize 55 %, soybean 44 % | #7, #5 | #2, #3 | #2, #3 |
| Finney County, Kansas, rainfed | wheat 36 %, sorghum 31 %, maize 30 % | #24, #5, #27 | #24, #5, #27 | #24, #6, #27 |
| Pergamino, Argentina (MAGyP) | soybean 59 %, maize 17 %, wheat 15 % | #3, #17, #12 | #3, #20, #14 | #2, #24, #14 |
| Torgau, Saxony (top 5) | — | rapeseed, sorghum, millet, chickpea, rye | rapeseed, sorghum, wheat, triticale, rye | rapeseed, sorghum, barley, wheat, triticale |

Two lessons. (1) One reference yield per crop was the main error: with the country's observed yield, Iowa maize and
soybean move to #2 and #3. (2) Absolute farm-gate prices made it worse (Iowa maize fell to #12): the reference costs
are one set for the world, so real prices without matching local costs favour niche crops with under-costed
production (US cowpea ≈ 1 100 €/t on a 17 kt market, sweet potato, cotton). The ranking therefore keeps the reference
prices and lets a market move them only relative to selling at home (freight, duty, a dearer buyer abroad); the
Market section shows the absolute euros. Markets under 20 000 t a year are niches, priced at most at the world median.

Winter crops then ripened on a German calendar everywhere (flowering in June, harvest in July), so at 38° N wheat was
"harvested" at peak water use and flowered in 100 % hot seasons. Now the degree-days since sowing (NASA POWER, base
0 °C) set how much sooner a winter crop ripens: up to two months of the winter rest are dropped and spring growth,
flowering and ripening follow on (`thermalAdvance` in crops.ts). Kansas wheat flowers in May and is cut in June;
Pergamino wheat peaks in October–November and is cut in December; Torgau wheat, barley, rye and rapeseed keep their
calendar. The demo plans changed with it (Torgau: rapeseed → triticale → linseed instead of rapeseed → millet → linseed;
Pergamino: wheat instead of sorghum) and the mean Spearman ρ rose from 0.03 to 0.27 (0.23 with observed yields,
0.17 with the market too). Irrigated Kansas wheat moved from #16 to #7; rainfed it stays #23 — dryland wheat there
lives on water stored during a fallow, which the one-season water model does not carry over.

### Blind validation against what farms grow, and what it changed

**Protocol.** Truth: the crop family with the largest CROPGRIDS 2020 harvested area in a 0.5° cell (proso and pearl
millet are one family, as CROPGRIDS maps FAO's Millet item). Cells: intensive cropland (≥ 600 km² harvested, ≥ 50 % in
modelled crops, |lat| < 60), never the 72 cells global.ts was tuned on nor the demo fields' surroundings. The engine
runs as the page does for a new field (NASA POWER monthly and daily, SoilGrids, FAO GMIA irrigation default, FAOSTAT
yields, auto market, the page's priorities, no history); the crop list never peeks at CROPGRIDS. Baselines: chance, and
ranking crops by the country's FAOSTAT harvested area - which knows nothing about the field. CROPGRIDS itself leans on
FAOSTAT 2020 national totals, so beating chance is not the bar; beating the country is.

**First run (24 random cells, seed 449307154), the engine as it stood:** the crop grown most was the model's top pick
in 2 cells, in its top three in 5, at mean rank 10.8 (chance 13.8); the country baseline: 17, 24 and 1.4. A
drought-hardy crop was the model's pick in 18 of 24 cells, farms' main crop in 2. Those 24 cells, the 72 tuning cells
and one audit cell became the development set (97 cells); every change above was measured on it before it was kept.

**Where the crop grown most fell** (the same 24 cells, rank after each stage):

| stage | before: mean rank | cells ranked ≥ 15 | after: mean rank | cells ranked ≥ 15 |
|---|---|---|---|---|
| soil × water | 11.7 | 6 | 11.2 | 6 |
| + phenology (warmth, heat, winter, frost) | 10.7 | 6 | 7.9 | 3 |
| + yield in money (× reference price) | 10.9 | 8 | 9.5 | 6 |
| + costs | 12.3 | 10 | 8.5 | 5 |
| + market | 11.3 | 8 | 9.0 | 5 |
| full score | 10.2 | 7 | 6.8 | 2 |
| full score, after the layer audit | | | 6.4 | 2 |

Before, phenology was where the spring-wheat belt collapsed (winter forms killed); after, the physics lifts the crop
grown most, and the step to money at reference prices costs it the most places (14 of 24 cells) - staples earn little
per hectare at reference prices against pulses, oilseeds and roots.

**Development set, before → after (97 cells, crop families):** mean rank 8.0 → 6.0, top-1 9 % → 19 %, top-3 24 % →
35 %, Spearman 0.29 → 0.39, catastrophic failures (the crop grown most ranked ≥ 15th or viability < 0.5) 12 → 6, a
drought-hardy crop as the pick 58 → 19 cells (farms' main crop in 17). The country baseline stays far ahead (mean
rank 1.8, top-1 62 %).

**Layer audit** (one crop on one cell through identity, calendar, temperature, water, soil,
yield, viability, money, market and score, with the raw numbers behind every penalty). Eight known failures went
through it; weights were not touched. Proven wrong and fixed: viability gated drought and winter kill a third time
(they are already in the yield and the dry-year water axis; the gate now keeps local proof only); heat at flowering
counted every hot day of the month (now 21 days: from the start of FAO-56's mid-season stage for crops with FAO
calendars, from the start of the heat month for winter crops - spring rapeseed had been checked in its ripening
August; North China Plain wheat stays hit in every recent season, as early-May heat ≥ 31 °C falls in its flowering
window there, and the heat-tolerant cultivars and irrigation that carry it are not modelled); the auto market
chased neighbours' prices out of reach of any trade (Kazakh rice "sold" in Kyrgyzstan at 4.9×; a buyer abroad above
1.3× the home price is now ignored - the law of one price, 30 % trade costs being an assumption). Proven wrong and
still open: the yield anchor counts a dry country's drought twice (the national FAOSTAT yield already holds it, and the
field's water loss is applied on top: Kazakh wheat 0.43 t/ha against the country's 1.06 at a cell that is 61 % wheat);
the fix needs each country's typical growing conditions per crop, which is a bake, not a coefficient. Suspect: paddy
rice is assumed bunded wherever the rains flood the field, so rice becomes the pick on the well-drained Cerrado and in
western Kenya; surface-water irrigation is priced as pumping (1.5 €/mm; Peru's canal rice pays 2 088 €/ha for water).

**Final blind test** (24 fresh cells, seed 1361244413 drawn and recorded before the run, never used for tuning).
Pre-registered: fewer catastrophic failures than the first run (7 of 24) and a better mean rank than its 10.75; the
comparison with the country published as it comes out.

| | first run | test, before the layer audit | after it | final engine |
|---|---|---|---|---|
| mean rank of the crop grown most (median) | 10.75 (8) | 6.46 (4) | 5.00 (3.5) | 4.25 (2.5) |
| top-1 / top-3 | 8 % / 21 % | 4 % / 38 % | 13 % / 50 % | 17 % / 63 % |
| catastrophic failures | 7 | 2 | 1 | 1 |
| country baseline, mean rank | 1.4 | 2.04 | 2.04 | 2.04 |
| model + national practice (k = 1), mean rank | - | 3.00 | 2.17 | 2.08 |

Both criteria pass; the country's own crop mix still beats the model at naming the main crop, and the practice prior
closes most of the gap without passing it. Three looks at the same locked cells, reported as they came: every change
between them came from x-rays of development cells (the audit fixes; then irrigated water counted as irrigation, not
rain; then niche yields), none from the test cells.

**Two more layer faults the x-ray found:** the irrigated water axis first divided the margin by all water used, rain
included, which marked monsoon rice down on irrigated fields (West Bengal's fell from first to fourth) - it now counts
irrigation only (at least 50 mm); and FAOSTAT yields of crops a country grows only in niches carried to ordinary
fields - Senegal's 43 t/ha of garden sweet potatoes, Niger's 29 t/ha of valley cassava - making roots and tubers the
pick in 22 development cells: under 1 % of the country's crop land, the physics' harvest is now the ceiling. What the
x-ray shows but no rule should fix: at the reference prices pulses and oilseeds earn more per hectare than staples
where yields are low (soybean becomes the pick across West Africa, where farms grow maize and sorghum for food) - the
gap the practice panel explains; local prices and costs, not a coefficient, would close it.

**Tried and rejected on the development set:** the country's own FAOSTAT price ratios between crops at the reference
level (top-1 21 % → 7 %: roots, tubers and pulses carry high, noisy local prices); world-median prices (cassava's
median is 283 €/t, a unit artefact); dropping or halving the field's yield adjustment against the country's observed
yield (no gain at the final score).

**What the model knows beyond a country's crop mix**: regressing each cell's
crop shares on the national shares, no stage of the engine adds share information (R² gain +0.0003, 95 % CI 0 to
0.001), and adding a prior from the national mix never beats the mix alone at naming the main crop. But among the
crops that matter nationally, the model separates the cells that grow them from those that do not: AUC 0.65
[0.59, 0.72] for the full score, 0.59 for the physics alone. So the tool's value is not predicting practice; it is
telling where within a country a crop can and cannot pay - and the page keeps the scientific ranking free of
prevalence, shows what farms around grow beside it, explains the disagreement in the model's own numbers, and offers
a small, visible practice prior (score × (1 + 0.25 √share)) as a separate view.

**Still failing and why:** North China Plain wheat and Punjab foothill wheat are judged rainfed (GMIA irrigated share
0.49 and 0.10 - crop-specific irrigation such as MIRCA2000 is missing); Bahia's semi-arid maize is a subsistence crop
the physics rightly calls risky (the country's 5.45 t/ha is Cerrado farming); Kenyan highland maize (two rainy seasons,
a coarse POWER cell); highveld and Danube-plain maize water stress; irrigated desert rice in Peru. Sub-national yields
(IBGE, HarvestStat Africa, Statistics Canada, GDHY) would let yields be judged locally instead of against national means.

### Every layer against its own truth (level audit)

A crop falling in the ranking at some stage proves nothing on its own - sorghum *should* beat maize on drought in the
Sahel. A layer is wrong when it misses its own, independent truth. So each layer was checked against data that play
no part in the model, on the development cells (121: the 97 above and the retired locked test), before anyone looked
at the ranking again:

| layer | independent truth | what it showed |
|---|---|---|
| rain (input) | WorldClim 2.1 station normals (Fick & Hijmans 2017); ERA5 via Open-Meteo | NASA POWER / stations: median 1.00; > 25 % off in 14 % of cells, > 40 % in 9 %. ERA5 is further from the stations (> 25 % off in 33 %) and sides with them in 5 of the 9 split cells. One clear failure: the Irrawaddy delta, POWER 365 mm a year against 2 381 (ERA5 2 139) |
| crops covered | CROPGRIDS | a median 21 % of a cell's harvested area is in crops the engine does not model (vegetables, sugarcane, sesame, coffee, oil palm, pigeon pea, cocoa); cells with less coverage are not ranked worse |
| wheat's form | GDHY winter / spring seasons | right in 35 of 36 cells |
| calendar | GGCMI Phase 3 crop calendars (Jägermeyr et al. 2021) | sowing off by a median 20 days, > 45 days in 28 % (both rainy seasons at the equator; GGCMI dates transplanted rice at the nursery). Wheat in warm winters flowered in May-June instead of February-March in 17 of 44 wheat cells - the European calendar in Punjab, Egypt, Morocco |
| water, year to year | GDHY yields 1981-2016 (Iizumi & Sakai 2020), detrended | Spearman ρ median 0.09 - weak, but above naive rain / PET (0.04) and POWER's root-zone wetness (0.06) on the same months; the dry-year shortfall is right on the median (model 19 %, GDHY 16 %), > 2× too deep in 20 % of cells |
| yield level | GDHY 2012-2016 | model / GDHY median 0.98, within ± 30 % in 52 %; the field's adjustment against its country tracks GDHY's (ρ 0.30) but marks arid temperate cells down too far (0.56 vs 0.69: the drought double count above) |
| prices | FAOSTAT producer prices, official levels | levels chained from FAOSTAT's (estimated) price index drift with devaluations: Argentina's soybeans "fall" from 277 to 97 €/t over 2015-2022, Nigeria's prices halve in 2023-2024 |

**Oracle ablation**: hand the engine the truth of one layer and watch the crop grown most.
Mean rank on the development cells: model 5.27; with GGCMI's calendars (sowing and maturity) 5.29; with station-scaled
rain 5.22; with the country's own (cleaned) price ratios 6.04. The physics is not where the ranking loses the crop farms
grow; errors in it offset each other in single cells (true calendars lift Romanian maize from 14th to 2nd and drop
Mexican-plateau maize from 2nd to 14th), not on average.

**Where the misses were** (75 of the 97 development cells, before the changes below): the pick was grown in the cell,
just on less land (30 - a plausible answer); grown in the country but not in this cell (27 - the within-country
question); or grown on under 1 % of the country's cropland (18 - sweet potato in India and Egypt, soybean in Kenya,
Mali and Ethiopia, chickpea in Canada). The last kind contradicts the model's own evidence rule: a crop missing from a
country's record already counts as limited by something unseen (local proof), a crop kept to niches did not.

**Changed:**
1. *Niche crops count as the neighbours' record* (viability 0.8, as for a crop only neighbouring countries grow).
   Development cells (97): mean rank 5.58 → 4.13, top-3 42 % → 52 %, catastrophic failures 7 → 1, Spearman 0.42 → 0.51.
   It uses FAOSTAT's national record - the same evidence as local proof - never CROPGRIDS; the page says so on the crop.
2. *Mild winters* (coldest month ≥ 10 °C): wheat, barley and rapeseed are planned as spring types sown in late autumn
   (two months before the coldest month; in the tropics the rains decide), ripe when the degree-days reach the crop's
   own need. False heat at flowering in Punjab, Egypt and Morocco is gone (heat in every season → none); ranking neutral
   (4.13 → 4.11); harvest / FAOSTAT in arid temperate cells 0.74 → 0.81. Known: without day length the season is about
   a month too short in Morocco, Australia and northern Argentina (maturity − 29 days median against GGCMI).
3. *Price artefacts*: a chained price-year whose country, crops together, sits more than 1.4× from where its official
   (or first) years sat against the world is dropped (`scripts/markets-clean.mjs`; normal variation: 95 % within 1.31×);
   920 price-years in 66 countries. The ranking does not move (5.53 → 5.58); the Market section's farm-gate prices do.
4. *Rain*: flagged, not corrected. Where POWER and the gauges disagree by more than 1.6× the field is marked in the
   validity panel with both numbers (`public/data/climate/rain.bin`, 52 kB). Correcting POWER to the stations moved
   nothing on average (3.94 → 3.98) and the stations do not win consistently against the other reanalysis.

**Drought, path by path** (145 development cells, runtime counterfactuals). On a rainfed
field one drought reaches the score three ways: the yield share × (1 − mean loss) → harvest → margin → profit axis;
the harvest's anchor, a national FAOSTAT yield that already holds the country's typical drought; and the water axis,
the margin of a dry year - which carries the mean loss again, through the harvest, plus the dry-year tail. Switched
off one at a time: all drought 3.95 → 4.71 (worse), the dry-year tail → 4.03, the anchor path → 4.50 (worse). So
drought is signal, not noise; the tail adds little. What is double: (1) the anchor, in *level* - arid temperate
yields sit at 0.65 of their country against GDHY's 0.72 - but simply removing it loses the between-crop contrast; the
principled fix divides the national yield by the country's own typical share instead of 0.8 (a bake, not yet built);
(2) money - the water and profit axes rank the crops of a rainfed cell almost alike (Spearman median 0.93, above 0.9
in 62 % of cells), so margins carry about two thirds of the mix. **Fixed:** the water axis now prices drought *risk*, not the level of the money.
Three candidates on the development cells, each judged by the physical sanity tests (src/lib/sanity.test.ts) before
the metric: (a) expected margin − dry-year margin - axes' median Spearman 0.94 → 0.00 and mean rank 4.02 → 3.73, but
the axis *rose* when a drought had already ruined the crop (nothing left to lose): harsher drought, heat and frost
raised total scores - rejected; (b) the same from the field's stress-free harvest - broke drought and pH monotonicity -
rejected; (c) dry-year loss share × the crop's reference revenue - monotone, and it fixed two earlier violations (more
rain and more irrigation budget had lowered the axis). With (c), each step up in the water weight moved the ranking
further from what farms grow (169 cells; water 0 / 15 / 30 / 45 / 75: mean rank 3.41 / 3.56 / 3.89 / 4.21 / 4.71):
drought already acts through the expected harvest and margin, and a separate tail penalty does not explain farmers'
choices. The default water weight is 15 (chosen among 0, 15 and the old axis); a risk-averse grower raises
it. Frozen engine on the same 169 cells: 3.86. And the water balance itself is too dry in places:
grown crops with mean losses of 65-82 % (dryland maize in Colorado, Bahia, the highveld, southern Russia; Rajasthan's
wheat, irrigated in reality) where GDHY's year-to-year shortfalls are a fraction of that.

**Development cells now (121):** mean rank 3.93 (median 3), top-1 26 %, top-3 55 %, catastrophic 1; country baseline
1.85; model + national practice (k = 1) 2.29.

## 7. Reproduce

`npm test` (≈ 200 tests: FAO/GAEZ transcriptions, physical invariants, determinism, leakage, calibration maths).
`python3 scripts/gaez.py` and `python3 scripts/fao56.py` rebuild the transcribed tables.
`node scripts/markets-clean.mjs` drops chained FAOSTAT price artefacts (also run by `scripts/markets.mjs`);
`node scripts/rainref.mjs` bakes the station rain grid.

## 8. Further checks and proxies

* **Global sensitivity (Sobol).** First- and total-order indices of the pick's lead over the runner-up across soil
  water, Ky, both prices and the three priority weights, estimated by Saltelli 2010 / Jansen 1999. The estimator is
  tested against the Ishigami function's exact indices.
* **Daily water check.** The water model is re-run day by day on NASA POWER daily data (FAO-56 single Kc, Hargreaves
  ET₀, eq. 21 radiation). Its crop order agrees with the monthly model (Spearman ρ > 0.5 on the German and Kansas
  demo fields, tested). The dual Kc, which splits soil evaporation out, is not implemented.
* **Insects.** Degree-days above 10 °C, recent decade vs baseline, read on Deutsch et al.'s (2018) scale of 10–25 %
  more insect losses per °C of warming. This is a regional proxy with no species.
* **Traffic on wet soil.** The share of seasons whose harvest or sowing month leaves the soil at field capacity. Heavy
  harvests on ≥ 30 % clay are flagged (subsoil compaction persists for years; Håkansson & Reeder 1994).
* **How farmers decide.** See [FARMERS.md](FARMERS.md): a short literature review kept apart from our own interview.
* **Seasons from space.** The field's pixel in NASA GIBS MODIS_Terra_L3_NDVI_16Day tiles, every composite of the last
  five seasons, is read back onto the GIBS colour ramp (a monotone stand-in for NDVI, not NDVI itself; cloud, snow and
  water fall off the ramp and are skipped). The timing of greening and browning classifies each season as winter crop,
  summer crop, two crops, ley or bare; in the tropics no type is given. It proposes a crop *type* — the farmer names the
  crop. Tested on synthetic curves; a 300 m pixel mixes in neighbours on small fields.

## 8a. Tree and bush crops — a long-term view, not a season

Coffee, cocoa, oil palm, rubber, olive, tea, citrus, banana and coconut are planted once and kept for decades, so they
are never ranked with the season's crops. For the field, the "Long term" tab reads FAO's GAEZ v4 suitability index
(rain-fed, high inputs, 5′ grid) live from FAO's GAEZ service: on the current cropland of the field's cell (on all its
land where GAEZ maps no cropland - it codes that -1), for 1981-2010 and for 2041-2070 under moderate (RCP 4.5) and high
(RCP 8.5) emissions, ensemble of four CMIP5 models, without CO₂ fertilisation (its size is uncertain, so the lower
estimate). The classes are GAEZ's own - very high > 85, high > 70, good > 55, medium > 40, moderate > 25, marginal > 10,
very marginal > 0, not suitable 0 - checked against its class layers at 14 points. Beside each rating: the share of the
harvested area around (CROPGRIDS 2020, 0.5° cell; scripts/perennials-grid.py).

**How far GAEZ agrees with the farms** (scripts/perennials-check.py): every 0.05° CROPGRIDS pixel's harvested area
attributed to the GAEZ pixel its centre falls in. Of each crop's world harvested area, GAEZ rates the cropland
suitable under 98 % of oil palm, 96 % of cocoa, 89 % of coffee, 86 % of coconut, 83 % of rubber, 81 % of banana and
plantain, 69 % of tea, 64 % of olive and 61 % of citrus - the last two largely irrigated, which a rain-fed rating
cannot see. The page says so next to the ratings, and where farms around grow a crop GAEZ rates unsuitable it says the
farms are the stronger evidence.

**Limits.** A cell's cropland index rests on its few cropland sub-pixels and can jump across one of GAEZ's temperature
limits with a degree or two of warming (Pereira, Colombia: cocoa 0 → 100 on the cell's cropland by the 2050s, 0 → 54-61
on all its land); the page shows both and calls the 2050s a direction, not a forecast. Grape, mango, apple, plum and
almond are not rated by GAEZ v4 and appear only as what farms grow. Establishment cost, years to the first harvest,
buyers and irrigation are not part of the rating.

## 8b. Fresh produce needs a market

The six vegetables stay off unless the farmer switches them on. When on, a crop that keeps under 30 days (tomato,
chilli, okra, watermelon) keeps half its standing where the field is farther from a city of 50 000+ than 95 % of the
crop's world harvested area (Nelson et al. 2019 travel time × CROPGRIDS 2020: tomato 3.3 h, fresh chilli 4.4 h, okra
3.1 h, watermelon 3.5 h; all cropland 4.5 h) - scripts/access.py. FAOSTAT's national
tomato and pepper yields count glasshouses (the Netherlands: 460 and 272 t/ha), so they cannot lift an open field
above its own modelled yield. Labour is not modelled.

## 8c. What farms around sow after your crops

Observed practice, beside the science and never inside it. From 270 random windows of field records 2019-2024 (USDA
Cropland Data Layer, AAFC Annual Crop Inventory, French RPG parcels) the page counts what fields
within 250 km sowed after the same last two crops as this field (else after its last crop; nearer windows weigh more).
It shows the result next to the ranking, with the engine's rank of each crop, and, under "Consider local practice",
uses it in place of the region's land shares. Held out window by window, it named the next crop on 62 % of rotating
fields' sample points, against 55 % for "the crop of two seasons before". What
neighbours do is evidence of markets, machinery and habit; it is not what pays best on this field.

## 8d. A field's history in three layers

Two questions kept apart - what is rational to grow here, and what do farms here usually sow - and the difference shown.
1. **The score** takes from the history only measured yield effects: a crop after itself (field records and trials:
   maize 4.3 %, soybean 10.4 %, wheat and the small grains 10 %, canola 7.5 % and 4.7 % one season early), a small grain
   after another host of its diseases (take-all, Fusarium: a second wheat's 10 %), and a break crop after two cereal
   seasons, credited the loss the next cereal is spared (0.9 × 10 %).
2. **The risk layer**: every rotation rule without a measured figure - a run limit, a minimum break, a soil-borne
   bridge (high), a second season, the crop's own disease past its break, rootworm, the same family (moderate) - is a
   flag shown with its evidence and "yield penalty: not quantified", never a number in the score. Multi-season plans do
   not choose a high-flagged crop: an unpriced risk is not traded against money.
3. **The practice layer**: what fields within 250 km sowed after the same crops (§8c), beside the ranking; only the
   labelled "Consider local practice" view uses it.
4. **Why different**: the model's pick, the crop sown most after these crops (its share and our rank), and the reason -
   the largest part of the score gap in the pick's favour (Shapley), with the flags on the farms' crop.
Why: experiments H and H2 found the old fixed penalties (R -0.55 for a minimum break, -0.3 for a soil-borne bridge)
pushing the ranking away from what farms sow.

## 9. Under glass — a different set of risks

The greenhouse model shares NASA POWER with the fields but not their science: soil water, FAO-56 and GAEZ do not apply
under a roof. What decides the answer there is sunlight, outdoor temperature, and money for energy.

| Part | Method | Evidence |
|---|---|---|
| Light | PAR = 48 % of CERES shortwave × 4.57 mol/MJ (McCree 1972) × cover transmission | literature / heuristic |
| Heat loss | U-values from ANSI/ASAE EP406.4 (glass 6.2, double film 4.0, polycarbonate 3.2–3.6 W m⁻² K⁻¹); glass leaks 0.5 air changes an hour (a Venlo house measured, GTB-1366) and a closed night screen leaves 45 % of the cover loss (4.4 W m⁻² K⁻¹ of floor, the top of the 3.8–4.4 measured over Dutch tomatoes, WPR-779); hour by hour over a mean day; a condensing boiler, 30.6 m³ of gas per GJ of heat (WEcR protocol) | tested |
| Lamps | LED 180 µmol m⁻² s⁻¹, 2.8 µmol/J (Kusuma et al. 2020) | cited |
| Yield | proportional to light up to 1.3 × the crop's daily target — the “1 % rule” (Marcelis et al. 2006: 0.7–1 %) | cited |
| Emissions | natural gas 56 100 kg CO₂/TJ (IPCC 2006 Vol. 2) | tested |
| Benchmarks | a heated glass tomato house with one screen needs 35 m³ a.e. of heat per m² a year in Westland (measured Dutch practice 38.9, WPR-779) and 44 on the Torgau record (the unscreened 1996 reference: 63.6); over a full season, tomatoes within the Dutch 47–73 kg/m²; Westland margins 2016-2021 against the Dutch farm accounts | tested |
| Labour, plants, pots | per month in crop and per kilo picked, from Flemish and Dutch farm accounts (fruit vegetables: LMN 2014-2018, Agrimatie), Flemish monitoring (strawberry) and small US houses (lettuce, herbs) | literature / assumption |

* **How sure.** 200 seeded re-runs vary the gas price (lognormal σ 0.35 — European gas moved several-fold in 2021–23),
  electricity (σ 0.25), each crop's price (±20 %) and light-use efficiency (±15 %), the heat loss of the house (±15 %) and
  which recent years recur. The share of runs in which a crop leaves the most after energy says how settled the ranking
  is. The spreads are **not calibrated**; the margin level is checked against Dutch and Flemish farm accounts (§5).
* **Tipping points.** The gas and electricity prices, scanned from ¼ to 4 × today's, at which another crop leads; how far
  the pick's own price can fall before it loses first place; the pick at three times today's gas price (2022-like).
* **Did NASA's record change the advice?** The same house and prices planned on the 1981–2010 climate: the pick, and
  the planting month of the chosen crop (a heated glass tomato house at Torgau now plants in February instead of March).
* **Labour, plants and pots.** Charged per month in crop, € per m² for twelve months, plus picking per kilo: tomato
  16.4 + 0.08, cucumber 19.4 + 0.08, pepper 12.4 + 0.11 — the plants, materials and labour of the Flemish tomato farms
  (LMN 2014-2018: ≈ €21/m²) and of the Dutch cucumber and pepper farms (Agrimatie), a third of the labour per kilo
  (picking and weighing, Hendrix 2000); earlier a whole Flemish cost price less gas, overheads included
  (≈ €32/m² for tomato); unheated houses keep the costs fitted on the Andalusian surveys;
  strawberry 12 (Flemish heated-glass monitoring: €9/m² variable costs per season incl. energy) with the Flemish price
  €3.7/kg; lettuce 40 (≈ €0.24 a head at 170 heads/m²) and basil 80 (≈ €0.40 a pot at 200 pots/m²), scaled down from
  small US houses (Kentucky hydroponic lettuce $0.74 a head; a potted-crop example $0.96 a pot) — rough, ±50 % in the
  Monte Carlo. Before these costs basil led in 100 % of re-runs at Torgau; with them, in ≈ 70 %, and a 20 % lower basil
  price hands first place to lettuce. Unheated tunnels become close calls between lettuce and basil.
* **Where it stops** (13 failure modes, 6 checked per site): hot climates that need evaporative cooling, tropical
  net-house cropping, dark winters beyond the lamps, thin markets, no crop paying for its energy, estimated sunlight
  before 1984; not modelled: cold snaps and boiler sizing, humidity and disease, CO₂ dosing, soil-borne disease and
  rotation, cover ageing, one price all year (no early-season premium), capital, packing and selling.

# Zixtaro and its analogues

*What already exists, what each tool answers, where Zixtaro differs and where it is better - and where it is not.
Facts about other products come from their own pages and documentation (sources at the end, read 2026-11-14);
facts about Zixtaro point to the document that holds the receipt.*

## 1. The question decides the comparison

Zixtaro answers one question: **what should this field grow next season, and in what four-season order, given its
climate, soil, water, money and the farmer's own priorities - and why.** Most farm software answers a different
one: *how is the crop I already sowed doing?* So the analogues fall into six groups, by the question they answer.

| Group | Examples | The question it answers |
|---|---|---|
| A. Field monitoring platforms | OneSoil, Climate FieldView (Bayer), EOSDA Crop Monitoring, xarvio Field Manager (BASF) | How is the sown crop doing, and where and when to treat it? |
| B. Global suitability atlases | FAO/IIASA GAEZ v4 | Where on Earth can a crop grow, and how much could it yield? |
| C. Process crop models | DSSAT, APSIM | How will this cultivar grow under this management, day by day? |
| D. Rotation calculators | USDA-ARS Crop Sequence Calculator | Which crop does well after which, in one region's trials? |
| E. Machine-learned crop recommenders | the "Crop Recommendation" data set and the models trained on it | Which crop label matches these soil and weather numbers? |
| F. Crop-condition bulletins | GEOGLAM Crop Monitor (NASA Harvest) | How are the main crops doing this month, country by country? |

## 2. Each analogue, and the difference

### A. Field monitoring platforms

| Tool | What it does | What it does not do |
|---|---|---|
| **OneSoil** | Free core tools on web and phone. Sentinel-2 NDVI at 10 m, new every 3-5 days. Field outlines detected from space in 59 countries. Notes, weather, a crop-rotation record and planner. | We found no published method, evidence or validation for *which* crop to choose: the rotation tool stores and allocates the crops the farmer names. |
| **Climate FieldView** | Paid subscription (Bayer's Canadian page: 499 $ a year, free trial). Reads data from the farm's machines, yield maps, seeding and fertiliser scripts. Reported in 23 countries. | We found no crop-choice or rotation recommendation in its feature lists. It needs connected machinery. |
| **EOSDA Crop Monitoring** | Satellite monitoring, vegetation indices, weather risk, a field-by-field rotation history. Free trial; prices on request. | The rotation feature is described as records and planning support; no published rule for the next crop was found. |
| **xarvio Field Manager** | Spray timing and zone spraying from growth stage, disease risk and forecast, for a few crops per country. | Rotation is an *input* to its disease risk, not an output. |

**Where Zixtaro differs.** These tools start after the decision Zixtaro is about: the crop is already in the
ground. Zixtaro works before sowing, and for the next four seasons.

**Where Zixtaro is better.**
- It names the next crop and the rotation, with a score for all 52 crops, and shows what each score is made of
  (exact Shapley parts, ten questions per recommendation - SCIENCE.md §1, §3).
- It works for a field with no history, no machines and no account: any point on Earth, in the browser, offline
  once opened (README.md; "no account and no server of ours" - the Legal page).
- It looks ahead: +1...+3 °C what-ifs and NASA NEX-GDDP-CMIP6 2050s scenarios (SCIENCE.md §2).
- Its accuracy is published, with the failures (section 5 below). We found no comparable published check for the
  rotation tools of the four platforms.

**Where they are better.** In-season monitoring at 10 m every few days (Zixtaro reads MODIS at about 300 m, and only
to guess past crop types); machine data, yield maps and variable-rate scripts; phone apps, support teams and years
of use on real farms. Zixtaro does not replace them: it exports its fields as GeoJSON/KML so they can be opened in
them (`src/lib/export.ts`).

### B. FAO/IIASA GAEZ v4

**What it does.** A free global atlas: suitability and attainable yield for each crop on a grid of about 9 km,
rain-fed and irrigated, for past and future climates.

**Where Zixtaro differs.** GAEZ is one of Zixtaro's inputs, not a rival: its pH and texture ratings and heat units
are in the engine, and its suitability index is the whole "Long term" tab for tree crops (SCIENCE.md §3, §8a).

**Where Zixtaro is better.** GAEZ rates each crop alone, per grid cell. Zixtaro adds what a farmer's decision
needs on top of it: the field's own soil profile (SoilGrids, or a lab test), a water balance on 45 years of NASA
POWER, the crop before and the crop after, margin and drought risk in money, the farmer's priorities, how sure the
pick is, and a ranking of crops against each other.

**Where GAEZ is better.** It is the institutional reference, peer-reviewed and maintained by FAO; it covers more
crop types and management levels than Zixtaro's 52 crops.

### C. DSSAT and APSIM

**What they do.** Daily process models of crop growth, soil water, nitrogen and carbon; they can run a rotation as
one continuous simulation. They are the scientific standard.

**Where Zixtaro differs.** DSSAT's own documentation asks for daily weather, a soil profile, management data, and
cultivar coefficients calibrated on experiments; it is a Windows desktop program for trained users. Zixtaro
fetches its inputs by itself from a point on the map and gives an answer in the time the page loads.

**Where Zixtaro is better.** For the user it is built for - a grower or adviser without a modelling team: no
set-up, no calibration, every crop compared at once, money and priorities included, and plain-language reasons.

**Where they are better.** The physics. Zixtaro uses a FAO-56 water balance in 10-day steps and FAO-33 yield
response, not daily growth; it does not model cultivars, management, pests or double cropping (22 failure modes
are listed in the app - SCIENCE.md §6). For research on one crop at one site DSSAT or APSIM is the right tool.

### D. USDA-ARS Crop Sequence Calculator

**What it does.** Expected yields of 10 crops in every two-year order, from no-till trials at Mandan, North Dakota
(1998-2005), with prices to compare returns. A downloadable program.

**Where Zixtaro differs and is better.** The calculator holds for the northern Great Plains and its ten crops;
Zixtaro works anywhere, with 52 crops and four seasons, and takes its rotation effects from published trials and
extension guidance instead of one site (SCIENCE.md §3, §8d). It also shows what fields within 250 km actually sowed
after the same crops (§8c).

**Where the calculator is better.** Inside its region its numbers are measured, crop pair by crop pair. Zixtaro has
measured figures for only a few sequences and shows the other rotation rules as risk flags with "yield penalty: not
quantified" (§8d).

### E. Machine-learned crop recommenders

**What they do.** The usual hackathon and student solution: a classifier trained on the public "Crop
Recommendation" table (2 200 rows, 22 crops, 7 inputs: N, P, K, temperature, humidity, pH, rainfall; compiled for
India). Papers report 95-99 % accuracy.

**Where Zixtaro differs.** The recommendation in Zixtaro is not machine-learned (README.md, "Use of AI"). It is a
written model whose every parameter has a source.

**Where Zixtaro is better.**
- **It explains itself.** Each point of a score traces to a FAO, NASA or published figure
  (`docs/audit/LINEAGE.md`); a classifier returns a label.
- **It needs no laboratory.** N, P and K values come from a soil test most growers do not have; Zixtaro starts from
  a point on the map and takes a lab test only if there is one.
- **It is tested against what farms do.** The 99 % is agreement with the labels of the same table, which are not
  observed harvests. Zixtaro is checked against independent crop maps on fields drawn after the criteria were
  written (section 5).
- **It covers the world and the order of crops.** The table has no place, no previous crop, no price and no
  climate trend.

**Where they are better.** They are simple to build and fast. Where a large set of real local outcomes exists, a
learned model can pick up patterns no written rule holds - our own test found the science alone carries little
information about what farms grow beyond a regional mix (SCIENCE.md §1).

### F. GEOGLAM Crop Monitor

**What it does.** Monthly consensus reports on the condition of the main crops (wheat, maize, rice, soybean) by
country and region, for markets and food-security early warning, built on satellite indices and national partners.

**Where Zixtaro differs.** A different user and scale: ministries and markets, not one field; this month's
condition, not next season's choice. It is the closest NASA-linked product, and it does not overlap.

## 3. The nearest analogues: Lithuania

Zixtaro opens on a field at Joniškis, so the closest comparison is with what a Lithuanian farmer already has for the
same problem - what to sow where, and in what order. Since 2024 that problem is also a rule: under GAAB 7 ("Augalų
kaita") at least 35 % of the arable land must change its main crop each year, and the same crop may not stay on a
field for more than three years. Five tools touch it.

| Tool | Who | What it does for rotation | Does it say which crop to sow? |
|---|---|---|---|
| **"3 m. auginti tie patys pasėliai" map layer** | ŽŪDC (state Agricultural Data Centre), since 2025-11 | On the public "GAAB ir VR" map, hatches the fields where the same crop was declared three years running, with the crop code, to plan the spring sowing. | No. It shows where the rule is about to be broken; the choice is the farmer's. |
| **GeoFace** | UAB Geoface, Kaunas | Farm management: fields, crops, cadastral plots and rotation on a map; variable-rate maps from NDVI, productivity and soil tests; fertiliser and spray journals sent to ŽŪDC; machine telematics. Price by hectares. | No crop recommendation is described. |
| **AGRO 247** (was Agrosmart) | UAB Agrokoncernas | Farm management: soil-test analysis, fertiliser plans (also variable-rate), work plans, store, costs per hectare, NDVI, journals to the state system; a rotation module. Free to 100 ha, then 41 € a month. | The page lists rotation as a feature and describes no recommendation. |
| **FarmEasy CropPLAN** | Scandagra | Field plans, rotation cycles, fertiliser and spray plans, costs and profit per field, 60 reports, store, scouting. Free until 2027 on registration. | No. The farmer enters the rotation plan. |
| **NMA agro** | National Paying Agency | Free phone app, over 36 000 users: geotagged photos and notices for support schemes, declared parcels, deadlines, Sentinel vegetation and water-stress layers. | No. |

**Where Zixtaro differs.** In all five the rotation is something the farmer brings: the tool stores it, maps it,
costs it or checks it against the rule. None of their pages describes a method that proposes the crop. Zixtaro
starts where they stop: it proposes the next crop and three more seasons, and gives the reasons.

**Where Zixtaro is better.**
- **It answers "what instead?".** The ŽŪDC layer tells a farmer a field cannot take the same crop a fourth year.
  Zixtaro ranks what to sow there: every crop scored on the field's climate, soil, water and margin, with the
  rotation effect of the crops before it (SCIENCE.md §3, §8d).
- **It looks past the season.** 45 years of NASA climate at the field, the trend, +1...+3 °C what-ifs and 2050s
  scenarios. The Lithuanian tools plan the coming year from the farm's own records.
- **It weighs soil, water and profit by the farmer's priorities**, and shows how sure the pick is and what would
  change it. The farm systems show costs and profit of the plan entered.
- **No registration, no contract, open source.** A field is picked on the map; nothing is stored on a server
  (the Legal page). The code and every parameter are public under Apache 2.0, so an adviser or a researcher at
  LAMMC or LŽŪKT can check a recommendation line by line. The commercial systems are closed, and three of the
  five come from input suppliers (Agrokoncernas, Scandagra) or need an account.
- **A published accuracy check, with failures** (section 5). We found none for the rotation functions of these
  tools.

**Where they are better - plainly.**
- **They speak Lithuanian.** Zixtaro's page is in English only, as the challenge requires (`src/lib/i18n.ts`).
- **They hold the farm's real records**: declared crops by parcel, soil tests, machine data. Zixtaro has no
  Lithuanian parcel records; around a Lithuanian field it knows what the region grows (CROPGRIDS, 0.5°), and its
  field-level "what neighbours sow next" layer covers only the USA, Canada, France and Denmark (SCIENCE.md §1, §8c).
- **They are tied to the state systems**: journals go to ŽŪDC, notices to NMA. Zixtaro files nothing.
- **Zixtaro does not check GAAB 7.** Its rotation rules are agronomic (disease breaks, yield effects), not the
  35 % and three-year rule. A plan from Zixtaro still has to be checked against the ŽŪDC layer.
- **They are in use** on Lithuanian farms; Zixtaro is a prototype.

**So the two sides fit together** rather than compete: ŽŪDC shows where the crop must change, Zixtaro proposes
what to change it to and why, and the farm system records and carries out the plan (Zixtaro exports its fields as
GeoJSON/KML for that).

## 4. Side by side

"Yes" and "no" are for the product as described in the sources below. "-" means not what the tool is for.

| | Zixtaro | Monitoring platforms (A) | GAEZ v4 | DSSAT / APSIM | Crop Sequence Calculator | ML recommenders |
|---|---|---|---|---|---|---|
| Recommends the next crop | yes, 52 crops ranked | no (records and plans) | no (rates each crop alone) | no (simulates what you set) | compares pairs | yes, a label |
| Multi-season rotation | yes, 4 seasons | record only | no | yes, if set up by hand | 2 years | no |
| Any field on Earth, no set-up | yes | field monitoring: yes | grid cell, not field | no, needs local inputs | no, one region | no, needs lab values |
| Farmer's own priorities | yes (soil / water / profit) | - | no | no | prices only | no |
| Margin and drought risk in money | yes | no | no | with extra tools | yes, returns | no |
| Reason for every number | yes (Shapley, sources) | - | documented method | documented method | trial data | no |
| How sure, and calibrated | yes (Monte Carlo, out-of-sample) | - | no | possible, by hand | no | no |
| Climate-change scenarios | yes (CMIP6 2050s) | no | yes | yes, if set up | no | no |
| Published validation with failures | yes, pre-registered | not found | yes (FAO report) | yes (literature) | trial data | accuracy on own labels |
| In-season satellite monitoring | no | **yes, 10 m** | no | no | no | no |
| Machine data, variable rate | no | **yes** | no | no | no | no |
| Daily crop physiology, cultivars | no | no | no | **yes** | no | no |
| Free and open source | yes, Apache 2.0 | free tier or paid, closed | free data | DSSAT open (BSD) | free | varies |

## 5. What makes Zixtaro different, in five points

1. **The decision before sowing.** The widely used farm platforms monitor a crop already chosen. Zixtaro is about
   the choice, and the three seasons after it.
2. **Every number has a receipt.** An evidence registry lists, for each number in the app, its kind, source and
   test (`src/lib/evidence.ts`); `docs/audit/LINEAGE.md` traces every input of the score.
3. **Validated the hard way.** Hypotheses and pass criteria are written before the test fields are drawn. On 48 fresh places the crop grown most ranked 1.50 on average and was in the top
   three in 98 %; on 85 new fields in the USA, Canada, France and Denmark, in the top three in 90.4 %
   (SCIENCE.md §1). The confidence it shows is calibrated out of sample: Brier 0.071 against 0.076 for the base
   rate (§4).
4. **It publishes what it cannot do.** 22 failure modes for fields and 13 for greenhouses, checked per site; results
   that went against us are in the documents (the science alone ranks the crop grown most 4.81 on average, behind a
   country's plain crop mix at 2.04 - SCIENCE.md §1).
5. **Three views kept apart.** The scientific score, what farms around grow, and the two combined are shown
   separately and labelled, so the user sees where science and practice disagree and why (§1, §8d).

## 6. What we do not claim

- The validation numbers measure agreement with what farms grow. They do not show that following Zixtaro pays
  better than what a farmer does now; that is a separate experiment (H3).
- Zixtaro has not been used on working farms for a season; the platforms in group A have.
- "Not found" in this document means we did not find it in the product's public pages on the date above, not that
  it does not exist.

## Sources

- OneSoil: [What is OneSoil](https://help.onesoil.ai/en/articles/5237693-what-is-onesoil),
  [web and mobile apps](https://help.onesoil.ai/en/articles/5237584-how-the-onesoil-web-and-mobile-apps-differ).
- Climate FieldView: [pricing, Canada](https://climate.com/en-ca/pricing.html),
  [Future Farming: the journey so far](https://futurefarming.com/tools-data-2/climate-fieldview-the-journey-so-far).
- EOSDA Crop Monitoring: [crop rotation](https://eos.com/agriculture/crop-rotation),
  [product page](https://eos.com/eos-crop-monitoring).
- xarvio Field Manager: [crop protection](https://global.xarvio.com/field-manager/crop-protection),
  [FAQ](https://fm.xarvio.com/docs/faq/en_gb.html).
- GAEZ v4: [FAO portal](https://www.fao.org/gaez/gaezv4/en),
  [IIASA](https://previous.iiasa.ac.at/web/home/research/researchPrograms/water/GAEZ_v4.html).
- DSSAT: [models overview](https://dssat.net/?p=1948), [requesting a copy](https://dssat.net/?p=1960).
- Crop Sequence Calculator: [USDA-ARS Mandan](https://www.ars.usda.gov/plains-area/mandan-nd/ngprl/docs/crop-sequence-calculator/).
- ML recommenders: [AgroXAI, arXiv 2412.16196](https://arxiv.org/pdf/2412.16196),
  [data set description](https://data.mendeley.com/datasets/7j8cz7p7w9).
- Lithuania: [ŽŪDC rotation layer, 2025-11-25](https://zudc.lt/naujas-zemelapio-sluoksnis-pades-laikytis-7-gaab-standarto-reikalavimu-ir-planuoti-sejomaina/),
  [GAAB standards 2026, Ministry of Agriculture](https://zum.lrv.lt/public/canonical/1774864792/19233/20260323%20GAAB%202026.pdf),
  [GeoFace](https://geoface.com/lt/), [AGRO 247](https://agro247.lt/),
  [FarmEasy CropPLAN](https://farmeasy.lt/produktai/cropplan/),
  [NMA agro, FAO AgriTech Observatory](https://agritechobservatory.review.fao.org/en/nma-agro).
- GEOGLAM Crop Monitor: [NASA Harvest](https://nasaharvest.org/news/a-hrefhttpsnasaharvestorgnewsgeoglam-crop-monitor-amis-assessing-crop-conditions-context-global-marketsgeoglam-crop-monitor-for-amis-assessing-crop-conditions-for-global-marketsa).

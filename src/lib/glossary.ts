// The words the page uses, said plainly - for a farmer who knows the field and has no reason to know what a
// reanalysis is. Each entry: what the word means, and where it is met on this page. The challenge asks for exactly
// this (evapotranspiration, soil-moisture anomalies, vegetation indices, frost risk, the water balance; how a
// satellite's measurement differs from one on the ground; what a legume, a cover crop, a deep root do for a soil).
//
// Kept to what the page really does: an entry never describes a method the engine does not use.

export type Word = { term: string; means: string; here: string; from?: string }

/** What is measured from orbit. */
export const ORBIT_WORDS: Word[] = [
  { term: 'Reanalysis', means: 'A weather model run back over decades and pulled toward every measurement of the time - stations, balloons, satellites - so that every place on Earth has a complete record, even where no station stood.', here: 'The rain, heat and sunshine every season is re-run on. One cell is about 50 km across.', from: 'NASA POWER · MERRA-2' },
  { term: 'Satellite rain', means: 'Rain estimated from orbit by microwave and infrared sensors on many satellites, tuned to the GPM core satellite and corrected each month with rain gauges.', here: 'The second rain record of a field, beside the reanalysis (Air); and yesterday’s rain on the globe.', from: 'NASA GPM IMERG' },
  { term: 'Root-zone soil moisture', means: 'The water held in the soil where roots reach, about the top metre. A satellite senses only the top few centimetres; a model carries the reading down.', here: 'The soil-moisture layer on the globe, and the wetness record that checks the water balance.', from: 'NASA SMAP · MERRA-2' },
  { term: 'Anomaly', means: 'The difference from what is normal for that place and that time of year. A dry June is judged against this field’s own Junes.', here: 'Every “since 1981-2010” on the page: the last ten years set against the thirty before.' },
  { term: 'Vegetation index (NDVI)', means: 'A number for how green and dense the plant cover is: leaves absorb red light and reflect near-infrared, and the index is the contrast between the two. Bare soil is near 0.1-0.2, a closed crop canopy 0.7-0.9.', here: 'The vegetation layer; a field’s past seasons are read from when it greened and when it lay bare (Field).', from: 'NASA MODIS' },
  { term: 'Land-surface temperature', means: 'The temperature of the ground or the canopy itself, seen in thermal infrared - at noon in summer far above the air’s. A crop short of water stops cooling itself and warms.', here: 'The surface-heat layer on the globe.', from: 'NASA MODIS' },
  { term: 'Total water storage', means: 'All the water of a region weighed together - groundwater, soil water, snow, lakes - from the tiny changes in Earth’s gravity that two satellites flying in line feel.', here: 'Whether the region is losing water (Roots). One cell is about 300 km: a region’s trend, never a well’s level.', from: 'NASA GRACE-FO' },
  { term: 'Elevation model', means: 'The height of the land as a grid, from radar flown on the Space Shuttle. Slope and the way a field faces follow from it.', here: 'Slope for erosion; height for how warm the field is within its weather cell (Ground).', from: 'NASA SRTM' },
]

/** The field's water and weather. */
export const WATER_WORDS: Word[] = [
  { term: 'Evapotranspiration (ET)', means: 'Water leaving a field as vapour: what evaporates from the soil plus what the plants breathe out through their leaves. It is what a crop drinks.', here: 'Every crop’s water need.' },
  { term: 'Reference evapotranspiration (ET₀)', means: 'What a short, well-watered grass would use in that weather - the thirst of the air, worked out from sunshine, temperature, humidity and wind. A crop’s own need is ET₀ times a coefficient that follows its growth.', here: 'Computed for each month since 1981 (Penman-Monteith, FAO-56).' },
  { term: 'Water balance', means: 'Bookkeeping for the root zone. In: rain and irrigation. Out: evapotranspiration, runoff, drainage. The soil is the store between them.', here: 'Run for every crop through every season on record: the source of each water figure.' },
  { term: 'Plant-available water', means: 'The water a soil holds that roots can still pull out - between a soil drained after rain and one where plants wilt. Sand holds little, loam much.', here: 'From the soil’s texture and carbon, or from your own lab test (Roots).' },
  { term: 'Water-stress loss', means: 'When the soil cannot give a crop what it needs, yield falls - by a factor known for each crop and growth stage.', here: 'The loss shown beside every crop and plan, for a typical season and for the driest ones.' },
  { term: 'Frost risk', means: 'How late in spring and how early in autumn a freezing night still comes, counted from the daily record - and what that means for a crop that has emerged or is in flower.', here: 'The frost-free season and its trend (Air); the sowing dates (Plan).' },
  { term: 'Heat at flowering', means: 'A few days above a crop’s critical temperature while it flowers can cost more grain than a dry month.', here: 'Counted from daily highs in each crop’s flowering weeks.' },
  { term: 'Degree-days', means: 'Warmth added up day by day above a base temperature. Plants and insects develop by it, not by the calendar.', here: 'How fast a crop ripens in a warmer season; how many generations pests can fit in.' },
  { term: 'What-if and scenario', means: 'A stress test replays the last ten seasons 1-3 °C warmer. A scenario adds the changes climate models project for the 2050s. Neither is a forecast.', here: 'The “What if” switch above the plan.', from: 'NASA NEX-GDDP-CMIP6' },
]

/** The rotation and the soil. */
export const SOIL_WORDS: Word[] = [
  { term: 'Break crop', means: 'A crop of a different plant family from the one before it. The weeds, pests and diseases that built up on the last crop lose their host.', here: 'The rotation rules; “plant families” on every plan.' },
  { term: 'Nitrogen-fixing crop', means: 'Peas, beans, soybean, lupin, clover: bacteria on their roots take nitrogen from the air. Part of it stays in the soil, and the next crop needs less fertiliser.', here: '“Fertiliser N, after legume credits” on every plan.' },
  { term: 'Cover crop', means: 'Sown between two main crops to cover the soil, not to be sold. It holds the soil against rain and wind, takes up nitrate that winter would wash away, and feeds soil life.', here: 'The catch-crop switch in the soil outlook (Plan); storm rain on bare soil.' },
  { term: 'Deep-rooting crop', means: 'Sunflower, rapeseed, sugar beet, a clover-grass ley: roots that go below the ploughed layer, reach deeper water and leave channels that let rain in.', here: 'Each crop’s rooting depth sets how much of the soil’s water it can use.' },
  { term: 'Drought-tolerant crop', means: 'Sorghum, millet, chickpea, sunflower: crops that lose less yield for the same shortage of water, or finish before the dry weeks.', here: 'The dry-year replay above the plan shows which crops hold their yield.' },
  { term: 'Soil organic carbon', means: 'The decomposed remains of plants and soil life. It holds water and nutrients and binds the soil into crumbs. Residues and roots build it slowly; bare, worked soil loses it.', here: 'Soil carbon after 20 years, for each plan against carrying on.' },
  { term: 'Erosion risk', means: 'How much soil rain or wind can carry off. A steeper slope, heavier storms, a silty or sandy topsoil and bare ground all raise it.', here: 'A note on crops that leave this field open for months; the bare-soil figure of a plan.' },
  { term: 'Nitrate leaching', means: 'Nitrogen left in the soil after harvest dissolves, and winter rain carries it below the roots toward the groundwater.', here: 'Nitrate in winter drainage, for each plan.' },
  { term: 'Gross margin', means: 'What the harvest sells for, less the costs that depend on the crop: seed, fertiliser, water, spraying. It is not profit - machinery, land and labour are not in it.', here: 'The money figure beside every crop: a yardstick between crops, not a budget.' },
]

/** A satellite's measurement and one made on the ground: what each can and cannot say, and how the page joins them. */
export const ORBIT_AND_GROUND: { k: string; v: string }[] = [
  { k: 'What a satellite gives', v: 'A whole region at once, measured the same way every few days, for decades. Never the field alone: one soil-moisture pixel is 9 km, one weather cell 50 km, one gravity cell 300 km. And never the thing itself - it records microwaves, reflected light or gravity, and a model turns that into rain, moisture or greenness.' },
  { k: 'What the ground gives', v: 'One point, exactly: a rain gauge, a soil probe, a lab test, a spade, the yield in your records. True for that spot on that day. Silent about the next field, and about 1987.' },
  { k: 'Why both', v: 'Orbit gives the long record and the map; the ground gives the truth at a point. A satellite record is trusted where it has been checked against stations, and a station is carried across space and time by the satellite.' },
  { k: 'How they are joined here', v: 'What you measure outranks what orbit estimates. Your lab test replaces the soil map for your field. The crops you name replace what the vegetation index guessed. Your prices replace national ones. For rain, two NASA records stand side by side, and where they part the water figures are less sure.' },
]

/** NASA records the challenge names that this page does not use, and why - said rather than left out. */
export const NOT_USED: { name: string; why: string }[] = [
  { name: 'ECOSTRESS', why: 'Field-scale surface temperature and evapotranspiration from the Space Station. It is served only behind a NASA Earthdata login, which a page without accounts cannot ask for. Surface heat here is MODIS at 1 km; evapotranspiration is computed from the weather record.' },
  { name: 'SMAP, per field', why: 'The soil-moisture record of a single point is behind the same login. SMAP is on the globe as a map layer; the per-field wetness record is MERRA-2’s root zone.' },
  { name: 'Landsat, per field', why: 'Thirty-metre imagery (HLS) was used to check crop vigour on real fields in validation. It is not drawn for each field: a cloud-free scene on a given week cannot be promised.' },
  { name: 'GLDAS and NLDAS', why: 'Land-surface models of the kind behind MERRA-2’s wetness record. The page already carries one modelled soil-moisture record and checks its own water balance against it.' },
]

export const ALL_WORDS: Word[] = [...ORBIT_WORDS, ...WATER_WORDS, ...SOIL_WORDS]

// src/lib/data/metrics.ts
// Every number the field dossier can show: what it is, where it comes from and how sure it is.
// asked.ts maps the 105 requested metrics onto these; the Data page reads both.
import type { Evidence, Group, Metric, SourceId } from './types'

const m = (id: string, group: Group, name: string, unit: string, evidence: Evidence, sources: SourceId[], method: string, extra: Partial<Metric> = {}): Metric =>
  ({ id, group, name, unit, evidence, sources, method, ...extra })

const ERA5 = 'A ~9 km reanalysis cell, not a probe in your field.'
const SG = 'Poggio et al. 2021, SOIL 7:217 (SoilGrids 2.0)'
const SG_CAVEAT = 'A 250 m prediction from soil profiles; your lab test outranks it.'
const WV = 'Turek et al. 2023, Int Soil Water Conserv Res 11:225 (SoilGrids water retention)'
const ISDA = 'Hengl et al. 2021, Sci Rep 11:6130 (iSDAsoil)'
const ISDA_CAVEAT = 'Africa only; a 30 m prediction, not a sample.'
const HLS = 'Claverie et al. 2018, Remote Sens Environ 219:145 (HLS)'
const S30 = 'Needs the red-edge bands of the Sentinel-2 half of HLS, so it follows S30 scenes only.'
const RANGE = 'Latest clear scene over the field; the range is its 2nd-98th percentile pixel.'
const MOD = (p: string) => `NASA MODIS ${p} via the ORNL DAAC web service, at the field centre.`
const PIX500 = 'A 500 m pixel mixes in neighbours on small fields.'
const MAKE_EXTRA = (p: string) => `${p} Arrives with the global files (plan C).`

export const METRICS: Metric[] = [
  // ---------- soil ----------
  m('sm_0_7', 'soil', 'Soil moisture 0-7 cm', 'm³/m³', 'modelled', ['om-archive'], 'ERA5-Land via Open-Meteo: the latest daily mean (5 days behind), with the last 365 days as a series.', { caveat: ERA5, digits: 2 }),
  m('sm_7_28', 'soil', 'Soil moisture 7-28 cm', 'm³/m³', 'modelled', ['om-archive'], 'ERA5-Land via Open-Meteo: the latest daily mean, with the last 365 days.', { caveat: ERA5, digits: 2 }),
  m('sm_28_100', 'soil', 'Soil moisture 28-100 cm', 'm³/m³', 'modelled', ['om-archive'], 'ERA5-Land via Open-Meteo: the latest daily mean, with the last 365 days.', { caveat: ERA5, digits: 2 }),
  m('sm_100_255', 'soil', 'Soil moisture 100-255 cm', 'm³/m³', 'modelled', ['om-archive'], 'ERA5-Land via Open-Meteo: the latest daily mean, with the last 365 days.', { caveat: ERA5, digits: 2 }),
  m('gwet_top', 'soil', 'Surface soil wetness (NASA MERRA-2)', '0-1', 'modelled', ['power'], 'NASA POWER GWETTOP: share of the top 5 cm pore space holding water, last 365 days.', { caveat: 'A 0.5° x 0.625° model cell.', digits: 2 }),
  m('gwet_root', 'soil', 'Root-zone soil wetness (NASA MERRA-2)', '0-1', 'modelled', ['power'], 'NASA POWER GWETROOT: the top 100 cm, last 365 days.', { caveat: 'A 0.5° x 0.625° model cell.', digits: 2 }),
  m('gwet_prof', 'soil', 'Whole-profile soil wetness (NASA MERRA-2)', '0-1', 'modelled', ['power'], 'NASA POWER GWETPROF: surface to bedrock, last 365 days.', { caveat: 'A 0.5° x 0.625° model cell.', digits: 2 }),
  m('st_6', 'soil', 'Soil temperature at 6 cm, now', '°C', 'modelled', ['om-forecast'], 'Open-Meteo forecast models, the current hour.', { digits: 1 }),
  m('st_18', 'soil', 'Soil temperature at 18 cm, now', '°C', 'modelled', ['om-forecast'], 'Open-Meteo forecast models, the current hour.', { digits: 1 }),
  m('st_54', 'soil', 'Soil temperature at 54 cm, now', '°C', 'modelled', ['om-forecast'], 'Open-Meteo forecast models, the current hour.', { digits: 1 }),
  m('ts_skin', 'soil', 'Ground surface temperature, 365-day mean', '°C', 'modelled', ['power'], 'NASA POWER TS, the earth skin temperature of MERRA-2.', { digits: 1 }),
  m('ph', 'soil', 'Soil pH (water), 0-30 cm', 'pH', 'modelled', ['soilgrids'], 'SoilGrids depth-weighted mean of 0-5, 5-15 and 15-30 cm; the range is the 5-95 % prediction interval.', { citation: SG, caveat: SG_CAVEAT, digits: 1 }),
  m('cec', 'soil', 'Cation exchange capacity, 0-30 cm', 'cmol(+)/kg', 'modelled', ['soilgrids'], 'SoilGrids cec, depth-weighted: how many nutrient cations the soil holds against leaching.', { citation: SG, caveat: SG_CAVEAT, digits: 0 }),
  m('n_total', 'soil', 'Total nitrogen, 0-30 cm', 'g/kg', 'modelled', ['soilgrids'], 'SoilGrids nitrogen, depth-weighted. Total N, not the mineral N a crop can take up this season.', { citation: SG, caveat: SG_CAVEAT, digits: 2 }),
  m('soc', 'soil', 'Organic carbon, 0-30 cm', 'g/kg', 'modelled', ['soilgrids'], 'SoilGrids soc, depth-weighted.', { citation: SG, caveat: SG_CAVEAT, digits: 1 }),
  m('bd', 'soil', 'Bulk density, 0-30 cm', 'g/cm³', 'modelled', ['soilgrids'], 'SoilGrids bdod, depth-weighted.', { citation: SG, caveat: SG_CAVEAT, digits: 2 }),
  m('cn', 'soil', 'Carbon to nitrogen ratio, 0-30 cm', 'ratio', 'derived', ['soilgrids'], 'Organic carbon over total nitrogen. Above about 25, soil microbes lock up nitrogen while residues rot.', { citation: 'USDA NRCS (2011), Carbon to Nitrogen Ratios in Cropping Systems', digits: 0 }),
  m('theta_10', 'soil', 'Water held at 10 kPa, 0-30 cm', 'm³/m³', 'modelled', ['soilgrids'], 'SoilGrids water retention wv0010, depth-weighted.', { citation: WV, digits: 2 }),
  m('theta_fc', 'soil', 'Water at field capacity (33 kPa), 0-30 cm', 'm³/m³', 'modelled', ['soilgrids'], 'SoilGrids water retention wv0033, depth-weighted.', { citation: WV, digits: 2 }),
  m('theta_wp', 'soil', 'Water at wilting point (1500 kPa), 0-30 cm', 'm³/m³', 'modelled', ['soilgrids'], 'SoilGrids water retention wv1500, depth-weighted.', { citation: WV, digits: 2 }),
  m('paw_sg', 'soil', 'Plant-available water, 0-30 cm', 'mm', 'derived', ['soilgrids'], '(field capacity minus wilting point) x 300 mm, from the SoilGrids retention layers.', { citation: WV, digits: 0 }),
  m('psi_0_7', 'soil', 'Soil water tension 0-7 cm', 'kPa', 'derived', ['soilgrids', 'om-archive'], 'van Genuchten curve fitted through the SoilGrids retention points and saturation (Saxton and Rawls), read at the latest ERA5-Land moisture.', { citation: 'van Genuchten 1980, Soil Sci Soc Am J 44:892', caveat: 'Model moisture on a model curve: a direction, not a tensiometer reading.', digits: 0 }),
  m('psi_7_28', 'soil', 'Soil water tension 7-28 cm', 'kPa', 'derived', ['soilgrids', 'om-archive'], 'As for 0-7 cm, with the 7-28 cm moisture.', { citation: 'van Genuchten 1980, Soil Sci Soc Am J 44:892', caveat: 'Model moisture on a model curve: a direction, not a tensiometer reading.', digits: 0 }),
  m('psi_28_100', 'soil', 'Soil water tension 28-100 cm', 'kPa', 'derived', ['soilgrids', 'om-archive'], 'As for 0-7 cm, with the 28-100 cm moisture and the 30-100 cm retention curve.', { citation: 'van Genuchten 1980, Soil Sci Soc Am J 44:892', caveat: 'Model moisture on a model curve: a direction, not a tensiometer reading.', digits: 0 }),
  m('pf_7_28', 'soil', 'pF, 7-28 cm', 'pF', 'derived', ['soilgrids', 'om-archive'], 'log10 of the tension in cm of water: about 2.0-2.5 at field capacity, 4.2 at wilting point.', { digits: 1 }),
  m('ksat', 'soil', 'Saturated hydraulic conductivity, topsoil', 'mm/h', 'derived', ['soilgrids'], 'Saxton and Rawls (2006) eq. 16 from sand, clay and organic matter.', { citation: 'Saxton & Rawls 2006, Soil Sci Soc Am J 70:1569', digits: 0 }),
  m('hsg', 'soil', 'Hydrologic soil group', 'A-D', 'derived', ['soilgrids'], 'NRCS groups from topsoil Ksat: A above 144, B 36-144, C 3.6-36, D below 3.6 mm/h.', { citation: 'USDA NRCS National Engineering Handbook Part 630 Ch. 7 (2009)' }),
  m('al_risk', 'soil', 'Aluminium toxicity risk', '0-1', 'derived', ['soilgrids', 'isda'], 'Rises from pH(H2O) 5.5 (0) to 4.5 (1): below 5.5 exchangeable Al3+ starts to stunt roots. Uses iSDA pH where available.', { citation: 'Kochian et al. 2004, Annu Rev Plant Biol 55:459', digits: 2 }),
  m('waterlog_days', 'soil', 'Days near saturation, top 7 cm (last 365 days)', 'days', 'proxy', ['om-archive', 'soilgrids'], 'Days with ERA5-Land moisture at or above 95 % of saturation (Saxton and Rawls): roots short of oxygen. Stands in for the redox potential, which needs an electrode.', { caveat: ERA5, digits: 0 }),
  m('decomp', 'soil', 'Pace of organic-matter decomposition', 'x Ultuna', 'modelled', ['model', 'power'], 'RothC temperature factor times the IPCC 2019 water factor on this field’s NASA POWER normals, relative to the Ultuna calibration site (soilcarbon.ts). Faster decomposition means more CO2 breathed out by soil life.', { citation: 'Coleman & Jenkinson 1996 (RothC); IPCC 2019 Refinement Vol. 4 Ch. 5', digits: 2 }),
  m('isda_ph', 'soil', 'pH, 0-20 cm (iSDAsoil)', 'pH', 'modelled', ['isda'], 'iSDAsoil 30 m mean, back-transformed x/10.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 1 }),
  m('isda_n', 'soil', 'Total nitrogen, 0-20 cm (iSDAsoil)', 'g/kg', 'modelled', ['isda'], 'iSDAsoil 30 m mean, back-transformed exp(x/100)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 2 }),
  m('isda_p', 'soil', 'Extractable phosphorus, 0-20 cm (iSDAsoil)', 'mg/kg', 'modelled', ['isda'], 'iSDAsoil Mehlich-3 P, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 0 }),
  m('isda_k', 'soil', 'Extractable potassium, 0-20 cm (iSDAsoil)', 'mg/kg', 'modelled', ['isda'], 'iSDAsoil Mehlich-3 K, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 0 }),
  m('isda_ca', 'soil', 'Extractable calcium, 0-20 cm (iSDAsoil)', 'mg/kg', 'modelled', ['isda'], 'iSDAsoil Mehlich-3 Ca, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 0 }),
  m('isda_mg', 'soil', 'Extractable magnesium, 0-20 cm (iSDAsoil)', 'mg/kg', 'modelled', ['isda'], 'iSDAsoil Mehlich-3 Mg, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 0 }),
  m('isda_s', 'soil', 'Extractable sulphur, 0-20 cm (iSDAsoil)', 'mg/kg', 'modelled', ['isda'], 'iSDAsoil Mehlich-3 S, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 1 }),
  m('isda_zn', 'soil', 'Extractable zinc, 0-20 cm (iSDAsoil)', 'mg/kg', 'modelled', ['isda'], 'iSDAsoil Mehlich-3 Zn, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 1 }),
  m('isda_fe', 'soil', 'Extractable iron, 0-20 cm (iSDAsoil)', 'mg/kg', 'modelled', ['isda'], 'iSDAsoil Mehlich-3 Fe, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 0 }),
  m('isda_al', 'soil', 'Extractable aluminium, 0-20 cm (iSDAsoil)', 'mg/kg', 'modelled', ['isda'], 'iSDAsoil Mehlich-3 Al, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 0 }),
  m('isda_cec', 'soil', 'Cation exchange capacity, 0-20 cm (iSDAsoil)', 'cmol(+)/kg', 'modelled', ['isda'], 'iSDAsoil, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 1 }),
  m('isda_oc', 'soil', 'Organic carbon, 0-20 cm (iSDAsoil)', 'g/kg', 'modelled', ['isda'], 'iSDAsoil, back-transformed exp(x/10)-1.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 1 }),
  m('isda_depth', 'soil', 'Depth to bedrock (iSDAsoil)', 'cm', 'modelled', ['isda'], 'iSDAsoil bedrock depth, predicted mean.', { citation: ISDA, caveat: ISDA_CAVEAT, digits: 0 }),
  m('ec', 'soil', 'Salinity (EC), topsoil', 'dS/m', 'modelled', ['hwsd'], MAKE_EXTRA('FAO HWSD v2 topsoil electrical conductivity: below 2 non-saline, 2-4 slightly, 4-8 moderately, above 8 strongly saline.'), { citation: 'FAO & IIASA 2023, HWSD v2.0', caveat: 'A 1 km soil-unit value, not a sample.', digits: 1 }),
  m('esp', 'soil', 'Sodicity (ESP), topsoil', '%', 'modelled', ['hwsd'], MAKE_EXTRA('FAO HWSD v2 exchangeable sodium percentage; above 15 % the soil is sodic.'), { citation: 'FAO & IIASA 2023, HWSD v2.0', digits: 0 }),
  m('drainage', 'soil', 'Drainage class', 'class', 'modelled', ['hwsd'], MAKE_EXTRA('FAO HWSD v2 drainage class, from excessively to very poorly drained.'), { citation: 'FAO & IIASA 2023, HWSD v2.0' }),

  // ---------- air ----------
  m('t_max16', 'air', 'Hottest day, next 16 days', '°C', 'modelled', ['om-forecast'], 'Highest hourly air temperature in the Open-Meteo forecast.', { digits: 0 }),
  m('t_min16', 'air', 'Coldest night, next 16 days', '°C', 'modelled', ['om-forecast'], 'Lowest hourly air temperature in the Open-Meteo forecast.', { digits: 0 }),
  m('rh', 'air', 'Relative humidity, 365-day mean', '%', 'modelled', ['power'], 'NASA POWER RH2M (MERRA-2).', { digits: 0 }),
  m('rh_now', 'air', 'Relative humidity now', '%', 'modelled', ['om-forecast'], 'Open-Meteo, the current hour.', { digits: 0 }),
  m('vpd_now', 'air', 'Vapour pressure deficit now', 'kPa', 'modelled', ['om-forecast'], 'Open-Meteo, the current hour. Above about 1.5 kPa many crops begin to close their stomata.', { digits: 2 }),
  m('vpd_day', 'air', 'Midday vapour pressure deficit, growing season', 'kPa', 'derived', ['power'], 'FAO-56 eq. 11-14 at the daily maximum with the dew point as actual vapour, mean over the growing-season months of the last 3 years.', { citation: 'Allen et al. 1998, FAO Irrigation and Drainage Paper 56', digits: 2 }),
  m('dew_now', 'air', 'Dew point now', '°C', 'modelled', ['om-forecast'], 'Open-Meteo, the current hour.', { digits: 1 }),
  m('ah_now', 'air', 'Absolute humidity now', 'g/m³', 'derived', ['om-forecast'], 'Grams of water vapour per cubic metre, from temperature and humidity (ideal gas).', { digits: 1 }),
  m('hd_now', 'air', 'Humidity deficit now', 'g/m³', 'derived', ['om-forecast'], 'Water the air could still take up: saturation minus actual absolute humidity. Greenhouse growers usually aim for 3-7 g/m³.', { digits: 1 }),
  m('deltat_now', 'air', 'Delta-T now', '°C', 'derived', ['om-forecast'], 'Air minus wet-bulb temperature (Stull 2011): 2-8 °C suits spraying; above 10 °C droplets evaporate before they land.', { citation: 'Stull 2011, J Appl Meteorol Climatol 50:2267; GRDC spray application guidance', digits: 1 }),
  m('wind_mean', 'air', 'Wind at 2 m, 365-day mean', 'm/s', 'modelled', ['power'], 'NASA POWER WS2M.', { digits: 1 }),
  m('gust_max', 'air', 'Strongest gust, next 16 days', 'km/h', 'modelled', ['om-forecast'], 'Open-Meteo hourly gusts.', { digits: 0 }),
  m('wind_rose', 'air', 'Wind rose, last 365 days', '% of days', 'derived', ['om-archive'], 'Share of days by dominant wind direction in 8 sectors (ERA5).', {}),
  m('pressure_now', 'air', 'Sea-level pressure now', 'hPa', 'modelled', ['om-forecast'], 'Open-Meteo, the current hour; the note gives the change over the last 3 hours.', { digits: 0 }),
  m('aod', 'air', 'Aerosol optical depth (550 nm), 365-day mean', 'AOD', 'modelled', ['power'], 'NASA POWER AOD_55 from MERRA-2: haze, dust and smoke between the sun and the field.', { digits: 2 }),
  m('dust_now', 'air', 'Dust near the ground, now', 'µg/m³', 'modelled', ['om-air'], 'CAMS global forecast via Open-Meteo, the current hour.', { digits: 0 }),
  m('uvb', 'air', 'UV-B at the surface, 365-day mean', 'MJ/m²/day', 'modelled', ['power'], 'NASA POWER ALLSKY_SFC_UVB (280-315 nm); 0.03 MJ/m²/day is about 0.35 W/m² over the day.', { digits: 3 }),
  m('rain_365', 'air', 'Rain, last 365 days', 'mm', 'modelled', ['power'], 'NASA POWER PRECTOTCORR (MERRA-2, bias-corrected).', { digits: 0 }),

  // ---------- light ----------
  m('sw', 'light', 'Solar radiation, 365-day mean', 'MJ/m²/day', 'observed', ['power'], 'NASA POWER ALLSKY_SFC_SW_DWN from the CERES satellites.', { digits: 1 }),
  m('par', 'light', 'PAR at the surface, 365-day mean', 'MJ/m²/day', 'observed', ['power'], 'NASA POWER ALLSKY_SFC_PAR_TOT: the 400-700 nm light plants use.', { digits: 1 }),
  m('dli', 'light', 'Daily light integral, growing season', 'mol/m²/day', 'derived', ['power'], 'PAR x 4.57 mol per MJ, mean over the growing-season days of the last 365.', { citation: 'McCree 1972, Agric Meteorol 10:443', digits: 0 }),
  m('diffuse', 'light', 'Diffuse share of sunlight, 365-day mean', '%', 'derived', ['power'], 'ALLSKY_SFC_SW_DIFF over ALLSKY_SFC_SW_DWN. Diffuse light reaches the lower leaves.', { citation: 'Mercado et al. 2009, Nature 458:1014', digits: 0 }),
  m('clearness', 'light', 'Clearness index, 365-day mean', '0-1', 'observed', ['power'], 'NASA POWER ALLSKY_KT: sunlight at the ground over sunlight at the top of the atmosphere.', { digits: 2 }),
  m('daylength', 'light', 'Day length today', 'h', 'derived', ['model'], 'Astronomical sunrise to sunset (FAO-56 declination, 0.83° for refraction and the sun’s disc).', { digits: 1 }),
  m('daylength_max', 'light', 'Longest day of the year', 'h', 'derived', ['model'], 'The same at the June (north) or December (south) solstice; day-length-sensitive crops flower by it.', { digits: 1 }),

  // ---------- plant ----------
  m('ndvi', 'plant', 'NDVI (MODIS 250 m)', '0-1', 'observed', ['modis'], MOD('MOD13Q1 16-day composites, the last two years'), { citation: 'Didan 2021, MOD13Q1 v061 user guide', caveat: 'A 250 m pixel mixes in neighbours on small fields.', digits: 2 }),
  m('evi', 'plant', 'EVI (MODIS 250 m)', '0-1', 'observed', ['modis'], MOD('MOD13Q1 enhanced vegetation index, the last two years; it does not saturate over dense canopies'), { citation: 'Huete et al. 2002, Remote Sens Environ 83:195', caveat: 'A 250 m pixel mixes in neighbours on small fields.', digits: 2 }),
  m('lai', 'plant', 'Leaf area index (MODIS)', 'm²/m²', 'observed', ['modis'], MOD('MCD15A2H 8-day LAI, the last 365 days'), { citation: 'Myneni et al. 2015, MCD15A2H v061', caveat: PIX500, digits: 1 }),
  m('fpar', 'plant', 'Absorbed share of PAR (MODIS fAPAR)', '%', 'observed', ['modis'], MOD('MCD15A2H 8-day fAPAR, the last 365 days'), { citation: 'Myneni et al. 2015, MCD15A2H v061', caveat: PIX500, digits: 0 }),
  m('et', 'plant', 'Evapotranspiration (MODIS)', 'mm/day', 'observed', ['modis'], MOD('MOD16A2 8-day ET, the last 365 days'), { citation: 'Running et al. 2019, MOD16 user guide', caveat: `${PIX500} MOD16 is a model driven by satellite inputs.`, digits: 1 }),
  m('pet', 'plant', 'Potential evapotranspiration (MODIS)', 'mm/day', 'observed', ['modis'], MOD('MOD16A2 8-day PET, the last 365 days'), { citation: 'Running et al. 2019, MOD16 user guide', caveat: PIX500, digits: 1 }),
  m('et_ratio', 'plant', 'ET / PET (evaporative stress)', '0-1', 'derived', ['modis'], 'MODIS ET over PET, mean of the last four 8-day composites: low values mean the land is short of water.', { citation: 'Anderson et al. 2011, J Climate 24:2025 (Evaporative Stress Index)', digits: 2 }),
  m('le', 'plant', 'Latent heat flux (energy spent on evaporation)', 'W/m²', 'observed', ['modis'], MOD('MOD16A2 LE, J/m²/day ÷ 86 400, the last 365 days'), { citation: 'Running et al. 2019, MOD16 user guide', caveat: PIX500, digits: 0 }),
  m('lst_day', 'plant', 'Land surface temperature, day (MODIS 1 km)', '°C', 'observed', ['modis'], MOD('MOD11A2 8-day daytime LST, the last 365 days'), { citation: 'Wan 2021, MOD11A2 v061', caveat: 'A 1 km pixel.', digits: 1 }),
  m('lst_night', 'plant', 'Land surface temperature, night (MODIS 1 km)', '°C', 'observed', ['modis'], MOD('MOD11A2 8-day night LST, the last 365 days'), { citation: 'Wan 2021, MOD11A2 v061', caveat: 'A 1 km pixel.', digits: 1 }),
  m('lst_anom', 'plant', 'Daytime LST vs the same weeks of the 5 previous years', '°C', 'derived', ['modis'], 'Mean of the latest four MOD11A2 daytime composites minus the mean of the same composites in the five years before. MODIS began in 2000, so there is no 50-year satellite baseline.', { digits: 1 }),
  m('gpp', 'plant', 'Gross primary production (MODIS)', 'g C/m²/day', 'modelled', ['modis'], MOD('MOD17A2H 8-day GPP, a light-use-efficiency model on MODIS fAPAR'), { citation: 'Running & Zhao 2021, MOD17 user guide', caveat: PIX500, digits: 1 }),
  m('greenup', 'plant', 'Green-up date (MODIS phenology)', 'date', 'observed', ['modis'], MOD('MCD12Q2 first vegetation cycle of the latest year'), { citation: 'Gray et al. 2019, MCD12Q2 v061 user guide', caveat: PIX500 }),
  m('maturity', 'plant', 'Maturity date (MODIS phenology)', 'date', 'observed', ['modis'], MOD('MCD12Q2 first cycle: when greenness reaches its plateau'), { citation: 'Gray et al. 2019, MCD12Q2 v061 user guide', caveat: PIX500 }),
  m('senescence', 'plant', 'Mid-senescence date (MODIS phenology)', 'date', 'observed', ['modis'], MOD('MCD12Q2 first cycle: half-way down from the peak'), { citation: 'Gray et al. 2019, MCD12Q2 v061 user guide', caveat: PIX500 }),
  m('burned', 'plant', 'Years with fire on the field pixel, last 10', 'years', 'observed', ['modis'], MOD('MCD64A1 monthly burned area: years with a burn date (stubble or residue burning shows here)'), { citation: 'Giglio et al. 2018, Remote Sens Environ 217:72', caveat: PIX500, digits: 0 }),
  m('veg_nontree', 'plant', 'Non-tree vegetation cover (MODIS VCF)', '%', 'observed', ['modis'], MOD('MOD44B yearly vegetation continuous fields'), { citation: 'DiMiceli et al. 2021, MOD44B v061', caveat: 'A 250 m pixel.', digits: 0 }),
  m('hls_ndvi', 'plant', 'NDVI of the field (NASA HLS 30 m)', '0-1', 'observed', ['hls'], `(NIR - red)/(NIR + red). ${RANGE}`, { citation: HLS, digits: 2 }),
  m('hls_evi', 'plant', 'EVI of the field (HLS)', '0-1', 'observed', ['hls'], `2.5 (NIR - red)/(NIR + 6 red - 7.5 blue + 1). ${RANGE}`, { citation: 'Huete et al. 2002, Remote Sens Environ 83:195', digits: 2 }),
  m('hls_ndre', 'plant', 'NDRE, red-edge index of the field (HLS)', '0-1', 'observed', ['hls'], `(NIR - red edge 705 nm)/(NIR + red edge). ${S30} ${RANGE}`, { citation: HLS, digits: 2 }),
  m('hls_ndmi', 'plant', 'NDMI, canopy water of the field (HLS)', '-1..1', 'observed', ['hls'], `(NIR - SWIR 1.6 µm)/(NIR + SWIR): the water in leaves, the index also called NDWI (Gao). ${RANGE}`, { citation: 'Gao 1996, Remote Sens Environ 58:257', digits: 2 }),
  m('hls_cire', 'plant', 'Chlorophyll index, red edge (HLS)', 'index', 'observed', ['hls'], `NIR / red edge 705 nm - 1: tracks leaf chlorophyll and so nitrogen status. ${S30}`, { citation: 'Gitelson et al. 2003, Geophys Res Lett 30:1248', digits: 2 }),
  m('hls_mtci', 'plant', 'Terrestrial chlorophyll index MTCI (HLS)', 'index', 'observed', ['hls'], `(740 - 705 nm)/(705 - 665 nm). ${S30}`, { citation: 'Dash & Curran 2004, Int J Remote Sens 25:5403', digits: 2 }),
  m('hls_reip', 'plant', 'Red-edge position (HLS)', 'nm', 'derived', ['hls'], `700 + 40 x ((665 + 783 nm)/2 - 705)/(740 - 705): moves to shorter wavelengths when chlorophyll breaks down. ${S30}`, { citation: 'Guyot & Baret 1988 (four-point interpolation)', digits: 0 }),
  m('hls_psri', 'plant', 'Plant senescence reflectance index (HLS)', 'index', 'observed', ['hls'], `(665 - 490 nm)/740 nm: carotenoids against chlorophyll, rises as leaves age. ${S30}`, { citation: 'Merzlyak et al. 1999, Physiol Plant 106:135', digits: 3 }),
  m('hls_ari', 'plant', 'Anthocyanin reflectance index (HLS)', '1/refl.', 'observed', ['hls'], `1/560 nm - 1/705 nm reflectance: red stress pigments. ${S30}`, { citation: 'Gitelson et al. 2001, Photochem Photobiol 74:38', caveat: 'Experimental on 30 m pixels: read the trend, not the value.', digits: 2 }),
  m('hls_cri', 'plant', 'Carotenoid reflectance index (HLS)', '1/refl.', 'observed', ['hls'], `1/490 nm - 1/560 nm reflectance. ${S30}`, { citation: 'Gitelson et al. 2002, Photochem Photobiol 75:272', caveat: 'Band approximation: 490 nm stands in for the 510 nm of the original index.', digits: 2 }),
  m('hls_cv', 'plant', 'Field heterogeneity (CV of NDVI)', '%', 'derived', ['hls'], 'Standard deviation over mean of the field’s HLS NDVI pixels in the latest clear scene. Above about 15 % the field is patchy enough for zone management.', { citation: 'Pringle et al. 2003, Precision Agric 4:167', digits: 0 }),
  m('hls_fvc', 'plant', 'Fraction of vegetation cover', '%', 'derived', ['hls'], '((NDVI - 0.15)/(0.85 - 0.15))² on the field’s mean HLS NDVI.', { citation: 'Carlson & Ripley 1997, Remote Sens Environ 62:241; Gutman & Ignatov 1998', digits: 0 }),
  m('hls_fapar', 'plant', 'fAPAR from HLS NDVI', '%', 'derived', ['hls'], '1.24 NDVI - 0.168 on the field’s mean HLS NDVI.', { citation: 'Myneni & Williams 1994, Remote Sens Environ 49:200', digits: 0 }),
  m('lst_landsat', 'plant', 'Surface temperature of the field (Landsat)', '°C', 'observed', ['landsat'], 'Landsat Collection 2 Level-2 surface temperature (x 0.00341802 + 149 K), latest clear scene of the last 60 days.', { citation: 'USGS Landsat 8-9 Collection 2 Level 2 Science Product Guide', caveat: 'Thermal pixels are 100 m.', digits: 1 }),
  m('dt_surface_air', 'plant', 'Surface minus air temperature at overpass', '°C', 'proxy', ['landsat', 'om-forecast'], 'Landsat surface temperature minus the 2 m air temperature at the overpass hour. Well above 0: a canopy not cooling itself (closed stomata) or bare soil.', { citation: 'Jackson et al. 1981, Water Resour Res 17:1133 (crop water stress index)', caveat: 'At 100 m it mixes canopy and soil: a stand-in for canopy temperature.', digits: 1 }),
  m('s1_vv', 'plant', 'Radar backscatter VV (Sentinel-1)', 'dB', 'observed', ['s1'], 'Radiometrically terrain-corrected gamma0, the latest pass of the last 24 days; radar sees through clouds and at night.', { citation: 'ESA Sentinel-1; Planetary Computer RTC', digits: 1 }),
  m('s1_vh', 'plant', 'Radar backscatter VH (Sentinel-1)', 'dB', 'observed', ['s1'], 'As VV, cross-polarised: grows with the volume of leaves and stems.', { citation: 'ESA Sentinel-1; Planetary Computer RTC', digits: 1 }),
  m('s1_rvi', 'plant', 'Radar vegetation index (Sentinel-1)', '0-1', 'derived', ['s1'], '4 VH/(VV + VH) in linear units: near 0 bare soil, towards 1 a dense canopy.', { citation: 'Kim & van Zyl 2009, IEEE Trans Geosci Remote Sens 47:2519 (dual-pol form)', digits: 2 }),

  // ---------- water ----------
  m('p_minus_e', 'water', 'Rain minus reference ET, recent decade', 'mm/yr', 'derived', ['power'], 'Annual rain minus FAO-56 Penman-Monteith ET₀ from the NASA POWER monthly normals of the recent decade.', { citation: 'Allen et al. 1998, FAO-56', digits: 0 }),
  m('aridity', 'water', 'Aridity index P/PET, recent decade', 'ratio', 'derived', ['power'], 'UNEP classes: below 0.05 hyper-arid, 0.2 arid, 0.5 semi-arid, 0.65 dry sub-humid, above humid.', { citation: 'UNEP 1997, World Atlas of Desertification', digits: 2 }),
  m('aridity_base', 'water', 'Aridity index P/PET, 1981-2010', 'ratio', 'derived', ['power'], 'The same for the baseline normals.', { citation: 'UNEP 1997, World Atlas of Desertification', digits: 2 }),
  m('r95p', 'water', 'Share of rain from very wet days (R95pTOT)', '%', 'derived', ['power'], 'Rain on days above the 95th percentile of 1981-2010 wet days (1 mm or more), as a share of all rain in the recent decade (ETCCDI).', { citation: 'Zhang et al. 2011, WIREs Clim Change 2:851 (ETCCDI indices)', digits: 0 }),
  m('r99p', 'water', 'Share of rain from extremely wet days (R99pTOT)', '%', 'derived', ['power'], 'As R95pTOT with the 99th percentile.', { citation: 'Zhang et al. 2011, WIREs Clim Change 2:851', digits: 0 }),
  m('runoff_share', 'water', 'Share of rain lost as surface runoff', '%', 'derived', ['power', 'soilgrids'], 'SCS curve number (row crops in good condition, hydrologic group from Ksat, adjusted for the 5 days of rain before) on NASA POWER daily rain of the recent decade.', { citation: 'USDA NRCS 1986, TR-55', digits: 0 }),
  m('flood_now', 'water', 'River flood signal, next 30 days', 'percentile', 'derived', ['om-flood'], 'Peak GloFAS discharge of the nearest river cell in the next 30 days, as a percentile of its own record since 1984.', { citation: 'Harrigan et al. 2020, Earth Syst Sci Data 12:2043', caveat: 'The river cell may be kilometres away; no floodplain map is used.', digits: 0 }),
  m('flood_days', 'water', 'Days above the 1-in-20 discharge, per year (last 10 years)', 'days/yr', 'derived', ['om-flood'], 'Days with discharge above the 95th percentile of the whole record, averaged over the last 10 years.', { citation: 'Harrigan et al. 2020, Earth Syst Sci Data 12:2043', digits: 1 }),
  m('grace_trend', 'water', 'Regional water storage trend (GRACE-FO)', 'cm/yr', 'observed', ['grace'], 'NASA GRACE and GRACE-FO mascon trend since 2002: soil, groundwater, snow and lakes together. It is not the depth to the water table.', { citation: 'Save et al. 2016, J Geophys Res 121:7547 (CSR mascons)', caveat: 'A ~300 km footprint.', digits: 1 }),
  m('wue', 'water', 'Water use efficiency of the pick', 'kg/m³', 'derived', ['model'], 'Modelled yield of the recommended crop divided by its modelled seasonal ET (FAO-56 water model).', { digits: 2 }),
  m('water_footprint', 'water', 'Water footprint of the pick', 'm³/t', 'derived', ['model'], '10 x ET (mm) ÷ yield (t/ha); the note splits blue (irrigation) from green (rain) water.', { citation: 'Mekonnen & Hoekstra 2011, Hydrol Earth Syst Sci 15:1577', digits: 0 }),
  m('transp_ratio', 'water', 'Transpiration ratio of the pick', 'kg water/kg dry matter', 'derived', ['literature'], 'Water transpired per kilogram of dry matter, measured for crops side by side at Akron, Colorado (1911-1917); approximate for crops not in that study.', { citation: 'Briggs & Shantz 1914, J Agric Res 3:1', digits: 0 }),

  // ---------- terrain ----------
  m('elev', 'terrain', 'Elevation', 'm', 'observed', ['dem'], 'Terrarium DEM at the field centre.', { digits: 0 }),
  m('slope', 'terrain', 'Mean slope', '%', 'derived', ['dem'], 'Horn’s method on the DEM grid, mean over the field.', { citation: 'Horn 1981, Proc IEEE 69:14', digits: 1 }),
  m('slope_p90', 'terrain', 'Slope of the steepest tenth of the field', '%', 'derived', ['dem'], '90th percentile of the field’s slope cells.', { digits: 1 }),
  m('aspect', 'terrain', 'Facing', 'direction', 'derived', ['dem'], 'Slope-weighted mean downhill direction; south-facing slopes get more sun and dry out faster (north of the equator).', {}),
  m('tri', 'terrain', 'Terrain ruggedness index', 'm', 'derived', ['dem'], 'Root of the summed squared height differences to the 8 neighbours, field mean.', { citation: 'Riley et al. 1999, Intermountain J Sci 5:23', digits: 1 }),
  m('twi', 'terrain', 'Topographic wetness index, field median', 'ln(m)', 'derived', ['dem'], 'ln(a / tan β) with D8 flow accumulation on the depression-filled DEM.', { citation: 'Beven & Kirkby 1979, Hydrol Sci Bull 24:43', caveat: 'A ~30 m DEM does not see furrows, drains or hedges.', digits: 1 }),
  m('wet_share', 'terrain', 'Share of the field that collects water from 1 ha or more upslope', '%', 'derived', ['dem'], 'Field cells whose upslope area (D8) is at least 1 ha: where water gathers after heavy rain.', { digits: 0 }),
  m('ls', 'terrain', 'Slope length-steepness factor (LS), field median', 'LS', 'derived', ['dem'], '(a/22.13)^0.4 x (sin β/0.0896)^1.3 from the DEM, instead of an assumed 100 m slope.', { citation: 'Moore & Burch 1986, Soil Sci Soc Am J 50:1294', digits: 2 }),

  // ---------- windows ----------
  m('spray_hours', 'windows', 'Hours fit for spraying, next 7 days', 'h', 'derived', ['om-forecast'], 'Hours with wind 3-15 km/h, delta-T 2-8 °C, 5-28 °C and no rain in that hour or the 6 hours after.', { citation: 'GRDC spray application guidance; Stull 2011 wet bulb', digits: 0 }),
  m('next_spray', 'windows', 'Next spraying window', 'date', 'derived', ['om-forecast'], 'Start of the first run of at least 3 spray-fit hours.', {}),
  m('sow_date', 'windows', 'Soil warm enough to sow the pick', 'date', 'derived', ['om-forecast', 'literature'], 'First day that starts 3 days in a row with the 6 cm soil at or above the crop’s minimum germination temperature (table in windows.ts).', { citation: 'Seed-bed minima from extension guides (e.g. Nielsen, Purdue: maize 10 °C)' }),
  m('disease_days', 'windows', 'Disease-weather days for the pick, next 16 days', 'days', 'derived', ['om-forecast', 'literature'], 'Potato: Hutton criteria. Cereals at flowering: 10 h or more at RH ≥ 90 % and 15-30 °C (Fusarium). Other crops: 10 h or more of leaf wetness at 15-25 °C (generic fungal infection).', { citation: 'Dancey et al. 2017 (AHDB Hutton criteria); De Wolf et al. 2003, Phytopathology 93:428; Magarey et al. 2005, Phytopathology 95:92', digits: 0 }),
  m('storm_days', 'windows', 'Thunderstorm and hail potential, next 16 days', 'days', 'derived', ['om-forecast'], 'Days with CAPE of 1000 J/kg or more and a lifted index of -2 or less in the same hour.', { citation: 'Brooks et al. 2003, Atmos Res 67:73', digits: 0 }),
  m('frost_days16', 'windows', 'Frost nights, next 16 days', 'nights', 'derived', ['om-forecast'], 'Nights with an hourly air temperature at or below 0 °C.', { digits: 0 }),
  m('heat_days16', 'windows', 'Days above the pick’s critical temperature, next 16 days', 'days', 'derived', ['om-forecast', 'literature'], 'Days whose maximum reaches the crop’s critical temperature at flowering (extremes.ts table).', { citation: 'Porter & Gawith 1999; Hatfield et al. 2011 (see extremes.ts)', digits: 0 }),
  m('lodging_days', 'windows', 'Lodging weather, next 16 days', 'days', 'derived', ['om-forecast'], 'Days with gusts of 60 km/h or more after 20 mm of rain within 48 hours: the weather that flattens tall cereals.', { citation: 'Berry et al. 2004, Adv Agron 84:217', caveat: 'A rule of thumb; stem strength and variety decide the rest.', digits: 0 }),
  m('gdd_season', 'windows', 'Degree-days since sowing (pick)', '°C·day', 'derived', ['power', 'om-forecast'], 'Sum of the daily mean above the crop’s base (0 °C for winter crops, 10 °C for summer crops, as the engine uses) from the calendar sowing date.', { digits: 0 }),
  m('ripe_date', 'windows', 'Expected ripening date (pick)', 'date', 'derived', ['power', 'om-forecast'], 'The day the degree-day need is met: observed days, then the forecast, then the median of the last 10 years for the rest.', {}),

  // ---------- climate ----------
  m('koppen_base', 'climate', 'Köppen-Geiger class, 1981-2010', 'class', 'derived', ['power'], 'Köppen-Geiger rules on the NASA POWER monthly normals.', { citation: 'Beck et al. 2018, Sci Data 5:180214; Peel et al. 2007, HESS 11:1633' }),
  m('koppen_recent', 'climate', 'Köppen-Geiger class, recent decade', 'class', 'derived', ['power'], 'The same rules on the recent decade.', { citation: 'Beck et al. 2018, Sci Data 5:180214' }),
  m('koppen_2050', 'climate', 'Köppen-Geiger class, 2050s (SSP2-4.5)', 'class', 'derived', ['power', 'model'], 'The same rules on the recent normals shifted by the NEX-GDDP-CMIP6 changes (demo fields only).', { citation: 'Beck et al. 2018, Sci Data 5:180214' }),
  m('frost_free', 'climate', 'Frost-free season, recent decade', 'days', 'derived', ['power'], 'Median days between the last spring and the first autumn night at or below 0 °C (NASA POWER daily minimum); July-June seasons south of the equator.', { digits: 0 }),
  m('frost_free_trend', 'climate', 'Frost-free season trend since 1981', 'days/decade', 'derived', ['power'], 'Sen’s slope of the yearly frost-free length.', { citation: 'Sen 1968, J Am Stat Assoc 63:1379', digits: 1 }),
  m('last_frost', 'climate', 'Median last spring frost, recent decade', 'date', 'derived', ['power'], 'Median day of the last night at or below 0 °C before midsummer.', {}),
  m('first_frost', 'climate', 'Median first autumn frost, recent decade', 'date', 'derived', ['power'], 'Median day of the first night at or below 0 °C after midsummer.', {}),
  m('dtr', 'climate', 'Day-night temperature range, growing season', '°C', 'derived', ['power'], 'Mean of Tmax - Tmin over the growing-season days of the recent decade.', { digits: 1 }),
  m('dtr_days', 'climate', 'Days with a day-night swing of 15 °C or more', 'days/yr', 'derived', ['power'], 'Per growing season, recent decade; the note gives 1981-2010.', { digits: 0 }),
  m('seas_t', 'climate', 'Next 3 months: temperature vs normal', '°C', 'modelled', ['om-seasonal', 'power'], 'ECMWF SEAS5 ensemble mean of the next three calendar months minus the NASA POWER recent normal of the same months.', { caveat: 'Raw model output: its own bias is not removed.', digits: 1 }),
  m('seas_p', 'climate', 'Next 3 months: rain vs normal', '%', 'modelled', ['om-seasonal', 'power'], 'Ensemble-mean rain of the next three months as a percentage of the NASA POWER recent normal.', { caveat: 'Raw model output: its own bias is not removed.', digits: 0 }),
  m('seas_p_dry', 'climate', 'Next 3 months: members drier than normal', '%', 'modelled', ['om-seasonal', 'power'], 'Share of the 51 ensemble members with less rain than the normal.', { caveat: 'Raw model output: its own bias is not removed.', digits: 0 }),
  m('oni', 'climate', 'El Niño-Southern Oscillation (ONI), latest', '°C', 'observed', ['oni'], 'NOAA Oceanic Niño Index: +0.5 or more El Niño, -0.5 or less La Niña.', { citation: 'NOAA CPC', digits: 1 }),
  m('enso_rain', 'climate', 'Growing-season rain in El Niño vs La Niña years (this field)', '%', 'derived', ['oni', 'power'], 'Mean growing-season rain in El Niño and in La Niña years (ONI of the season’s middle month) against neutral years, NASA POWER 1981 on.', { digits: 0 }),

  // ---------- economy ----------
  m('yield_pick', 'economy', 'Expected yield of the pick', 't/ha', 'modelled', ['model'], 'Reference yield of the crop x (1 - modelled water loss of the recent decade), the same numbers the plan uses.', { digits: 1 }),
  m('removal_n', 'economy', 'Nitrogen taken off with the harvest', 'kg N/ha', 'derived', ['literature', 'model'], 'Yield x nutrient content of the harvested product.', { citation: 'AHDB Nutrient Management Guide (RB209) 2023, Section 4; approximate for crops it does not list', digits: 0 }),
  m('removal_p', 'economy', 'Phosphate taken off with the harvest', 'kg P2O5/ha', 'derived', ['literature', 'model'], 'Yield x P2O5 content of the harvested product.', { citation: 'AHDB RB209 2023, Section 4', digits: 0 }),
  m('removal_k', 'economy', 'Potash taken off with the harvest', 'kg K2O/ha', 'derived', ['literature', 'model'], 'Yield x K2O content of the harvested product (grain only; straw adds more if it leaves the field).', { citation: 'AHDB RB209 2023, Section 4', digits: 0 }),
  m('n_credit', 'economy', 'Nitrogen left for the next crop (legume credit)', 'kg N/ha', 'modelled', ['model'], 'The crop table’s nitrogen credit, as the plan counts it.', { citation: 'Preissel et al. 2015, Field Crops Res 175:64', digits: 0 }),
  m('n_fix_total', 'economy', 'Nitrogen fixed from the air (legumes)', 'kg N/ha', 'derived', ['literature'], 'Typical season totals for the crop, most of it leaving with the grain.', { citation: 'Herridge et al. 2008, Plant Soil 311:1; Peoples et al. 2009, Symbiosis 48:1', caveat: 'Varies ±50 % with inoculation, soil N and water.', digits: 0 }),
  m('co2e_t', 'economy', 'Carbon footprint of the pick', 'kg CO₂e/t', 'derived', ['literature', 'model'], 'Fertiliser N (field N2O at IPCC 2019 EF1 + 3.5 kg CO2e/kg to make it), P and K replacing the offtake, diesel, and pumping energy for irrigation, per tonne harvested.', { citation: 'IPCC 2019 Refinement Vol. 4 Ch. 11; Brentrup et al. 2016, Eur J Agron 83:1; Lal 2004, Environ Int 30:981', caveat: 'Typical inputs, not your farm records.', digits: 0 }),
  m('eroi', 'economy', 'Energy returned on energy invested (pick)', 'ratio', 'derived', ['literature', 'model'], 'Gross energy of the harvest over the energy in diesel, fertiliser, seed, machinery and irrigation.', { citation: 'Hülsbergen et al. 2001, Agric Ecosyst Environ 86:303', caveat: 'Typical inputs, not your farm records.', digits: 1 }),
  m('travel_city', 'economy', 'Travel time to a city of 50 000+', 'min', 'modelled', ['access'], MAKE_EXTRA('Friction-surface travel time (roads, terrain, borders) to the nearest city of 50 000 or more.'), { citation: 'Nelson et al. 2019, Sci Data 6:134', digits: 0 }),
  m('travel_port', 'economy', 'Travel time to a port', 'min', 'modelled', ['access'], MAKE_EXTRA('Travel time to the nearest large or medium port.'), { citation: 'Nelson et al. 2019, Sci Data 6:134', digits: 0 }),
  m('price_cv', 'economy', 'World price swings of the pick', '%', 'derived', ['worldbank'], MAKE_EXTRA('Coefficient of variation of the monthly World Bank price over the last 10 years.'), { digits: 0 }),
  m('fert_import', 'economy', 'Fertiliser import dependence of the country', '%', 'derived', ['faostat'], MAKE_EXTRA('Imports over use of N + P2O5 + K2O (FAOSTAT): a country-level stand-in for supply-chain risk.'), { digits: 0 }),

  // ---------- ecosystem ----------
  m('habitat_2km', 'ecosystem', 'Semi-natural habitat within 2 km', '%', 'derived', ['modis'], 'MODIS MCD12Q1 land cover in a 4 x 4 km window: forest, shrub, savanna, grassland and wetland as habitat (half of the cropland-natural mosaic).', { citation: 'Kennedy et al. 2013, Ecol Lett 16:584; Dainese et al. 2019, Sci Adv 5:eaax0121', caveat: '500 m classes miss hedges and field margins.', digits: 0 }),
  m('cropland_2km', 'ecosystem', 'Cropland within 2 km', '%', 'derived', ['modis'], 'The same window: cropland plus half of the cropland-natural mosaic.', { digits: 0 }),
  m('poll_dep', 'ecosystem', 'How much the pick depends on pollinators', 'class', 'derived', ['literature'], 'Klein et al. classes: none, little (below 10 %), modest (10-40 %), great (40-90 %), essential (above 90 % of yield).', { citation: 'Klein et al. 2007, Proc R Soc B 274:303' }),
  m('poll_risk', 'ecosystem', 'Yield share at risk from low pollination', '%', 'proxy', ['modis', 'literature'], 'Mid-point of the crop’s dependence class x (1 - habitat share / 20 %): wild pollinators fade where little habitat is left.', { citation: 'Klein et al. 2007; Kremen et al. 2004, Ecol Lett 7:1109', caveat: 'An index for comparison, not a pollinator count.', digits: 0 }),
  m('weed_window', 'ecosystem', 'Weeks of open canopy after sowing (pick)', 'weeks', 'proxy', ['literature'], 'FAO-56 initial stage plus half the development stage: the weeks before the canopy closes, when weeds compete.', { citation: 'Allen et al. 1998, FAO-56 Table 11', caveat: 'Stands in for weed pressure, which needs imagery between the rows.', digits: 0 }),
  m('protein_supply', 'ecosystem', 'Protein supply per person in the country', 'g/day', 'observed', ['faostat'], MAKE_EXTRA('FAOSTAT food balance, latest year.'), { digits: 0 }),
]

export const METRIC_BY_ID = new Map(METRICS.map((x) => [x.id, x]))

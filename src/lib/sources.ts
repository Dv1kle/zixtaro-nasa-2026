// Data endpoints, shared by the app and scripts/prebake.mjs (keep this file import-free).

export const POWER_PARAMS = [
  'PRECTOTCORR_SUM', 'T2M', 'T2M_RANGE', 'T2M_MAX', 'GWETROOT', // water & heat
  'ALLSKY_SFC_SW_DWN', 'T2MDEW', 'WS2M', 'PS', // Penman-Monteith inputs
] as const

export const POWER_DAILY_PARAMS = ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR'] as const

export const SOILGRIDS_PROPERTIES = ['sand', 'silt', 'clay', 'soc', 'phh2o', 'bdod', 'cfvo'] as const
export const SOILGRIDS_DEPTHS = ['0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm', '100-200cm'] as const

/** NASA POWER monthly point series (MERRA-2 meteorology, CERES/SRB solar), 1981 → endYear. */
export function powerUrl(lat: number, lon: number, endYear: number): string {
  return (
    'https://power.larc.nasa.gov/api/temporal/monthly/point' +
    `?parameters=${POWER_PARAMS.join(',')}&community=AG` +
    `&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=1981&end=${endYear}&format=JSON`
  )
}

/** NASA POWER daily point series - frost dates, hot days and dry spells. */
export function powerDailyUrl(lat: number, lon: number, endYear: number): string {
  return (
    'https://power.larc.nasa.gov/api/temporal/daily/point' +
    `?parameters=${POWER_DAILY_PARAMS.join(',')}&community=AG` +
    `&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=19810101&end=${endYear}1231&format=JSON`
  )
}

/** ISRIC SoilGrids 2.0 point query (250 m). */
export function soilUrl(lat: number, lon: number): string {
  const props = SOILGRIDS_PROPERTIES.map((p) => `property=${p}`).join('&')
  const depths = SOILGRIDS_DEPTHS.map((d) => `depth=${d}`).join('&')
  return `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&${props}&${depths}&value=mean`
}

/** Open-Meteo 16-day forecast (DWD ICON, NOAA GFS, ECMWF… blended) incl. FAO ET₀ and soil moisture. */
export function forecastUrl(lat: number, lon: number): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,wind_speed_10m_max' +
    '&hourly=soil_moisture_27_to_81cm&timezone=auto&forecast_days=16'
  )
}

/** AWS Terrain Tiles (terrarium encoding; SRTM and other DEMs). */
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

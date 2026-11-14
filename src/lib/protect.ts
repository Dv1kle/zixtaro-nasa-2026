// Names that must never be translated: the product itself, the data sets and the published methods. A machine
// translator happily turns "Rootline" into "Корневая линия" or "SoilGrids" into "Bodengitter"; here they are
// swapped for numbered tokens before translation and put back after. If a translator drops or mangles a token,
// the English original is kept rather than a sentence with a wrong or missing name.

export const PROTECTED = [
  'Zixtaro', 'NASA POWER', 'NASA', 'NEX-GDDP-CMIP6', 'CMIP6', 'MERRA-2', 'GWETROOT', 'CERES/SRB', 'CERES', 'SMAP', 'MODIS',
  'VIIRS', 'GIBS', 'GRACE-FO', 'GRACE', 'SoilGrids', 'ISRIC', 'Open-Meteo', 'FAO-56', 'FAO-33', 'FAO', 'IPCC', 'ICBM',
  'RothC', 'AquaCrop', 'FACE', 'SSP2-4.5', 'SSP5-8.5', 'SRTM', 'Esri', 'Street View', 'Penman-Monteith', 'Saxton & Rawls',
  'Mann-Kendall', 'Shapley', 'Sen’s', 'ET₀', 'ETc', 'NO₃', 'CO₂', 'USDA', 'Ky',
  'GAEZ', 'IIASA', 'CROPGRIDS', 'RUSLE', 'EPIC', 'Fryrear', 'Sobol', 'Saltelli', 'Jansen', 'Ishigami', 'Hargreaves', 'pyfao56',
  'AHDB', 'BBRO', 'PGRO', 'BSPP', 'Brier', 'Spearman', 'Monte Carlo', 'Deutsch', 'Håkansson', 'Burns', 'Preissel', 'Thorup-Kristensen',
]
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const RE = new RegExp(`(?<![\\p{L}\\d])(${[...PROTECTED].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![\\p{L}\\d])`, 'gu')

export function protect(text: string): { masked: string; restore: (out: string) => string | null } {
  const found: string[] = []
  const masked = text.replace(RE, (m) => `[${found.push(m) - 1}]`)
  return {
    masked,
    restore: (out) => {
      if (!found.length) return out
      let used = 0
      const back = out.replace(/\[\s*(\d+)\s*\]/g, (whole, i: string) => {
        const name = found[Number(i)]
        if (name === undefined) return whole
        used++
        return name
      })
      return used === found.length ? back : null
    },
  }
}

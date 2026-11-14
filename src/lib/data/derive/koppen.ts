// src/lib/data/derive/koppen.ts
// Köppen-Geiger class from 12 monthly normals: Peel et al. (2007) criteria, polar climates checked first (Kottek et
// al. 2006), with the 0 °C boundary between temperate and cold climates that Beck et al. (2018) use.

export function koppen(t: number[], p: number[], lat: number): string {
  const MAT = t.reduce((a, b) => a + b, 0) / 12
  const MAP = p.reduce((a, b) => a + b, 0)
  const Tcold = Math.min(...t)
  const Thot = Math.max(...t)
  const summer = lat >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2] // Apr-Sep north, Oct-Mar south
  const winter = [...Array(12).keys()].filter((i) => !summer.includes(i))
  const Ps = summer.map((i) => p[i])
  const Pw = winter.map((i) => p[i])
  const Psum = Ps.reduce((a, b) => a + b, 0)
  const Pwin = Pw.reduce((a, b) => a + b, 0)
  const Pth = Pwin >= 0.7 * MAP ? 2 * MAT : Psum >= 0.7 * MAP ? 2 * MAT + 28 : 2 * MAT + 14
  if (Thot < 10) return Thot > 0 ? 'ET' : 'EF'
  if (MAP < 10 * Pth) return (MAP < 5 * Pth ? 'BW' : 'BS') + (MAT >= 18 ? 'h' : 'k')
  if (Tcold >= 18) {
    const Pdry = Math.min(...p)
    return Pdry >= 60 ? 'Af' : Pdry >= 100 - MAP / 25 ? 'Am' : 'Aw'
  }
  const Psdry = Math.min(...Ps)
  const Pwdry = Math.min(...Pw)
  const Pswet = Math.max(...Ps)
  const Pwwet = Math.max(...Pw)
  const second = Psdry < 40 && Psdry < Pwwet / 3 ? 's' : Pwdry < Pswet / 10 ? 'w' : 'f'
  const warmMonths = t.filter((x) => x >= 10).length
  const third = Thot >= 22 ? 'a' : warmMonths >= 4 ? 'b' : Tcold < -38 ? 'd' : 'c'
  return (Tcold > 0 ? 'C' : 'D') + second + third
}

export const KOPPEN_LABEL: Record<string, string> = {
  Af: 'tropical rainforest', Am: 'tropical monsoon', Aw: 'tropical savanna',
  BW: 'desert', BS: 'steppe',
  Cs: 'Mediterranean', Cw: 'temperate, dry winter', Cf: 'temperate, no dry season',
  Ds: 'cold, dry summer', Dw: 'cold, dry winter', Df: 'cold, no dry season',
  ET: 'tundra', EF: 'ice cap',
}

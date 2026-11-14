const MINUS = '−'

export const signed = (x: number, digits = 1, unit = '') =>
  `${x > 0 ? '+' : x < 0 ? MINUS : '±'}${Math.abs(x).toFixed(digits)}${unit}`

export const pct = (x: number) => `${Math.round(x * 100)}%`

/** Money from a model: three significant figures, so estimates don't pose as accounting. */
export function euro(x: number): string {
  const a = Math.abs(x)
  const r = a >= 1000 ? Number(a.toPrecision(3)) : Math.round(a)
  return `${x < 0 ? MINUS : ''}€${r.toLocaleString('en-US')}`
}

export const thousands = (x: number) => Math.round(x).toLocaleString('en-US')

export function pValue(p: number): string {
  if (p < 0.001) return 'p < 0.001'
  if (p < 0.01) return `p = ${p.toFixed(3)}`
  return `p = ${p.toFixed(2)}`
}

export function coord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

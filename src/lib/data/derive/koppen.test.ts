// src/lib/data/derive/koppen.test.ts
import { describe, expect, it } from 'vitest'
import { koppen } from './koppen'

describe('Köppen-Geiger', () => {
  it('classes Berlin as Cfb', () => {
    expect(koppen([0.6, 1.4, 4.8, 9.4, 14.4, 17.5, 19.6, 19.2, 15.0, 10.0, 5.1, 1.8], [42, 33, 40, 37, 54, 69, 56, 58, 45, 37, 44, 55], 52.5)).toBe('Cfb')
  })
  it('classes Niamey as BSh (summer rain raises the threshold)', () => {
    expect(koppen([24.7, 27.6, 31.2, 33.9, 34.1, 31.6, 29.0, 27.5, 28.8, 30.9, 28.5, 25.4], [0, 0, 1, 5, 34, 69, 154, 188, 93, 15, 1, 0], 13.5)).toBe('BSh')
  })
  it('classes Singapore as Af', () => {
    expect(koppen(Array(12).fill(27.5), [234, 114, 176, 154, 171, 131, 158, 176, 170, 194, 256, 318], 1.3)).toBe('Af')
  })
  it('uses the southern summer for Buenos Aires (Cfa)', () => {
    expect(koppen([24.5, 23.5, 21.5, 17.8, 14.5, 11.5, 10.8, 12.5, 14.5, 17.5, 20.5, 23.2], [120, 117, 134, 127, 89, 61, 68, 70, 77, 124, 109, 101], -34.6)).toBe('Cfa')
  })
  it('classes Yakutsk as Dfd', () => {
    expect(koppen([-38.6, -33.8, -20.1, -4.8, 7.5, 16.4, 19.5, 15.2, 6.1, -7.8, -27.0, -37.6], [9, 8, 7, 10, 19, 32, 43, 39, 24, 17, 14, 10], 62)).toBe('Dfd')
  })
})

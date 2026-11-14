// src/lib/data/derive/humidity.test.ts
import { describe, expect, it } from 'vitest'
import { absoluteHumidity, deltaT, dewPoint, esat, humidityDeficit, vpd, vpdFromDew, wetBulb } from './humidity'

describe('humidity physics', () => {
  it('matches FAO-56 Annex 2 saturation vapour pressure', () => {
    expect(esat(20)).toBeCloseTo(2.338, 3)
    expect(esat(30)).toBeCloseTo(4.243, 3)
  })
  it('computes VPD from RH and from the dew point', () => {
    expect(vpd(25, 50)).toBeCloseTo(1.584, 3)
    expect(vpdFromDew(25, 25)).toBeCloseTo(0, 6)
    expect(vpd(25, 120)).toBe(0) // never negative
  })
  it('inverts the Magnus curve for the dew point', () => {
    expect(dewPoint(20, 50)).toBeCloseTo(9.27, 1)
    expect(dewPoint(15, 100)).toBeCloseTo(15, 5)
  })
  it('gives 17.3 g/m³ of vapour in saturated air at 20 °C', () => {
    expect(absoluteHumidity(20, 100)).toBeCloseTo(17.28, 1)
    expect(humidityDeficit(20, 50)).toBeCloseTo(8.64, 1)
  })
  it('reproduces Stull (2011): 20 °C and 50 % give a 13.7 °C wet bulb', () => {
    expect(wetBulb(20, 50)).toBeCloseTo(13.7, 1)
    expect(deltaT(20, 50)).toBeCloseTo(6.3, 1)
  })
})

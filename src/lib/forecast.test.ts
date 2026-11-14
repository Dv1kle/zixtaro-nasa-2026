import { describe, expect, it } from 'vitest'
import { drillCheck, type ForecastDay } from './forecast'

const day = (date: string, o: Partial<ForecastDay> = {}): ForecastDay => ({ date, code: 0, tmax: 14, tmin: 4, rain: 0, rainProb: 10, et0: 1, windMax: 10, rootMoisture: null, ...o })

describe('drill check', () => {
  it('counts the workable days inside the sowing month and finds the longest run', () => {
    const days = [day('2026-09-29'), day('2026-09-30'), day('2026-10-01'), day('2026-10-02', { rain: 6 }), day('2026-10-03'), day('2026-10-04'), day('2026-10-05')]
    const c = drillCheck(days, 10)
    expect(c.inWindow).toBe(5)
    expect(c.workable).toBe(4)
    expect(c.run).toEqual([4, 6]) // 3-5 Oct beats 1 Oct alone; September is outside the window
  })
  it('holds a spring crop back on cold days and frost-tender crops on frost nights', () => {
    const days = [day('2027-04-20', { tmax: 9, tmin: 1 }), day('2027-04-21', { tmax: 18, tmin: 6 }), day('2027-04-22', { tmax: 16, tmin: -1 })]
    expect(drillCheck(days, 4, 10).good).toEqual([false, true, false]) // daily means 5 and 7.5 °C: too cold for 10 °C
    expect(drillCheck(days, 4, undefined, true).good).toEqual([true, true, false]) // -1 °C night: frost
    expect(drillCheck(days, 4).good).toEqual([true, true, true])
  })
  it('says how far off a window is that none of the days reaches, across the new year', () => {
    expect(drillCheck([day('2026-10-10'), day('2026-10-25')], 4).opensIn).toBe(173)
    expect(drillCheck([day('2026-10-10')], 11).opensIn).toBe(22)
    expect(drillCheck([day('2026-10-10')], 10).opensIn).toBeNull()
  })
})

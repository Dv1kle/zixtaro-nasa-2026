import { describe, expect, it } from 'vitest'
import { lookup, normalize, type Dict } from './dictionary'

describe('months in translated sentences', () => {
  const ru: Dict = new Map([
    ['Sown in {m0}.', 'Сеют в {m0}.'],
    ['Frost ends on {0} {m0}.', 'Заморозки заканчиваются {0} {m0}.'],
    ['Harvest: {m0}', 'Уборка: {m0}'],
    ['Wait until {m0}.', 'Подождите до {m0}.'],
  ])
  const uk: Dict = new Map([['Sown in {m0}.', 'Сіють у {m0}.']])
  it('declines a Russian or Ukrainian month after a preposition or a day, and leaves it alone elsewhere', () => {
    expect(lookup(ru, 'ru', 'Sown in October.')).toBe('Сеют в октябре.')
    expect(lookup(ru, 'ru', 'Frost ends on 21 April.')).toBe('Заморозки заканчиваются 21 апреля.')
    expect(lookup(ru, 'ru', 'Harvest: July')).toBe('Уборка: июль')
    expect(lookup(ru, 'ru', 'Wait until March.')).toBe('Подождите до марта.')
    expect(lookup(uk, 'uk', 'Sown in October.')).toBe('Сіють у жовтні.')
  })
  it('reads en-GB’s “Sept” as September', () => {
    expect(normalize('frost-free 150 days (12 Apr → 9 Sept)').key).toBe('frost-free {0} days ({1} {m0} → {2} {m1})')
    expect(normalize('frost-free 150 days (12 Apr → 9 Sept)').months[1]).toEqual({ i: 8, long: false })
  })
})

describe('crop names in translated sentences', () => {
  it('templates a crop in prose but not one hyphen-glued into a name', () => {
    expect(normalize('Maize after sorghum').key).toBe('{C0} after {c1}')
    expect(normalize('CERES-Maize: A Simulation Model of Maize Growth').key).toBe('CERES-Maize: A Simulation Model of {C0} Growth')
    expect(normalize('Research on Wheat-Sorghum-Fallow in Western Kansas').key).toBe('Research on Wheat-Sorghum-Fallow in Western Kansas')
  })
  it('templates the forms a field grows as crops (spring wheat, the autumn-sown type)', () => {
    expect(normalize('Autumn-sown wheat: windows from six weeks earlier to six weeks later').key).toBe('{C0}: windows from six weeks earlier to six weeks later')
    expect(normalize('scored 67 / 33 between spring rapeseed and it').key).toBe('scored {0} / {1} between {c0} and it')
  })
})

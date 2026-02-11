import { describe, expect, it } from 'vitest'
import { ENEMIES } from '../src/entities/enemies'
import { SPELLS } from '../src/content/spells'
import { ITEMS } from '../src/content/items'
import { MAP_KEYS, isMapKey } from '../src/game/types'

describe('Content expansion', () => {
  it('includes five new enemy archetypes and one boss', () => {
    const kinds = Object.keys(ENEMIES)
    expect(kinds).toEqual(expect.arrayContaining(['spider', 'skeleton', 'wisp', 'imp', 'golem', 'bone_lord']))
    expect(ENEMIES.bone_lord.hp).toBeGreaterThanOrEqual(20)
  })

  it('includes three additional spells and matching gear grants', () => {
    expect(SPELLS).toHaveProperty('stormlance')
    expect(SPELLS).toHaveProperty('venomshot')
    expect(SPELLS).toHaveProperty('arcaneorb')

    const storm = ITEMS.helmet_storm.equip
    const venom = ITEMS.chest_venom.equip
    const rift = ITEMS.boots_rift.equip

    expect(storm?.slot).toBe('helmet')
    expect(storm && 'spells' in storm ? storm.spells?.[0]?.id : null).toBe('stormlance')
    expect(venom?.slot).toBe('chest')
    expect(venom && 'spells' in venom ? venom.spells?.[0]?.id : null).toBe('venomshot')
    expect(rift?.slot).toBe('boots')
    expect(rift && 'spells' in rift ? rift.spells?.[0]?.id : null).toBe('arcaneorb')
  })

  it('registers new world maps as valid map keys', () => {
    expect(MAP_KEYS).toEqual(expect.arrayContaining(['marsh', 'ruins', 'citadel']))
    expect(isMapKey('marsh')).toBe(true)
    expect(isMapKey('ruins')).toBe(true)
    expect(isMapKey('citadel')).toBe(true)
    expect(isMapKey('not_a_map')).toBe(false)
  })
})

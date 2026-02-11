import { describe, expect, it } from 'vitest'
import { resolveSpellLevel, SPELLS, spellSpeedPxPerSec } from '../src/content/spells'
import { normalizeCardinalDirection } from '../src/systems/spell/castDirection'

describe('SpellSystem helpers', () => {
  it('normalizes cast direction to a single cardinal axis', () => {
    expect(normalizeCardinalDirection({ x: 5, y: 1 })).toEqual({ x: 1, y: 0 })
    expect(normalizeCardinalDirection({ x: -3, y: 1 })).toEqual({ x: -1, y: 0 })
    expect(normalizeCardinalDirection({ x: 0.1, y: -4 })).toEqual({ x: 0, y: -1 })
    expect(normalizeCardinalDirection({ x: 0, y: 0 })).toBeNull()
    expect(normalizeCardinalDirection(null)).toBeNull()
  })

  it('resolves spell levels to the highest available level at or below requested', () => {
    const ice = SPELLS.iceblast
    expect(resolveSpellLevel(ice, 1)).toEqual({ level: 1, cfg: ice.levels[1] })
    expect(resolveSpellLevel(ice, 2)).toEqual({ level: 2, cfg: ice.levels[2] })
    expect(resolveSpellLevel(ice, 99)).toEqual({ level: 2, cfg: ice.levels[2] })
  })

  it('converts tiles/sec spell speed into px/sec', () => {
    expect(spellSpeedPxPerSec(0)).toBe(0)
    expect(spellSpeedPxPerSec(15)).toBe(240)
    expect(spellSpeedPxPerSec(-2)).toBe(0)
  })
})

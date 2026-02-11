import { describe, expect, it } from 'vitest'
import { InventorySystem } from '../src/systems/InventorySystem'

function firstBagIndex(inv: InventorySystem, itemId: string) {
  return inv.getBag().findIndex((s) => s?.id === itemId)
}

function firstEmptyBag(inv: InventorySystem) {
  return inv.getBag().findIndex((s) => !s)
}

describe('InventorySystem', () => {
  it('starts with default equipment and starter stash', () => {
    const inv = new InventorySystem()
    expect(inv.getEquipment('weapon')).toBe('sword')
    expect(inv.getEquipment('shield')).toBe('shield_basic')
    expect(firstBagIndex(inv, 'greatsword')).toBeGreaterThanOrEqual(0)
    expect(firstBagIndex(inv, 'helmet_pyro')).toBeGreaterThanOrEqual(0)
  })

  it('enforces 2H weapon normalization by unequipping shield to bag', () => {
    const inv = new InventorySystem()
    const gs = firstBagIndex(inv, 'greatsword')
    expect(gs).toBeGreaterThanOrEqual(0)

    const moved = inv.moveItem({ type: 'bag', index: gs }, { type: 'equip', slot: 'weapon' })
    expect(moved.ok).toBe(true)
    expect(inv.getEquipment('weapon')).toBe('greatsword')
    expect(inv.getEquipment('shield')).toBeNull()
    expect(firstBagIndex(inv, 'shield_basic')).toBeGreaterThanOrEqual(0)
  })

  it('blocks equipping a shield while a 2H weapon is equipped', () => {
    const inv = new InventorySystem()
    const gs = firstBagIndex(inv, 'greatsword')
    expect(gs).toBeGreaterThanOrEqual(0)
    expect(inv.moveItem({ type: 'bag', index: gs }, { type: 'equip', slot: 'weapon' }).ok).toBe(true)

    const shieldIdx = firstBagIndex(inv, 'shield_basic')
    expect(shieldIdx).toBeGreaterThanOrEqual(0)

    const equipShield = inv.moveItem({ type: 'bag', index: shieldIdx }, { type: 'equip', slot: 'shield' })
    expect(equipShield.ok).toBe(false)
    expect(equipShield.error).toBe('2h-blocks-shield')
  })

  it('clears selected spell and hotkeys when granting gear is removed', () => {
    const inv = new InventorySystem()

    const pyroIdx = firstBagIndex(inv, 'helmet_pyro')
    expect(pyroIdx).toBeGreaterThanOrEqual(0)
    expect(inv.moveItem({ type: 'bag', index: pyroIdx }, { type: 'equip', slot: 'helmet' }).ok).toBe(true)

    expect(inv.assignSpellHotkey(0, 'fireball')).toBe(true)
    expect(inv.selectSpellHotkey(0)).toBe(true)
    expect(inv.getSelectedSpell()).toEqual({ id: 'fireball', level: 1 })

    const empty = firstEmptyBag(inv)
    expect(empty).toBeGreaterThanOrEqual(0)
    expect(inv.moveItem({ type: 'equip', slot: 'helmet' }, { type: 'bag', index: empty }).ok).toBe(true)

    expect(inv.getSelectedSpell()).toBeNull()
    expect(inv.getSpellHotkeys()[0]).toBeNull()
  })
})

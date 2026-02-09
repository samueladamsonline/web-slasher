import type { WeaponId } from './weapons'
import type { SpellGrant } from './spells'

export type EquipmentSlot = 'helmet' | 'chest' | 'gloves' | 'boots' | 'weapon' | 'shield'

export type ItemId =
  | 'coin'
  | 'key'
  | 'heart'
  // Basic starting gear.
  | 'helmet_basic'
  | 'helmet_pyro'
  | 'chest_basic'
  | 'gloves_basic'
  | 'boots_basic'
  | 'shield_basic'
  // Early upgraded gear (starter stash).
  | 'boots_swift'
  | 'gloves_quick'
  | 'chest_hearty'
  // Weapons (also used by combat).
  | WeaponId

export type ItemKind = 'currency' | 'key' | 'pickup' | 'equipment'

export type EquipmentInfo =
  | { slot: 'weapon'; weaponId: WeaponId }
  | {
      slot: Exclude<EquipmentSlot, 'weapon'>
      armor: number
      // Percent modifiers (0..). These are applied multiplicatively in PlayerStats.
      moveSpeedPct?: number
      attackSpeedPct?: number
      // Flat additive hearts to max HP.
      maxHpBonus?: number
      // Helmets can grant a spell list (id + level).
      spells?: SpellGrant[]
    }

export type ItemDef = {
  id: ItemId
  name: string
  kind: ItemKind
  texture: string
  stackable: boolean
  equip?: EquipmentInfo
}

export const ITEMS: Record<ItemId, ItemDef> = {
  coin: { id: 'coin', name: 'Coin', kind: 'currency', texture: 'item-coin', stackable: true },
  key: { id: 'key', name: 'Key', kind: 'key', texture: 'item-key', stackable: true },
  heart: { id: 'heart', name: 'Heart', kind: 'pickup', texture: 'item-heart', stackable: false },

  // Starter gear (simple placeholder stats for now).
  helmet_basic: {
    id: 'helmet_basic',
    name: 'Leather Cap',
    kind: 'equipment',
    texture: 'item-helmet',
    stackable: false,
    equip: { slot: 'helmet', armor: 1 },
  },
  helmet_pyro: {
    id: 'helmet_pyro',
    name: 'Ember Hood',
    kind: 'equipment',
    texture: 'item-helmet-fire',
    stackable: false,
    equip: { slot: 'helmet', armor: 1, spells: [{ id: 'fireball', level: 1 }] },
  },
  chest_basic: { id: 'chest_basic', name: 'Leather Tunic', kind: 'equipment', texture: 'item-chest', stackable: false, equip: { slot: 'chest', armor: 2, maxHpBonus: 0 } },
  gloves_basic: {
    id: 'gloves_basic',
    name: 'Cloth Gloves',
    kind: 'equipment',
    texture: 'item-gloves',
    stackable: false,
    equip: { slot: 'gloves', armor: 1, attackSpeedPct: 0 },
  },
  boots_basic: {
    id: 'boots_basic',
    name: 'Leather Boots',
    kind: 'equipment',
    texture: 'item-boots',
    stackable: false,
    equip: { slot: 'boots', armor: 1, moveSpeedPct: 0 },
  },
  shield_basic: { id: 'shield_basic', name: 'Wooden Shield', kind: 'equipment', texture: 'item-shield', stackable: false, equip: { slot: 'shield', armor: 1 } },

  // Stash gear (used for testing early stat modifiers).
  boots_swift: {
    id: 'boots_swift',
    name: 'Swift Boots',
    kind: 'equipment',
    texture: 'item-boots-swift',
    stackable: false,
    equip: { slot: 'boots', armor: 1, moveSpeedPct: 10 },
  },
  gloves_quick: {
    id: 'gloves_quick',
    name: 'Quick Gloves',
    kind: 'equipment',
    texture: 'item-gloves-quick',
    stackable: false,
    equip: { slot: 'gloves', armor: 1, attackSpeedPct: 25 },
  },
  chest_hearty: {
    id: 'chest_hearty',
    name: 'Hearty Tunic',
    kind: 'equipment',
    texture: 'item-chest-hearty',
    stackable: false,
    equip: { slot: 'chest', armor: 2, maxHpBonus: 2 },
  },

  // Weapons as equippable items.
  sword: { id: 'sword', name: 'Short Sword', kind: 'equipment', texture: 'item-sword', stackable: false, equip: { slot: 'weapon', weaponId: 'sword' } },
  greatsword: { id: 'greatsword', name: 'Long Sword', kind: 'equipment', texture: 'item-greatsword', stackable: false, equip: { slot: 'weapon', weaponId: 'greatsword' } },
}

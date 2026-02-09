import type { WeaponId } from './weapons'

export type EquipmentSlot = 'helmet' | 'chest' | 'gloves' | 'boots' | 'weapon' | 'shield'

export type ItemId =
  | 'coin'
  | 'key'
  | 'heart'
  // Basic starting gear.
  | 'helmet_basic'
  | 'chest_basic'
  | 'gloves_basic'
  | 'boots_basic'
  | 'shield_basic'
  // Weapons (also used by combat).
  | WeaponId

export type ItemKind = 'currency' | 'key' | 'pickup' | 'equipment'

export type EquipmentInfo =
  | { slot: 'weapon'; weaponId: WeaponId }
  | { slot: Exclude<EquipmentSlot, 'weapon'>; armor: number }

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
  helmet_basic: { id: 'helmet_basic', name: 'Leather Cap', kind: 'equipment', texture: 'item-helmet', stackable: false, equip: { slot: 'helmet', armor: 1 } },
  chest_basic: { id: 'chest_basic', name: 'Leather Tunic', kind: 'equipment', texture: 'item-chest', stackable: false, equip: { slot: 'chest', armor: 2 } },
  gloves_basic: { id: 'gloves_basic', name: 'Cloth Gloves', kind: 'equipment', texture: 'item-gloves', stackable: false, equip: { slot: 'gloves', armor: 1 } },
  boots_basic: { id: 'boots_basic', name: 'Leather Boots', kind: 'equipment', texture: 'item-boots', stackable: false, equip: { slot: 'boots', armor: 1 } },
  shield_basic: { id: 'shield_basic', name: 'Wooden Shield', kind: 'equipment', texture: 'item-shield', stackable: false, equip: { slot: 'shield', armor: 1 } },

  // Weapons as equippable items.
  sword: { id: 'sword', name: 'Short Sword', kind: 'equipment', texture: 'item-sword', stackable: false, equip: { slot: 'weapon', weaponId: 'sword' } },
  greatsword: { id: 'greatsword', name: 'Long Sword', kind: 'equipment', texture: 'item-greatsword', stackable: false, equip: { slot: 'weapon', weaponId: 'greatsword' } },
}


import { ITEMS, type EquipmentSlot, type ItemId } from '../content/items'
import { WEAPONS, type WeaponDef, type WeaponHands, type WeaponId } from '../content/weapons'

export type InventoryItemStack = { id: ItemId; qty: number }

export type EquipmentState = Record<EquipmentSlot, ItemId | null>

export type SlotRef = { type: 'equip'; slot: EquipmentSlot } | { type: 'bag'; index: number }

// Inventory snapshot is intentionally permissive to support loading older saves.
export type InventorySnapshot = {
  coins?: number
  keys?: number

  equipment?: Partial<Record<EquipmentSlot, ItemId | null>>
  bag?: (InventoryItemStack | null)[]

  // Legacy fields (pre equipment/backpack refactor).
  weapon?: WeaponId | null
  ownedWeapons?: WeaponId[]
}

// Stash size (simple 1x1 items for now).
const BAG_COLS = 5
const BAG_ROWS = 5
const BAG_SIZE = BAG_COLS * BAG_ROWS

function clampInt(v: unknown, def = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def
}

function isItemId(v: unknown): v is ItemId {
  return typeof v === 'string' && v in ITEMS
}

function isEquipmentSlot(v: unknown): v is EquipmentSlot {
  return v === 'helmet' || v === 'chest' || v === 'gloves' || v === 'boots' || v === 'weapon' || v === 'shield'
}

function cloneEquipment(e: EquipmentState) {
  return { helmet: e.helmet, chest: e.chest, gloves: e.gloves, boots: e.boots, weapon: e.weapon, shield: e.shield } satisfies EquipmentState
}

function cloneBag(bag: (InventoryItemStack | null)[]) {
  return bag.map((s) => (s ? { id: s.id, qty: s.qty } : null))
}

function getWeaponHands(itemId: ItemId | null): WeaponHands | 0 {
  if (!itemId) return 0
  const def = ITEMS[itemId]
  if (def.kind !== 'equipment') return 0
  if (def.equip?.slot !== 'weapon') return 0
  const wid = def.equip.weaponId
  const wd = WEAPONS[wid]
  return wd?.hands ?? 0
}

export class InventorySystem {
  private coins = 0
  private keys = 0

  private equipment: EquipmentState = {
    helmet: 'helmet_basic',
    chest: 'chest_basic',
    gloves: 'gloves_basic',
    boots: 'boots_basic',
    weapon: 'sword',
    shield: 'shield_basic',
  }

  private bag: (InventoryItemStack | null)[] = Array.from({ length: BAG_SIZE }, () => null)

  private onChanged?: () => void

  constructor(opts?: { onChanged?: () => void }) {
    this.onChanged = opts?.onChanged
    // Default loadout: give the player a 2H sword to experiment with.
    this.bag[0] = { id: 'greatsword', qty: 1 }
  }

  setOnChanged(cb: (() => void) | undefined) {
    this.onChanged = cb
  }

  getBagCols() {
    return BAG_COLS
  }

  getBagRows() {
    return BAG_ROWS
  }

  getBagSize() {
    return BAG_SIZE
  }

  reset() {
    this.coins = 0
    this.keys = 0

    this.equipment = {
      helmet: 'helmet_basic',
      chest: 'chest_basic',
      gloves: 'gloves_basic',
      boots: 'boots_basic',
      weapon: 'sword',
      shield: 'shield_basic',
    }

    this.bag = Array.from({ length: BAG_SIZE }, () => null)
    this.bag[0] = { id: 'greatsword', qty: 1 }

    this.onChanged?.()
  }

  load(snapshot: InventorySnapshot | null | undefined) {
    const coins = Math.max(0, clampInt(snapshot?.coins, 0))
    const keys = Math.max(0, clampInt(snapshot?.keys, 0))

    // Start from default equipment, then apply save overrides.
    let equipment: EquipmentState = {
      helmet: 'helmet_basic',
      chest: 'chest_basic',
      gloves: 'gloves_basic',
      boots: 'boots_basic',
      weapon: 'sword',
      shield: 'shield_basic',
    }

    // Bag defaults to an empty grid.
    let bag: (InventoryItemStack | null)[] = Array.from({ length: BAG_SIZE }, () => null)

    const eqRaw = snapshot?.equipment
    if (eqRaw && typeof eqRaw === 'object') {
      for (const [k, v] of Object.entries(eqRaw as any)) {
        if (!isEquipmentSlot(k)) continue
        if (v === null) {
          equipment[k] = null
          continue
        }
        if (!isItemId(v)) continue
        const def = ITEMS[v]
        if (def.kind !== 'equipment') continue
        if (!def.equip) continue
        if (def.equip.slot !== k) continue
        equipment[k] = v
      }
    } else {
      // Legacy migration: weapon + ownedWeapons.
      const weaponRaw = snapshot?.weapon
      const weapon = typeof weaponRaw === 'string' && weaponRaw in WEAPONS ? (weaponRaw as WeaponId) : 'sword'
      equipment.weapon = weapon
      // If the legacy save had a 2H weapon, don't auto-add a shield.
      if (WEAPONS[weapon]?.hands === 2) equipment.shield = null

      const ownedRaw = Array.isArray(snapshot?.ownedWeapons) ? snapshot!.ownedWeapons : []
      const owned = new Set<WeaponId>()
      for (const w of ownedRaw) if (typeof w === 'string' && w in WEAPONS) owned.add(w as WeaponId)
      owned.add(weapon)

      // Put any non-equipped owned weapons into the bag.
      let bi = 0
      for (const w of owned) {
        if (w === weapon) continue
        if (bi >= bag.length) break
        bag[bi++] = { id: w, qty: 1 }
      }
    }

    const bagRaw = snapshot?.bag
    if (Array.isArray(bagRaw)) {
      // Older saves may have a bigger stash. We compact items into the new grid in a stable order
      // (scan old slots top-left to bottom-right). Stash items do not stack; qty>1 spills into
      // additional slots.
      const flat: ItemId[] = []
      for (const v of bagRaw as any[]) {
        if (!v) continue
        if (!isItemId(v.id)) continue
        const qty = Math.max(1, clampInt(v.qty, 1))
        for (let k = 0; k < qty; k++) {
          flat.push(v.id)
          // No need to keep collecting once we're beyond what can fit.
          if (flat.length >= BAG_SIZE * 3) break
        }
        if (flat.length >= BAG_SIZE * 3) break
      }

      const next: (InventoryItemStack | null)[] = Array.from({ length: BAG_SIZE }, () => null)
      for (let i = 0; i < Math.min(flat.length, BAG_SIZE); i++) next[i] = { id: flat[i], qty: 1 }
      bag = next
    }

    const normalized = InventorySystem.normalize({ equipment, bag })
    if (normalized.ok) {
      equipment = normalized.equipment
      bag = normalized.bag
    }

    // Migration/starter-kit safety: ensure the player owns at least one shield.
    // This keeps older saves compatible with the equipment model.
    const ownsShield =
      !!equipment.shield ||
      bag.some((s) => {
        if (!s) return false
        const def = ITEMS[s.id]
        return def.kind === 'equipment' && def.equip?.slot === 'shield'
      })
    if (!ownsShield) {
      const empty = bag.findIndex((s) => !s)
      if (empty >= 0) bag[empty] = { id: 'shield_basic', qty: 1 }
      else {
        // If the bag is full, prefer equipping it (as long as a 2H weapon isn't forcing the slot empty).
        const hands = getWeaponHands(equipment.weapon)
        if (hands !== 2 && !equipment.shield) equipment.shield = 'shield_basic'
        else bag[bag.length - 1] = { id: 'shield_basic', qty: 1 }
      }
    }

    this.coins = coins
    this.keys = keys
    this.equipment = equipment
    this.bag = bag
    this.onChanged?.()
  }

  snapshot(): Required<Pick<InventorySnapshot, 'coins' | 'keys' | 'equipment' | 'bag'>> {
    return {
      coins: this.coins,
      keys: this.keys,
      equipment: { ...this.equipment },
      bag: cloneBag(this.bag),
    }
  }

  getCoins() {
    return this.coins
  }

  getKeys() {
    return this.keys
  }

  addItem(id: ItemId, amount = 1) {
    const n = Math.max(0, Math.floor(amount))
    if (n <= 0) return

    const beforeCoins = this.coins
    const beforeKeys = this.keys

    if (id === 'coin') this.coins += n
    if (id === 'key') this.keys += n

    if (this.coins !== beforeCoins || this.keys !== beforeKeys) this.onChanged?.()

    // Hearts are immediate-use pickups handled by PickupSystem.
  }

  tryConsumeKey(amount = 1) {
    const n = Math.max(1, Math.floor(amount))
    if (this.keys < n) return false
    this.keys -= n
    this.onChanged?.()
    return true
  }

  getEquipment(slot: EquipmentSlot) {
    return this.equipment[slot]
  }

  getEquipmentState(): EquipmentState {
    return cloneEquipment(this.equipment)
  }

  getBagItem(index: number): InventoryItemStack | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.bag.length) return null
    const s = this.bag[index]
    return s ? { id: s.id, qty: s.qty } : null
  }

  getBag(): (InventoryItemStack | null)[] {
    return cloneBag(this.bag)
  }

  getEquippedWeaponId(): WeaponId | null {
    const id = this.equipment.weapon
    if (!id) return null
    const def = ITEMS[id]
    if (def.kind !== 'equipment') return null
    if (def.equip?.slot !== 'weapon') return null
    return def.equip.weaponId
  }

  getWeaponDef(): WeaponDef | null {
    const wid = this.getEquippedWeaponId()
    return wid ? WEAPONS[wid] : null
  }

  getAttackDamage() {
    const weapon = this.getWeaponDef()
    return weapon ? weapon.damage : 0
  }

  equipWeapon(wid: WeaponId) {
    // If already equipped, nothing to do.
    const current = this.getEquippedWeaponId()
    if (current === wid) return true

    // Find the item in the bag; weapons are represented as items with the same ids.
    const targetItemId = wid as unknown as ItemId
    const idx = this.bag.findIndex((s) => s?.id === targetItemId)
    if (idx < 0) return false

    const res = this.moveItem({ type: 'bag', index: idx }, { type: 'equip', slot: 'weapon' })
    return res.ok
  }

  tryAddToBag(itemId: ItemId, amount = 1) {
    const n = Math.max(0, Math.floor(amount))
    if (n <= 0) return true

    const nextBag = cloneBag(this.bag)

    // Backpack items do not stack. Each unit consumes one slot.
    for (let k = 0; k < n; k++) {
      const empty = nextBag.findIndex((s) => !s)
      if (empty < 0) return false
      nextBag[empty] = { id: itemId, qty: 1 }
    }
    this.bag = nextBag
    this.onChanged?.()
    return true
  }

  moveItem(from: SlotRef, to: SlotRef): { ok: boolean; error?: string } {
    const a = this.getSlotStack(from)
    if (!a) return { ok: false, error: 'empty' }
    const b = this.getSlotStack(to)

    if (from.type === 'equip' && to.type === 'equip') {
      // Swapping between different equipment slots is confusing and can easily be invalid.
      // Force the user to drag through the bag for clarity.
      if (from.slot !== to.slot) return { ok: false, error: 'equip-swap' }
      return { ok: true }
    }

    // Validate the two-way swap.
    const tmpEquip = cloneEquipment(this.equipment)
    const tmpBag = cloneBag(this.bag)

    const canPlaceA = InventorySystem.canPlace({ equipment: tmpEquip, bag: tmpBag }, to, a)
    if (!canPlaceA.ok) return canPlaceA
    if (b) {
      const canPlaceB = InventorySystem.canPlace({ equipment: tmpEquip, bag: tmpBag }, from, b)
      if (!canPlaceB.ok) return canPlaceB
    }

    InventorySystem.setSlotStack({ equipment: tmpEquip, bag: tmpBag }, from, b)
    InventorySystem.setSlotStack({ equipment: tmpEquip, bag: tmpBag }, to, a)

    const normalized = InventorySystem.normalize({ equipment: tmpEquip, bag: tmpBag })
    if (!normalized.ok) return { ok: false, error: normalized.error }

    this.equipment = normalized.equipment
    this.bag = normalized.bag
    this.onChanged?.()
    return { ok: true }
  }

  private getSlotStack(ref: SlotRef): InventoryItemStack | null {
    if (ref.type === 'bag') {
      return this.getBagItem(ref.index)
    }
    const id = this.getEquipment(ref.slot)
    return id ? { id, qty: 1 } : null
  }

  private static setSlotStack(state: { equipment: EquipmentState; bag: (InventoryItemStack | null)[] }, ref: SlotRef, stack: InventoryItemStack | null) {
    if (ref.type === 'bag') {
      if (ref.index < 0 || ref.index >= state.bag.length) return
      state.bag[ref.index] = stack ? { id: stack.id, qty: stack.qty } : null
      return
    }
    state.equipment[ref.slot] = stack ? stack.id : null
  }

  private static canPlace(
    state: { equipment: EquipmentState; bag: (InventoryItemStack | null)[] },
    dest: SlotRef,
    stack: InventoryItemStack,
  ): { ok: boolean; error?: string } {
    if (dest.type === 'bag') {
      if (!Number.isInteger(dest.index) || dest.index < 0 || dest.index >= state.bag.length) return { ok: false, error: 'bad-slot' }
      if (stack.qty !== 1) return { ok: false, error: 'no-stacks' }
      return { ok: true }
    }

    if (stack.qty !== 1) return { ok: false, error: 'bad-equip-stack' }
    const def = ITEMS[stack.id]
    if (def.kind !== 'equipment' || !def.equip) return { ok: false, error: 'not-equipment' }
    if (def.equip.slot !== dest.slot) return { ok: false, error: 'wrong-slot' }

    // If trying to equip a shield while a 2H weapon is equipped, block it.
    if (dest.slot === 'shield') {
      const hands = getWeaponHands(state.equipment.weapon)
      if (hands === 2) return { ok: false, error: '2h-blocks-shield' }
    }

    return { ok: true }
  }

  private static normalize(state: { equipment: EquipmentState; bag: (InventoryItemStack | null)[] }): { ok: true; equipment: EquipmentState; bag: (InventoryItemStack | null)[] } | { ok: false; error: string } {
    const equipment = cloneEquipment(state.equipment)
    const bag = cloneBag(state.bag)

    // Enforce: 2H weapon => no shield equipped.
    const hands = getWeaponHands(equipment.weapon)
    if (hands === 2 && equipment.shield) {
      const empty = bag.findIndex((s) => !s)
      if (empty < 0) return { ok: false, error: 'no-bag-space-for-shield' }
      bag[empty] = { id: equipment.shield, qty: 1 }
      equipment.shield = null
    }

    return { ok: true, equipment, bag }
  }
}

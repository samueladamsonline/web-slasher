import { ITEMS, type EquipmentSlot, type ItemId } from '../content/items'
import { SPELLS, type SpellGrant, type SpellId } from '../content/spells'
import { WEAPONS, type WeaponDef, type WeaponHands, type WeaponId } from '../content/weapons'

export type InventoryItemStack = { id: ItemId; qty: number }

export type EquipmentState = Record<EquipmentSlot, ItemId | null>

export type SlotRef = { type: 'equip'; slot: EquipmentSlot } | { type: 'bag'; index: number }

export type PlayerStats = {
  moveSpeedPct: number
  moveSpeedMul: number
  attackSpeedPct: number
  attackSpeedMul: number
  maxHpBonus: number
  spells: SpellGrant[]
  selectedSpell: SpellGrant | null
  weapon: WeaponDef | null
  attackDamage: number
}

// Inventory snapshot is intentionally permissive to support loading older saves.
export type InventorySnapshot = {
  coins?: number
  keys?: number

  equipment?: Partial<Record<EquipmentSlot, ItemId | null>>
  bag?: (InventoryItemStack | null)[]
  selectedSpell?: SpellGrant | null
  spellHotkeys?: (SpellId | null)[]

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

function sameSpellGrant(a: SpellGrant | null, b: SpellGrant | null) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.id === b.id && a.level === b.level
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

  private selectedSpell: SpellGrant | null = null
  private spellHotkeys: (SpellId | null)[] = [null, null, null, null, null]

  private onChanged?: () => void

  constructor(opts?: { onChanged?: () => void }) {
    this.onChanged = opts?.onChanged
    // Default loadout: give the player some gear to experiment with.
    this.bag[0] = { id: 'greatsword', qty: 1 }
    this.bag[1] = { id: 'boots_swift', qty: 1 }
    this.bag[2] = { id: 'gloves_quick', qty: 1 }
    this.bag[3] = { id: 'chest_hearty', qty: 1 }
    this.bag[4] = { id: 'helmet_pyro', qty: 1 }
    this.bag[5] = { id: 'gloves_frost', qty: 1 }

    // Starter helmet grants no spells, so selection starts empty.
    this.ensureSelectedSpellValid()
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
    this.bag[1] = { id: 'boots_swift', qty: 1 }
    this.bag[2] = { id: 'gloves_quick', qty: 1 }
    this.bag[3] = { id: 'chest_hearty', qty: 1 }
    this.bag[4] = { id: 'helmet_pyro', qty: 1 }
    this.bag[5] = { id: 'gloves_frost', qty: 1 }

    this.selectedSpell = null
    this.spellHotkeys = [null, null, null, null, null]
    this.ensureSelectedSpellValid()
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

    // Selected spell is optional; validate it after computing the spellbook from equipment.
    let selectedSpell: SpellGrant | null = null
    const selRaw = (snapshot as any)?.selectedSpell
    if (selRaw && typeof selRaw === 'object') {
      const id = (selRaw as any).id
      const levelRaw = (selRaw as any).level
      const level = typeof levelRaw === 'number' && Number.isFinite(levelRaw) ? Math.max(1, Math.floor(levelRaw)) : 1
      if (typeof id === 'string' && (id as any) in SPELLS) selectedSpell = { id: id as SpellId, level }
    }

    let spellHotkeys: (SpellId | null)[] = [null, null, null, null, null]
    const hkRaw = (snapshot as any)?.spellHotkeys
    if (Array.isArray(hkRaw)) {
      const next: (SpellId | null)[] = [null, null, null, null, null]
      for (let i = 0; i < Math.min(5, hkRaw.length); i++) {
        const v = hkRaw[i]
        if (v === null) {
          next[i] = null
          continue
        }
        if (typeof v === 'string' && (v as any) in SPELLS) next[i] = v as SpellId
      }
      spellHotkeys = next
    }

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
    this.selectedSpell = selectedSpell
    this.spellHotkeys = spellHotkeys
    this.ensureSelectedSpellValid()
    this.onChanged?.()
  }

  snapshot(): InventorySnapshot {
    return {
      coins: this.coins,
      keys: this.keys,
      equipment: { ...this.equipment },
      bag: cloneBag(this.bag),
      selectedSpell: this.selectedSpell ? { id: this.selectedSpell.id, level: this.selectedSpell.level } : null,
      spellHotkeys: this.spellHotkeys.slice(0, 5),
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

  getSelectedSpell(): SpellGrant | null {
    return this.selectedSpell ? { id: this.selectedSpell.id, level: this.selectedSpell.level } : null
  }

  getSpellHotkeys(): (SpellId | null)[] {
    return this.spellHotkeys.slice(0, 5)
  }

  assignSpellHotkey(slotIndex: number, spellId: SpellId) {
    const idx = Math.max(0, Math.min(4, Math.floor(slotIndex)))
    if (!(spellId in SPELLS)) return false
    // Only allow binding spells that are currently available from equipped gear.
    const book = this.computeSpellbook(this.equipment)
    if (!book.some((s) => s.id === spellId)) return false
    const next = this.spellHotkeys.slice(0, 5)
    for (let i = 0; i < next.length; i++) {
      if (next[i] === spellId) next[i] = null
    }
    next[idx] = spellId
    this.spellHotkeys = next
    this.onChanged?.()
    return true
  }

  selectSpellHotkey(slotIndex: number) {
    const idx = Math.max(0, Math.min(4, Math.floor(slotIndex)))
    const id = this.spellHotkeys[idx]
    if (!id) return false
    return this.selectSpell(id)
  }

  selectSpell(id: SpellId) {
    const book = this.computeSpellbook(this.equipment)
    const target = book.find((s) => s.id === id) ?? null
    if (!target) return false
    if (sameSpellGrant(this.selectedSpell, target)) return true
    this.selectedSpell = { id: target.id, level: target.level }
    this.onChanged?.()
    return true
  }

  getPlayerStats(): PlayerStats {
    const weapon = this.getWeaponDef()

    const bootsId = this.getEquipment('boots')
    const boots = bootsId ? ITEMS[bootsId] : null
    const moveSpeedPct =
      boots && boots.kind === 'equipment' && boots.equip?.slot === 'boots' && typeof boots.equip.moveSpeedPct === 'number'
        ? boots.equip.moveSpeedPct
        : 0

    const glovesId = this.getEquipment('gloves')
    const gloves = glovesId ? ITEMS[glovesId] : null
    const attackSpeedPct =
      gloves &&
      gloves.kind === 'equipment' &&
      gloves.equip?.slot === 'gloves' &&
      typeof gloves.equip.attackSpeedPct === 'number'
        ? gloves.equip.attackSpeedPct
        : 0

    const chestId = this.getEquipment('chest')
    const chest = chestId ? ITEMS[chestId] : null
    const maxHpBonus =
      chest && chest.kind === 'equipment' && chest.equip?.slot === 'chest' && typeof chest.equip.maxHpBonus === 'number'
        ? Math.max(0, Math.floor(chest.equip.maxHpBonus))
        : 0

    const spells = this.computeSpellbook(this.equipment)

    const msMulRaw = 1 + (Number.isFinite(moveSpeedPct) ? moveSpeedPct / 100 : 0)
    const asMulRaw = 1 + (Number.isFinite(attackSpeedPct) ? attackSpeedPct / 100 : 0)
    const moveSpeedMul = Math.max(0.1, msMulRaw)
    const attackSpeedMul = Math.max(0.1, asMulRaw)

    return {
      moveSpeedPct: Number.isFinite(moveSpeedPct) ? moveSpeedPct : 0,
      moveSpeedMul,
      attackSpeedPct: Number.isFinite(attackSpeedPct) ? attackSpeedPct : 0,
      attackSpeedMul,
      maxHpBonus,
      spells,
      selectedSpell: this.selectedSpell ? { id: this.selectedSpell.id, level: this.selectedSpell.level } : null,
      weapon,
      attackDamage: weapon ? weapon.damage : 0,
    }
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
    this.ensureSelectedSpellValid()
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

  private computeSpellbook(equipment: EquipmentState): SpellGrant[] {
    const levels = new Map<SpellId, number>()
    for (const slot of Object.keys(equipment) as EquipmentSlot[]) {
      const itemId = equipment[slot]
      if (!itemId) continue
      const def = ITEMS[itemId]
      if (def.kind !== 'equipment') continue
      const spellsRaw = (def.equip as any)?.spells
      if (!Array.isArray(spellsRaw) || spellsRaw.length === 0) continue
      for (const s of spellsRaw) {
        if (!s) continue
        const id = (s as any).id
        if (!(typeof id === 'string' && (id as any) in SPELLS)) continue
        const levelRaw = (s as any).level
        const level = typeof levelRaw === 'number' && Number.isFinite(levelRaw) ? Math.max(1, Math.floor(levelRaw)) : 1
        const prev = levels.get(id as SpellId) ?? 0
        if (level > prev) levels.set(id as SpellId, level)
      }
    }

    return Array.from(levels.entries())
      .map(([id, level]) => ({ id, level }))
      .sort((a, b) => String(SPELLS[a.id]?.name ?? a.id).localeCompare(String(SPELLS[b.id]?.name ?? b.id)))
  }

  private ensureSelectedSpellValid() {
    const book = this.computeSpellbook(this.equipment)
    const valid = new Map<SpellId, number>()
    for (const s of book) valid.set(s.id, s.level)

    // Prune hotkeys that point to spells you no longer have.
    const nextHotkeys = this.spellHotkeys.slice(0, 5).map((id) => (id && valid.has(id) ? id : null))
    let hotkeysChanged = false
    for (let i = 0; i < 5; i++) {
      if (nextHotkeys[i] !== this.spellHotkeys[i]) {
        hotkeysChanged = true
        break
      }
    }
    if (hotkeysChanged) this.spellHotkeys = nextHotkeys

    // If the selected spell is no longer available, clear it (do not auto-select another).
    let nextSelected: SpellGrant | null = null
    if (this.selectedSpell && valid.has(this.selectedSpell.id)) {
      const lvl = valid.get(this.selectedSpell.id) ?? this.selectedSpell.level
      nextSelected = { id: this.selectedSpell.id, level: lvl }
    }

    if (!sameSpellGrant(this.selectedSpell, nextSelected)) this.selectedSpell = nextSelected
  }
}

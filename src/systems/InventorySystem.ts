import type { ItemId } from '../content/items'
import { ITEMS } from '../content/items'
import { WEAPONS, type WeaponDef, type WeaponId } from '../content/weapons'

export type InventorySnapshot = {
  coins: number
  keys: number
  weapon: WeaponId | null
  ownedWeapons: WeaponId[]
}

export class InventorySystem {
  private coins = 0
  private keys = 0
  private weapon: WeaponId | null = 'sword'
  private ownedWeapons = new Set<WeaponId>(['sword', 'greatsword'])
  private onChanged?: () => void

  constructor(opts?: { onChanged?: () => void }) {
    this.onChanged = opts?.onChanged
  }

  setOnChanged(cb: (() => void) | undefined) {
    this.onChanged = cb
  }

  reset() {
    this.coins = 0
    this.keys = 0
    this.ownedWeapons = new Set<WeaponId>(['sword', 'greatsword'])
    this.weapon = 'sword'
    this.onChanged?.()
  }

  load(snapshot: InventorySnapshot | null | undefined) {
    const coins = typeof snapshot?.coins === 'number' && Number.isFinite(snapshot.coins) ? Math.max(0, Math.floor(snapshot.coins)) : 0
    const keys = typeof snapshot?.keys === 'number' && Number.isFinite(snapshot.keys) ? Math.max(0, Math.floor(snapshot.keys)) : 0
    const ownedRaw = Array.isArray(snapshot?.ownedWeapons) ? snapshot!.ownedWeapons : []
    const owned = new Set<WeaponId>()
    for (const w of ownedRaw) if (typeof w === 'string' && w in WEAPONS) owned.add(w as WeaponId)
    if (owned.size === 0) owned.add('sword')

    const weaponRaw = snapshot?.weapon
    const weapon = typeof weaponRaw === 'string' && owned.has(weaponRaw as WeaponId) ? (weaponRaw as WeaponId) : (owned.has('sword') ? 'sword' : null)

    this.coins = coins
    this.keys = keys
    this.ownedWeapons = owned
    this.weapon = weapon

    this.onChanged?.()
  }

  getCoins() {
    return this.coins
  }

  getKeys() {
    return this.keys
  }

  getWeapon() {
    return this.weapon
  }

  getWeaponDef(): WeaponDef | null {
    const id = this.weapon
    return id ? WEAPONS[id] : null
  }

  hasWeapon(id: WeaponId) {
    return this.ownedWeapons.has(id)
  }

  addWeapon(id: WeaponId) {
    if (this.ownedWeapons.has(id)) return
    this.ownedWeapons.add(id)
    if (!this.weapon) this.weapon = id
    this.onChanged?.()
  }

  equipWeapon(id: WeaponId) {
    if (!this.ownedWeapons.has(id)) return false
    if (this.weapon === id) return true
    this.weapon = id
    this.onChanged?.()
    return true
  }

  snapshot(): InventorySnapshot {
    return { coins: this.coins, keys: this.keys, weapon: this.weapon, ownedWeapons: [...this.ownedWeapons] }
  }

  addItem(id: ItemId, amount = 1) {
    const n = Math.max(0, Math.floor(amount))
    if (n <= 0) return

    const beforeCoins = this.coins
    const beforeKeys = this.keys

    if (id === 'coin') this.coins += n
    if (id === 'key') this.keys += n

    if (this.coins !== beforeCoins || this.keys !== beforeKeys) this.onChanged?.()

    // Hearts are immediate-use pickups handled by PickupSystem (not stored).
  }

  tryConsumeKey(amount = 1) {
    const n = Math.max(1, Math.floor(amount))
    if (this.keys < n) return false
    this.keys -= n
    this.onChanged?.()
    return true
  }

  getInventoryLines() {
    const lines: string[] = []

    lines.push('I: Close')
    lines.push('')
    lines.push('Equipment')
    const wd = this.getWeaponDef()
    const weaponLabel = wd ? `${wd.name} (DMG ${wd.damage}, CD ${wd.cooldownMs}ms)` : '(none)'
    lines.push(`- Weapon: ${weaponLabel}`)
    lines.push('  1: Sword   2: Greatsword')
    lines.push('')
    lines.push('Items')
    lines.push(`- ${ITEMS.coin.name}: ${this.coins}`)
    lines.push(`- ${ITEMS.key.name}: ${this.keys}`)

    return lines
  }
}

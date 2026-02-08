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
    this.ownedWeapons.add(id)
    if (!this.weapon) this.weapon = id
  }

  equipWeapon(id: WeaponId) {
    if (!this.ownedWeapons.has(id)) return false
    this.weapon = id
    return true
  }

  snapshot(): InventorySnapshot {
    return { coins: this.coins, keys: this.keys, weapon: this.weapon, ownedWeapons: [...this.ownedWeapons] }
  }

  addItem(id: ItemId, amount = 1) {
    const n = Math.max(0, Math.floor(amount))
    if (n <= 0) return

    if (id === 'coin') this.coins += n
    if (id === 'key') this.keys += n

    // Hearts are immediate-use pickups handled by PickupSystem (not stored).
  }

  tryConsumeKey(amount = 1) {
    const n = Math.max(1, Math.floor(amount))
    if (this.keys < n) return false
    this.keys -= n
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

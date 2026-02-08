import type { ItemId } from '../content/items'
import { ITEMS } from '../content/items'

export type WeaponId = 'sword'

export type InventorySnapshot = {
  coins: number
  keys: number
  weapon: WeaponId | null
}

export class InventorySystem {
  private coins = 0
  private keys = 0
  private weapon: WeaponId | null = 'sword'

  getCoins() {
    return this.coins
  }

  getKeys() {
    return this.keys
  }

  getWeapon() {
    return this.weapon
  }

  snapshot(): InventorySnapshot {
    return { coins: this.coins, keys: this.keys, weapon: this.weapon }
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
    lines.push(`- Weapon: ${this.weapon ?? '(none)'}`)
    lines.push('')
    lines.push('Items')
    lines.push(`- ${ITEMS.coin.name}: ${this.coins}`)
    lines.push(`- ${ITEMS.key.name}: ${this.keys}`)

    return lines
  }
}

import * as Phaser from 'phaser'
import type { ItemId } from '../content/items'
import { ENEMIES, type EnemyKind, type LootDrop } from '../entities/enemies'
import type { PickupSystem } from './PickupSystem'

type EnemyDiedEvent = { kind: EnemyKind; x: number; y: number }

function clampChance(ch: number) {
  if (!Number.isFinite(ch)) return 0
  return Math.max(0, Math.min(1, ch))
}

function roll(drop: LootDrop) {
  const min = Math.max(0, Math.floor(drop.min))
  const max = Math.max(min, Math.floor(drop.max))
  return min === max ? min : Phaser.Math.Between(min, max)
}

export class LootSystem {
  private scene: Phaser.Scene
  private pickups: PickupSystem

  constructor(scene: Phaser.Scene, pickups: PickupSystem) {
    this.scene = scene
    this.pickups = pickups

    this.scene.events.on('enemy:died', this.onEnemyDied, this)
  }

  destroy() {
    this.scene.events.off('enemy:died', this.onEnemyDied, this)
  }

  private onEnemyDied(ev: EnemyDiedEvent) {
    const def = ENEMIES[ev.kind]
    const drops = def?.drops ?? []
    if (!Array.isArray(drops) || drops.length === 0) return

    for (const d of drops) {
      const chance = clampChance(d.chance)
      if (chance <= 0) continue
      if (chance < 1 && Math.random() > chance) continue

      const amount = roll(d)
      if (amount <= 0) continue

      this.spawn(ev.x, ev.y, d.itemId, amount)
    }
  }

  private spawn(x: number, y: number, itemId: ItemId, amount: number) {
    // Slight scatter so multi-drops don't overlap perfectly.
    const ox = Phaser.Math.Between(-12, 12)
    const oy = Phaser.Math.Between(-10, 10)
    this.pickups.spawnDrop(x + ox, y + oy, itemId, amount)
  }
}


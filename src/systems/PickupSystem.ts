import * as Phaser from 'phaser'
import type { ItemId } from '../content/items'
import { ITEMS } from '../content/items'
import { DEPTH_PICKUP } from '../game/constants'
import type { MapKey } from '../game/types'
import { getTiledNumber, getTiledString } from '../game/tiled'
import type { WorldState } from '../game/WorldState'
import type { InventorySystem } from './InventorySystem'
import type { PlayerHealthSystem } from './PlayerHealthSystem'

type PickupData = {
  mapKey: MapKey
  objectId: number
  itemId: ItemId
  amount: number
}

export class PickupSystem {
  static preload(scene: Phaser.Scene) {
    const ensure = (key: string, draw: (g: Phaser.GameObjects.Graphics) => { w: number; h: number }) => {
      if (scene.textures.exists(key)) return
      const g = scene.add.graphics()
      const { w, h } = draw(g)
      g.generateTexture(key, w, h)
      g.destroy()
    }

    ensure('item-coin', (g) => {
      const w = 32
      const h = 32
      g.fillStyle(0xffd96b, 1)
      g.fillCircle(16, 16, 12)
      g.fillStyle(0xfff2a8, 0.9)
      g.fillCircle(13, 13, 5)
      g.lineStyle(3, 0x7a4b14, 0.55)
      g.strokeCircle(16, 16, 12)
      g.lineStyle(2, 0x7a4b14, 0.35)
      g.strokeCircle(16, 16, 7)
      return { w, h }
    })

    ensure('item-key', (g) => {
      const w = 32
      const h = 32
      g.lineStyle(5, 0x0a0d12, 0.55)
      g.fillStyle(0xd9e3ee, 1)
      g.fillCircle(12, 16, 7)
      g.strokeCircle(12, 16, 7)
      g.fillRoundedRect(16, 14, 14, 4, 2)
      g.strokeRoundedRect(16, 14, 14, 4, 2)
      g.fillRoundedRect(24, 18, 6, 4, 2)
      g.strokeRoundedRect(24, 18, 6, 4, 2)
      g.fillRoundedRect(21, 18, 4, 7, 2)
      g.strokeRoundedRect(21, 18, 4, 7, 2)
      return { w, h }
    })

    ensure('item-heart', (g) => {
      const w = 32
      const h = 32
      g.fillStyle(0xff4b5c, 1)
      g.fillCircle(12, 13, 7)
      g.fillCircle(20, 13, 7)
      g.fillTriangle(6, 16, 26, 16, 16, 28)
      g.lineStyle(3, 0x0a0d12, 0.55)
      g.strokeCircle(12, 13, 7)
      g.strokeCircle(20, 13, 7)
      g.strokeTriangle(6, 16, 26, 16, 16, 28)
      g.fillStyle(0xffc0c7, 0.55)
      g.fillCircle(10, 11, 3)
      return { w, h }
    })
  }

  private scene: Phaser.Scene
  private player: Phaser.Physics.Arcade.Sprite
  private inventory: InventorySystem
  private health: PlayerHealthSystem
  private world: WorldState

  private group?: Phaser.Physics.Arcade.Group
  private overlap?: Phaser.Physics.Arcade.Collider

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    deps: { inventory: InventorySystem; health: PlayerHealthSystem; world: WorldState },
  ) {
    this.scene = scene
    this.player = player
    this.inventory = deps.inventory
    this.health = deps.health
    this.world = deps.world
  }

  clear() {
    this.overlap?.destroy()
    this.overlap = undefined
    this.group?.clear(true, true)
    this.group?.destroy(true)
    this.group = undefined
  }

  install(mapKey: MapKey, objects: Phaser.Types.Tilemaps.TiledObject[]) {
    this.clear()

    const group = this.scene.physics.add.group()
    this.group = group

    for (const o of objects) {
      if (o.type !== 'pickup') continue
      const objectId = typeof o.id === 'number' ? o.id : null
      if (!objectId) continue
      if (this.world.isPickupCollected(mapKey, objectId)) continue

      const itemIdRaw = getTiledString(o.properties, 'itemId')
      const itemId = (itemIdRaw && itemIdRaw in ITEMS ? (itemIdRaw as ItemId) : null) ?? null
      if (!itemId) continue

      const amountRaw = getTiledNumber(o.properties, 'amount')
      const amount = typeof amountRaw === 'number' ? amountRaw : 1

      const x = typeof o.x === 'number' ? o.x : null
      const y = typeof o.y === 'number' ? o.y : null
      if (!(typeof x === 'number' && typeof y === 'number')) continue

      const s = this.scene.physics.add.sprite(x, y, ITEMS[itemId].texture)
      s.setDepth(DEPTH_PICKUP)
      s.setOrigin(0.5, 0.85)
      s.setImmovable(true)
      ;(s.body as Phaser.Physics.Arcade.Body).setSize(22, 18, true)
      ;(s as any).__pickup = { mapKey, objectId, itemId, amount } satisfies PickupData

      // A little idle float so pickups read as interactive.
      this.scene.tweens.add({
        targets: s,
        y: { from: y, to: y - 6 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      })

      group.add(s)
    }

    this.overlap = this.scene.physics.add.overlap(this.player, group, (_p, pickupGo) => {
      const s = pickupGo as Phaser.Physics.Arcade.Sprite
      const data = (s as any).__pickup as PickupData | undefined
      if (!data) return
      if (!s.active) return

      const consumed = this.applyPickup(data.itemId, data.amount)
      if (!consumed) return

      this.world.markPickupCollected(data.mapKey, data.objectId)
      this.scene.tweens.killTweensOf(s)
      s.destroy()
    })
  }

  private applyPickup(itemId: ItemId, amount: number) {
    if (itemId === 'coin' || itemId === 'key') {
      this.inventory.addItem(itemId, amount)
      return true
    }

    if (itemId === 'heart') {
      return this.health.heal(amount)
    }

    return false
  }
}


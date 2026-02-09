import * as Phaser from 'phaser'
import type { Facing } from '../game/types'
import { DEPTH_PLAYER } from '../game/constants'
import type { Hero } from './Hero'
import { ITEMS, type EquipmentSlot } from '../content/items'
import type { InventorySystem } from '../systems/InventorySystem'

type Vec2 = { x: number; y: number }

export class HeroGear {
  private scene: Phaser.Scene
  private hero: Hero
  private inventory: InventorySystem

  private weapon: Phaser.GameObjects.Image
  private shield: Phaser.GameObjects.Image
  private helmet: Phaser.GameObjects.Image
  private chest: Phaser.GameObjects.Image
  private gloves: Phaser.GameObjects.Image
  private boots: Phaser.GameObjects.Image

  constructor(scene: Phaser.Scene, hero: Hero, inventory: InventorySystem) {
    this.scene = scene
    this.hero = hero
    this.inventory = inventory

    this.weapon = this.makeSprite('sword', DEPTH_PLAYER + 0.2)
    this.shield = this.makeSprite('item-shield', DEPTH_PLAYER + 0.1)
    this.helmet = this.makeSprite('item-helmet', DEPTH_PLAYER + 0.17)
    this.chest = this.makeSprite('item-chest', DEPTH_PLAYER + 0.15)
    this.gloves = this.makeSprite('item-gloves', DEPTH_PLAYER + 0.16)
    this.boots = this.makeSprite('item-boots', DEPTH_PLAYER - 0.05)
  }

  destroy() {
    this.weapon.destroy()
    this.shield.destroy()
    this.helmet.destroy()
    this.chest.destroy()
    this.gloves.destroy()
    this.boots.destroy()
  }

  update(didStartAttack: boolean) {
    const facing = this.hero.getFacing()
    const body = this.hero.body as Phaser.Physics.Arcade.Body | undefined
    const px = body?.center?.x ?? this.hero.x
    const py = body?.center?.y ?? this.hero.y

    this.updateWeapon(px, py, facing, didStartAttack)
    this.updateShield(px, py, facing)
    this.updateArmor(px, py, facing)
  }

  private makeSprite(texture: string, depth: number) {
    return this.scene.add.image(0, 0, texture).setOrigin(0.5, 0.5).setDepth(depth).setVisible(false)
  }

  private updateWeapon(px: number, py: number, facing: Facing, didStartAttack: boolean) {
    const weapon = this.inventory.getWeaponDef()
    if (!weapon) {
      this.weapon.setVisible(false)
      return
    }

    const isGreat = weapon.id === 'greatsword'
    const baseRot: Record<Facing, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }
    const rot = baseRot[facing] ?? 0

    const offsets: Record<Facing, Vec2> = isGreat
      ? { right: { x: 22, y: 6 }, left: { x: -22, y: 6 }, up: { x: 0, y: -28 }, down: { x: 0, y: 24 } }
      : { right: { x: 16, y: 5 }, left: { x: -16, y: 5 }, up: { x: 0, y: -22 }, down: { x: 0, y: 20 } }
    const off = offsets[facing] ?? offsets.down

    this.weapon.setTexture(weapon.vfx.weaponTexture)
    this.weapon.setPosition(px + off.x, py + off.y)
    this.weapon.setRotation(rot)
    this.weapon.setScale(isGreat ? 0.58 : 0.48)

    const attacking = this.hero.getState() === 'attack'
    if (isGreat && attacking) {
      this.weapon.setVisible(false)
      if (didStartAttack) this.spawnGreatswordSwing(px, py, rot, off)
    } else {
      this.weapon.setVisible(true)
      if (!isGreat && didStartAttack) this.spawnSwordSwing(px, py, rot, off)
    }
  }

  private updateShield(px: number, py: number, facing: Facing) {
    const shieldId = this.inventory.getEquipment('shield')
    const weapon = this.inventory.getWeaponDef()
    const isGreat = weapon?.id === 'greatsword'
    const showShield = !!shieldId && !isGreat
    if (!showShield) {
      this.shield.setVisible(false)
      return
    }

    const offsets: Record<Facing, Vec2> = {
      right: { x: -14, y: 6 },
      left: { x: 14, y: 6 },
      up: { x: 12, y: -10 },
      down: { x: -12, y: 10 },
    }
    const off = offsets[facing] ?? offsets.down
    const tex = shieldId && ITEMS[shieldId] ? ITEMS[shieldId].texture : 'item-shield'
    this.shield.setTexture(tex)
    this.shield.setPosition(px + off.x, py + off.y)
    this.shield.setScale(0.5)
    this.shield.setVisible(true)
  }

  private updateArmor(px: number, py: number, facing: Facing) {
    const scale = 0.38
    const offsets: Record<EquipmentSlot, Record<Facing, Vec2>> = {
      helmet: {
        up: { x: 0, y: -42 },
        down: { x: 0, y: -40 },
        left: { x: -4, y: -40 },
        right: { x: 4, y: -40 },
      },
      chest: {
        up: { x: 0, y: -18 },
        down: { x: 0, y: -18 },
        left: { x: -4, y: -18 },
        right: { x: 4, y: -18 },
      },
      gloves: {
        up: { x: -10, y: -10 },
        down: { x: 10, y: -8 },
        left: { x: -12, y: -8 },
        right: { x: 12, y: -8 },
      },
      boots: {
        up: { x: -8, y: 10 },
        down: { x: 8, y: 12 },
        left: { x: -8, y: 12 },
        right: { x: 8, y: 12 },
      },
      weapon: { down: { x: 0, y: 0 } },
      shield: { down: { x: 0, y: 0 } },
    }

    const apply = (slot: EquipmentSlot, sprite: Phaser.GameObjects.Image) => {
      if (slot === 'weapon' || slot === 'shield') return
      const itemId = this.inventory.getEquipment(slot)
      if (!itemId || !ITEMS[itemId]) {
        sprite.setVisible(false)
        return
      }
      const off = offsets[slot]?.[facing] ?? offsets[slot]?.down ?? { x: 0, y: 0 }
      sprite.setTexture(ITEMS[itemId].texture)
      sprite.setPosition(px + off.x, py + off.y)
      sprite.setScale(scale)
      sprite.setVisible(true)
    }

    apply('helmet', this.helmet)
    apply('chest', this.chest)
    apply('gloves', this.gloves)
    apply('boots', this.boots)
  }

  private spawnGreatswordSwing(px: number, py: number, baseRot: number, off: Vec2) {
    const weapon = this.inventory.getWeaponDef()
    if (!weapon || weapon.id !== 'greatsword') return

    const swing = this.scene.add
      .image(px + off.x, py + off.y, weapon.vfx.weaponTexture)
      .setOrigin(0.2, 0.5)
      .setDepth(DEPTH_PLAYER + 0.3)
      .setScale(0.6)
      .setAlpha(0.9)

    const arc = 0.7
    swing.setRotation(baseRot - arc)

    this.scene.tweens.add({
      targets: swing,
      rotation: { from: baseRot - arc, to: baseRot + arc },
      alpha: { from: 0.9, to: 0 },
      duration: 160,
      ease: 'sine.out',
      onComplete: () => swing.destroy(),
    })
  }

  private spawnSwordSwing(px: number, py: number, baseRot: number, off: Vec2) {
    const weapon = this.inventory.getWeaponDef()
    if (!weapon || weapon.id !== 'sword') return

    const swing = this.scene.add
      .image(px + off.x, py + off.y, weapon.vfx.weaponTexture)
      .setOrigin(0.2, 0.5)
      .setDepth(DEPTH_PLAYER + 0.3)
      .setScale(0.52)
      .setAlpha(0.85)

    const arc = 0.55
    swing.setRotation(baseRot - arc)

    this.scene.tweens.add({
      targets: swing,
      rotation: { from: baseRot - arc, to: baseRot + arc },
      alpha: { from: 0.85, to: 0 },
      duration: 130,
      ease: 'sine.out',
      onComplete: () => swing.destroy(),
    })
  }
}

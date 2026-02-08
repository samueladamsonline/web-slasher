import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { DEPTH_HITBOX } from './constants'
import type { Facing } from './types'

export type CombatDebug = { at: number; hits: number }

export class CombatSystem {
  static preload(scene: Phaser.Scene) {
    // VFX placeholder textures.
    const g = scene.add.graphics()

    // Sword.
    g.fillStyle(0x3b2a1a, 1)
    g.fillRoundedRect(10, 30, 12, 6, 3)
    g.fillStyle(0xb08a5a, 1)
    g.fillCircle(10, 33, 4)
    g.fillStyle(0x1b1b1b, 0.75)
    g.fillRoundedRect(18, 26, 6, 14, 3)

    g.fillStyle(0xd9e3ee, 1)
    g.fillRoundedRect(22, 30, 34, 6, 3)
    g.fillStyle(0xffffff, 0.7)
    g.fillRoundedRect(26, 31, 26, 2, 1)
    g.fillStyle(0xb2c0cf, 0.85)
    g.fillRoundedRect(26, 34, 26, 1, 1)
    g.fillStyle(0xd9e3ee, 1)
    g.fillTriangle(56, 30, 64, 33, 56, 36)

    g.lineStyle(3, 0x0a0d12, 0.55)
    g.strokeRoundedRect(22, 30, 34, 6, 3)
    g.strokeRoundedRect(18, 26, 6, 14, 3)
    g.strokeRoundedRect(10, 30, 12, 6, 3)
    g.strokeTriangle(56, 30, 64, 33, 56, 36)

    g.generateTexture('sword', 64, 64)
    g.clear()

    // Slash trail.
    g.lineStyle(10, 0xfff2a8, 0.55)
    g.beginPath()
    g.moveTo(14, 52)
    g.lineTo(54, 12)
    g.strokePath()
    g.lineStyle(5, 0xffffff, 0.35)
    g.beginPath()
    g.moveTo(20, 52)
    g.lineTo(56, 18)
    g.strokePath()
    g.generateTexture('slash', 64, 64)
    g.clear()

    // Hit spark.
    g.lineStyle(4, 0xffffff, 0.9)
    g.fillStyle(0xfff2a8, 0.95)
    g.beginPath()
    g.moveTo(16, 2)
    g.lineTo(20, 12)
    g.lineTo(30, 16)
    g.lineTo(20, 20)
    g.lineTo(16, 30)
    g.lineTo(12, 20)
    g.lineTo(2, 16)
    g.lineTo(12, 12)
    g.closePath()
    g.fillPath()
    g.strokePath()
    g.generateTexture('hitSpark', 32, 32)

    g.destroy()
  }

  private scene: Phaser.Scene
  private player: Phaser.Physics.Arcade.Sprite
  private getFacing: () => Facing
  private getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined
  private canAttack?: () => boolean
  private debugHitbox: boolean

  private attackLock = false
  private lastAttack: CombatDebug = { at: 0, hits: 0 }
  private spaceKey?: Phaser.Input.Keyboard.Key

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    opts: {
      getFacing: () => Facing
      getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined
      canAttack?: () => boolean
      debugHitbox?: boolean
    },
  ) {
    this.scene = scene
    this.player = player
    this.getFacing = opts.getFacing
    this.getEnemyGroup = opts.getEnemyGroup
    this.canAttack = opts.canAttack
    this.debugHitbox = !!opts.debugHitbox
  }

  bindInput(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
  }

  destroy(_keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null) {
    this.spaceKey = undefined
  }

  getDebug() {
    return this.lastAttack
  }

  update() {
    if (!this.spaceKey) return
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.tryAttack()
  }

  tryAttack() {
    if (this.canAttack && !this.canAttack()) return
    if (this.attackLock) return
    const enemies = this.getEnemyGroup()
    if (!enemies) return

    this.attackLock = true
    this.lastAttack = { at: this.scene.time.now, hits: 0 }

    const facing = this.getFacing()
    const offset = 42
    const sizeW = 50
    const sizeH = 34

    let hx = this.player.x
    let hy = this.player.y
    if (facing === 'up') hy -= offset
    if (facing === 'down') hy += offset
    if (facing === 'left') hx -= offset
    if (facing === 'right') hx += offset

    const left = hx - sizeW / 2
    const top = hy - sizeH / 2
    const bodies = this.scene.physics.overlapRect(left, top, sizeW, sizeH, true, false) as Phaser.Physics.Arcade.Body[]

    for (const b of bodies) {
      const go = (b as any)?.gameObject as Phaser.GameObjects.GameObject | undefined
      if (!go || !go.active) continue
      if (!(go instanceof Enemy)) continue
      if (go.damage(this.scene.time.now, this.player.x, this.player.y, 1)) {
        this.lastAttack.hits++
        this.spawnHitSpark(go.x, go.y)
      }
    }

    if (this.debugHitbox) this.showHitboxDebug(hx, hy, sizeW, sizeH)

    this.playSwordVfx(hx, hy, facing)

    if (this.lastAttack.hits > 0) this.scene.cameras.main.shake(70, 0.003)

    this.scene.time.delayedCall(220, () => {
      this.attackLock = false
    })
  }

  private spawnHitSpark(x: number, y: number) {
    const s = this.scene.add.image(x, y - 10, 'hitSpark').setDepth(DEPTH_HITBOX).setAlpha(0.95)
    s.setBlendMode(Phaser.BlendModes.ADD)
    s.setScale(0.9)
    this.scene.tweens.add({
      targets: s,
      alpha: { from: 0.95, to: 0 },
      scale: { from: 0.9, to: 1.35 },
      angle: { from: -10, to: 25 },
      duration: 140,
      ease: 'sine.out',
      onComplete: () => s.destroy(),
    })
  }

  private showHitboxDebug(cx: number, cy: number, w: number, h: number) {
    const r = this.scene.add.rectangle(cx, cy, w, h, 0xffe08a, 0.08).setStrokeStyle(2, 0xffe08a, 0.75).setDepth(DEPTH_HITBOX)
    this.scene.tweens.add({
      targets: r,
      alpha: { from: 0.6, to: 0 },
      duration: 120,
      ease: 'sine.out',
      onComplete: () => r.destroy(),
    })
  }

  private playSwordVfx(hx: number, hy: number, facing: Facing) {
    const rotByFacing: Record<Facing, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }
    const baseRot = rotByFacing[facing]

    const sword = this.scene.add.image(this.player.x, this.player.y, 'sword').setDepth(DEPTH_HITBOX).setAlpha(1)
    sword.setOrigin(0.2, 0.5)
    sword.setRotation(baseRot)

    const slash = this.scene.add.image(hx, hy, 'slash').setDepth(DEPTH_HITBOX).setAlpha(0.6)
    slash.setBlendMode(Phaser.BlendModes.ADD)
    slash.setRotation(baseRot)
    slash.setScale(0.85)

    const swordOffset = 22
    const sx = this.player.x + Math.cos(baseRot) * swordOffset
    const sy = this.player.y + Math.sin(baseRot) * swordOffset
    sword.setPosition(sx, sy)

    const swing = 0.55
    const from = baseRot - swing
    const to = baseRot + swing
    sword.setRotation(from)

    this.scene.tweens.add({
      targets: slash,
      alpha: { from: 0.6, to: 0 },
      scale: { from: 0.85, to: 1.15 },
      duration: 140,
      ease: 'sine.out',
      onComplete: () => slash.destroy(),
    })

    this.scene.tweens.add({
      targets: sword,
      rotation: { from, to },
      duration: 120,
      ease: 'sine.inOut',
      onComplete: () => sword.destroy(),
    })
  }
}

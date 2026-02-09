import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { DEPTH_HITBOX } from '../game/constants'
import { emitGameEvent, GAME_EVENTS } from '../game/events'
import type { Facing } from '../game/types'
import type { WeaponDef, WeaponHitbox } from '../content/weapons'

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

    // Greatsword (chunkier).
    g.fillStyle(0x3b2a1a, 1)
    g.fillRoundedRect(10, 30, 18, 8, 4)
    g.fillStyle(0xb08a5a, 1)
    g.fillCircle(12, 34, 5)
    g.fillStyle(0x1b1b1b, 0.75)
    g.fillRoundedRect(22, 24, 8, 20, 4)

    g.fillStyle(0xd9e3ee, 1)
    g.fillRoundedRect(28, 30, 34, 8, 4)
    g.fillStyle(0xffffff, 0.65)
    g.fillRoundedRect(32, 32, 26, 2, 1)
    g.fillStyle(0xb2c0cf, 0.85)
    g.fillRoundedRect(32, 36, 26, 1, 1)
    g.fillStyle(0xd9e3ee, 1)
    g.fillTriangle(62, 30, 72, 34, 62, 38)

    g.lineStyle(3, 0x0a0d12, 0.55)
    g.strokeRoundedRect(28, 30, 34, 8, 4)
    g.strokeRoundedRect(22, 24, 8, 20, 4)
    g.strokeRoundedRect(10, 30, 18, 8, 4)
    g.strokeTriangle(62, 30, 72, 34, 62, 38)

    g.generateTexture('greatsword', 80, 64)
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

    // Heavy slash.
    g.lineStyle(14, 0xffd96b, 0.45)
    g.beginPath()
    g.moveTo(10, 56)
    g.lineTo(58, 8)
    g.strokePath()
    g.lineStyle(7, 0xffffff, 0.22)
    g.beginPath()
    g.moveTo(14, 58)
    g.lineTo(62, 14)
    g.strokePath()
    g.generateTexture('slash-heavy', 72, 72)
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
  private getWeapon?: () => WeaponDef | null
  private getAttackDamage?: () => number
  private hasLineOfSight?: (fromX: number, fromY: number, toX: number, toY: number) => boolean
  private debugHitbox: boolean

  private attackLock = false
  private lastAttack: CombatDebug = { at: 0, hits: 0 }

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    opts: {
      getFacing: () => Facing
      getWeapon?: () => WeaponDef | null
      getAttackDamage?: () => number
      debugHitbox?: boolean
      hasLineOfSight?: (fromX: number, fromY: number, toX: number, toY: number) => boolean
    },
  ) {
    this.scene = scene
    this.player = player
    this.getFacing = opts.getFacing
    this.getWeapon = opts.getWeapon
    this.getAttackDamage = opts.getAttackDamage
    this.hasLineOfSight = opts.hasLineOfSight
    this.debugHitbox = !!opts.debugHitbox
  }

  getDebug() {
    return this.lastAttack
  }

  canAttack() {
    if (this.attackLock) return false
    const weapon = this.getWeapon ? this.getWeapon() : null
    return !!weapon
  }

  tryAttack() {
    if (this.attackLock) return

    const weapon = this.getWeapon ? this.getWeapon() : null
    if (!weapon) return
    const attackDamageRaw = this.getAttackDamage ? this.getAttackDamage() : weapon.damage
    const attackDamage = Number.isFinite(attackDamageRaw) ? Math.max(0, Math.floor(attackDamageRaw)) : 0

    const pBody = this.player.body as Phaser.Physics.Arcade.Body | undefined
    const px = pBody?.center?.x ?? this.player.x
    const py = pBody?.center?.y ?? this.player.y

    this.attackLock = true
    this.lastAttack = { at: this.scene.time.now, hits: 0 }
    emitGameEvent(this.scene.events, GAME_EVENTS.PLAYER_ATTACK, { now: this.scene.time.now, weaponId: weapon.id })

    const facing = this.getFacing()
    const { offset, w: sizeW, h: sizeH } = this.resolveHitbox(weapon, facing)

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
      if (this.hasLineOfSight) {
        const eBody = go.body as Phaser.Physics.Arcade.Body | undefined
        const ex = eBody?.center?.x ?? go.x
        const ey = eBody?.center?.y ?? go.y
        if (!this.hasLineOfSight(px, py, ex, ey)) continue
      }
      if (attackDamage > 0 && go.damage(this.scene.time.now, this.player.x, this.player.y, attackDamage)) {
        this.lastAttack.hits++
        this.spawnHitSpark(go.x, go.y)
      }
    }

    if (this.debugHitbox) this.showHitboxDebug(hx, hy, sizeW, sizeH)

    this.playSwordVfx(hx, hy, facing, weapon)

    if (this.lastAttack.hits > 0) this.scene.cameras.main.shake(70, 0.003)

    const lockMs = Math.max(0, Math.floor((weapon.timings?.activeMs ?? 0) + (weapon.timings?.recoveryMs ?? 0)))
    this.scene.time.delayedCall(lockMs, () => {
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

  private resolveHitbox(weapon: WeaponDef, facing: Facing): WeaponHitbox {
    const base = weapon.hitbox
    const perFacing = weapon.hitboxByFacing?.[facing]
    return {
      offset: typeof perFacing?.offset === 'number' ? perFacing.offset : base.offset,
      w: typeof perFacing?.w === 'number' ? perFacing.w : base.w,
      h: typeof perFacing?.h === 'number' ? perFacing.h : base.h,
    }
  }

  private playSwordVfx(hx: number, hy: number, facing: Facing, weapon: WeaponDef) {
    const rotByFacing: Record<Facing, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }
    const baseRot = rotByFacing[facing]

    const slash = this.scene.add.image(hx, hy, weapon.vfx.slashTexture).setDepth(DEPTH_HITBOX).setAlpha(0.6)
    slash.setBlendMode(Phaser.BlendModes.ADD)
    slash.setRotation(baseRot)
    slash.setScale(weapon.vfx.slashScale)

    this.scene.tweens.add({
      targets: slash,
      alpha: { from: 0.6, to: 0 },
      scale: { from: 0.85, to: 1.15 },
      duration: 140,
      ease: 'sine.out',
      onComplete: () => slash.destroy(),
    })

  }
}

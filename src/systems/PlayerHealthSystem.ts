import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { Hero } from '../entities/Hero'
import { HeartsUI } from '../ui/HeartsUI'

export class PlayerHealthSystem {
  private scene: Phaser.Scene
  private player: Hero
  private getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined

  private maxHp = 5
  private hp = 5
  private invulnUntil = 0
  private touchInvulnMs = 800
  private warpLockUntil = 0

  private overlap?: Phaser.Physics.Arcade.Collider
  private ui: HeartsUI

  constructor(scene: Phaser.Scene, player: Hero, getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined) {
    this.scene = scene
    this.player = player
    this.getEnemyGroup = getEnemyGroup
    this.ui = new HeartsUI(scene)
    this.ui.set(this.maxHp, this.hp)
  }

  destroy() {
    this.overlap?.destroy()
    this.ui.destroy()
  }

  onMapChanged() {
    this.overlap?.destroy()
    const group = this.getEnemyGroup()
    if (!group) return

    // Use overlap for damage (collider for blocking is handled by MapRuntime + enemy immovable).
    this.overlap = this.scene.physics.add.overlap(this.player, group, (_p, e) => {
      if (!(e instanceof Enemy)) return
      this.tryTouchDamage(e)
    })
  }

  getHp() {
    return this.hp
  }

  getMaxHp() {
    return this.maxHp
  }

  setHp(hp: number) {
    const next = Math.max(0, Math.min(this.maxHp, Math.floor(hp)))
    this.hp = next
    this.ui.set(this.maxHp, this.hp)
  }

  heal(amount = 1) {
    const n = Math.max(1, Math.floor(amount))
    const before = this.hp
    this.setHp(this.hp + n)
    return this.hp !== before
  }

  reset() {
    this.hp = this.maxHp
    this.invulnUntil = 0
    this.warpLockUntil = 0
    this.ui.set(this.maxHp, this.hp)
  }

  canWarp() {
    return this.scene.time.now >= this.warpLockUntil
  }

  update() {
    // Touch damage is driven by the physics overlap callback set up in onMapChanged().
    // Keeping this update hook in case we add non-overlap health effects later.
  }

  private tryTouchDamage(enemy: Enemy) {
    const now = this.scene.time.now
    if (now < this.invulnUntil) return
    if (!enemy.active) return

    const dmg = enemy.getTouchDamage()
    if (dmg <= 0) return

    this.hp = Math.max(0, this.hp - dmg)
    this.invulnUntil = now + this.touchInvulnMs
    // Prevent accidental warps during knockback/hit feedback.
    this.warpLockUntil = Math.max(this.warpLockUntil, now + 350)
    this.ui.set(this.maxHp, this.hp)

    // Feedback + knockback.
    this.player.setTintFill(0xffffff)
    this.scene.cameras.main.shake(70, 0.002)
    this.scene.time.delayedCall(90, () => {
      if (!this.player.active) return
      this.player.clearTint()
    })

    const dx = this.player.x - enemy.x
    const dy = this.player.y - enemy.y
    const v = new Phaser.Math.Vector2(dx, dy)
    if (v.lengthSq() < 0.0001) v.set(1, 0)
    v.normalize().scale(enemy.getTouchKnockback())
    this.player.hurt(now, { vx: v.x, vy: v.y })
  }

  // (no tile-based helpers needed)
}

import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { TILE_SIZE } from '../game/constants'
import { HeartsUI } from '../ui/HeartsUI'

export class PlayerHealthSystem {
  private scene: Phaser.Scene
  private player: Phaser.Physics.Arcade.Sprite
  private getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined

  private maxHp = 5
  private hp = 5
  private invulnUntil = 0
  private touchInvulnMs = 550
  private warpLockUntil = 0

  private overlap?: Phaser.Physics.Arcade.Collider
  private ui: HeartsUI

  constructor(scene: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined) {
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

  canWarp() {
    return this.scene.time.now >= this.warpLockUntil
  }

  update() {
    const group = this.getEnemyGroup()
    if (!group) return

    const now = this.scene.time.now
    if (now < this.invulnUntil) return

    const pTile = this.tileFor(this.player)
    if (!pTile) return

    // Tile-based contact damage: if an enemy's body center enters the same tile
    // as the player, apply touch damage immediately (then invuln kicks in).
    let best: Enemy | null = null
    let bestDist = Number.POSITIVE_INFINITY

    const kids = group.getChildren() as unknown as Phaser.GameObjects.GameObject[]
    for (const go of kids) {
      if (!(go instanceof Enemy)) continue
      if (!go.active) continue
      const eTile = this.tileFor(go)
      if (!eTile) continue
      if (eTile.tx !== pTile.tx || eTile.ty !== pTile.ty) continue

      const dx = go.x - this.player.x
      const dy = go.y - this.player.y
      const d = dx * dx + dy * dy
      if (d < bestDist) {
        bestDist = d
        best = go
      }
    }

    if (best) this.tryTouchDamage(best)
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
    this.scene.time.delayedCall(90, () => {
      if (!this.player.active) return
      this.player.clearTint()
    })

    const dx = this.player.x - enemy.x
    const dy = this.player.y - enemy.y
    const v = new Phaser.Math.Vector2(dx, dy)
    if (v.lengthSq() < 0.0001) v.set(1, 0)
    v.normalize().scale(enemy.getTouchKnockback())
    this.player.setVelocity(v.x, v.y)
    this.scene.time.delayedCall(120, () => {
      if (!this.player.active) return
      this.player.setVelocity(0, 0)
    })
  }

  private tileFor(go: Phaser.GameObjects.GameObject) {
    const x = (go as any).x
    const y = (go as any).y
    if (!(typeof x === 'number' && typeof y === 'number')) return null
    return { tx: Math.floor(x / TILE_SIZE), ty: Math.floor(y / TILE_SIZE) }
  }
}

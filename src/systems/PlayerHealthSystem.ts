import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { Hero } from '../entities/Hero'
import { HeartsUI } from '../ui/HeartsUI'

export type EnemyStrike = {
  enemy: Enemy
  now: number
  sourceX: number
  sourceY: number
  damage: number
  knockback: number
  hitRadius: number
}

export class PlayerHealthSystem {
  private scene: Phaser.Scene
  private player: Hero

  private maxHp = 5
  private hp = 5
  private invulnUntil = 0
  private damageInvulnMs = 800
  private warpLockUntil = 0

  private ui: HeartsUI

  constructor(scene: Phaser.Scene, player: Hero, _getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined) {
    this.scene = scene
    this.player = player
    this.ui = new HeartsUI(scene)
    this.ui.set(this.maxHp, this.hp)
  }

  destroy() {
    this.ui.destroy()
  }

  onMapChanged() {
    // Keep API stable for Scene lifecycle; no collider wiring needed with attack-based damage.
  }

  getHp() {
    return this.hp
  }

  getMaxHp() {
    return this.maxHp
  }

  setMaxHp(maxHp: number) {
    const next = Math.max(1, Math.floor(maxHp))
    if (next === this.maxHp) return
    const prevMax = this.maxHp
    this.maxHp = next
    // If the player was full before a max-HP increase (eg equipping a chest piece),
    // keep them full after. Otherwise, preserve current HP (only clamp on decreases).
    if (next > prevMax && this.hp === prevMax) this.hp = next
    this.hp = Math.max(0, Math.min(this.maxHp, this.hp))
    this.ui.set(this.maxHp, this.hp)
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
    // Health updates are event-driven by enemy strike windows.
  }

  tryApplyEnemyStrike(strike: EnemyStrike) {
    const now = strike.now
    if (now < this.invulnUntil) return false
    if (!strike.enemy.active) return false

    const dmg = typeof strike.damage === 'number' && Number.isFinite(strike.damage) ? Math.max(0, strike.damage) : 0
    if (dmg <= 0) return false

    if (!this.playerWithinStrikeRadius(strike.sourceX, strike.sourceY, strike.hitRadius)) return false

    this.hp = Math.max(0, this.hp - dmg)
    this.invulnUntil = now + this.damageInvulnMs
    // Prevent accidental warps during knockback/hit feedback.
    this.warpLockUntil = Math.max(this.warpLockUntil, now + 350)
    this.ui.set(this.maxHp, this.hp)
    strike.enemy.recordPlayerHit(now)

    this.player.setTintFill(0xffffff)
    this.scene.cameras.main.shake(70, 0.002)
    this.scene.time.delayedCall(90, () => {
      if (!this.player.active) return
      this.player.clearTint()
    })

    const dx = this.player.x - strike.sourceX
    const dy = this.player.y - strike.sourceY
    const v = new Phaser.Math.Vector2(dx, dy)
    if (v.lengthSq() < 0.0001) v.set(1, 0)
    const knockback = typeof strike.knockback === 'number' && Number.isFinite(strike.knockback) ? Math.max(0, strike.knockback) : 0
    v.normalize().scale(knockback)
    this.player.hurt(now, { vx: v.x, vy: v.y })

    return true
  }

  private playerWithinStrikeRadius(x: number, y: number, radiusRaw: number) {
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined
    const px = body?.center?.x ?? this.player.x
    const py = body?.center?.y ?? this.player.y
    const pw = typeof body?.width === 'number' ? body.width : 0
    const ph = typeof body?.height === 'number' ? body.height : 0
    const pr = Math.max(6, Math.max(pw, ph) * 0.5 + 4)
    const radius = typeof radiusRaw === 'number' && Number.isFinite(radiusRaw) ? Math.max(0, radiusRaw) : 0

    const dx = px - x
    const dy = py - y
    const rr = pr + radius
    return dx * dx + dy * dy <= rr * rr
  }
}

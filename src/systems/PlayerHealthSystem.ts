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
  private touchRadiusPadding = 4
  private warpLockUntil = 0

  private overlap?: Phaser.Physics.Arcade.Collider
  private ui: HeartsUI
  private prevPlayerPos: { x: number; y: number } | null = null
  private prevEnemyPos = new WeakMap<Enemy, { x: number; y: number }>()

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
    const pBody = this.player.body as Phaser.Physics.Arcade.Body | undefined
    this.prevPlayerPos = { x: pBody?.center?.x ?? this.player.x, y: pBody?.center?.y ?? this.player.y }
    this.prevEnemyPos = new WeakMap()

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
    const pBody = this.player.body as Phaser.Physics.Arcade.Body | undefined
    this.prevPlayerPos = { x: pBody?.center?.x ?? this.player.x, y: pBody?.center?.y ?? this.player.y }
    this.prevEnemyPos = new WeakMap()
  }

  canWarp() {
    return this.scene.time.now >= this.warpLockUntil
  }

  update() {
    // Touch damage is primarily driven by the physics overlap callback set up in onMapChanged().
    // We also run a swept-circle check to catch tunneling for fast/small enemies.
    const now = this.scene.time.now

    const group = this.getEnemyGroup()
    if (!group) {
      this.prevPlayerPos = null
      return
    }

    const pBody = this.player.body as Phaser.Physics.Arcade.Body | undefined
    const px = pBody?.center?.x ?? this.player.x
    const py = pBody?.center?.y ?? this.player.y
    const pw = typeof pBody?.width === 'number' ? pBody.width : 0
    const ph = typeof pBody?.height === 'number' ? pBody.height : 0
    const pr = Math.max(pw, ph) * 0.5 + this.touchRadiusPadding

    const pPrev = this.prevPlayerPos ?? { x: px, y: py }
    const pDelta = { x: px - pPrev.x, y: py - pPrev.y }

    const enemies = group.getChildren() as unknown as Phaser.GameObjects.GameObject[]
    for (const go of enemies) {
      if (!(go instanceof Enemy)) continue
      if (!go.active) continue
      const body = go.body as Phaser.Physics.Arcade.Body | null
      if (!body || !body.enable) continue

      const ex = body?.center?.x ?? go.x
      const ey = body?.center?.y ?? go.y
      const ePrev = this.prevEnemyPos.get(go) ?? { x: ex, y: ey }
      const eDelta = { x: ex - ePrev.x, y: ey - ePrev.y }

      this.prevEnemyPos.set(go, { x: ex, y: ey })
      const r = pr + go.getTouchRadius()
      const hit = segmentIntersectsCircle(
        { x: ePrev.x - pPrev.x, y: ePrev.y - pPrev.y },
        { x: ePrev.x - pPrev.x + (eDelta.x - pDelta.x), y: ePrev.y - pPrev.y + (eDelta.y - pDelta.y) },
        r,
      )
      if (hit && now >= this.invulnUntil) {
        this.tryTouchDamage(go)
        if (this.scene.time.now < this.invulnUntil) break
      }
    }

    this.prevPlayerPos = { x: px, y: py }
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
    enemy.recordPlayerHit(now)

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

function segmentIntersectsCircle(start: { x: number; y: number }, end: { x: number; y: number }, radius: number) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const a = dx * dx + dy * dy
  if (a < 0.0001) return start.x * start.x + start.y * start.y <= radius * radius

  const t = Math.max(0, Math.min(1, -(start.x * dx + start.y * dy) / a))
  const cx = start.x + dx * t
  const cy = start.y + dy * t
  return cx * cx + cy * cy <= radius * radius
}

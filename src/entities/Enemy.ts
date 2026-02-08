import * as Phaser from 'phaser'
import type { EnemyDef, EnemyKind } from './enemies'
import { ENEMIES } from './enemies'
import { DEPTH_ENEMY } from '../game/constants'
import { getTiledNumber, getTiledProp, type TiledProps } from '../game/tiled'

type EnemyStats = Pick<EnemyDef, 'invulnMs' | 'knockback' | 'moveSpeed' | 'leashRadius' | 'touchDamage' | 'touchKnockback' | 'aggroRadius'>

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly kind: EnemyKind
  private hp: number
  private invulnUntil = 0
  readonly spawnX: number
  readonly spawnY: number
  stats: EnemyStats

  constructor(scene: Phaser.Scene, x: number, y: number, def: EnemyDef, hpOverride?: number) {
    super(scene, x, y, def.texture)

    this.kind = def.kind
    this.hp = typeof hpOverride === 'number' ? Math.max(1, Math.floor(hpOverride)) : def.hp
    this.spawnX = x
    this.spawnY = y
    this.stats = {
      invulnMs: def.invulnMs,
      knockback: def.knockback,
      moveSpeed: def.moveSpeed,
      leashRadius: def.leashRadius,
      touchDamage: def.touchDamage,
      touchKnockback: def.touchKnockback,
      aggroRadius: def.aggroRadius,
    }

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setDepth(DEPTH_ENEMY)
    this.setOrigin(0.5, 0.9)
    this.setCollideWorldBounds(true)
    this.setPushable(false)
    this.setImmovable(true)

    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(def.body.w, def.body.h)
    body.setOffset(def.body.ox, def.body.oy)

    // Play simple looping anims if they exist (created in GameScene).
    if (this.kind === 'slime' && scene.anims.exists('slime-wiggle')) this.anims.play('slime-wiggle')
    if (this.kind === 'bat' && scene.anims.exists('bat-flap')) this.anims.play('bat-flap')
  }

  getHp() {
    return this.hp
  }

  getTouchDamage() {
    return this.stats.touchDamage
  }

  getTouchKnockback() {
    return this.stats.touchKnockback
  }

  getMoveSpeed() {
    return this.stats.moveSpeed
  }

  getAggroRadius() {
    return this.stats.aggroRadius ?? 0
  }

  getLeashRadius() {
    return this.stats.leashRadius ?? 0
  }

  canTakeDamage(now: number) {
    return this.active && now >= this.invulnUntil
  }

  damage(now: number, sourceX: number, sourceY: number, amount = 1) {
    if (!this.canTakeDamage(now)) return false

    this.hp = this.hp - Math.max(1, Math.floor(amount))
    this.invulnUntil = now + this.stats.invulnMs

    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(70, () => {
      if (!this.active) return
      this.clearTint()
    })

    this.applyKnockback(sourceX, sourceY, this.stats.knockback)

    if (this.hp <= 0) {
      this.die()
    }

    return true
  }

  private applyKnockback(fromX: number, fromY: number, strength: number) {
    if (!this.body) return
    const dx = this.x - fromX
    const dy = this.y - fromY
    const v = new Phaser.Math.Vector2(dx, dy)
    if (v.lengthSq() < 0.0001) v.set(1, 0)
    v.normalize().scale(strength)

    this.setVelocity(v.x, v.y)
    this.scene.time.delayedCall(120, () => {
      if (!this.active) return
      if (!this.body) return
      this.setVelocity(0, 0)
    })
  }

  private die() {
    // Let other systems (loot, quests, etc.) react before this enemy is destroyed.
    this.scene.events.emit('enemy:died', { kind: this.kind, x: this.x, y: this.y })

    const body = this.body as Phaser.Physics.Arcade.Body | undefined
    if (body) body.enable = false
    this.setVisible(false)
    this.scene.time.delayedCall(60, () => {
      if (!this.scene) return
      this.destroy()
    })
  }

  static fromTiledObject(scene: Phaser.Scene, obj: Phaser.Types.Tilemaps.TiledObject) {
    if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return null
    const props = (obj.properties ?? []) as TiledProps

    const kindRaw = getTiledProp(props, 'kind')
    const kind =
      typeof kindRaw === 'string' && kindRaw in ENEMIES ? (kindRaw as EnemyKind) : ('slime' as EnemyKind)

    const def = ENEMIES[kind]
    const hpRaw = getTiledNumber(props, 'hp')
    const hp = typeof hpRaw === 'number' ? hpRaw : undefined

    const enemy = new Enemy(scene, obj.x, obj.y, def, hp)

    // Optional overrides from Tiled (kept minimal; defaults live in entities/enemies.ts).
    const speedRaw = getTiledNumber(props, 'speed')
    if (typeof speedRaw === 'number') enemy.stats.moveSpeed = Math.max(0, speedRaw)
    const aggroRaw = getTiledNumber(props, 'aggroRadius')
    if (typeof aggroRaw === 'number') enemy.stats.aggroRadius = Math.max(0, aggroRaw)
    const leashRaw = getTiledNumber(props, 'leashRadius')
    if (typeof leashRaw === 'number') enemy.stats.leashRadius = Math.max(0, leashRaw)
    const touchDmgRaw = getTiledNumber(props, 'touchDamage')
    if (typeof touchDmgRaw === 'number') enemy.stats.touchDamage = Math.max(0, Math.floor(touchDmgRaw))
    const touchKbRaw = getTiledNumber(props, 'touchKnockback')
    if (typeof touchKbRaw === 'number') enemy.stats.touchKnockback = Math.max(0, touchKbRaw)
    const invulnRaw = getTiledNumber(props, 'invulnMs')
    if (typeof invulnRaw === 'number') enemy.stats.invulnMs = Math.max(0, invulnRaw)
    const kbRaw = getTiledNumber(props, 'knockback')
    if (typeof kbRaw === 'number') enemy.stats.knockback = Math.max(0, kbRaw)

    return enemy
  }
}

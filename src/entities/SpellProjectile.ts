import * as Phaser from 'phaser'
import { DEPTH_HITBOX } from '../game/constants'
import type { SpellId } from '../content/spells'

export class SpellProjectile extends Phaser.Physics.Arcade.Image {
  readonly spellId: SpellId
  readonly level: number
  readonly damage: number
  readonly createdAt: number
  readonly ttlMs: number
  private hit = false

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    cfg: { spellId: SpellId; level: number; damage: number; radius: number; ttlMs: number; createdAt: number },
  ) {
    super(scene, x, y, texture)
    this.spellId = cfg.spellId
    this.level = cfg.level
    this.damage = cfg.damage
    this.ttlMs = cfg.ttlMs
    this.createdAt = cfg.createdAt

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setDepth(DEPTH_HITBOX)
    this.setBlendMode(Phaser.BlendModes.ADD)

    const body = this.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false)
    body.setImmovable(true)

    // Circular body is typical for projectiles in Arcade physics.
    const r = Math.max(2, Math.floor(cfg.radius))
    const w = this.width || r * 2
    const h = this.height || r * 2
    body.setCircle(r, Math.max(0, Math.floor(w / 2 - r)), Math.max(0, Math.floor(h / 2 - r)))
  }

  markHit() {
    this.hit = true
  }

  hasHit() {
    return this.hit
  }
}


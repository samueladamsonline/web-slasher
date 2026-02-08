import * as Phaser from 'phaser'
import type { EnemyDef, EnemyKind } from '../content/enemies'
import { ENEMIES } from '../content/enemies'
import { DEPTH_ENEMY } from '../game/constants'

type TiledProps = any[]

function getProp(props: TiledProps | undefined, name: string): unknown {
  if (!Array.isArray(props)) return undefined
  return props.find((p) => p?.name === name)?.value
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly kind: EnemyKind
  private def: EnemyDef
  private hp: number
  private invulnUntil = 0

  constructor(scene: Phaser.Scene, x: number, y: number, def: EnemyDef, hpOverride?: number) {
    super(scene, x, y, def.texture)

    this.kind = def.kind
    this.def = def
    this.hp = typeof hpOverride === 'number' ? Math.max(1, Math.floor(hpOverride)) : def.hp

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setDepth(DEPTH_ENEMY)
    this.setOrigin(0.5, 0.9)
    this.setCollideWorldBounds(true)
    this.setPushable(false)

    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(def.body.w, def.body.h)
    body.setOffset(def.body.ox, def.body.oy)
  }

  getHp() {
    return this.hp
  }

  canTakeDamage(now: number) {
    return this.active && now >= this.invulnUntil
  }

  damage(now: number, sourceX: number, sourceY: number, amount = 1) {
    if (!this.canTakeDamage(now)) return false

    this.hp = this.hp - Math.max(1, Math.floor(amount))
    this.invulnUntil = now + this.def.invulnMs

    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(70, () => {
      if (!this.active) return
      this.clearTint()
    })

    this.applyKnockback(sourceX, sourceY, this.def.knockback)

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

    const kindRaw = getProp(props, 'kind')
    const kind =
      typeof kindRaw === 'string' && kindRaw in ENEMIES ? (kindRaw as EnemyKind) : ('slime' as EnemyKind)

    const def = ENEMIES[kind]
    const hpRaw = getProp(props, 'hp')
    const hp = typeof hpRaw === 'number' ? hpRaw : undefined

    return new Enemy(scene, obj.x, obj.y, def, hp)
  }
}

import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { DEPTH_ENEMY } from '../game/constants'

type EnemyVfx = {
  slowIcon: Phaser.GameObjects.Image
}

export class StatusEffectSystem {
  static preload(scene: Phaser.Scene) {
    const key = 'status-slow'
    if (scene.textures.exists(key)) return

    const g = scene.add.graphics()
    // Small snowflake-ish icon.
    g.fillStyle(0x0b111a, 0.7)
    g.fillRoundedRect(1, 1, 18, 18, 5)
    g.lineStyle(2, 0xe0c68a, 0.18)
    g.strokeRoundedRect(1, 1, 18, 18, 5)

    g.lineStyle(2, 0x76fff8, 0.95)
    g.strokeLineShape(new Phaser.Geom.Line(10, 4, 10, 16))
    g.strokeLineShape(new Phaser.Geom.Line(4, 10, 16, 10))
    g.strokeLineShape(new Phaser.Geom.Line(6, 6, 14, 14))
    g.strokeLineShape(new Phaser.Geom.Line(14, 6, 6, 14))

    g.generateTexture(key, 20, 20)
    g.destroy()
  }

  private scene: Phaser.Scene
  private getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined
  private vfx = new WeakMap<Enemy, EnemyVfx>()

  constructor(scene: Phaser.Scene, getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined) {
    this.scene = scene
    this.getEnemyGroup = getEnemyGroup
  }

  destroy() {
    // WeakMap means we can't iterate; rely on enemy destroy hooks for cleanup.
  }

  update(now: number) {
    const group = this.getEnemyGroup()
    if (!group) return
    const kids = group.getChildren() as unknown as Phaser.GameObjects.GameObject[]
    for (const go of kids) {
      if (!(go instanceof Enemy)) continue
      if (!go.active) continue
      const body = go.body as Phaser.Physics.Arcade.Body | null
      if (!body || !body.enable) continue

      const view = this.ensure(go)
      const slowed = go.hasStatusEffect('slow', now)
      view.slowIcon.setVisible(slowed)

      if (slowed) {
        const ex = body.center?.x ?? go.x
        const ey = body.center?.y ?? go.y
        const offY = Math.max(22, Math.floor(go.displayHeight * 0.7))
        view.slowIcon.setPosition(ex, ey - offY)
        view.slowIcon.setDepth(DEPTH_ENEMY + 0.9)
      }
    }
  }

  private ensure(enemy: Enemy): EnemyVfx {
    const existing = this.vfx.get(enemy)
    if (existing) return existing

    const slowIcon = this.scene.add.image(enemy.x, enemy.y, 'status-slow').setOrigin(0.5, 0.5).setVisible(false)
    slowIcon.setScale(0.9)
    slowIcon.setAlpha(0.95)

    enemy.once(Phaser.GameObjects.Events.DESTROY, () => {
      slowIcon.destroy()
    })

    const next: EnemyVfx = { slowIcon }
    this.vfx.set(enemy, next)
    return next
  }
}


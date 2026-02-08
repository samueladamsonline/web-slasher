import * as Phaser from 'phaser'
import { DEPTH_PLAYER, HERO_H, HERO_W } from '../game/constants'
import type { Facing } from '../game/types'

export class Hero extends Phaser.Physics.Arcade.Sprite {
  private facing: Facing = 'down'
  private moveVec = new Phaser.Math.Vector2()

  static preload(scene: Phaser.Scene) {
    scene.load.spritesheet('hero', '/sprites/hero.png', { frameWidth: HERO_W, frameHeight: HERO_H })
  }

  static ensureAnims(scene: Phaser.Scene) {
    const facings: Facing[] = ['down', 'up', 'left', 'right']
    for (const facing of facings) {
      const key = `hero-walk-${facing}`
      if (scene.anims.exists(key)) continue
      scene.anims.create({
        key,
        frames: [
          { key: 'hero', frame: Hero.frameFor(facing, 0) },
          { key: 'hero', frame: Hero.frameFor(facing, 1) },
          { key: 'hero', frame: Hero.frameFor(facing, 2) },
          { key: 'hero', frame: Hero.frameFor(facing, 1) },
        ],
        frameRate: 10,
        repeat: -1,
      })
    }
  }

  static frameFor(facing: Facing, step: 0 | 1 | 2) {
    const rowByFacing: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 }
    return rowByFacing[facing] * 3 + step
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'hero', Hero.frameFor('down', 0))

    Hero.ensureAnims(scene)

    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setOrigin(0.5, 0.8)
    this.setDepth(DEPTH_PLAYER)
    this.setCollideWorldBounds(true)

    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(28, 28)
    body.setOffset((HERO_W - 28) / 2, HERO_H - 28 - 8)
  }

  getFacing() {
    return this.facing
  }

  setFacing(facing: Facing) {
    this.facing = facing
    // If we're idle, update the displayed direction immediately.
    if (!this.anims.isPlaying) this.setFrame(Hero.frameFor(this.facing, 0))
  }

  stopMoving() {
    this.setVelocity(0, 0)
    this.anims.stop()
    this.setFrame(Hero.frameFor(this.facing, 0))
  }

  applyMovement(vx: number, vy: number, speed: number) {
    const moving = vx !== 0 || vy !== 0

    if (moving) {
      if (vx !== 0) this.facing = vx > 0 ? 'right' : 'left'
      else this.facing = vy > 0 ? 'down' : 'up'

      this.moveVec.set(vx, vy).normalize()
      this.setVelocity(this.moveVec.x * speed, this.moveVec.y * speed)
      this.anims.play(`hero-walk-${this.facing}`, true)
    } else {
      this.stopMoving()
    }
  }
}

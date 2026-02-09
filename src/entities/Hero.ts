import * as Phaser from 'phaser'
import { DEPTH_PLAYER, HERO_H, HERO_W } from '../game/constants'
import type { Facing } from '../game/types'
import { StateMachine } from '../game/StateMachine'

export type HeroState = 'idle' | 'walk' | 'attack' | 'hurt'
export type HeroIntent = { vx: number; vy: number; attackPressed: boolean }
export type HeroAttackTiming = { windupMs: number; activeMs: number; recoveryMs: number }
export type HeroUpdateResult = { didStartAttack: boolean; didStrike: boolean }

export class Hero extends Phaser.Physics.Arcade.Sprite {
  private readonly fsm: StateMachine<HeroState, Hero>
  private facing: Facing = 'down'
  private moveVec = new Phaser.Math.Vector2()

  private intent: HeroIntent = { vx: 0, vy: 0, attackPressed: false }
  private moveSpeed = 0
  private attackTiming: HeroAttackTiming = { windupMs: 70, activeMs: 70, recoveryMs: 120 }
  private didStartAttack = false
  private didStrike = false
  private attackStrikeAt = 0
  private attackStruck = false
  private attackUntil = 0

  private hurtVx = 0
  private hurtVy = 0
  private hurtStopAt = 0
  private hurtUntil = 0

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

    this.fsm = new StateMachine<HeroState, Hero>({
      initial: 'idle',
      now: scene.time.now,
      handlers: {
        idle: {
          onEnter: (h) => h.stopMoving(),
          onUpdate: (h, now) => {
            if (h.intent.attackPressed) {
              h.fsm.transition('attack', h, now)
              return
            }
            if (h.intent.vx !== 0 || h.intent.vy !== 0) h.fsm.transition('walk', h, now)
          },
        },
        walk: {
          onUpdate: (h, now) => {
            if (h.intent.attackPressed) {
              h.fsm.transition('attack', h, now)
              return
            }
            if (h.intent.vx === 0 && h.intent.vy === 0) {
              h.fsm.transition('idle', h, now)
              return
            }
            h.applyMovement(h.intent.vx, h.intent.vy, h.moveSpeed)
          },
        },
        attack: {
          onEnter: (h, _prev, now) => {
            h.didStartAttack = true
            h.attackStruck = false
            h.attackStrikeAt = now + Math.max(0, Math.floor(h.attackTiming.windupMs))
            h.attackUntil =
              h.attackStrikeAt +
              Math.max(0, Math.floor(h.attackTiming.activeMs)) +
              Math.max(0, Math.floor(h.attackTiming.recoveryMs))
            h.setVelocity(0, 0)
            h.anims.stop()
            h.setFrame(Hero.frameFor(h.facing, 0))
          },
          onUpdate: (h, now) => {
            h.setVelocity(0, 0)
            if (!h.attackStruck && now >= h.attackStrikeAt) {
              h.attackStruck = true
              h.didStrike = true
            }
            if (now < h.attackUntil) return
            if (h.intent.vx !== 0 || h.intent.vy !== 0) h.fsm.transition('walk', h, now)
            else h.fsm.transition('idle', h, now)
          },
        },
        hurt: {
          onEnter: (h) => {
            h.anims.stop()
            h.setFrame(Hero.frameFor(h.facing, 0))
            h.setVelocity(h.hurtVx, h.hurtVy)
          },
          onUpdate: (h, now) => {
            if (now >= h.hurtStopAt) h.setVelocity(0, 0)
            if (now < h.hurtUntil) return
            if (h.intent.vx !== 0 || h.intent.vy !== 0) h.fsm.transition('walk', h, now)
            else h.fsm.transition('idle', h, now)
          },
        },
      },
    })
  }

  getState(): HeroState {
    return this.fsm.getState()
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

  updateFsm(now: number, dt: number, intent: HeroIntent, opts: { moveSpeed: number; attackTiming?: HeroAttackTiming }): HeroUpdateResult {
    this.intent = intent
    this.moveSpeed = opts.moveSpeed
    this.didStartAttack = false
    this.didStrike = false
    if (opts.attackTiming) this.attackTiming = opts.attackTiming
    this.fsm.update(this, now, dt)
    return { didStartAttack: this.didStartAttack, didStrike: this.didStrike }
  }

  hurt(now: number, knockback: { vx: number; vy: number }, opts?: { lockMs?: number; stopMs?: number }) {
    const lockMs = Math.max(0, Math.floor(opts?.lockMs ?? 220))
    const stopMs = Math.max(0, Math.floor(opts?.stopMs ?? 120))
    this.hurtVx = knockback.vx
    this.hurtVy = knockback.vy
    this.hurtStopAt = now + stopMs
    this.hurtUntil = now + lockMs
    this.fsm.transition('hurt', this, now)
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

import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { StateMachine } from '../game/StateMachine'

type EnemyController = {
  update: (now: number, dt: number) => void
  onDamaged: (now: number) => void
}

type SlimeState = 'wander' | 'leash' | 'hitstun'
type SlimeCtx = { enemy: Enemy; seed: number; hitstunUntil: number }

type BatState = 'hover' | 'chase' | 'retreat' | 'leash' | 'hitstun'
type BatCtx = { enemy: Enemy; hitstunUntil: number; retreatUntil: number; retreatCooldownUntil: number }

type EnemyDamagedEvent = { enemy: Enemy; now: number }

export class EnemyAISystem {
  private scene: Phaser.Scene
  private player: Phaser.Physics.Arcade.Sprite
  private getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined

  private controllers = new WeakMap<Enemy, EnemyController>()

  constructor(scene: Phaser.Scene, player: Phaser.Physics.Arcade.Sprite, getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined) {
    this.scene = scene
    this.player = player
    this.getEnemyGroup = getEnemyGroup

    this.scene.events.on('enemy:damaged', this.onEnemyDamaged)
  }

  destroy() {
    this.scene.events.off('enemy:damaged', this.onEnemyDamaged)
  }

  update(now: number, dt: number) {
    const group = this.getEnemyGroup()
    if (!group) return

    const enemies = group.getChildren() as unknown as Phaser.GameObjects.GameObject[]
    for (const go of enemies) {
      if (!(go instanceof Enemy)) continue
      if (!go.active) continue
      const body = go.body as Phaser.Physics.Arcade.Body | null
      if (!body || !body.enable) continue
      this.getController(go).update(now, dt)
    }
  }

  private onEnemyDamaged = (ev: unknown) => {
    const e = ev as Partial<EnemyDamagedEvent> | null
    if (!e) return
    const enemy = e.enemy
    const now = e.now
    if (!(enemy instanceof Enemy)) return
    if (typeof now !== 'number') return
    this.getController(enemy).onDamaged(now)
  }

  private getController(enemy: Enemy): EnemyController {
    const existing = this.controllers.get(enemy)
    if (existing) return existing

    const next = enemy.kind === 'bat' ? this.createBatController(enemy) : this.createSlimeController(enemy)
    this.controllers.set(enemy, next)
    return next
  }

  private createSlimeController(enemy: Enemy): EnemyController {
    const seed = Math.floor((enemy.spawnX + enemy.spawnY) / 16) % 4
    const ctx: SlimeCtx = { enemy, seed, hitstunUntil: 0 }

    const dirs = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ] as const

    const shouldLeash = () => {
      const leash = enemy.getLeashRadius()
      if (!(leash > 0)) return false
      const dx = enemy.spawnX - enemy.x
      const dy = enemy.spawnY - enemy.y
      return Math.hypot(dx, dy) > leash
    }

    const goHome = () => {
      const speed = enemy.getMoveSpeed()
      const dx = enemy.spawnX - enemy.x
      const dy = enemy.spawnY - enemy.y
      const len = Math.hypot(dx, dy)
      if (len < 0.0001 || speed <= 0) {
        enemy.setVelocity(0, 0)
        return
      }
      enemy.setVelocity((dx / len) * speed, (dy / len) * speed)
    }

    const fsm = new StateMachine<SlimeState, SlimeCtx>({
      initial: 'wander',
      now: this.scene.time.now,
      handlers: {
        wander: {
          onUpdate: (c, now) => {
            if (shouldLeash()) {
              fsm.transition('leash', c, now)
              return
            }

            const speed = enemy.getMoveSpeed()
            const phase = (Math.floor(now / 900) + c.seed) % 4
            const d = dirs[phase]!

            const body = enemy.body as Phaser.Physics.Arcade.Body
            const blocked =
              (d.x > 0 && body.blocked.right) ||
              (d.x < 0 && body.blocked.left) ||
              (d.y > 0 && body.blocked.down) ||
              (d.y < 0 && body.blocked.up)
            const dd = blocked ? dirs[(phase + 1) % 4]! : d
            enemy.setVelocity(dd.x * speed, dd.y * speed)
          },
        },
        leash: {
          onUpdate: (c, now) => {
            if (!shouldLeash()) {
              fsm.transition('wander', c, now)
              return
            }
            goHome()
          },
        },
        hitstun: {
          onUpdate: (c, now) => {
            if (now < c.hitstunUntil) return
            fsm.transition(shouldLeash() ? 'leash' : 'wander', c, now)
          },
        },
      },
    })

    return {
      update: (now, dt) => fsm.update(ctx, now, dt),
      onDamaged: (now) => {
        // Keep this short so wander/chase resumes quickly after knockback.
        ctx.hitstunUntil = now + Math.max(120, Math.min(240, Math.floor(enemy.stats.invulnMs)))
        fsm.transition('hitstun', ctx, now)
      },
    }
  }

  private createBatController(enemy: Enemy): EnemyController {
    const ctx: BatCtx = { enemy, hitstunUntil: 0, retreatUntil: 0, retreatCooldownUntil: 0 }

    const shouldLeash = () => {
      const leash = enemy.getLeashRadius()
      if (!(leash > 0)) return false
      const dx = enemy.spawnX - enemy.x
      const dy = enemy.spawnY - enemy.y
      return Math.hypot(dx, dy) > leash
    }

    const goHome = () => {
      const speed = enemy.getMoveSpeed()
      const dx = enemy.spawnX - enemy.x
      const dy = enemy.spawnY - enemy.y
      const len = Math.hypot(dx, dy)
      if (len < 0.0001 || speed <= 0) {
        enemy.setVelocity(0, 0)
        return
      }
      enemy.setVelocity((dx / len) * speed, (dy / len) * speed)
    }

    const getPlayerVec = () => {
      const dx = this.player.x - enemy.x
      const dy = this.player.y - enemy.y
      const dist0 = Math.hypot(dx, dy)
      // If the player is exactly on top of the bat, pick a stable fallback direction so retreat works.
      if (dist0 < 0.0001) return { dx: 1, dy: 0, dist: 1 }
      return { dx, dy, dist: dist0 }
    }

    const startRetreatIfTouching = (now: number) => {
      const { dist } = getPlayerVec()
      const touchDist = 44
      if (dist >= touchDist) return false
      if (now < ctx.retreatCooldownUntil) return false
      ctx.retreatUntil = now + 340
      ctx.retreatCooldownUntil = now + 650
      return true
    }

    const chase = () => {
      const speed = enemy.getMoveSpeed()
      const { dx, dy, dist } = getPlayerVec()
      if (dist < 0.0001 || speed <= 0) {
        enemy.setVelocity(0, 0)
        return
      }
      enemy.setVelocity((dx / dist) * speed, (dy / dist) * speed)
    }

    const retreat = () => {
      const speed = enemy.getMoveSpeed()
      const { dx, dy, dist } = getPlayerVec()
      if (dist < 0.0001 || speed <= 0) {
        enemy.setVelocity(0, 0)
        return
      }
      enemy.setVelocity((-dx / dist) * speed * 1.1, (-dy / dist) * speed * 1.1)
    }

    const hover = (now: number) => {
      const speed = enemy.getMoveSpeed()
      const t = now / 1000
      const hoverX = enemy.spawnX + Math.sin(t * 1.7) * 26
      const hoverY = enemy.spawnY + Math.cos(t * 2.1) * 18
      const vx = hoverX - enemy.x
      const vy = hoverY - enemy.y
      const len = Math.hypot(vx, vy)
      if (len < 1 || speed <= 0) {
        enemy.setVelocity(0, 0)
        return
      }
      enemy.setVelocity((vx / len) * speed * 0.6, (vy / len) * speed * 0.6)
    }

    const fsm = new StateMachine<BatState, BatCtx>({
      initial: 'hover',
      now: this.scene.time.now,
      handlers: {
        hover: {
          onUpdate: (c, now) => {
            if (shouldLeash()) {
              fsm.transition('leash', c, now)
              return
            }
            if (startRetreatIfTouching(now)) {
              fsm.transition('retreat', c, now)
              return
            }
            const aggro = enemy.getAggroRadius() || 260
            const { dist } = getPlayerVec()
            if (dist < aggro) {
              fsm.transition('chase', c, now)
              return
            }
            hover(now)
          },
        },
        chase: {
          onUpdate: (c, now) => {
            if (shouldLeash()) {
              fsm.transition('leash', c, now)
              return
            }
            if (startRetreatIfTouching(now)) {
              fsm.transition('retreat', c, now)
              return
            }
            const aggro = enemy.getAggroRadius() || 260
            const { dist } = getPlayerVec()
            if (dist > aggro * 1.15) {
              fsm.transition('hover', c, now)
              return
            }
            chase()
          },
        },
        retreat: {
          onUpdate: (c, now) => {
            if (shouldLeash()) {
              fsm.transition('leash', c, now)
              return
            }
            if (now >= c.retreatUntil) {
              const aggro = enemy.getAggroRadius() || 260
              const { dist } = getPlayerVec()
              fsm.transition(dist < aggro ? 'chase' : 'hover', c, now)
              return
            }
            retreat()
          },
        },
        leash: {
          onUpdate: (c, now) => {
            if (!shouldLeash()) {
              const aggro = enemy.getAggroRadius() || 260
              const { dist } = getPlayerVec()
              fsm.transition(dist < aggro ? 'chase' : 'hover', c, now)
              return
            }
            goHome()
          },
        },
        hitstun: {
          onUpdate: (c, now) => {
            if (now < c.hitstunUntil) return
            if (shouldLeash()) {
              fsm.transition('leash', c, now)
              return
            }
            const aggro = enemy.getAggroRadius() || 260
            const { dist } = getPlayerVec()
            fsm.transition(dist < aggro ? 'chase' : 'hover', c, now)
          },
        },
      },
    })

    return {
      update: (now, dt) => fsm.update(ctx, now, dt),
      onDamaged: (now) => {
        ctx.hitstunUntil = now + Math.max(120, Math.min(240, Math.floor(enemy.stats.invulnMs)))
        // Cancel retreat so the bat doesn't immediately re-enter it after hit-stun ends.
        ctx.retreatUntil = 0
        fsm.transition('hitstun', ctx, now)
      },
    }
  }
}

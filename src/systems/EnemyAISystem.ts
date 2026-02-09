import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { StateMachine } from '../game/StateMachine'
import { offGameEvent, onGameEvent, GAME_EVENTS, type GameEventMap } from '../game/events'

type EnemyController = {
  update: (now: number, dt: number) => void
  onDamaged: (now: number) => void
}

type SlimeState = 'wander' | 'leash' | 'hitstun'
type SlimeCtx = { enemy: Enemy; seed: number; hitstunUntil: number }

type BatState = 'hover' | 'chase' | 'hitstun'
type BatCtx = { enemy: Enemy; hitstunUntil: number }

type EnemyDamagedEvent = GameEventMap[typeof GAME_EVENTS.ENEMY_DAMAGED]

export class EnemyAISystem {
  private scene: Phaser.Scene
  private player: Phaser.Physics.Arcade.Sprite
  private getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined
  private isWorldBlocked?: (x: number, y: number) => boolean

  private controllers = new WeakMap<Enemy, EnemyController>()
  private lastSafePos = new WeakMap<Enemy, { x: number; y: number }>()

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined,
    opts?: { isWorldBlocked?: (x: number, y: number) => boolean },
  ) {
    this.scene = scene
    this.player = player
    this.getEnemyGroup = getEnemyGroup
    this.isWorldBlocked = opts?.isWorldBlocked

    onGameEvent(this.scene.events, GAME_EVENTS.ENEMY_DAMAGED, this.onEnemyDamaged)
  }

  destroy() {
    offGameEvent(this.scene.events, GAME_EVENTS.ENEMY_DAMAGED, this.onEnemyDamaged)
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
      this.recordSafePos(go)
      this.getController(go).update(now, dt)
      this.enforceNotInBlockedTile(go)
    }
  }

  private recordSafePos(enemy: Enemy) {
    if (!this.isWorldBlocked) return
    const body = enemy.body as Phaser.Physics.Arcade.Body | null
    const cxRaw = body?.center?.x
    const cyRaw = body?.center?.y
    const cx = Number.isFinite(cxRaw) ? (cxRaw as number) : enemy.x
    const cy = Number.isFinite(cyRaw) ? (cyRaw as number) : enemy.y
    if (this.isWorldBlocked(cx, cy)) return
    this.lastSafePos.set(enemy, { x: enemy.x, y: enemy.y })
  }

  private enforceNotInBlockedTile(enemy: Enemy) {
    if (!this.isWorldBlocked) return
    const body = enemy.body as Phaser.Physics.Arcade.Body | null
    const cxRaw = body?.center?.x
    const cyRaw = body?.center?.y
    const cx = Number.isFinite(cxRaw) ? (cxRaw as number) : enemy.x
    const cy = Number.isFinite(cyRaw) ? (cyRaw as number) : enemy.y
    if (!this.isWorldBlocked(cx, cy)) return

    const safe = this.lastSafePos.get(enemy) ?? { x: enemy.spawnX, y: enemy.spawnY }
    if (body && typeof body.reset === 'function') body.reset(safe.x, safe.y)
    else enemy.setPosition(safe.x, safe.y)
    enemy.setVelocity(0, 0)
  }

  private onEnemyDamaged = (ev: EnemyDamagedEvent) => {
    this.getController(ev.enemy).onDamaged(ev.now)
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
        ctx.hitstunUntil = now + Math.max(0, Math.floor(enemy.getHitstunMs()))
        fsm.transition('hitstun', ctx, now)
      },
    }
  }

  private createBatController(enemy: Enemy): EnemyController {
    const ctx: BatCtx = { enemy, hitstunUntil: 0 }

    const getPlayerCenter = () => {
      const body = this.player.body as Phaser.Physics.Arcade.Body | undefined
      const cx = body?.center?.x
      const cy = body?.center?.y
      return {
        x: Number.isFinite(cx) ? (cx as number) : this.player.x,
        y: Number.isFinite(cy) ? (cy as number) : this.player.y,
      }
    }

    const getEnemyCenter = () => {
      const body = enemy.body as Phaser.Physics.Arcade.Body | undefined
      const cx = body?.center?.x
      const cy = body?.center?.y
      return { x: Number.isFinite(cx) ? (cx as number) : enemy.x, y: Number.isFinite(cy) ? (cy as number) : enemy.y }
    }

    const getPlayerVec = () => {
      const p = getPlayerCenter()
      const e = getEnemyCenter()
      const dx = p.x - e.x
      const dy = p.y - e.y
      const dist0 = Math.hypot(dx, dy)
      if (!Number.isFinite(dist0)) return { dx: 0, dy: 0, dist: 0 }
      return { dx, dy, dist: dist0 }
    }

    const chase = (dt: number) => {
      const speed = enemy.getMoveSpeed()
      const { dx, dy, dist } = getPlayerVec()
      if (dist <= 0.5 || speed <= 0) {
        enemy.setVelocity(0, 0)
        return
      }
      const dtSec = Math.max(0.001, dt / 1000)
      const maxSpeed = Math.min(speed, dist / dtSec)
      enemy.setVelocity((dx / dist) * maxSpeed, (dy / dist) * maxSpeed)
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
          onUpdate: (c, now, dt) => {
            const aggro = enemy.getAggroRadius() || 260
            const { dist } = getPlayerVec()
            if (dist > aggro * 1.15) {
              fsm.transition('hover', c, now)
              return
            }
            chase(dt)
          },
        },
        hitstun: {
          onUpdate: (c, now) => {
            if (now < c.hitstunUntil) return
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
        ctx.hitstunUntil = now + Math.max(0, Math.floor(enemy.getHitstunMs()))
        fsm.transition('hitstun', ctx, now)
      },
    }
  }
}

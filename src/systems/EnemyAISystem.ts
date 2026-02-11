import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { StateMachine } from '../game/StateMachine'
import { offGameEvent, onGameEvent, GAME_EVENTS, type GameEventMap } from '../game/events'
import {
  canStartAttack,
  computeStrikeCenter,
  createAttackState,
  isAttackLocked,
  startAttack,
  updateAttack,
  type AttackState,
} from './enemyAI/attackModel'
import { resolveBatTransition, type BatMode } from './enemyAI/batTransitions'

type EnemyController = {
  update: (now: number, dt: number) => void
  onDamaged: (now: number) => void
}

type SlimeState = 'wander' | 'leash' | 'hitstun'
type SlimeCtx = { enemy: Enemy; seed: number; hitstunUntil: number; attack: AttackState }

type BatState = BatMode
type BatCtx = { enemy: Enemy; hitstunUntil: number; aggroCooldownUntil: number; returningFromLeash: boolean; attack: AttackState }

type EnemyDamagedEvent = GameEventMap[typeof GAME_EVENTS.ENEMY_DAMAGED]
type PathResult = { points: Array<{ x: number; y: number }> }

export type EnemyStrikePayload = {
  enemy: Enemy
  now: number
  sourceX: number
  sourceY: number
  damage: number
  knockback: number
  hitRadius: number
}

export class EnemyAISystem {
  private scene: Phaser.Scene
  private player: Phaser.Physics.Arcade.Sprite
  private getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined
  private findPath?: (fromX: number, fromY: number, toX: number, toY: number) => PathResult | null
  private hasLineOfSight?: (fromX: number, fromY: number, toX: number, toY: number) => boolean
  private onEnemyStrike?: (strike: EnemyStrikePayload) => void

  private controllers = new WeakMap<Enemy, EnemyController>()

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined,
    opts?: {
      findPath?: (fromX: number, fromY: number, toX: number, toY: number) => PathResult | null
      hasLineOfSight?: (fromX: number, fromY: number, toX: number, toY: number) => boolean
      onEnemyStrike?: (strike: EnemyStrikePayload) => void
    },
  ) {
    this.scene = scene
    this.player = player
    this.getEnemyGroup = getEnemyGroup
    this.findPath = opts?.findPath
    this.hasLineOfSight = opts?.hasLineOfSight
    this.onEnemyStrike = opts?.onEnemyStrike

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
      this.getController(go).update(now, dt)
    }
  }

  private onEnemyDamaged = (ev: EnemyDamagedEvent) => {
    this.getController(ev.enemy).onDamaged(ev.now)
  }

  private getController(enemy: Enemy): EnemyController {
    const existing = this.controllers.get(enemy)
    if (existing) return existing

    const batLike = enemy.kind === 'bat' || enemy.kind === 'wisp' || enemy.kind === 'imp' || enemy.kind === 'bone_lord'
    const next = batLike ? this.createBatController(enemy) : this.createSlimeController(enemy)
    this.controllers.set(enemy, next)
    return next
  }

  private getPlayerCenter() {
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined
    const cx = body?.center?.x
    const cy = body?.center?.y
    return {
      x: Number.isFinite(cx) ? (cx as number) : this.player.x,
      y: Number.isFinite(cy) ? (cy as number) : this.player.y,
    }
  }

  private getPlayerRadius() {
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined
    const w = typeof body?.width === 'number' ? body.width : 0
    const h = typeof body?.height === 'number' ? body.height : 0
    return Math.max(6, Math.max(w, h) * 0.5 + 4)
  }

  private getEnemyCenter(enemy: Enemy) {
    const body = enemy.body as Phaser.Physics.Arcade.Body | undefined
    const cx = body?.center?.x
    const cy = body?.center?.y
    return {
      x: Number.isFinite(cx) ? (cx as number) : enemy.x,
      y: Number.isFinite(cy) ? (cy as number) : enemy.y,
    }
  }

  private tryBeginAttack(enemy: Enemy, attack: AttackState, now: number, dx: number, dy: number) {
    if (enemy.getMoveSpeed() <= 0) return false
    if (!canStartAttack(enemy, attack, now)) return false

    const atk = enemy.getAttackConfig()
    const playerRadius = this.getPlayerRadius()
    const dist = Math.hypot(dx, dy)
    const startRange = atk.hitbox.offset + atk.hitbox.radius + playerRadius + 4
    if (dist > startRange) return false

    startAttack(enemy, attack, now, { x: dx, y: dy })
    enemy.setVelocity(0, 0)
    this.tickAttack(enemy, attack, now)
    return true
  }

  private tickAttack(enemy: Enemy, attack: AttackState, now: number) {
    if (enemy.getMoveSpeed() <= 0) return
    const tick = updateAttack(enemy, attack, now)
    if (!tick.shouldStrike || !this.onEnemyStrike) return

    const atk = enemy.getAttackConfig()
    const e = this.getEnemyCenter(enemy)
    const hit = computeStrikeCenter(e.x, e.y, atk.hitbox.offset, attack.aim)
    const player = this.getPlayerCenter()
    if (this.hasLineOfSight && !this.hasLineOfSight(hit.x, hit.y, player.x, player.y)) return

    this.onEnemyStrike({
      enemy,
      now,
      sourceX: hit.x,
      sourceY: hit.y,
      damage: atk.damage,
      knockback: atk.knockback,
      hitRadius: atk.hitbox.radius,
    })
  }

  private createSlimeController(enemy: Enemy): EnemyController {
    const seed = Math.floor((enemy.spawnX + enemy.spawnY) / 16) % 4
    const ctx: SlimeCtx = { enemy, seed, hitstunUntil: 0, attack: createAttackState() }

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

            const p = this.getPlayerCenter()
            const e = this.getEnemyCenter(enemy)
            const dx = p.x - e.x
            const dy = p.y - e.y
            if (this.tryBeginAttack(enemy, c.attack, now, dx, dy)) return
            if (isAttackLocked(c.attack)) {
              enemy.setVelocity(0, 0)
              this.tickAttack(enemy, c.attack, now)
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
            if (isAttackLocked(c.attack)) {
              enemy.setVelocity(0, 0)
              this.tickAttack(enemy, c.attack, now)
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
      update: (now, dt) => {
        if (enemy.getMoveSpeed() <= 0) {
          enemy.setVelocity(0, 0)
          this.cancelAttack(ctx.attack)
          return
        }
        this.tickAttack(enemy, ctx.attack, now)
        fsm.update(ctx, now, dt)
      },
      onDamaged: (now) => {
        ctx.hitstunUntil = now + Math.max(0, Math.floor(enemy.getHitstunMs()))
        ctx.attack.phase = 'ready'
        ctx.attack.phaseUntil = 0
        ctx.attack.didStrike = false
        fsm.transition('hitstun', ctx, now)
      },
    }
  }

  private createBatController(enemy: Enemy): EnemyController {
    const ctx: BatCtx = { enemy, hitstunUntil: 0, aggroCooldownUntil: 0, returningFromLeash: false, attack: createAttackState() }

    const PATH_RECALC_MS = 220
    const WAYPOINT_RADIUS = 6
    const STUCK_TIMEOUT_MS = 350
    const HOME_RADIUS = 14

    const pathState = {
      targetKey: '',
      points: [] as Array<{ x: number; y: number }>,
      index: 0,
      lastComputeAt: -Infinity,
      lastTarget: { x: 0, y: 0 },
      lastProgressAt: 0,
      lastDist: Number.POSITIVE_INFINITY,
      mode: 'path' as 'path' | 'direct',
    }

    const clearPath = () => {
      pathState.points = []
      pathState.index = 0
      pathState.lastComputeAt = -Infinity
      pathState.lastProgressAt = 0
      pathState.lastDist = Number.POSITIVE_INFINITY
      pathState.mode = 'path'
    }

    const getPlayerVec = () => {
      const p = this.getPlayerCenter()
      const e = this.getEnemyCenter(enemy)
      const dx = p.x - e.x
      const dy = p.y - e.y
      const dist0 = Math.hypot(dx, dy)
      if (!Number.isFinite(dist0)) return { dx: 0, dy: 0, dist: 0 }
      return { dx, dy, dist: dist0 }
    }

    const seek = (targetX: number, targetY: number, dt: number) => {
      const speed = enemy.getMoveSpeed()
      const e = this.getEnemyCenter(enemy)
      const dx = targetX - e.x
      const dy = targetY - e.y
      const dist = Math.hypot(dx, dy)
      if (dist <= 0.5 || speed <= 0) {
        enemy.setVelocity(0, 0)
        return dist
      }
      const dtSec = Math.max(0.001, dt / 1000)
      const maxSpeed = Math.min(speed, dist / dtSec)
      enemy.setVelocity((dx / dist) * maxSpeed, (dy / dist) * maxSpeed)
      return dist
    }

    const shouldLeash = () => {
      const leash = enemy.getLeashRadius()
      if (!(leash > 0)) return false
      const dx = enemy.spawnX - enemy.x
      const dy = enemy.spawnY - enemy.y
      return Math.hypot(dx, dy) > leash
    }

    const playerWithinLeashTerritory = () => {
      const leash = enemy.getLeashRadius()
      if (!(leash > 0)) return true
      const p = this.getPlayerCenter()
      return Math.hypot(p.x - enemy.spawnX, p.y - enemy.spawnY) <= leash
    }

    const followTarget = (targetX: number, targetY: number, key: string, now: number, dt: number) => {
      if (pathState.targetKey !== key) {
        pathState.targetKey = key
        clearPath()
      }

      const e0 = this.getEnemyCenter(enemy)
      const lineOfSight = this.hasLineOfSight?.(e0.x, e0.y, targetX, targetY) ?? true

      let forcePath = false
      if (lineOfSight) {
        if (pathState.mode !== 'direct') {
          pathState.mode = 'direct'
          pathState.lastDist = Number.POSITIVE_INFINITY
          pathState.lastProgressAt = now
        }
        pathState.lastTarget = { x: targetX, y: targetY }
        const dist = seek(targetX, targetY, dt)
        if (dist < pathState.lastDist - 0.5) {
          pathState.lastDist = dist
          pathState.lastProgressAt = now
          return
        }
        if (now - pathState.lastProgressAt <= STUCK_TIMEOUT_MS) return

        forcePath = true
        clearPath()
      }

      if (pathState.mode !== 'path') {
        pathState.mode = 'path'
        pathState.lastDist = Number.POSITIVE_INFINITY
        pathState.lastProgressAt = now
      }

      const targetMoved = Math.hypot(targetX - pathState.lastTarget.x, targetY - pathState.lastTarget.y) > 12
      const shouldRepath =
        !this.findPath ||
        targetMoved ||
        now - pathState.lastComputeAt > PATH_RECALC_MS ||
        pathState.points.length === 0

      if ((forcePath || shouldRepath) && this.findPath) {
        const res = this.findPath(e0.x, e0.y, targetX, targetY)
        if (res?.points?.length) {
          pathState.points = res.points
          pathState.index = 0
          pathState.lastDist = Number.POSITIVE_INFINITY
          pathState.lastProgressAt = now
        } else {
          pathState.points = []
          pathState.index = 0
        }
        pathState.lastComputeAt = now
      }

      pathState.lastTarget = { x: targetX, y: targetY }

      let target = pathState.points[pathState.index]
      const e = this.getEnemyCenter(enemy)
      const startIdx = pathState.index
      while (target) {
        const dist = Math.hypot(target.x - e.x, target.y - e.y)
        if (dist > WAYPOINT_RADIUS || pathState.index >= pathState.points.length - 1) break
        pathState.index += 1
        target = pathState.points[pathState.index]
      }

      if (pathState.index !== startIdx) {
        pathState.lastDist = Number.POSITIVE_INFINITY
        pathState.lastProgressAt = now
      }

      if (!target) {
        seek(targetX, targetY, dt)
        return
      }

      const dist = seek(target.x, target.y, dt)
      if (dist < pathState.lastDist - 0.5) {
        pathState.lastDist = dist
        pathState.lastProgressAt = now
      } else if (now - pathState.lastProgressAt > STUCK_TIMEOUT_MS) {
        clearPath()
      }
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
            const next = resolveBatTransition({
              mode: 'hover',
              now,
              distToPlayer: dist,
              aggroRadius: aggro,
              shouldLeash: shouldLeash(),
              playerWithinLeashTerritory: playerWithinLeashTerritory(),
              aggroCooldownUntil: c.aggroCooldownUntil,
              returningFromLeash: c.returningFromLeash,
            })
            c.aggroCooldownUntil = next.aggroCooldownUntil
            c.returningFromLeash = next.returningFromLeash
            if (next.nextMode !== 'hover') {
              fsm.transition(next.nextMode, c, now)
              return
            }
            if (enemy.kind === 'bone_lord') enemy.setVelocity(0, 0)
            else hover(now)
          },
        },
        chase: {
          onUpdate: (c, now, dt) => {
            const aggro = enemy.getAggroRadius() || 260
            const { dx, dy, dist } = getPlayerVec()

            const next = resolveBatTransition({
              mode: 'chase',
              now,
              distToPlayer: dist,
              aggroRadius: aggro,
              shouldLeash: shouldLeash(),
              playerWithinLeashTerritory: playerWithinLeashTerritory(),
              aggroCooldownUntil: c.aggroCooldownUntil,
              returningFromLeash: c.returningFromLeash,
            })
            c.aggroCooldownUntil = next.aggroCooldownUntil
            c.returningFromLeash = next.returningFromLeash
            if (next.nextMode !== 'chase') {
              fsm.transition(next.nextMode, c, now)
              return
            }

            if (this.tryBeginAttack(enemy, c.attack, now, dx, dy)) return
            if (isAttackLocked(c.attack)) {
              enemy.setVelocity(0, 0)
              this.tickAttack(enemy, c.attack, now)
              return
            }

            const p = this.getPlayerCenter()
            followTarget(p.x, p.y, 'player', now, dt)
          },
        },
        return: {
          onUpdate: (c, now, dt) => {
            if (isAttackLocked(c.attack)) {
              enemy.setVelocity(0, 0)
              this.tickAttack(enemy, c.attack, now)
              return
            }

            const aggro = enemy.getAggroRadius() || 260
            const { dist } = getPlayerVec()
            const next = resolveBatTransition({
              mode: 'return',
              now,
              distToPlayer: dist,
              aggroRadius: aggro,
              shouldLeash: shouldLeash(),
              playerWithinLeashTerritory: playerWithinLeashTerritory(),
              aggroCooldownUntil: c.aggroCooldownUntil,
              returningFromLeash: c.returningFromLeash,
            })
            c.aggroCooldownUntil = next.aggroCooldownUntil
            c.returningFromLeash = next.returningFromLeash
            if (next.nextMode === 'chase') {
              fsm.transition('chase', c, now)
              return
            }

            const dx = enemy.spawnX - enemy.x
            const dy = enemy.spawnY - enemy.y
            if (Math.hypot(dx, dy) <= HOME_RADIUS) {
              enemy.setVelocity(0, 0)
              c.returningFromLeash = false
              fsm.transition('hover', c, now)
              return
            }
            followTarget(enemy.spawnX, enemy.spawnY, 'spawn', now, dt)
          },
        },
        hitstun: {
          onUpdate: (c, now) => {
            if (now < c.hitstunUntil) return
            const aggro = enemy.getAggroRadius() || 260
            const { dist } = getPlayerVec()
            const next = resolveBatTransition({
              mode: 'hitstun',
              now,
              distToPlayer: dist,
              aggroRadius: aggro,
              shouldLeash: shouldLeash(),
              playerWithinLeashTerritory: playerWithinLeashTerritory(),
              aggroCooldownUntil: c.aggroCooldownUntil,
              returningFromLeash: c.returningFromLeash,
            })
            c.aggroCooldownUntil = next.aggroCooldownUntil
            c.returningFromLeash = next.returningFromLeash
            fsm.transition(next.nextMode, c, now)
          },
        },
      },
    })

    return {
      update: (now, dt) => {
        if (enemy.getMoveSpeed() <= 0) {
          enemy.setVelocity(0, 0)
          this.cancelAttack(ctx.attack)
          return
        }
        this.tickAttack(enemy, ctx.attack, now)
        fsm.update(ctx, now, dt)
      },
      onDamaged: (now) => {
        ctx.hitstunUntil = now + Math.max(0, Math.floor(enemy.getHitstunMs()))
        ctx.attack.phase = 'ready'
        ctx.attack.phaseUntil = 0
        ctx.attack.didStrike = false
        fsm.transition('hitstun', ctx, now)
      },
    }
  }

  private cancelAttack(attack: AttackState) {
    attack.phase = 'ready'
    attack.phaseUntil = 0
    attack.didStrike = false
  }
}

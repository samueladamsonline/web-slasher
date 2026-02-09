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

type BatState = 'hover' | 'chase' | 'retreat' | 'leash' | 'hitstun'
type BatCtx = { enemy: Enemy; hitstunUntil: number; retreatUntil: number; retreatCooldownUntil: number; retreatDir: { x: number; y: number } | null }

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
    const cx = body?.center?.x ?? enemy.x
    const cy = body?.center?.y ?? enemy.y
    if (this.isWorldBlocked(cx, cy)) return
    this.lastSafePos.set(enemy, { x: enemy.x, y: enemy.y })
  }

  private enforceNotInBlockedTile(enemy: Enemy) {
    if (!this.isWorldBlocked) return
    const body = enemy.body as Phaser.Physics.Arcade.Body | null
    const cx = body?.center?.x ?? enemy.x
    const cy = body?.center?.y ?? enemy.y
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
    const ctx: BatCtx = { enemy, hitstunUntil: 0, retreatUntil: 0, retreatCooldownUntil: 0, retreatDir: null }

    const getPlayerCenter = () => {
      const body = this.player.body as Phaser.Physics.Arcade.Body | undefined
      return { x: body?.center?.x ?? this.player.x, y: body?.center?.y ?? this.player.y }
    }

    const getPlayerRadius = () => {
      const body = this.player.body as Phaser.Physics.Arcade.Body | undefined
      const w = typeof body?.width === 'number' ? body.width : 0
      const h = typeof body?.height === 'number' ? body.height : 0
      return Math.max(w, h) * 0.5
    }

    const getEnemyCenter = () => {
      const body = enemy.body as Phaser.Physics.Arcade.Body | undefined
      return { x: body?.center?.x ?? enemy.x, y: body?.center?.y ?? enemy.y }
    }

    const isTouchingPlayer = () => {
      const pb = this.player.body as Phaser.Physics.Arcade.Body | undefined
      const eb = enemy.body as Phaser.Physics.Arcade.Body | undefined
      if (pb && eb) {
        const pad = 2
        const pLeft = pb.left - pad
        const pRight = pb.right + pad
        const pTop = pb.top - pad
        const pBottom = pb.bottom + pad
        const eLeft = eb.left - pad
        const eRight = eb.right + pad
        const eTop = eb.top - pad
        const eBottom = eb.bottom + pad
        return pLeft <= eRight && pRight >= eLeft && pTop <= eBottom && pBottom >= eTop
      }

      const { dist } = getPlayerVec()
      const touchDist = getPlayerRadius() + enemy.getTouchRadius() + 2
      return dist < touchDist
    }

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
      const p = getPlayerCenter()
      const e = getEnemyCenter()
      const dx = p.x - e.x
      const dy = p.y - e.y
      const dist0 = Math.hypot(dx, dy)
      // If the player is exactly on top of the bat, pick a stable fallback direction so retreat works.
      if (dist0 < 0.0001) return { dx: 1, dy: 0, dist: 1 }
      return { dx, dy, dist: dist0 }
    }

    const pickRetreatDir = () => {
      const body = enemy.body as Phaser.Physics.Arcade.Body | null
      const cx = body?.center?.x ?? enemy.x
      const cy = body?.center?.y ?? enemy.y

      const { dx, dy, dist } = getPlayerVec()
      // Away from the player.
      let ax = -dx / dist
      let ay = -dy / dist

      const probe = 18
      const can = (vx: number, vy: number) => {
        const len = Math.hypot(vx, vy)
        if (len < 0.0001) return false
        const nx = vx / len
        const ny = vy / len
        if (!this.isWorldBlocked) return true
        return !this.isWorldBlocked(cx + nx * probe, cy + ny * probe)
      }

      // Try the natural retreat direction first, then slide directions if blocked.
      const candidates = [
        { x: ax, y: ay },
        // Rotate 90 degrees left/right to slide along walls if needed.
        { x: ay, y: -ax },
        { x: -ay, y: ax },
        // Cardinal fallbacks.
        { x: Math.sign(ax), y: 0 },
        { x: 0, y: Math.sign(ay) },
      ]

      const chosen = candidates.find((d) => can(d.x, d.y)) ?? { x: ax, y: ay }
      const clen = Math.hypot(chosen.x, chosen.y)
      if (clen < 0.0001) return { x: 1, y: 0 }
      return { x: chosen.x / clen, y: chosen.y / clen }
    }

    const startRetreatIfTouching = (now: number) => {
      if (!isTouchingPlayer()) return false
      // Always allow a retreat when overlapping so we don't get stuck oscillating at contact distance.
      if (now < ctx.retreatCooldownUntil) {
        ctx.retreatCooldownUntil = now
      }
      ctx.retreatUntil = now + 360
      ctx.retreatCooldownUntil = now + 650
      ctx.retreatDir = pickRetreatDir()
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
      const dir = ctx.retreatDir ?? pickRetreatDir()
      if (speed <= 0) {
        enemy.setVelocity(0, 0)
        return
      }
      // Slightly faster than chase so contact creates immediate space.
      enemy.setVelocity(dir.x * speed * 1.25, dir.y * speed * 1.25)
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
        ctx.hitstunUntil = now + Math.max(0, Math.floor(enemy.getHitstunMs()))
        // Cancel retreat so the bat doesn't immediately re-enter it after hit-stun ends.
        ctx.retreatUntil = 0
        ctx.retreatDir = null
        fsm.transition('hitstun', ctx, now)
      },
    }
  }
}

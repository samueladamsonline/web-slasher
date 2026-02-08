import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'

export class EnemyAISystem {
  private player: Phaser.Physics.Arcade.Sprite
  private getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined
  private batRetreatUntil = new WeakMap<Enemy, number>()
  private batRetreatCooldownUntil = new WeakMap<Enemy, number>()

  constructor(player: Phaser.Physics.Arcade.Sprite, getEnemyGroup: () => Phaser.Physics.Arcade.Group | undefined) {
    this.player = player
    this.getEnemyGroup = getEnemyGroup
  }

  update(now: number) {
    const group = this.getEnemyGroup()
    if (!group) return

    const enemies = group.getChildren() as unknown as Phaser.GameObjects.GameObject[]
    for (const go of enemies) {
      if (!(go instanceof Enemy)) continue
      if (!go.active) continue
      this.tickEnemy(go, now)
    }
  }

  private tickEnemy(enemy: Enemy, now: number) {
    if (enemy.kind === 'slime') return this.tickSlime(enemy, now)
    if (enemy.kind === 'bat') return this.tickBat(enemy, now)
  }

  private tickSlime(enemy: Enemy, now: number) {
    const speed = enemy.getMoveSpeed()
    const leash = enemy.getLeashRadius()
    if (leash > 0) {
      const homeDx = enemy.spawnX - enemy.x
      const homeDy = enemy.spawnY - enemy.y
      const distHome = Math.hypot(homeDx, homeDy)
      if (distHome > leash) {
        const v = new Phaser.Math.Vector2(homeDx, homeDy)
        if (v.lengthSq() < 0.0001) v.set(1, 0)
        v.normalize().scale(speed)
        enemy.setVelocity(v.x, v.y)
        return
      }
    }

    const seed = Math.floor((enemy.spawnX + enemy.spawnY) / 16) % 4
    const phase = (Math.floor(now / 900) + seed) % 4

    const dirs = [
      new Phaser.Math.Vector2(1, 0),
      new Phaser.Math.Vector2(0, 1),
      new Phaser.Math.Vector2(-1, 0),
      new Phaser.Math.Vector2(0, -1),
    ]

    const d = dirs[phase]!
    const body = enemy.body as Phaser.Physics.Arcade.Body
    // If blocked, rotate direction once (keeps movement from getting stuck in walls).
    const blocked =
      (d.x > 0 && body.blocked.right) || (d.x < 0 && body.blocked.left) || (d.y > 0 && body.blocked.down) || (d.y < 0 && body.blocked.up)
    const dd = blocked ? dirs[(phase + 1) % 4]! : d
    enemy.setVelocity(dd.x * speed, dd.y * speed)
  }

  private tickBat(enemy: Enemy, now: number) {
    const speed = enemy.getMoveSpeed()
    const aggro = enemy.getAggroRadius() || 260
    const leash = enemy.getLeashRadius()

    if (leash > 0) {
      const homeDx = enemy.spawnX - enemy.x
      const homeDy = enemy.spawnY - enemy.y
      const distHome = Math.hypot(homeDx, homeDy)
      if (distHome > leash) {
        const v = new Phaser.Math.Vector2(homeDx, homeDy)
        if (v.lengthSq() < 0.0001) v.set(1, 0)
        v.normalize().scale(speed)
        enemy.setVelocity(v.x, v.y)
        return
      }
    }

    const dx = this.player.x - enemy.x
    const dy = this.player.y - enemy.y
    const dist = Math.hypot(dx, dy)

    // On contact, bats should back off briefly, then re-aggro.
    // This prevents sticky "slowdown" behavior when physics is constantly resolving contact.
    const touchDist = 44
    if (dist < touchDist) {
      const cd = this.batRetreatCooldownUntil.get(enemy) ?? 0
      if (now >= cd) {
        this.batRetreatUntil.set(enemy, now + 340)
        this.batRetreatCooldownUntil.set(enemy, now + 650)
      }
    }

    const retreatUntil = this.batRetreatUntil.get(enemy) ?? 0
    if (now < retreatUntil) {
      const v = new Phaser.Math.Vector2(-dx, -dy)
      if (v.lengthSq() < 0.0001) v.set(1, 0)
      v.normalize().scale(speed * 1.1)
      enemy.setVelocity(v.x, v.y)
      return
    }

    if (dist < aggro) {
      const v = new Phaser.Math.Vector2(dx, dy)
      if (v.lengthSq() < 0.0001) v.set(1, 0)
      v.normalize().scale(speed)
      enemy.setVelocity(v.x, v.y)
      return
    }

    // Idle hover around spawn point (deterministic, no RNG).
    const t = now / 1000
    const hoverX = enemy.spawnX + Math.sin(t * 1.7) * 26
    const hoverY = enemy.spawnY + Math.cos(t * 2.1) * 18
    const vx = hoverX - enemy.x
    const vy = hoverY - enemy.y
    const v = new Phaser.Math.Vector2(vx, vy)
    if (v.lengthSq() < 1) {
      enemy.setVelocity(0, 0)
      return
    }
    v.normalize().scale(speed * 0.6)
    enemy.setVelocity(v.x, v.y)
  }
}

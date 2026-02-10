import * as Phaser from 'phaser'
import { SPELLS, resolveSpellLevel, spellSpeedPxPerSec, type SpellGrant, type SpellId } from '../content/spells'
import { Enemy } from '../entities/Enemy'
import { SpellProjectile } from '../entities/SpellProjectile'

export type SpellDebug = { at: number; spellId: SpellId | null; level: number; hits: number }

export class SpellSystem {
  static preload(scene: Phaser.Scene) {
    // Placeholder projectile textures. Real games would load sprite assets; we generate a consistent look for now.
    const ensure = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void, size = 20) => {
      if (scene.textures.exists(key)) return
      const g = scene.add.graphics()
      draw(g)
      g.generateTexture(key, size, size)
      g.destroy()
    }

    for (const def of Object.values(SPELLS)) {
      if (def.kind !== 'projectile') continue
      ensure(def.projectileTexture, (g) => {
        const cx = 10
        const cy = 10
        g.fillStyle(def.glowColor, 0.45)
        g.fillCircle(cx, cy, 9)
        g.fillStyle(def.coreColor, 0.95)
        g.fillCircle(cx - 1, cy + 1, 5.5)
        g.fillStyle(0xffffff, 0.35)
        g.fillCircle(cx - 3, cy - 3, 2.4)
      })

      ensure(
        def.iconTexture,
        (g) => {
          // UI icon: framed tile with the spell's palette.
          g.fillStyle(0x0b111a, 0.95)
          g.fillRoundedRect(2, 2, 28, 28, 6)
          g.lineStyle(3, 0xe0c68a, 0.32)
          g.strokeRoundedRect(2, 2, 28, 28, 6)
          g.fillStyle(def.glowColor, 0.32)
          g.fillCircle(16, 16, 10)
          g.fillStyle(def.coreColor, 0.92)
          g.fillCircle(15, 17, 6)
          g.fillStyle(0xffffff, 0.25)
          g.fillCircle(13, 13, 2.6)
        },
        32,
      )
    }
  }

  private scene: Phaser.Scene
  private caster: Phaser.Physics.Arcade.Sprite
  private getEnemies: () => Phaser.Physics.Arcade.Group | undefined
  private getSelectedSpell: () => SpellGrant | null
  private getCollisionLayer?: () => Phaser.Tilemaps.TilemapLayer | null

  private projectiles: Phaser.Physics.Arcade.Group
  private wallCollider?: Phaser.Physics.Arcade.Collider
  private enemyOverlap?: Phaser.Physics.Arcade.Collider
  private worldBoundsHandler: ((body: Phaser.Physics.Arcade.Body) => void) | null = null

  private cooldownUntil = new Map<SpellId, number>()
  private lastCast: SpellDebug = { at: 0, spellId: null, level: 0, hits: 0 }

  constructor(
    scene: Phaser.Scene,
    caster: Phaser.Physics.Arcade.Sprite,
    getEnemies: () => Phaser.Physics.Arcade.Group | undefined,
    opts: { getSelectedSpell: () => SpellGrant | null; getCollisionLayer?: () => Phaser.Tilemaps.TilemapLayer | null },
  ) {
    this.scene = scene
    this.caster = caster
    this.getEnemies = getEnemies
    this.getSelectedSpell = opts.getSelectedSpell
    this.getCollisionLayer = opts.getCollisionLayer

    this.projectiles = this.scene.physics.add.group()

    this.installWorldBoundsCleanup()
  }

  destroy() {
    this.wallCollider?.destroy()
    this.enemyOverlap?.destroy()
    this.clearProjectiles()
    this.projectiles.destroy(true)

    if (this.worldBoundsHandler) {
      this.scene.physics.world.off('worldbounds', this.worldBoundsHandler)
      this.worldBoundsHandler = null
    }
  }

  onMapChanged() {
    // Projectiles from previous maps should not persist across warps.
    this.clearProjectiles()

    this.wallCollider?.destroy()
    this.enemyOverlap?.destroy()
    this.wallCollider = undefined
    this.enemyOverlap = undefined

    const enemies = this.getEnemies()
    if (enemies) {
      this.enemyOverlap = this.scene.physics.add.overlap(this.projectiles, enemies, (_p, e) => {
        const p = _p as any
        if (!(p instanceof SpellProjectile)) return
        if (p.hasHit()) return
        if (!(e instanceof Enemy)) return
        if (!p.active || !e.active) return

        // Stop on first enemy hit.
        p.markHit()
        const dmg = Number.isFinite(p.damage) ? Math.max(0, p.damage) : 0
        const hit = dmg > 0 ? e.damage(this.scene.time.now, this.caster.x, this.caster.y, dmg) : false
        if (hit) {
          this.lastCast.hits++
          const def = SPELLS[p.spellId]
          if (def && def.kind === 'projectile') {
            const resolved = resolveSpellLevel(def, p.level)
            const effects = resolved?.cfg?.onHit ?? []
            for (const fx of effects) {
              if (!fx || typeof fx !== 'object') continue
              if ((fx as any).kind === 'slow') {
                const mul = (fx as any).moveSpeedMul
                const dur = (fx as any).durationMs
                e.applySlow(this.scene.time.now, mul, dur)
              }
            }
          }
        }
        p.destroy()
      })
    }

    const layer = this.getCollisionLayer ? this.getCollisionLayer() : null
    if (layer) {
      this.wallCollider = this.scene.physics.add.collider(this.projectiles, layer, (_p) => {
        const p = _p as any
        if (p instanceof SpellProjectile) p.destroy()
      })
    }
  }

  getDebug() {
    return this.lastCast
  }

  getProjectilesDebug() {
    const kids = this.projectiles.getChildren?.() ?? []
    return kids
      .filter((k: any) => k?.active && k instanceof SpellProjectile)
      .map((k: any) => ({ spellId: k.spellId, level: k.level, x: k.x, y: k.y }))
  }

  tryCastSelected(now: number, dir: { x: number; y: number }) {
    const selected = this.getSelectedSpell ? this.getSelectedSpell() : null
    if (!selected) return false
    if (!(selected.id in SPELLS)) return false
    return this.tryCast(now, selected.id as SpellId, selected.level, dir)
  }

  tryCast(now: number, spellId: SpellId, level: number, dirRaw: { x: number; y: number }) {
    const def = SPELLS[spellId]
    if (!def || def.kind !== 'projectile') return false

    const resolved = resolveSpellLevel(def, level)
    if (!resolved) return false

    const until = this.cooldownUntil.get(spellId) ?? -Infinity
    if (now < until) return false

    const dir = normalizeCardinalDir(dirRaw)
    if (!dir) return false

    const cfg = resolved.cfg
    const dmg = Number.isFinite(cfg.damage) ? Math.max(0, cfg.damage) : 0
    const speed = spellSpeedPxPerSec(cfg.speedTilesPerSec)

    const body = this.caster.body as Phaser.Physics.Arcade.Body | undefined
    const cx = body?.center?.x ?? this.caster.x
    const cy = body?.center?.y ?? this.caster.y

    const spawnOff = 12
    const x = cx + dir.x * spawnOff
    const y = cy + dir.y * spawnOff

    const p = new SpellProjectile(this.scene, x, y, def.projectileTexture, {
      spellId,
      level: resolved.level,
      damage: dmg,
      radius: def.radius,
      ttlMs: def.ttlMs,
      createdAt: now,
    })
    this.projectiles.add(p)

    // Important: Arcade Physics Groups apply their defaults to added bodies (including velocity).
    // Configure movement AFTER adding to the group so our settings win.
    p.setScale(1)
    p.setAlpha(0.95)
    p.setCollideWorldBounds(true)
    const pBody = p.body as Phaser.Physics.Arcade.Body
    pBody.setAllowGravity(false)
    pBody.onWorldBounds = true
    p.setVelocity(dir.x * speed, dir.y * speed)

    this.cooldownUntil.set(spellId, now + Math.max(0, Math.floor(cfg.cooldownMs)))
    this.lastCast = { at: now, spellId, level: resolved.level, hits: 0 }

    this.scene.time.delayedCall(def.ttlMs, () => {
      if (!p.active) return
      p.destroy()
    })

    // Small cast feedback at the spawn point.
    this.scene.tweens.add({
      targets: p,
      alpha: { from: 0.95, to: 0.8 },
      duration: 120,
      yoyo: true,
      ease: 'sine.out',
    })

    return true
  }

  private clearProjectiles() {
    this.projectiles.clear(true, true)
  }

  private installWorldBoundsCleanup() {
    const handler = (body: Phaser.Physics.Arcade.Body) => {
      const go = (body as any)?.gameObject
      if (go && go instanceof SpellProjectile) go.destroy()
    }
    this.worldBoundsHandler = handler
    this.scene.physics.world.on('worldbounds', handler)
  }
}

function normalizeCardinalDir(dir: { x: number; y: number } | null | undefined): { x: number; y: number } | null {
  if (!dir) return null
  const x = typeof dir.x === 'number' && Number.isFinite(dir.x) ? dir.x : 0
  const y = typeof dir.y === 'number' && Number.isFinite(dir.y) ? dir.y : 0
  if (Math.abs(x) < 0.0001 && Math.abs(y) < 0.0001) return null
  if (Math.abs(x) >= Math.abs(y)) return { x: x < 0 ? -1 : 1, y: 0 }
  return { x: 0, y: y < 0 ? -1 : 1 }
}

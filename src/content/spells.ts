import { TILE_SIZE } from '../game/constants'

export type SpellId = 'fireball'

export type SpellGrant = { id: SpellId; level: number }

export type ProjectileSpellLevel = {
  damage: number
  // Speed expressed in tiles/sec, converted to px/sec at runtime.
  speedTilesPerSec: number
  cooldownMs: number
}

export type ProjectileSpellDef = {
  kind: 'projectile'
  id: SpellId
  name: string
  projectileTexture: string
  iconTexture: string
  // Simple palette for generated placeholder textures.
  coreColor: number
  glowColor: number
  // Collision shape for the projectile (in world px).
  radius: number
  // Safety TTL so projectiles don't live forever if fired into open space.
  ttlMs: number
  levels: Record<number, ProjectileSpellLevel>
}

export type SpellDef = ProjectileSpellDef

export const SPELLS: Record<SpellId, SpellDef> = {
  fireball: {
    kind: 'projectile',
    id: 'fireball',
    name: 'Fireball',
    projectileTexture: 'spell-fireball',
    iconTexture: 'spell-icon-fireball',
    coreColor: 0xff6b3d,
    glowColor: 0xffd96b,
    radius: 5,
    ttlMs: 2600,
    levels: {
      1: {
        damage: 1,
        // Roughly matches player speed (240 px/s) given TILE_SIZE=16.
        speedTilesPerSec: 15,
        cooldownMs: 450,
      },
    },
  },
}

export function resolveSpellLevel(def: SpellDef, requestedLevel: number): { level: number; cfg: ProjectileSpellLevel } | null {
  const req = Math.max(1, Math.floor(requestedLevel))
  const levels = Object.keys(def.levels)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b)
  if (levels.length === 0) return null
  let chosen = levels[0]
  for (const l of levels) {
    if (l <= req) chosen = l
  }
  const cfg = def.levels[chosen]
  if (!cfg) return null
  return { level: chosen, cfg }
}

export function spellSpeedPxPerSec(speedTilesPerSec: number) {
  const tps = typeof speedTilesPerSec === 'number' && Number.isFinite(speedTilesPerSec) ? Math.max(0, speedTilesPerSec) : 0
  return tps * TILE_SIZE
}

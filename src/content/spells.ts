import { TILE_SIZE } from '../game/constants'
import type { StatusEffect } from '../game/statusEffects'

export type SpellId = 'fireball' | 'iceblast' | 'icebolt' | 'stormlance' | 'venomshot' | 'arcaneorb'

export type SpellGrant = { id: SpellId; level: number }

export type ProjectileSpellLevel = {
  damage: number
  // Speed expressed in tiles/sec, converted to px/sec at runtime.
  speedTilesPerSec: number
  cooldownMs: number
  // Optional on-hit effects (for example, debuffs).
  onHit?: StatusEffect[]
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
  iceblast: {
    kind: 'projectile',
    id: 'iceblast',
    name: 'Ice Blast',
    projectileTexture: 'spell-iceblast',
    iconTexture: 'spell-icon-iceblast',
    coreColor: 0x76fff8,
    glowColor: 0x3dd6ff,
    radius: 6,
    ttlMs: 2700,
    levels: {
      1: {
        damage: 1,
        speedTilesPerSec: 13,
        cooldownMs: 520,
      },
      2: {
        damage: 2,
        speedTilesPerSec: 13,
        cooldownMs: 520,
      },
    },
  },
  icebolt: {
    kind: 'projectile',
    id: 'icebolt',
    name: 'Ice Bolt',
    projectileTexture: 'spell-icebolt',
    iconTexture: 'spell-icon-icebolt',
    coreColor: 0x9ad7ff,
    glowColor: 0x5da3ff,
    radius: 5,
    ttlMs: 2700,
    levels: {
      1: {
        damage: 0.5,
        speedTilesPerSec: 14,
        cooldownMs: 520,
        onHit: [{ kind: 'slow', moveSpeedMul: 0.5, durationMs: 1000 }],
      },
    },
  },
  stormlance: {
    kind: 'projectile',
    id: 'stormlance',
    name: 'Storm Lance',
    projectileTexture: 'spell-stormlance',
    iconTexture: 'spell-icon-stormlance',
    coreColor: 0xbef6ff,
    glowColor: 0x77cbff,
    radius: 5,
    ttlMs: 2500,
    levels: {
      1: {
        damage: 1.5,
        speedTilesPerSec: 17,
        cooldownMs: 430,
      },
    },
  },
  venomshot: {
    kind: 'projectile',
    id: 'venomshot',
    name: 'Venom Shot',
    projectileTexture: 'spell-venomshot',
    iconTexture: 'spell-icon-venomshot',
    coreColor: 0x92f36e,
    glowColor: 0x4cbf56,
    radius: 5,
    ttlMs: 2500,
    levels: {
      1: {
        damage: 0.8,
        speedTilesPerSec: 16,
        cooldownMs: 360,
        // Temporary poison stand-in until DOT is implemented.
        onHit: [{ kind: 'slow', moveSpeedMul: 0.85, durationMs: 1200 }],
      },
    },
  },
  arcaneorb: {
    kind: 'projectile',
    id: 'arcaneorb',
    name: 'Arcane Orb',
    projectileTexture: 'spell-arcaneorb',
    iconTexture: 'spell-icon-arcaneorb',
    coreColor: 0xd6a7ff,
    glowColor: 0x9a67ff,
    radius: 7,
    ttlMs: 2800,
    levels: {
      1: {
        damage: 2,
        speedTilesPerSec: 11,
        cooldownMs: 700,
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

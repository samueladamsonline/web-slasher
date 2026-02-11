import type { ItemId } from '../content/items'

export type EnemyKind = 'slime' | 'bat'

export type LootRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type LootDrop = {
  itemId: ItemId
  min: number
  max: number
  // 0..1 chance per kill.
  chance: number
  rarity?: LootRarity
}

export type LootTable = LootDrop[]

export type EnemyDef = {
  kind: EnemyKind
  texture: string
  hp: number
  invulnMs: number
  // Short AI lock after taking damage (separate from invuln so tuning is easier).
  hitstunMs: number
  knockback: number
  moveSpeed: number
  // Max distance (px) the enemy may roam from its spawn point before returning home.
  // Keeps patrol enemies from drifting into warps or off into weird corners.
  leashRadius?: number
  attack: {
    damage: number
    knockback: number
    cooldownMs: number
    windupMs: number
    activeMs: number
    recoveryMs: number
    hitbox: {
      offset: number
      radius: number
    }
  }
  // Deprecated aliases kept for backward-compatible map overrides.
  touchDamage?: number
  touchKnockback?: number
  touchRadius?: number
  aggroRadius?: number
  body: { w: number; h: number; ox: number; oy: number }
  drops?: LootTable
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: {
    kind: 'slime',
    texture: 'slime',
    hp: 3,
    invulnMs: 250,
    hitstunMs: 160,
    knockback: 220,
    moveSpeed: 55,
    leashRadius: 140,
    attack: {
      damage: 2,
      knockback: 260,
      cooldownMs: 900,
      windupMs: 240,
      activeMs: 90,
      recoveryMs: 260,
      hitbox: { offset: 18, radius: 20 },
    },
    body: { w: 34, h: 22, ox: (44 - 34) / 2, oy: 34 - 22 - 4 },
    drops: [
      // Guaranteed small reward so combat feels immediately useful.
      { itemId: 'coin', min: 1, max: 1, chance: 1, rarity: 'common' },
      { itemId: 'heart', min: 1, max: 1, chance: 0.18, rarity: 'uncommon' },
    ],
  },
  bat: {
    kind: 'bat',
    texture: 'bat',
    hp: 2,
    invulnMs: 180,
    hitstunMs: 140,
    knockback: 280,
    moveSpeed: 135,
    leashRadius: 340,
    attack: {
      damage: 1,
      knockback: 320,
      cooldownMs: 780,
      windupMs: 120,
      activeMs: 85,
      recoveryMs: 180,
      hitbox: { offset: 16, radius: 18 },
    },
    aggroRadius: 260,
    body: { w: 34, h: 18, ox: (64 - 34) / 2, oy: 48 - 18 - 10 },
    drops: [
      { itemId: 'coin', min: 1, max: 1, chance: 1, rarity: 'common' },
      { itemId: 'heart', min: 1, max: 1, chance: 0.12, rarity: 'uncommon' },
      { itemId: 'key', min: 1, max: 1, chance: 0.03, rarity: 'rare' },
    ],
  },
}

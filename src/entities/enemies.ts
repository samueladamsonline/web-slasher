import type { ItemId } from '../content/items'

export type EnemyKind = 'slime' | 'bat' | 'spider' | 'skeleton' | 'wisp' | 'imp' | 'golem' | 'bone_lord'

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
  spider: {
    kind: 'spider',
    texture: 'spider',
    hp: 3,
    invulnMs: 200,
    hitstunMs: 130,
    knockback: 190,
    moveSpeed: 98,
    leashRadius: 230,
    attack: {
      damage: 1,
      knockback: 240,
      cooldownMs: 720,
      windupMs: 120,
      activeMs: 90,
      recoveryMs: 170,
      hitbox: { offset: 14, radius: 14 },
    },
    body: { w: 24, h: 16, ox: (36 - 24) / 2, oy: 28 - 16 - 5 },
    drops: [
      { itemId: 'coin', min: 1, max: 2, chance: 1, rarity: 'common' },
      { itemId: 'heart', min: 1, max: 1, chance: 0.1, rarity: 'uncommon' },
    ],
  },
  skeleton: {
    kind: 'skeleton',
    texture: 'skeleton',
    hp: 4,
    invulnMs: 220,
    hitstunMs: 160,
    knockback: 220,
    moveSpeed: 72,
    leashRadius: 260,
    attack: {
      damage: 1,
      knockback: 280,
      cooldownMs: 860,
      windupMs: 180,
      activeMs: 90,
      recoveryMs: 220,
      hitbox: { offset: 16, radius: 16 },
    },
    body: { w: 24, h: 24, ox: (40 - 24) / 2, oy: 34 - 24 - 5 },
    drops: [
      { itemId: 'coin', min: 2, max: 3, chance: 1, rarity: 'common' },
      { itemId: 'key', min: 1, max: 1, chance: 0.05, rarity: 'rare' },
    ],
  },
  wisp: {
    kind: 'wisp',
    texture: 'wisp',
    hp: 2,
    invulnMs: 140,
    hitstunMs: 110,
    knockback: 200,
    moveSpeed: 162,
    leashRadius: 360,
    attack: {
      damage: 1,
      knockback: 260,
      cooldownMs: 680,
      windupMs: 90,
      activeMs: 70,
      recoveryMs: 140,
      hitbox: { offset: 14, radius: 14 },
    },
    aggroRadius: 320,
    body: { w: 20, h: 20, ox: (34 - 20) / 2, oy: 34 - 20 - 8 },
    drops: [{ itemId: 'coin', min: 1, max: 2, chance: 1, rarity: 'common' }],
  },
  imp: {
    kind: 'imp',
    texture: 'imp',
    hp: 3,
    invulnMs: 170,
    hitstunMs: 120,
    knockback: 210,
    moveSpeed: 136,
    leashRadius: 320,
    attack: {
      damage: 1,
      knockback: 300,
      cooldownMs: 740,
      windupMs: 110,
      activeMs: 80,
      recoveryMs: 160,
      hitbox: { offset: 16, radius: 15 },
    },
    aggroRadius: 300,
    body: { w: 24, h: 20, ox: (38 - 24) / 2, oy: 34 - 20 - 8 },
    drops: [
      { itemId: 'coin', min: 2, max: 3, chance: 1, rarity: 'common' },
      { itemId: 'heart', min: 1, max: 1, chance: 0.08, rarity: 'uncommon' },
    ],
  },
  golem: {
    kind: 'golem',
    texture: 'golem',
    hp: 8,
    invulnMs: 260,
    hitstunMs: 210,
    knockback: 150,
    moveSpeed: 50,
    leashRadius: 240,
    attack: {
      damage: 2,
      knockback: 360,
      cooldownMs: 1200,
      windupMs: 260,
      activeMs: 120,
      recoveryMs: 280,
      hitbox: { offset: 18, radius: 18 },
    },
    body: { w: 30, h: 24, ox: (44 - 30) / 2, oy: 38 - 24 - 6 },
    drops: [
      { itemId: 'coin', min: 3, max: 5, chance: 1, rarity: 'common' },
      { itemId: 'heart', min: 1, max: 1, chance: 0.2, rarity: 'uncommon' },
    ],
  },
  bone_lord: {
    kind: 'bone_lord',
    texture: 'bone_lord',
    hp: 30,
    invulnMs: 130,
    hitstunMs: 100,
    knockback: 130,
    moveSpeed: 92,
    leashRadius: 520,
    attack: {
      damage: 3,
      knockback: 420,
      cooldownMs: 1400,
      windupMs: 320,
      activeMs: 130,
      recoveryMs: 340,
      hitbox: { offset: 20, radius: 24 },
    },
    aggroRadius: 420,
    body: { w: 42, h: 38, ox: (64 - 42) / 2, oy: 64 - 38 - 10 },
    drops: [
      { itemId: 'coin', min: 8, max: 12, chance: 1, rarity: 'rare' },
      { itemId: 'key', min: 1, max: 2, chance: 0.6, rarity: 'epic' },
      { itemId: 'heart', min: 2, max: 3, chance: 0.7, rarity: 'epic' },
    ],
  },
}

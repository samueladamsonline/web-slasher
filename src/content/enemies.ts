export type EnemyKind = 'slime' | 'bat'

export type EnemyDef = {
  kind: EnemyKind
  texture: string
  hp: number
  invulnMs: number
  knockback: number
  moveSpeed: number
  // Max distance (px) the enemy may roam from its spawn point before returning home.
  // Keeps patrol enemies from drifting into warps or off into weird corners.
  leashRadius?: number
  touchDamage: number
  touchKnockback: number
  aggroRadius?: number
  body: { w: number; h: number; ox: number; oy: number }
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: {
    kind: 'slime',
    texture: 'slime',
    hp: 3,
    invulnMs: 250,
    knockback: 220,
    moveSpeed: 55,
    leashRadius: 140,
    touchDamage: 1,
    touchKnockback: 260,
    body: { w: 34, h: 22, ox: (44 - 34) / 2, oy: 34 - 22 - 4 },
  },
  bat: {
    kind: 'bat',
    texture: 'bat',
    hp: 2,
    invulnMs: 180,
    knockback: 280,
    moveSpeed: 135,
    leashRadius: 220,
    touchDamage: 1,
    touchKnockback: 320,
    aggroRadius: 260,
    body: { w: 34, h: 18, ox: (64 - 34) / 2, oy: 48 - 18 - 10 },
  },
}

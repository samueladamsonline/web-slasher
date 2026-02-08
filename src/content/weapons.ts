import type { Facing } from '../game/types'

export type WeaponId = 'sword' | 'greatsword'

export type WeaponHitbox = {
  offset: number
  w: number
  h: number
}

export type WeaponVfx = {
  weaponTexture: string
  slashTexture: string
  slashScale: number
}

export type WeaponDef = {
  id: WeaponId
  name: string
  damage: number
  cooldownMs: number
  hitbox: WeaponHitbox
  vfx: WeaponVfx
  // Optional per-facing tweak if needed later (e.g. spears).
  hitboxByFacing?: Partial<Record<Facing, Partial<WeaponHitbox>>>
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Sword',
    damage: 1,
    cooldownMs: 220,
    hitbox: { offset: 42, w: 50, h: 34 },
    vfx: { weaponTexture: 'sword', slashTexture: 'slash', slashScale: 0.85 },
  },
  greatsword: {
    id: 'greatsword',
    name: 'Greatsword',
    damage: 2,
    cooldownMs: 340,
    hitbox: { offset: 46, w: 66, h: 40 },
    vfx: { weaponTexture: 'greatsword', slashTexture: 'slash-heavy', slashScale: 1.08 },
  },
}


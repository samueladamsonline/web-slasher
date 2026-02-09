import type { Facing } from '../game/types'

export type WeaponId = 'sword' | 'greatsword'

export type WeaponHands = 1 | 2

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

export type WeaponTimings = {
  // Delay between pressing attack and the strike becoming active.
  windupMs: number
  // Window where the strike is considered active (we currently apply damage once at the start of this window).
  activeMs: number
  // Post-strike recovery time where the hero remains locked (and cannot start another attack).
  recoveryMs: number
}

export type WeaponDef = {
  id: WeaponId
  name: string
  hands: WeaponHands
  damage: number
  // Total time between attack presses (windup + active + recovery).
  cooldownMs: number
  hitbox: WeaponHitbox
  timings: WeaponTimings
  vfx: WeaponVfx
  // Optional per-facing tweak if needed later (e.g. spears).
  hitboxByFacing?: Partial<Record<Facing, Partial<WeaponHitbox>>>
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Short Sword',
    hands: 1,
    damage: 1,
    cooldownMs: 260,
    hitbox: { offset: 42, w: 50, h: 34 },
    timings: { windupMs: 70, activeMs: 70, recoveryMs: 120 },
    vfx: { weaponTexture: 'sword', slashTexture: 'slash', slashScale: 0.85 },
  },
  greatsword: {
    id: 'greatsword',
    name: 'Long Sword',
    hands: 2,
    damage: 2,
    cooldownMs: 390,
    hitbox: { offset: 46, w: 66, h: 40 },
    timings: { windupMs: 95, activeMs: 90, recoveryMs: 205 },
    vfx: { weaponTexture: 'greatsword', slashTexture: 'slash-heavy', slashScale: 1.08 },
  },
}

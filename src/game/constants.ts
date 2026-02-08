export const TILE_SIZE = 64

// Our animation helpers assume a 3x4 spritesheet (3 frames per facing).
// Kenney hero uses 64x64 frames and is toggled at runtime via ?kenneyHero=1,
// but we keep the default dimensions here so existing art continues to work.
export const HERO_W = 48
export const HERO_H = 72

export const DEPTH_GROUND = 0
export const DEPTH_WARP = 5
export const DEPTH_ENEMY = 9
export const DEPTH_PLAYER = 10
export const DEPTH_HITBOX = 11
export const DEPTH_UI = 1000

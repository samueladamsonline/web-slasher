export type Facing = 'down' | 'up' | 'left' | 'right'

export const MAP_KEYS = ['overworld', 'cave', 'marsh', 'ruins', 'citadel'] as const
export type MapKey = (typeof MAP_KEYS)[number]

export function isMapKey(v: unknown): v is MapKey {
  return typeof v === 'string' && (MAP_KEYS as readonly string[]).includes(v)
}

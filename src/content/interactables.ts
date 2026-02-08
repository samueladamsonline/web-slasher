import type { ItemId } from './items'
import type { MapKey } from '../game/types'

export type InteractableKind = 'sign' | 'npc' | 'chest' | 'lockedWarp'

export type InteractableDefId = 'welcome_sign' | 'starter_key_chest' | 'locked_door_to_cave'

export type InteractableDef = {
  id: InteractableDefId
  kind: InteractableKind
  message?: string
  reward?: { itemId: ItemId; amount: number }
  lockedWarp?: { toMap: MapKey; toSpawn: string; keyCost: number }
  radius?: number
}

export const INTERACTABLES: Record<InteractableDefId, InteractableDef> = {
  welcome_sign: {
    id: 'welcome_sign',
    kind: 'sign',
    message: 'Welcome.\n\nE: Interact\nSpace: Attack\nI: Inventory',
    radius: 90,
  },
  starter_key_chest: {
    id: 'starter_key_chest',
    kind: 'chest',
    reward: { itemId: 'key', amount: 1 },
    radius: 90,
  },
  locked_door_to_cave: {
    id: 'locked_door_to_cave',
    kind: 'lockedWarp',
    lockedWarp: { toMap: 'cave', toSpawn: 'from_overworld_fast', keyCost: 1 },
    radius: 96,
  },
}


import type { MapKey } from './types'

type MapId = string

function keyFor(mapKey: MapKey) {
  return mapKey as unknown as MapId
}

export class WorldState {
  private collectedPickups = new Map<MapId, Set<number>>()
  private openedChests = new Map<MapId, Set<number>>()

  isPickupCollected(mapKey: MapKey, objectId: number) {
    const s = this.collectedPickups.get(keyFor(mapKey))
    return s ? s.has(objectId) : false
  }

  markPickupCollected(mapKey: MapKey, objectId: number) {
    const k = keyFor(mapKey)
    const s = this.collectedPickups.get(k) ?? new Set<number>()
    s.add(objectId)
    this.collectedPickups.set(k, s)
  }

  isChestOpened(mapKey: MapKey, objectId: number) {
    const s = this.openedChests.get(keyFor(mapKey))
    return s ? s.has(objectId) : false
  }

  markChestOpened(mapKey: MapKey, objectId: number) {
    const k = keyFor(mapKey)
    const s = this.openedChests.get(k) ?? new Set<number>()
    s.add(objectId)
    this.openedChests.set(k, s)
  }
}


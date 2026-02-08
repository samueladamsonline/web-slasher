import type { MapKey } from './types'

type MapId = string

function keyFor(mapKey: MapKey) {
  return mapKey as unknown as MapId
}

export type WorldStateSnapshot = {
  collectedPickups: Record<string, number[]>
  openedChests: Record<string, number[]>
}

export class WorldState {
  private collectedPickups = new Map<MapId, Set<number>>()
  private openedChests = new Map<MapId, Set<number>>()
  private onChanged?: () => void

  setOnChanged(cb: (() => void) | undefined) {
    this.onChanged = cb
  }

  clear() {
    const hadData = this.collectedPickups.size > 0 || this.openedChests.size > 0
    this.collectedPickups.clear()
    this.openedChests.clear()
    if (hadData) this.onChanged?.()
  }

  snapshot(): WorldStateSnapshot {
    const collectedPickups: Record<string, number[]> = {}
    const openedChests: Record<string, number[]> = {}

    for (const [k, s] of this.collectedPickups.entries()) collectedPickups[k] = [...s.values()]
    for (const [k, s] of this.openedChests.entries()) openedChests[k] = [...s.values()]

    return { collectedPickups, openedChests }
  }

  load(snapshot: WorldStateSnapshot | null | undefined) {
    this.collectedPickups.clear()
    this.openedChests.clear()

    const collected = snapshot?.collectedPickups
    const opened = snapshot?.openedChests

    if (collected && typeof collected === 'object') {
      for (const [k, arr] of Object.entries(collected)) {
        if (!Array.isArray(arr)) continue
        const set = new Set<number>()
        for (const n of arr) if (typeof n === 'number' && Number.isFinite(n)) set.add(Math.floor(n))
        if (set.size) this.collectedPickups.set(k, set)
      }
    }

    if (opened && typeof opened === 'object') {
      for (const [k, arr] of Object.entries(opened)) {
        if (!Array.isArray(arr)) continue
        const set = new Set<number>()
        for (const n of arr) if (typeof n === 'number' && Number.isFinite(n)) set.add(Math.floor(n))
        if (set.size) this.openedChests.set(k, set)
      }
    }

    this.onChanged?.()
  }

  isPickupCollected(mapKey: MapKey, objectId: number) {
    const s = this.collectedPickups.get(keyFor(mapKey))
    return s ? s.has(objectId) : false
  }

  markPickupCollected(mapKey: MapKey, objectId: number) {
    const k = keyFor(mapKey)
    const s = this.collectedPickups.get(k) ?? new Set<number>()
    if (s.has(objectId)) return
    s.add(objectId)
    this.collectedPickups.set(k, s)
    this.onChanged?.()
  }

  isChestOpened(mapKey: MapKey, objectId: number) {
    const s = this.openedChests.get(keyFor(mapKey))
    return s ? s.has(objectId) : false
  }

  markChestOpened(mapKey: MapKey, objectId: number) {
    const k = keyFor(mapKey)
    const s = this.openedChests.get(k) ?? new Set<number>()
    if (s.has(objectId)) return
    s.add(objectId)
    this.openedChests.set(k, s)
    this.onChanged?.()
  }
}

import { isMapKey, type MapKey } from '../game/types'
import type { WorldState, WorldStateSnapshot } from '../game/WorldState'
import type { InventorySnapshot, InventorySystem } from './InventorySystem'

export type Checkpoint = { mapKey: MapKey; spawnName: string }

export type SaveDataV1 = {
  v: 1
  savedAt: number
  inventory: InventorySnapshot
  world: WorldStateSnapshot
  checkpoint: Checkpoint
}

export type SaveLoadResult = { status: 'missing' } | { status: 'error'; error: string } | { status: 'ok'; data: SaveDataV1 }

const SAVE_KEY = 'web-slasher.save.v1'

export interface SaveBackend {
  loadRaw(): Promise<string | null>
  saveRaw(raw: string): Promise<void>
  clear(): Promise<void>
}

export class LocalStorageSaveBackend implements SaveBackend {
  private storage: Storage
  private key: string

  constructor(opts: { storage: Storage; key?: string }) {
    this.storage = opts.storage
    this.key = opts.key ?? SAVE_KEY
  }

  async loadRaw() {
    try {
      return this.storage.getItem(this.key)
    } catch (e) {
      throw new Error(`Failed to read save: ${String((e as any)?.message ?? e)}`)
    }
  }

  async saveRaw(raw: string) {
    try {
      this.storage.setItem(this.key, raw)
    } catch (e) {
      throw new Error(`Failed to write save: ${String((e as any)?.message ?? e)}`)
    }
  }

  async clear() {
    try {
      this.storage.removeItem(this.key)
    } catch (e) {
      throw new Error(`Failed to clear save: ${String((e as any)?.message ?? e)}`)
    }
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export class SaveSystem {
  private backend: SaveBackend | null
  private inventory: InventorySystem
  private world: WorldState
  private getCheckpoint: () => Checkpoint
  private enabled = true
  private debounceMs: number
  private pending = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private saving = false

  constructor(opts: {
    inventory: InventorySystem
    world: WorldState
    getCheckpoint: () => Checkpoint
    backend?: SaveBackend | null
    storage?: Storage | null
    debounceMs?: number
  }) {
    this.inventory = opts.inventory
    this.world = opts.world
    this.getCheckpoint = opts.getCheckpoint
    this.debounceMs = typeof opts.debounceMs === 'number' && Number.isFinite(opts.debounceMs) ? Math.max(0, Math.floor(opts.debounceMs)) : 250

    if (typeof opts.backend !== 'undefined') this.backend = opts.backend
    else {
      const storage = typeof opts.storage === 'undefined' ? (typeof window !== 'undefined' ? window.localStorage : null) : opts.storage
      this.backend = storage ? new LocalStorageSaveBackend({ storage, key: SAVE_KEY }) : null
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled) {
      this.pending = false
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }
    }
  }

  async hasSave() {
    if (!this.backend) return false
    try {
      return !!(await this.backend.loadRaw())
    } catch {
      return false
    }
  }

  async clear() {
    if (!this.backend) return true
    try {
      await this.backend.clear()
      return true
    } catch {
      // Clearing a save should never block gameplay.
      return false
    }
  }

  async load(): Promise<SaveLoadResult> {
    if (!this.backend) return { status: 'missing' }
    let raw: string | null = null
    try {
      raw = await this.backend.loadRaw()
    } catch (e) {
      return { status: 'error', error: String((e as any)?.message ?? e) }
    }
    if (!raw) return { status: 'missing' }

    const parsed = safeJsonParse(raw) as any
    if (!parsed || typeof parsed !== 'object') return { status: 'error', error: 'Save data was not valid JSON.' }
    if (parsed.v !== 1) return { status: 'error', error: `Unsupported save version: ${String(parsed.v)}` }

    const checkpointRaw = parsed.checkpoint
    const mapKey = isMapKey(checkpointRaw?.mapKey) ? (checkpointRaw.mapKey as MapKey) : null
    const spawnName = typeof checkpointRaw?.spawnName === 'string' && checkpointRaw.spawnName ? checkpointRaw.spawnName : null
    if (!mapKey || !spawnName) return { status: 'error', error: 'Save checkpoint was invalid.' }

    const savedAt = typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt) ? parsed.savedAt : Date.now()

    const data: SaveDataV1 = {
      v: 1,
      savedAt,
      inventory: parsed.inventory as InventorySnapshot,
      world: parsed.world as WorldStateSnapshot,
      checkpoint: { mapKey, spawnName },
    }

    return { status: 'ok', data }
  }

  apply(data: SaveDataV1) {
    this.inventory.load(data.inventory)
    this.world.load(data.world)
    return data.checkpoint
  }

  requestSave() {
    if (!this.enabled) return
    this.pending = true
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.debounceMs)
  }

  private async flush() {
    if (!this.enabled) return
    if (!this.pending) return
    if (this.saving) {
      // A save is already in-flight (future DB backend). Try again shortly.
      this.requestSave()
      return
    }

    this.pending = false
    this.saving = true
    try {
      await this.saveNow()
    } finally {
      this.saving = false
      if (this.pending) this.requestSave()
    }
  }

  async saveNow() {
    if (!this.enabled) return false
    if (!this.backend) return false

    const checkpoint = this.getCheckpoint()
    if (!checkpoint?.mapKey || !checkpoint?.spawnName) return false

    const data: SaveDataV1 = {
      v: 1,
      savedAt: Date.now(),
      inventory: this.inventory.snapshot(),
      world: this.world.snapshot(),
      checkpoint,
    }

    try {
      await this.backend.saveRaw(JSON.stringify(data))
      return true
    } catch {
      return false
    }
  }
}

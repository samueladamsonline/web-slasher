import type * as Phaser from 'phaser'
import type { ItemId } from '../content/items'
import type { WeaponId } from '../content/weapons'
import type { Enemy } from '../entities/Enemy'
import type { EnemyKind } from '../entities/enemies'

export const GAME_EVENTS = {
  ENEMY_DAMAGED: 'enemy:damaged',
  ENEMY_DIED: 'enemy:died',
  PLAYER_ATTACK: 'player:attack',
  PICKUP_COLLECTED: 'pickup:collected',
} as const

export type GameEventMap = {
  [GAME_EVENTS.ENEMY_DAMAGED]: { enemy: Enemy; now: number }
  [GAME_EVENTS.ENEMY_DIED]: { kind: EnemyKind; x: number; y: number }
  [GAME_EVENTS.PLAYER_ATTACK]: { now: number; weaponId: WeaponId }
  [GAME_EVENTS.PICKUP_COLLECTED]: { itemId: ItemId; amount: number }
}

export function emitGameEvent<K extends keyof GameEventMap>(emitter: Phaser.Events.EventEmitter, event: K, payload: GameEventMap[K]) {
  emitter.emit(event, payload)
}

export function onGameEvent<K extends keyof GameEventMap>(
  emitter: Phaser.Events.EventEmitter,
  event: K,
  handler: (payload: GameEventMap[K]) => void,
  context?: unknown,
) {
  emitter.on(event, handler as any, context as any)
}

export function offGameEvent<K extends keyof GameEventMap>(
  emitter: Phaser.Events.EventEmitter,
  event: K,
  handler: (payload: GameEventMap[K]) => void,
  context?: unknown,
) {
  emitter.off(event, handler as any, context as any)
}

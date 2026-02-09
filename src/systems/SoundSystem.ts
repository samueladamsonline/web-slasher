import * as Phaser from 'phaser'
import { GAME_EVENTS, offGameEvent, onGameEvent, type GameEventMap } from '../game/events'

type EnemyDamagedEvent = GameEventMap[typeof GAME_EVENTS.ENEMY_DAMAGED]
type EnemyDiedEvent = GameEventMap[typeof GAME_EVENTS.ENEMY_DIED]
type PlayerAttackEvent = GameEventMap[typeof GAME_EVENTS.PLAYER_ATTACK]
type PickupCollectedEvent = GameEventMap[typeof GAME_EVENTS.PICKUP_COLLECTED]

type SfxKey =
  | 'sfx-swing-short'
  | 'sfx-swing-long'
  | 'sfx-hit'
  | 'sfx-pickup'
  | 'sfx-ui-open'
  | 'sfx-ui-close'
  | 'sfx-enemy-die'

export class SoundSystem {
  static preload(scene: Phaser.Scene) {
    scene.load.audio('sfx-swing-short', '/sfx/swing_short.wav')
    scene.load.audio('sfx-swing-long', '/sfx/swing_long.wav')
    scene.load.audio('sfx-hit', '/sfx/hit.wav')
    scene.load.audio('sfx-pickup', '/sfx/pickup.wav')
    scene.load.audio('sfx-ui-open', '/sfx/ui_open.wav')
    scene.load.audio('sfx-ui-close', '/sfx/ui_close.wav')
    scene.load.audio('sfx-enemy-die', '/sfx/enemy_die.wav')
  }

  private scene: Phaser.Scene
  private destroyed = false

  private lastPlayedAt = new Map<string, number>()
  private unlockHandler: (() => void) | null = null

  constructor(scene: Phaser.Scene) {
    this.scene = scene

    this.installUnlockHandlers()

    onGameEvent(this.scene.events, GAME_EVENTS.PLAYER_ATTACK, this.onPlayerAttack, this)
    onGameEvent(this.scene.events, GAME_EVENTS.ENEMY_DAMAGED, this.onEnemyDamaged, this)
    onGameEvent(this.scene.events, GAME_EVENTS.ENEMY_DIED, this.onEnemyDied, this)
    onGameEvent(this.scene.events, GAME_EVENTS.PICKUP_COLLECTED, this.onPickupCollected, this)
  }

  destroy() {
    this.destroyed = true
    this.removeUnlockHandlers()
    offGameEvent(this.scene.events, GAME_EVENTS.PLAYER_ATTACK, this.onPlayerAttack, this)
    offGameEvent(this.scene.events, GAME_EVENTS.ENEMY_DAMAGED, this.onEnemyDamaged, this)
    offGameEvent(this.scene.events, GAME_EVENTS.ENEMY_DIED, this.onEnemyDied, this)
    offGameEvent(this.scene.events, GAME_EVENTS.PICKUP_COLLECTED, this.onPickupCollected, this)
  }

  playUiOpen() {
    this.play('sfx-ui-open', { volume: 0.22, cooldownMs: 90 })
  }

  playUiClose() {
    this.play('sfx-ui-close', { volume: 0.22, cooldownMs: 90 })
  }

  private onPlayerAttack(ev: PlayerAttackEvent) {
    // Slight random detune to avoid repetition.
    const detune = Phaser.Math.Between(-35, 35)
    const key: SfxKey = ev.weaponId === 'greatsword' ? 'sfx-swing-long' : 'sfx-swing-short'
    this.play(key, { volume: ev.weaponId === 'greatsword' ? 0.28 : 0.24, detune, cooldownMs: 40 })
  }

  private onEnemyDamaged(_ev: EnemyDamagedEvent) {
    const detune = Phaser.Math.Between(-25, 25)
    this.play('sfx-hit', { volume: 0.24, detune, cooldownMs: 35 })
  }

  private onEnemyDied(_ev: EnemyDiedEvent) {
    const detune = Phaser.Math.Between(-20, 20)
    this.play('sfx-enemy-die', { volume: 0.26, detune, cooldownMs: 70 })
  }

  private onPickupCollected(_ev: PickupCollectedEvent) {
    const detune = Phaser.Math.Between(-15, 15)
    this.play('sfx-pickup', { volume: 0.2, detune, cooldownMs: 60 })
  }

  private play(key: SfxKey, cfg?: Phaser.Types.Sound.SoundConfig & { cooldownMs?: number }) {
    if (this.destroyed) return

    const now = this.scene.time.now
    const cooldownMs = typeof cfg?.cooldownMs === 'number' ? cfg.cooldownMs : 0
    const lastAt = this.lastPlayedAt.get(key) ?? -Infinity
    if (cooldownMs > 0 && now - lastAt < cooldownMs) return
    this.lastPlayedAt.set(key, now)

    const { cooldownMs: _cooldown, ...soundCfg } = cfg ?? {}
    try {
      this.scene.sound.play(key, soundCfg)
    } catch {
      // Audio can fail to play if the browser hasn't unlocked the AudioContext yet.
      // Treat that as non-fatal (sound will start once unlocked).
    }
  }

  private installUnlockHandlers() {
    const sm = this.scene.sound as any
    if (!sm || !sm.locked) return

    const tryUnlock = () => {
      if (this.destroyed) return
      try {
        if (typeof sm.unlock === 'function') sm.unlock()
        if (typeof sm.context?.resume === 'function') void sm.context.resume()
      } catch {
        // Ignore unlock errors; they vary by browser.
      }
      if (!sm.locked) this.removeUnlockHandlers()
    }

    this.unlockHandler = tryUnlock
    this.scene.input.on('pointerdown', tryUnlock)
    this.scene.input.keyboard?.on('keydown', tryUnlock)
  }

  private removeUnlockHandlers() {
    if (!this.unlockHandler) return
    this.scene.input.off('pointerdown', this.unlockHandler)
    this.scene.input.keyboard?.off('keydown', this.unlockHandler)
    this.unlockHandler = null
  }
}


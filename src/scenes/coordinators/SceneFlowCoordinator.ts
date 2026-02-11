import * as Phaser from 'phaser'
import type { MapRuntime } from '../../game/MapRuntime'
import type { WorldState } from '../../game/WorldState'
import type { Hero } from '../../entities/Hero'
import type { Checkpoint, SaveDataV1, SaveSystem } from '../../systems/SaveSystem'
import type { InputSystem } from '../../systems/InputSystem'
import type { InventorySystem } from '../../systems/InventorySystem'
import type { PlayerHealthSystem } from '../../systems/PlayerHealthSystem'
import type { SoundSystem } from '../../systems/SoundSystem'
import type { OverlayUI } from '../../ui/OverlayUI'
import type { MinimapUI } from '../../ui/MinimapUI'
import type { InventoryUI } from '../../ui/InventoryUI'
import type { SpellSlotUI } from '../../ui/SpellSlotUI'
import type { SpellbookUI } from '../../ui/SpellbookUI'

export type PauseMode = 'pause' | 'inventory' | 'map' | 'spellbook'

export class SceneFlowCoordinator {
  private scene: Phaser.Scene
  private hero: Hero
  private mapRuntime: MapRuntime
  private world: WorldState
  private inventory: InventorySystem
  private health: PlayerHealthSystem
  private save: SaveSystem
  private sfx: SoundSystem
  private overlay: OverlayUI
  private minimap: MinimapUI
  private inventoryUI: InventoryUI
  private spellSlotUI: SpellSlotUI
  private spellbookUI: SpellbookUI
  private refreshDbg: () => void

  private startMenu = true
  private startLoading = true
  private startBusy = false
  private startBusyMessage: string | null = null
  private startCanContinue = false
  private startError: string | null = null
  private startLoadedSave: SaveDataV1 | null = null
  private startToken = 0

  private paused = false
  private pauseMode: PauseMode = 'pause'
  private gameOver = false
  private dialoguePaused = false
  private checkpoint: Checkpoint = { mapKey: 'overworld', spawnName: 'player_spawn' }

  constructor(opts: {
    scene: Phaser.Scene
    hero: Hero
    mapRuntime: MapRuntime
    world: WorldState
    inventory: InventorySystem
    health: PlayerHealthSystem
    save: SaveSystem
    sfx: SoundSystem
    overlay: OverlayUI
    minimap: MinimapUI
    inventoryUI: InventoryUI
    spellSlotUI: SpellSlotUI
    spellbookUI: SpellbookUI
    refreshDbg: () => void
  }) {
    this.scene = opts.scene
    this.hero = opts.hero
    this.mapRuntime = opts.mapRuntime
    this.world = opts.world
    this.inventory = opts.inventory
    this.health = opts.health
    this.save = opts.save
    this.sfx = opts.sfx
    this.overlay = opts.overlay
    this.minimap = opts.minimap
    this.inventoryUI = opts.inventoryUI
    this.spellSlotUI = opts.spellSlotUI
    this.spellbookUI = opts.spellbookUI
    this.refreshDbg = opts.refreshDbg
  }

  getState() {
    return {
      startMenu: this.startMenu,
      startLoading: this.startLoading,
      startCanContinue: this.startCanContinue,
      startBusy: this.startBusy,
      paused: this.paused,
      pauseMode: this.pauseMode,
      gameOver: this.gameOver,
      dialoguePaused: this.dialoguePaused,
      checkpoint: { ...this.checkpoint },
    }
  }

  getCheckpoint() {
    return { ...this.checkpoint }
  }

  syncCheckpointFromRuntime() {
    const mk = this.mapRuntime.mapKey
    const sn = this.mapRuntime.spawnName
    if (mk && typeof sn === 'string' && sn) this.checkpoint = { mapKey: mk, spawnName: sn }
  }

  isStartMenu() {
    return this.startMenu
  }

  isPaused() {
    return this.paused
  }

  getPauseMode() {
    return this.pauseMode
  }

  isGameOver() {
    return this.gameOver
  }

  isDialoguePaused() {
    return this.dialoguePaused
  }

  canRunGameplay() {
    return !this.startMenu && !this.gameOver && !this.paused && !this.dialoguePaused
  }

  async refreshStartMenuState() {
    const token = ++this.startToken
    this.startLoading = true
    this.startError = null
    this.startCanContinue = false
    this.startLoadedSave = null
    this.openStartMenu()

    const res = await this.save.load()
    if (token !== this.startToken) return
    if (!this.startMenu) return

    this.startLoading = false
    this.startError = res.status === 'error' ? res.error : null
    this.startCanContinue = res.status === 'ok'
    this.startLoadedSave = res.status === 'ok' ? res.data : null
    this.openStartMenu()
  }

  openStartMenu() {
    this.startMenu = true
    this.paused = false
    this.pauseMode = 'pause'
    this.gameOver = false
    this.dialoguePaused = false
    this.hero.setVelocity(0, 0)
    this.scene.physics.world.pause()
    this.scene.anims.pauseAll()
    this.minimap.setMiniVisible(false)
    this.minimap.setMapVisible(false)
    this.inventoryUI.hide()
    this.spellSlotUI.setVisible(false)
    this.spellbookUI.hide()

    const lines: string[] = []
    if (this.startBusy) {
      lines.push(this.startBusyMessage ?? 'Working...')
      lines.push('Please wait.')
    } else if (this.startLoading) {
      lines.push('Checking for an existing save...')
      lines.push('')
      lines.push('N: New Game')
    } else if (this.startError) {
      lines.push('Save data could not be loaded.')
      lines.push(this.startError)
      lines.push('')
      lines.push('N: New Game')
    } else if (this.startCanContinue) {
      lines.push('ENTER: Continue')
      lines.push('N: New Game (clears save)')
    } else {
      lines.push('ENTER: New Game')
    }
    lines.push('')
    lines.push('WASD: Move   SPACE: Attack   ARROWS: Cast   F: Spellbook   E: Interact   I: Inventory   M: Map')
    this.overlay.showStart(lines)
    this.refreshDbg()
  }

  async handleStartMenuInput(controls: InputSystem) {
    if (!this.startMenu) return false
    if (this.startBusy) return true
    if (controls.justPressed('newGame')) {
      await this.startNewGame()
      return true
    }
    if (this.startLoading) return true
    if (controls.justPressed('confirm')) {
      if (this.startCanContinue) await this.continueGame()
      else await this.startNewGame()
      return true
    }
    return true
  }

  handleGameOverInput(controls: InputSystem) {
    if (!this.gameOver) return false
    if (controls.justPressed('confirm')) this.respawn()
    return true
  }

  handlePauseShortcuts(controls: InputSystem) {
    let changed = false
    if (controls.justPressed('pause')) {
      if (this.paused) this.setPaused(false)
      else this.setPaused(true, 'pause')
      changed = true
    }

    if (controls.justPressed('inventory')) {
      if (this.paused && this.pauseMode === 'inventory') this.setPaused(false)
      else this.setPaused(true, 'inventory')
      changed = true
    }

    if (controls.justPressed('map')) {
      if (this.paused && this.pauseMode === 'map') this.setPaused(false)
      else this.setPaused(true, 'map')
      changed = true
    }

    if (controls.justPressed('spellbook')) {
      if (this.paused && this.pauseMode === 'spellbook') this.setPaused(false)
      else this.setPaused(true, 'spellbook')
      changed = true
    }

    return changed
  }

  setPaused(paused: boolean, mode: PauseMode = this.pauseMode) {
    if (this.paused === paused && this.pauseMode === mode) return
    const wasPaused = this.paused
    this.paused = paused
    this.pauseMode = mode

    if (!wasPaused && this.paused) this.sfx.playUiOpen()
    if (wasPaused && !this.paused) this.sfx.playUiClose()

    if (this.paused) {
      this.hero.setVelocity(0, 0)
      this.scene.physics.world.pause()
      this.scene.anims.pauseAll()

      this.minimap.setMiniVisible(false)
      this.minimap.setMapVisible(false)
      this.inventoryUI.hide()
      this.spellSlotUI.setVisible(false)
      this.spellbookUI.hide()

      if (this.pauseMode === 'map') {
        this.overlay.hide()
        this.minimap.setMapVisible(true)
      } else if (this.pauseMode === 'inventory') {
        this.overlay.hide()
        this.inventoryUI.show()
      } else if (this.pauseMode === 'spellbook') {
        this.overlay.hide()
        this.spellbookUI.show()
      } else {
        this.minimap.setMapVisible(false)
        this.inventoryUI.hide()
        this.overlay.showPause(['ESC: Resume', 'I: Inventory', 'F: Spellbook', 'M: Map'])
      }
    } else {
      if (!this.dialoguePaused) {
        this.scene.physics.world.resume()
        this.scene.anims.resumeAll()
      }
      this.overlay.hide()
      this.minimap.setMapVisible(false)
      this.minimap.setMiniVisible(true)
      this.inventoryUI.hide()
      this.spellSlotUI.setVisible(true)
      this.spellbookUI.hide()
    }
  }

  pauseForDialogue() {
    if (this.dialoguePaused || this.paused || this.gameOver) return
    this.dialoguePaused = true
    this.hero.setVelocity(0, 0)
    this.scene.physics.world.pause()
    this.scene.anims.pauseAll()
  }

  resumeFromDialogue() {
    if (!this.dialoguePaused) return
    this.dialoguePaused = false
    if (this.paused || this.gameOver) return
    this.scene.physics.world.resume()
    this.scene.anims.resumeAll()
  }

  triggerGameOver() {
    if (this.gameOver) return
    this.gameOver = true
    this.paused = false
    this.pauseMode = 'pause'
    this.dialoguePaused = false

    this.hero.setVelocity(0, 0)
    this.scene.physics.world.pause()
    this.scene.anims.pauseAll()
    this.inventoryUI.hide()
    this.spellSlotUI.setVisible(false)
    this.spellbookUI.hide()
    this.overlay.showGameOver(['Press ENTER to respawn at last checkpoint.'])
  }

  respawn() {
    if (!this.gameOver) return
    this.gameOver = false

    this.health.reset()
    this.scene.physics.world.resume()
    this.scene.anims.resumeAll()
    this.overlay.hide()

    this.mapRuntime.load(this.checkpoint.mapKey, this.checkpoint.spawnName)
    this.syncCheckpointFromRuntime()
    this.refreshDbg()
  }

  private async startNewGame() {
    const token = ++this.startToken
    this.startBusy = true
    this.startBusyMessage = 'Starting new game...'
    this.openStartMenu()

    await this.save.clear()
    this.save.setEnabled(false)
    this.world.clear()
    this.inventory.reset()
    this.health.reset()

    this.checkpoint = { mapKey: 'overworld', spawnName: 'player_spawn' }
    if (token !== this.startToken) return
    await this.startAtCheckpoint(this.checkpoint)
  }

  private async continueGame() {
    const token = ++this.startToken
    this.startBusy = true
    this.startBusyMessage = 'Loading save...'
    this.openStartMenu()

    let data = this.startLoadedSave
    if (!data) {
      const res = await this.save.load()
      if (token !== this.startToken) return
      if (res.status !== 'ok') {
        this.startBusy = false
        this.startBusyMessage = null
        void this.refreshStartMenuState()
        this.openStartMenu()
        return
      }
      data = res.data
    }

    const cp = this.save.apply(data)
    this.health.reset()
    this.checkpoint = cp
    if (token !== this.startToken) return
    await this.startAtCheckpoint(cp)
  }

  private async startAtCheckpoint(cp: Checkpoint) {
    this.startMenu = false
    this.startLoading = false
    this.startBusy = false
    this.startBusyMessage = null
    this.overlay.hide()
    this.minimap.setMapVisible(false)
    this.minimap.setMiniVisible(true)
    this.spellSlotUI.setVisible(true)
    this.spellbookUI.hide()

    this.hero.setVelocity(0, 0)
    this.scene.physics.world.pause()
    this.scene.anims.pauseAll()

    this.mapRuntime.load(cp.mapKey, cp.spawnName)

    this.scene.physics.world.resume()
    this.scene.anims.resumeAll()

    this.save.setEnabled(true)
    await this.save.saveNow()
    this.refreshDbg()
  }
}

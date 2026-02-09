import * as Phaser from 'phaser'
import { MapRuntime } from '../game/MapRuntime'
import { Enemy } from '../entities/Enemy'
import { Hero } from '../entities/Hero'
import { HeroGear } from '../entities/HeroGear'
import { EnemyAISystem } from '../systems/EnemyAISystem'
import { InteractionSystem } from '../systems/InteractionSystem'
import { InputSystem } from '../systems/InputSystem'
import { InventorySystem } from '../systems/InventorySystem'
import { LootSystem } from '../systems/LootSystem'
import { PickupSystem } from '../systems/PickupSystem'
import { PlayerHealthSystem } from '../systems/PlayerHealthSystem'
import { SoundSystem } from '../systems/SoundSystem'
import { CombatSystem } from '../systems/CombatSystem'
import { SaveSystem, type SaveDataV1 } from '../systems/SaveSystem'
import { HeartsUI } from '../ui/HeartsUI'
import { DialogueUI } from '../ui/DialogueUI'
import { InteractPromptUI } from '../ui/InteractPromptUI'
import { MapNameUI } from '../ui/MapNameUI'
import { MinimapUI } from '../ui/MinimapUI'
import { OverlayUI } from '../ui/OverlayUI'
import { InventoryUI } from '../ui/InventoryUI'
import { WorldState } from '../game/WorldState'

export class GameScene extends Phaser.Scene {
  private controls!: InputSystem
  private hero!: Hero
  private speed = 240
  private debugAttackQueued = false
  private cleanedUp = false

  private mapRuntime!: MapRuntime
  private combat!: CombatSystem
  private enemyAI!: EnemyAISystem
  private health!: PlayerHealthSystem
  private loot!: LootSystem
  private world!: WorldState
  private inventory!: InventorySystem
  private pickups!: PickupSystem
  private sfx!: SoundSystem
  private save!: SaveSystem
  private dialogueUI!: DialogueUI
  private promptUI!: InteractPromptUI
  private interactions!: InteractionSystem
  private mapNameUI!: MapNameUI
  private minimap!: MinimapUI
  private overlay!: OverlayUI
  private inventoryUI!: InventoryUI
  private heroGear?: HeroGear

  private startMenu = true
  private startLoading = true
  private startBusy = false
  private startBusyMessage: string | null = null
  private startCanContinue = false
  private startError: string | null = null
  private startLoadedSave: SaveDataV1 | null = null
  private startToken = 0

  private paused = false
  private pauseMode: 'pause' | 'inventory' | 'map' = 'pause'
  private gameOver = false
  private dialoguePaused = false
  private checkpoint: { mapKey: 'overworld' | 'cave'; spawnName: string } = { mapKey: 'overworld', spawnName: 'player_spawn' }

  constructor() {
    super('game')
  }

  preload() {
    Hero.preload(this)
    this.load.spritesheet('slime', '/sprites/slime.png', { frameWidth: 44, frameHeight: 34 })
    this.load.spritesheet('bat', '/sprites/bat.png', { frameWidth: 64, frameHeight: 48 })
    this.load.image('overworldTiles', '/tilesets/overworld.png')
    this.load.tilemapTiledJSON('overworld', '/maps/overworld.json')
    this.load.tilemapTiledJSON('cave', '/maps/cave.json')

    CombatSystem.preload(this)
    HeartsUI.preload(this)
    PickupSystem.preload(this)
    InteractionSystem.preload(this)
    InventoryUI.preload(this)
    SoundSystem.preload(this)
  }

  create() {
    // If this Scene is restarted, `create()` runs again on the same instance.
    // Reset cleanup guard and install a fresh shutdown hook.
    this.cleanedUp = false
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this)
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown, this)

    this.controls = new InputSystem(this)

    this.hero = new Hero(this, 0, 0)
    this.sfx = new SoundSystem(this)

    this.cameras.main.startFollow(this.hero, true, 0.12, 0.12)
    this.createEnemyAnims()

    this.mapNameUI = new MapNameUI(this)
    this.overlay = new OverlayUI(this)
    this.dialogueUI = new DialogueUI(this)
    this.promptUI = new InteractPromptUI(this)

    this.world = new WorldState()
    this.inventory = new InventorySystem()
    this.heroGear = new HeroGear(this, this.hero, this.inventory)
    this.inventoryUI = new InventoryUI(this, this.inventory)
    this.save = new SaveSystem({
      inventory: this.inventory,
      world: this.world,
      getCheckpoint: () => ({ mapKey: this.checkpoint.mapKey, spawnName: this.checkpoint.spawnName }),
    })
    // Only start saving once the player starts a new game or continues.
    this.save.setEnabled(false)
    this.inventory.setOnChanged(() => {
      this.save.requestSave()
      if (this.inventoryUI?.isVisible?.()) this.inventoryUI.refresh()
    })
    this.world.setOnChanged(() => this.save.requestSave())

    this.mapRuntime = new MapRuntime(this, this.hero, {
      onChanged: () => {
        this.health?.onMapChanged?.()
        this.updateCheckpoint()
        this.mapNameUI.set(this.mapRuntime.mapKey)
        this.minimap?.onMapChanged?.()
        this.save?.requestSave?.()
        this.refreshDbg()
      },
      canWarp: () => (typeof this.health?.canWarp === 'function' ? this.health.canWarp() : true),
    })
    const debugHitbox = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugHitbox')
    this.combat = new CombatSystem(this, this.hero, {
      getFacing: () => this.hero.getFacing(),
      getWeapon: () => this.inventory.getWeaponDef(),
      getAttackDamage: () => this.inventory.getAttackDamage(),
      debugHitbox,
      hasLineOfSight: (fromX, fromY, toX, toY) => this.mapRuntime.hasLineOfSight(fromX, fromY, toX, toY),
    })

    this.health = new PlayerHealthSystem(this, this.hero, () => this.mapRuntime.enemies)
    this.health.onMapChanged()

    this.pickups = new PickupSystem(this, this.hero, { inventory: this.inventory, health: this.health, world: this.world })
    // LootSystem listens for enemy death events and spawns drops via PickupSystem.
    this.loot = new LootSystem(this, this.pickups)
    this.interactions = new InteractionSystem(
      this,
      this.hero,
      { inventory: this.inventory, world: this.world, dialogue: this.dialogueUI, prompt: this.promptUI },
      { onDialogueOpen: () => this.pauseForDialogue(), onDialogueClose: () => this.resumeFromDialogue() },
    )
    this.mapRuntime.setPickupSystem(this.pickups)
    this.mapRuntime.setInteractionSystem(this.interactions)

    this.enemyAI = new EnemyAISystem(this, this.hero, () => this.mapRuntime.enemies, {
      findPath: (fromX, fromY, toX, toY) => this.mapRuntime.findPath(fromX, fromY, toX, toY),
      hasLineOfSight: (fromX, fromY, toX, toY) => this.mapRuntime.hasLineOfSight(fromX, fromY, toX, toY),
    })

    this.minimap = new MinimapUI(this, this.hero, {
      getMapKey: () => this.mapRuntime.mapKey,
      getMapSizeTiles: () => this.mapRuntime.getMapSizeTiles(),
      isTileBlocked: (tx, ty) => this.mapRuntime.isTileBlocked(tx, ty),
      getWarpRects: () => this.mapRuntime.getWarpTileRects(),
      getEnemyPoints: () => {
        const kids = this.mapRuntime.enemies?.getChildren?.() ?? []
        return kids.filter((k: any) => k?.active).map((k: any) => ({ x: k.x, y: k.y }))
      },
    })

    // Start menu (New Game / Continue) is shown before loading a map.
    this.mapNameUI.set(null)
    this.openStartMenu()
    void this.refreshStartMenuState()

    this.refreshDbg()
  }

  private onShutdown() {
    if (this.cleanedUp) return
    this.cleanedUp = true

    // Stop autosaves and detach callbacks so we don't keep touching LocalStorage after shutdown.
    this.save?.setEnabled?.(false)
    this.inventory?.setOnChanged?.(undefined)
    this.world?.setOnChanged?.(undefined)

    this.enemyAI?.destroy?.()
    this.loot?.destroy?.()
    this.health?.destroy?.()
    this.pickups?.clear?.()
    this.interactions?.destroy?.()
    this.mapRuntime?.destroy?.()
    this.sfx?.destroy?.()

    this.minimap?.destroy?.()
    this.inventoryUI?.destroy?.()
    this.mapNameUI?.destroy?.()
    this.dialogueUI?.destroy?.()
    this.promptUI?.destroy?.()
    this.overlay?.destroy?.()
    this.heroGear?.destroy?.()

    // Avoid leaking references to dead objects into tests/devtools between restarts.
    if (typeof window !== 'undefined') {
      try {
        delete (window as any).__dbg
      } catch {
        ;(window as any).__dbg = undefined
      }
    }
  }

  update(_time: number, delta: number) {
    this.minimap?.update?.()

    if (this.startMenu) {
      if (this.startBusy) return
      if (this.controls.justPressed('newGame')) {
        void this.startNewGame()
        return
      }
      if (this.startLoading) return
      if (this.controls.justPressed('confirm')) {
        if (this.startCanContinue) void this.continueGame()
        else void this.startNewGame()
        return
      }
      return
    }

    if (this.gameOver) {
      if (this.controls.justPressed('confirm')) this.respawn()
      return
    }

    const interactPressed = this.controls.justPressed('interact')
    if (!this.paused) this.interactions.update()
    if (interactPressed && (!this.paused || this.interactions.isDialogueOpen())) this.interactions.tryInteract()
    if (this.interactions.isDialogueOpen()) return

    if (this.controls.justPressed('pause')) {
      if (this.paused) this.setPaused(false)
      else this.setPaused(true, 'pause')
      this.refreshDbg()
    }

    if (this.controls.justPressed('inventory')) {
      if (this.paused && this.pauseMode === 'inventory') this.setPaused(false)
      else this.setPaused(true, 'inventory')
      this.refreshDbg()
    }

    if (this.controls.justPressed('map')) {
      if (this.paused && this.pauseMode === 'map') this.setPaused(false)
      else this.setPaused(true, 'map')
      this.refreshDbg()
    }

    if (this.controls.justPressed('weapon1')) {
      if (this.inventory.equipWeapon('sword')) {
        this.refreshDbg()
      }
    }
    if (this.controls.justPressed('weapon2')) {
      if (this.inventory.equipWeapon('greatsword')) {
        this.refreshDbg()
      }
    }

    if (this.paused) return

    const { vx, vy } = this.controls.getMoveAxes()
    const weapon = this.inventory.getWeaponDef()
    const attackJustPressed = this.controls.justPressed('attack')
    const attackPressedRaw = attackJustPressed || this.debugAttackQueued
    const attackPressed = !!weapon && attackPressedRaw && this.combat.canAttack()
    const res = this.hero.updateFsm(this.time.now, delta, { vx, vy, attackPressed }, { moveSpeed: this.speed, attackTiming: weapon?.timings })
    this.heroGear?.update(res.didStartAttack)
    // Keep debug attacks queued until an attack actually starts, so tests don't flake on timing/locks.
    if (!weapon) this.debugAttackQueued = false
    else if (res.didStartAttack) this.debugAttackQueued = false
    if (res.didStrike) this.combat.tryAttack()

    this.health.update()
    this.pickups.update()
    if (this.health.getHp() <= 0) {
      this.triggerGameOver()
      this.refreshDbg()
      return
    }
    this.enemyAI.update(this.time.now, delta)
  }

  private createEnemyAnims() {
    if (!this.anims.exists('slime-wiggle')) {
      this.anims.create({
        key: 'slime-wiggle',
        frames: [{ key: 'slime', frame: 0 }, { key: 'slime', frame: 1 }, { key: 'slime', frame: 2 }, { key: 'slime', frame: 1 }],
        frameRate: 8,
        repeat: -1,
      })
    }
    if (!this.anims.exists('bat-flap')) {
      this.anims.create({
        key: 'bat-flap',
        frames: [{ key: 'bat', frame: 0 }, { key: 'bat', frame: 1 }, { key: 'bat', frame: 2 }, { key: 'bat', frame: 1 }],
        frameRate: 12,
        repeat: -1,
      })
    }
  }

  private refreshDbg() {
    const rawEnemies = this.mapRuntime.enemies?.getChildren?.() ?? []
    ;(window as any).__dbg = {
      player: this.hero,
      heroState: this.hero.getState(),
      mapKey: this.mapRuntime.mapKey,
      spawnName: this.mapRuntime.spawnName,
      facing: this.hero.getFacing(),
      setFacing: (facing: string) => {
        if (facing === 'up' || facing === 'down' || facing === 'left' || facing === 'right') this.hero.setFacing(facing)
      },
      hasSave: () => this.save?.hasSave?.() ?? false,
      saveNow: () => this.save?.saveNow?.() ?? false,
      clearSave: () => this.save?.clear?.(),
      getLastAttack: () => this.combat?.getDebug?.() ?? { at: 0, hits: 0 },
      tryAttack: () => {
        this.debugAttackQueued = true
      },
      tryInteract: () => this.interactions?.tryInteract?.(),
      equipWeapon: (id: string) => {
        if (id === 'sword' || id === 'greatsword') return this.inventory?.equipWeapon?.(id)
        return false
      },
      moveInvItem: (from: any, to: any) => {
        const isSlot = (v: any) => {
          if (!v || typeof v !== 'object') return false
          if (v.type === 'equip') return v.slot === 'helmet' || v.slot === 'chest' || v.slot === 'gloves' || v.slot === 'boots' || v.slot === 'weapon' || v.slot === 'shield'
          if (v.type === 'bag') return typeof v.index === 'number' && Number.isFinite(v.index)
          return false
        }
        if (!isSlot(from) || !isSlot(to)) return { ok: false, error: 'bad-args' }
        return this.inventory?.moveItem?.(from, to) ?? { ok: false, error: 'no-inventory' }
      },
      getPlayerHp: () => this.health?.getHp?.() ?? null,
      getPlayerMaxHp: () => this.health?.getMaxHp?.() ?? null,
      setPlayerHp: (hp: number) => this.health?.setHp?.(hp),
      getInventory: () => this.inventory?.snapshot?.() ?? null,
      getDialogue: () => ({ open: this.interactions?.isDialogueOpen?.() ?? false, text: this.interactions?.getDialogueText?.() ?? '' }),
      enemyCount: rawEnemies.length,
      enemyActives: rawEnemies.map((e: any) => e?.active ?? null),
      getEnemies: () => {
        const enemies = this.mapRuntime.enemies?.getChildren?.() ?? []
        return enemies
          .filter((e: any) => e?.active)
          .map((e: any) => {
            const body = e?.body as Phaser.Physics.Arcade.Body | undefined
            const bx = body?.center?.x ?? e.x
            const by = body?.center?.y ?? e.y
            return e instanceof Enemy
              ? { kind: e.kind, x: e.x, y: e.y, bx, by, hp: e.getHp() }
              : { kind: null, x: e.x, y: e.y, bx, by, hp: null }
          })
      },
      getGameState: () => ({
        startMenu: this.startMenu,
        startLoading: this.startLoading,
        startCanContinue: this.startCanContinue,
        startBusy: this.startBusy,
        paused: this.paused,
        pauseMode: this.pauseMode,
        gameOver: this.gameOver,
        dialogueOpen: this.interactions?.isDialogueOpen?.() ?? false,
        checkpoint: { ...this.checkpoint },
      }),
      togglePause: () => (this.paused ? this.setPaused(false) : this.setPaused(true, 'pause')),
      respawn: () => this.respawn(),
      depths: {
        ground: this.mapRuntime.groundDepth,
        player: this.hero.depth,
      },
    }
  }

  private updateCheckpoint() {
    const mk = this.mapRuntime.mapKey
    const sn = this.mapRuntime.spawnName
    if (mk && typeof sn === 'string' && sn) this.checkpoint = { mapKey: mk, spawnName: sn }
  }

  private setPaused(paused: boolean, mode: 'pause' | 'inventory' | 'map' = this.pauseMode) {
    if (this.paused === paused && this.pauseMode === mode) return
    const wasPaused = this.paused
    this.paused = paused
    this.pauseMode = mode

    if (!wasPaused && this.paused) this.sfx?.playUiOpen?.()
    if (wasPaused && !this.paused) this.sfx?.playUiClose?.()

    if (this.paused) {
      this.hero.setVelocity(0, 0)
      this.physics.world.pause()
      this.anims.pauseAll()

      this.minimap?.setMiniVisible?.(false)
      this.minimap?.setMapVisible?.(false)
      this.inventoryUI?.hide?.()

      if (this.pauseMode === 'map') {
        this.overlay.hide()
        this.minimap?.setMapVisible?.(true)
      } else if (this.pauseMode === 'inventory') {
        this.overlay.hide()
        this.inventoryUI?.show?.()
      } else {
        this.minimap?.setMapVisible?.(false)
        this.inventoryUI?.hide?.()
        this.overlay.showPause(['ESC: Resume', 'I: Inventory', 'M: Map'])
      }
    } else {
      // Dialogue may have paused the world separately.
      if (!this.dialoguePaused) {
        this.physics.world.resume()
        this.anims.resumeAll()
      }
      this.overlay.hide()
      this.minimap?.setMapVisible?.(false)
      this.minimap?.setMiniVisible?.(true)
      this.inventoryUI?.hide?.()
    }
  }

  private pauseForDialogue() {
    if (this.dialoguePaused) return
    if (this.paused) return
    if (this.gameOver) return
    this.dialoguePaused = true
    this.hero.setVelocity(0, 0)
    this.physics.world.pause()
    this.anims.pauseAll()
  }

  private resumeFromDialogue() {
    if (!this.dialoguePaused) return
    this.dialoguePaused = false
    if (this.paused) return
    if (this.gameOver) return
    this.physics.world.resume()
    this.anims.resumeAll()
  }

  private triggerGameOver() {
    if (this.gameOver) return
    this.gameOver = true
    this.paused = false
    this.pauseMode = 'pause'
    this.dialoguePaused = false

    this.hero.setVelocity(0, 0)
    this.physics.world.pause()
    this.anims.pauseAll()
    this.inventoryUI?.hide?.()
    this.overlay.showGameOver(['Press ENTER to respawn at last checkpoint.'])
  }

  private respawn() {
    if (!this.gameOver) return
    this.gameOver = false

    this.health.reset()
    this.physics.world.resume()
    this.anims.resumeAll()
    this.overlay.hide()

    this.mapRuntime.load(this.checkpoint.mapKey, this.checkpoint.spawnName)
    this.updateCheckpoint()
    this.mapNameUI.set(this.mapRuntime.mapKey)
    this.refreshDbg()
  }

  private async refreshStartMenuState() {
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

  private openStartMenu() {
    this.startMenu = true
    this.paused = false
    this.pauseMode = 'pause'
    this.gameOver = false
    this.dialoguePaused = false
    this.hero.setVelocity(0, 0)
    this.physics.world.pause()
    this.anims.pauseAll()
    this.minimap?.setMiniVisible?.(false)
    this.minimap?.setMapVisible?.(false)
    this.inventoryUI?.hide?.()

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
    lines.push('WASD: Move   SPACE: Attack   E: Interact   I: Inventory   M: Map')
    this.overlay.showStart(lines)
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

  private async startAtCheckpoint(cp: { mapKey: 'overworld' | 'cave'; spawnName: string }) {
    this.startMenu = false
    this.startLoading = false
    this.startBusy = false
    this.startBusyMessage = null
    this.overlay.hide()
    this.minimap?.setMapVisible?.(false)
    this.minimap?.setMiniVisible?.(true)

    // Load while paused, then resume.
    this.hero.setVelocity(0, 0)
    this.physics.world.pause()
    this.anims.pauseAll()

    this.mapRuntime.load(cp.mapKey, cp.spawnName)

    this.physics.world.resume()
    this.anims.resumeAll()

    this.save.setEnabled(true)
    await this.save.saveNow()
    this.refreshDbg()
  }
}

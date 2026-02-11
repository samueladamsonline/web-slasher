import * as Phaser from 'phaser'
import { MapRuntime } from '../game/MapRuntime'
import { Enemy } from '../entities/Enemy'
import { Hero } from '../entities/Hero'
import { EnemyAISystem } from '../systems/EnemyAISystem'
import { InteractionSystem } from '../systems/InteractionSystem'
import { InputSystem } from '../systems/InputSystem'
import { InventorySystem } from '../systems/InventorySystem'
import { LootSystem } from '../systems/LootSystem'
import { PickupSystem } from '../systems/PickupSystem'
import { PlayerHealthSystem } from '../systems/PlayerHealthSystem'
import { SoundSystem } from '../systems/SoundSystem'
import { CombatSystem } from '../systems/CombatSystem'
import { SpellSystem } from '../systems/SpellSystem'
import { StatusEffectSystem } from '../systems/StatusEffectSystem'
import { SaveSystem } from '../systems/SaveSystem'
import { HeartsUI } from '../ui/HeartsUI'
import { DialogueUI } from '../ui/DialogueUI'
import { InteractPromptUI } from '../ui/InteractPromptUI'
import { MapNameUI } from '../ui/MapNameUI'
import { MinimapUI } from '../ui/MinimapUI'
import { OverlayUI } from '../ui/OverlayUI'
import { InventoryUI } from '../ui/InventoryUI'
import { SpellSlotUI } from '../ui/SpellSlotUI'
import { SpellbookUI } from '../ui/SpellbookUI'
import { WorldState } from '../game/WorldState'
import { SceneDebugCoordinator } from './coordinators/SceneDebugCoordinator'
import { SceneFlowCoordinator } from './coordinators/SceneFlowCoordinator'

export class GameScene extends Phaser.Scene {
  private controls!: InputSystem
  private hero!: Hero
  private speed = 240
  private baseMaxHp = 5
  private debugAttackQueued = false
  private debugCastQueuedDir: { x: number; y: number } | null = null
  private cleanedUp = false

  private mapRuntime!: MapRuntime
  private combat!: CombatSystem
  private spells!: SpellSystem
  private enemyAI!: EnemyAISystem
  private statusFx!: StatusEffectSystem
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
  private spellSlotUI!: SpellSlotUI
  private spellbookUI!: SpellbookUI

  private flow!: SceneFlowCoordinator
  private debug!: SceneDebugCoordinator

  constructor() {
    super('game')
  }

  preload() {
    Hero.preload(this)
    this.load.spritesheet('slime', '/sprites/slime.png', { frameWidth: 44, frameHeight: 34 })
    this.load.spritesheet('bat', '/sprites/bat.png', { frameWidth: 64, frameHeight: 48 })
    this.load.image('spider', '/sprites/spider.png')
    this.load.image('skeleton', '/sprites/skeleton.png')
    this.load.image('wisp', '/sprites/wisp.png')
    this.load.image('imp', '/sprites/imp.png')
    this.load.image('golem', '/sprites/golem.png')
    this.load.image('bone_lord', '/sprites/bone_lord.png')
    this.load.image('overworldTiles', '/tilesets/overworld.png')
    this.load.tilemapTiledJSON('overworld', '/maps/overworld.json')
    this.load.tilemapTiledJSON('cave', '/maps/cave.json')
    this.load.tilemapTiledJSON('marsh', '/maps/marsh.json')
    this.load.tilemapTiledJSON('ruins', '/maps/ruins.json')
    this.load.tilemapTiledJSON('citadel', '/maps/citadel.json')

    CombatSystem.preload(this)
    SpellSystem.preload(this)
    HeartsUI.preload(this)
    PickupSystem.preload(this)
    InteractionSystem.preload(this)
    InventoryUI.preload(this)
    SoundSystem.preload(this)
    SpellSlotUI.preload(this)
    StatusEffectSystem.preload(this)
  }

  create() {
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
    this.spellSlotUI = new SpellSlotUI(this)
    this.spellSlotUI.setVisible(false)

    this.world = new WorldState()
    this.inventory = new InventorySystem()
    this.inventoryUI = new InventoryUI(this, this.inventory)
    this.spellbookUI = new SpellbookUI(this, this.inventory)
    this.spellbookUI.hide()

    this.save = new SaveSystem({
      inventory: this.inventory,
      world: this.world,
      getCheckpoint: () => this.flow?.getCheckpoint?.() ?? { mapKey: 'overworld', spawnName: 'player_spawn' },
    })
    this.save.setEnabled(false)

    this.inventory.setOnChanged(() => {
      this.save.requestSave()
      if (this.inventoryUI.isVisible()) this.inventoryUI.refresh()
      if (this.spellbookUI.isVisible()) this.spellbookUI.refresh()
      const stats = this.inventory.getPlayerStats()
      this.health?.setMaxHp(this.baseMaxHp + stats.maxHpBonus)
      this.spellSlotUI.setSpell(stats.selectedSpell)
    })
    this.world.setOnChanged(() => this.save.requestSave())

    this.mapRuntime = new MapRuntime(this, this.hero, {
      onChanged: () => {
        this.health.onMapChanged()
        this.spells.onMapChanged()
        this.flow.syncCheckpointFromRuntime()
        this.mapNameUI.set(this.mapRuntime.mapKey)
        this.minimap.onMapChanged()
        this.save.requestSave()
        this.debug.refresh()
      },
      canWarp: () => this.health.canWarp(),
    })

    const debugHitbox = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugHitbox')
    this.combat = new CombatSystem(this, this.hero, {
      getFacing: () => this.hero.getFacing(),
      getWeapon: () => this.inventory.getWeaponDef(),
      getAttackDamage: () => this.inventory.getAttackDamage(),
      getAttackSpeedMul: () => this.inventory.getPlayerStats().attackSpeedMul,
      debugHitbox,
      hasLineOfSight: (fromX, fromY, toX, toY) => this.mapRuntime.hasLineOfSight(fromX, fromY, toX, toY),
    })

    this.spells = new SpellSystem(this, this.hero, () => this.mapRuntime.enemies, {
      getSelectedSpell: () => this.inventory.getSelectedSpell(),
      getCollisionLayer: () => this.mapRuntime.getCollisionLayer(),
    })
    this.spellSlotUI.setSpell(this.inventory.getPlayerStats().selectedSpell)

    this.health = new PlayerHealthSystem(this, this.hero, () => this.mapRuntime.enemies)
    this.health.onMapChanged()

    this.pickups = new PickupSystem(this, this.hero, { inventory: this.inventory, health: this.health, world: this.world })
    this.loot = new LootSystem(this, this.pickups)

    this.interactions = new InteractionSystem(
      this,
      this.hero,
      { inventory: this.inventory, world: this.world, dialogue: this.dialogueUI, prompt: this.promptUI },
      {
        onDialogueOpen: () => this.flow.pauseForDialogue(),
        onDialogueClose: () => this.flow.resumeFromDialogue(),
      },
    )

    this.mapRuntime.setPickupSystem(this.pickups)
    this.mapRuntime.setInteractionSystem(this.interactions)

    this.enemyAI = new EnemyAISystem(this, this.hero, () => this.mapRuntime.enemies, {
      findPath: (fromX, fromY, toX, toY) => this.mapRuntime.findPath(fromX, fromY, toX, toY),
      hasLineOfSight: (fromX, fromY, toX, toY) => this.mapRuntime.hasLineOfSight(fromX, fromY, toX, toY),
      onEnemyStrike: (strike) => this.health.tryApplyEnemyStrike(strike),
    })

    this.statusFx = new StatusEffectSystem(this, () => this.mapRuntime.enemies)

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

    this.debug = new SceneDebugCoordinator(() => this.buildDebugState())

    this.flow = new SceneFlowCoordinator({
      scene: this,
      hero: this.hero,
      mapRuntime: this.mapRuntime,
      world: this.world,
      inventory: this.inventory,
      health: this.health,
      save: this.save,
      sfx: this.sfx,
      overlay: this.overlay,
      minimap: this.minimap,
      inventoryUI: this.inventoryUI,
      spellSlotUI: this.spellSlotUI,
      spellbookUI: this.spellbookUI,
      refreshDbg: () => this.debug.refresh(),
    })

    this.mapNameUI.set(null)
    this.flow.openStartMenu()
    void this.flow.refreshStartMenuState()

    this.debug.refresh()
  }

  private onShutdown() {
    if (this.cleanedUp) return
    this.cleanedUp = true

    this.save?.setEnabled(false)
    this.inventory?.setOnChanged(undefined)
    this.world?.setOnChanged(undefined)

    this.enemyAI?.destroy()
    this.loot?.destroy()
    this.health?.destroy()
    this.pickups?.clear()
    this.interactions?.destroy()
    this.mapRuntime?.destroy()
    this.sfx?.destroy()
    this.spells?.destroy()
    this.statusFx?.destroy()

    this.minimap?.destroy()
    this.inventoryUI?.destroy()
    this.spellSlotUI?.destroy()
    this.spellbookUI?.destroy()
    this.mapNameUI?.destroy()
    this.dialogueUI?.destroy()
    this.promptUI?.destroy()
    this.overlay?.destroy()

    this.debug?.clear?.()
  }

  update(_time: number, delta: number) {
    this.minimap.update()

    if (this.flow.isStartMenu()) {
      void this.flow.handleStartMenuInput(this.controls)
      return
    }

    if (this.flow.handleGameOverInput(this.controls)) return

    const interactPressed = this.controls.justPressed('interact')
    if (!this.flow.isPaused()) this.interactions.update()
    if (interactPressed && (!this.flow.isPaused() || this.interactions.isDialogueOpen())) this.interactions.tryInteract()
    if (this.interactions.isDialogueOpen()) return

    if (this.flow.handlePauseShortcuts(this.controls)) this.debug.refresh()

    if (this.flow.isPaused()) {
      if (this.flow.getPauseMode() === 'spellbook') {
        if (this.controls.justPressed('spell1')) this.spellbookUI.onHotkeyPressed(0)
        if (this.controls.justPressed('spell2')) this.spellbookUI.onHotkeyPressed(1)
        if (this.controls.justPressed('spell3')) this.spellbookUI.onHotkeyPressed(2)
        if (this.controls.justPressed('spell4')) this.spellbookUI.onHotkeyPressed(3)
        if (this.controls.justPressed('spell5')) this.spellbookUI.onHotkeyPressed(4)
      }
      return
    }

    const { vx, vy } = this.controls.getMoveAxes()

    if (this.controls.justPressed('spell1')) this.inventory.selectSpellHotkey(0)
    if (this.controls.justPressed('spell2')) this.inventory.selectSpellHotkey(1)
    if (this.controls.justPressed('spell3')) this.inventory.selectSpellHotkey(2)
    if (this.controls.justPressed('spell4')) this.inventory.selectSpellHotkey(3)
    if (this.controls.justPressed('spell5')) this.inventory.selectSpellHotkey(4)

    const stats = this.inventory.getPlayerStats()
    if (!stats.selectedSpell) this.debugCastQueuedDir = null
    const weapon = stats.weapon
    const attackJustPressed = this.controls.justPressed('attack')
    const attackPressedRaw = attackJustPressed || this.debugAttackQueued
    const attackPressed = !!weapon && attackPressedRaw && this.combat.canAttack()
    const scaledAttackTiming = weapon
      ? {
          windupMs: Math.max(0, Math.floor(weapon.timings.windupMs / stats.attackSpeedMul)),
          activeMs: Math.max(0, Math.floor(weapon.timings.activeMs / stats.attackSpeedMul)),
          recoveryMs: Math.max(0, Math.floor(weapon.timings.recoveryMs / stats.attackSpeedMul)),
        }
      : undefined

    const res = this.hero.updateFsm(
      this.time.now,
      delta,
      { vx, vy, attackPressed },
      { moveSpeed: this.speed * stats.moveSpeedMul, attackTiming: scaledAttackTiming },
    )

    if (!weapon) this.debugAttackQueued = false
    else if (res.didStartAttack) this.debugAttackQueued = false
    if (res.didStrike) this.combat.tryAttack()

    const castDir = this.controls.getCastDir()
    const castDirRaw = castDir ?? this.debugCastQueuedDir
    if (castDirRaw && stats.selectedSpell) {
      const didCast = this.spells.tryCastSelected(this.time.now, castDirRaw)
      if (!castDir && this.debugCastQueuedDir) {
        if (!stats.selectedSpell) this.debugCastQueuedDir = null
        else if (didCast) this.debugCastQueuedDir = null
      }
    }

    this.health.setMaxHp(this.baseMaxHp + stats.maxHpBonus)
    this.health.update()
    this.pickups.update()

    if (this.health.getHp() <= 0) {
      this.flow.triggerGameOver()
      this.debug.refresh()
      return
    }

    this.enemyAI.update(this.time.now, delta)
    this.statusFx.update(this.time.now)
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

  private buildDebugState() {
    const rawEnemies = this.mapRuntime.enemies?.getChildren?.() ?? []
    return {
      player: this.hero,
      heroState: this.hero.getState(),
      mapKey: this.mapRuntime.mapKey,
      spawnName: this.mapRuntime.spawnName,
      facing: this.hero.getFacing(),
      setFacing: (facing: string) => {
        if (facing === 'up' || facing === 'down' || facing === 'left' || facing === 'right') this.hero.setFacing(facing)
      },
      hasSave: () => this.save.hasSave(),
      saveNow: () => this.save.saveNow(),
      clearSave: () => this.save.clear(),
      getLastAttack: () => this.combat.getDebug(),
      tryAttack: () => {
        this.debugAttackQueued = true
      },
      getLastCast: () => this.spells.getDebug(),
      getProjectiles: () => this.spells.getProjectilesDebug(),
      tryCast: (dir: string = 'right') => {
        const d = dir === 'left' ? { x: -1, y: 0 } : dir === 'up' ? { x: 0, y: -1 } : dir === 'down' ? { x: 0, y: 1 } : { x: 1, y: 0 }
        this.debugCastQueuedDir = d
      },
      tryInteract: () => this.interactions.tryInteract(),
      equipWeapon: (id: string) => {
        if (id === 'sword' || id === 'greatsword') return this.inventory.equipWeapon(id)
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
        return this.inventory.moveItem(from, to)
      },
      getPlayerHp: () => this.health.getHp(),
      getPlayerMaxHp: () => this.health.getMaxHp(),
      setPlayerHp: (hp: number) => this.health.setHp(hp),
      getInventory: () => this.inventory.snapshot(),
      getDialogue: () => ({ open: this.interactions.isDialogueOpen(), text: this.interactions.getDialogueText() }),
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
      getGameState: () => ({ ...this.flow.getState(), dialogueOpen: this.interactions.isDialogueOpen() }),
      togglePause: () => {
        if (this.flow.isPaused()) this.flow.setPaused(false)
        else this.flow.setPaused(true, 'pause')
        this.debug.refresh()
      },
      respawn: () => {
        this.flow.respawn()
        this.debug.refresh()
      },
      depths: {
        ground: this.mapRuntime.groundDepth,
        player: this.hero.depth,
      },
    }
  }
}

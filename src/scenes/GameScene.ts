import * as Phaser from 'phaser'
import { CombatSystem } from '../game/CombatSystem'
import { MapRuntime } from '../game/MapRuntime'
import { DEPTH_PLAYER, HERO_H, HERO_W } from '../game/constants'
import type { Facing } from '../game/types'
import { Enemy } from '../entities/Enemy'
import { EnemyAISystem } from '../systems/EnemyAISystem'
import { PlayerHealthSystem } from '../systems/PlayerHealthSystem'
import { HeartsUI } from '../ui/HeartsUI'
import { MapNameUI } from '../ui/MapNameUI'
import { OverlayUI } from '../ui/OverlayUI'

export class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }
  private keyEsc!: Phaser.Input.Keyboard.Key
  private keyI!: Phaser.Input.Keyboard.Key
  private keyEnter!: Phaser.Input.Keyboard.Key

  private player!: Phaser.Physics.Arcade.Sprite
  private speed = 240
  private facing: Facing = 'down'

  private mapRuntime!: MapRuntime
  private combat!: CombatSystem
  private enemyAI!: EnemyAISystem
  private health!: PlayerHealthSystem
  private mapNameUI!: MapNameUI
  private overlay!: OverlayUI

  private paused = false
  private gameOver = false
  private checkpoint: { mapKey: string; spawnName: string } = { mapKey: 'overworld', spawnName: 'player_spawn' }

  constructor() {
    super('game')
  }

  preload() {
    this.load.spritesheet('hero', '/sprites/hero.png', { frameWidth: HERO_W, frameHeight: HERO_H })
    this.load.spritesheet('slime', '/sprites/slime.png', { frameWidth: 44, frameHeight: 34 })
    this.load.spritesheet('bat', '/sprites/bat.png', { frameWidth: 64, frameHeight: 48 })
    this.load.image('overworldTiles', '/tilesets/overworld.png')
    this.load.tilemapTiledJSON('overworld', '/maps/overworld.json')
    this.load.tilemapTiledJSON('cave', '/maps/cave.json')

    CombatSystem.preload(this)
    HeartsUI.preload(this)
  }

  create() {
    const keyboard = this.input.keyboard!
    this.cursors = keyboard.createCursorKeys()
    this.wasd = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }
    this.keyEsc = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.keyI = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I)
    this.keyEnter = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)

    this.player = this.physics.add.sprite(0, 0, 'hero', this.frameFor(this.facing, 0))
    this.player.setOrigin(0.5, 0.8)
    this.player.setDepth(DEPTH_PLAYER)
    this.player.setCollideWorldBounds(true)

    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setSize(28, 28)
    body.setOffset((HERO_W - 28) / 2, HERO_H - 28 - 8)

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)
    this.createHeroAnims()
    this.createEnemyAnims()

    this.mapNameUI = new MapNameUI(this)
    this.overlay = new OverlayUI(this)

    this.mapRuntime = new MapRuntime(this, this.player, {
      onChanged: () => {
        this.health?.onMapChanged?.()
        this.updateCheckpoint()
        this.mapNameUI.set(this.mapRuntime.mapKey)
        this.refreshDbg()
      },
      canWarp: () => (typeof this.health?.canWarp === 'function' ? this.health.canWarp() : true),
    })
    const debugHitbox = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugHitbox')
    this.combat = new CombatSystem(this, this.player, {
      getFacing: () => this.facing,
      getEnemyGroup: () => this.mapRuntime.enemies,
      debugHitbox,
    })
    this.combat.bindInput(keyboard)

    this.health = new PlayerHealthSystem(this, this.player, () => this.mapRuntime.enemies)
    this.health.onMapChanged()

    this.enemyAI = new EnemyAISystem(this.player, () => this.mapRuntime.enemies)

    this.mapRuntime.load('overworld', 'player_spawn')
    this.updateCheckpoint()
    this.mapNameUI.set(this.mapRuntime.mapKey)

    this.refreshDbg()
  }

  update() {
    if (!this.gameOver && (Phaser.Input.Keyboard.JustDown(this.keyEsc) || Phaser.Input.Keyboard.JustDown(this.keyI))) {
      this.setPaused(!this.paused)
      this.refreshDbg()
    }

    if (this.gameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.keyEnter)) this.respawn()
      return
    }

    if (this.paused) return

    const left = !!this.cursors.left?.isDown || !!this.wasd.left?.isDown
    const right = !!this.cursors.right?.isDown || !!this.wasd.right?.isDown
    const up = !!this.cursors.up?.isDown || !!this.wasd.up?.isDown
    const down = !!this.cursors.down?.isDown || !!this.wasd.down?.isDown

    const vx = (right ? 1 : 0) - (left ? 1 : 0)
    const vy = (down ? 1 : 0) - (up ? 1 : 0)

    const vec = new Phaser.Math.Vector2(vx, vy).normalize()
    this.player.setVelocity(vec.x * this.speed, vec.y * this.speed)

    const moving = vx !== 0 || vy !== 0
    if (moving) {
      if (vx !== 0) this.facing = vx > 0 ? 'right' : 'left'
      else this.facing = vy > 0 ? 'down' : 'up'
      this.player.anims.play(`hero-walk-${this.facing}`, true)
    } else {
      this.player.anims.stop()
      this.player.setFrame(this.frameFor(this.facing, 0))
    }

    this.health.update()
    if (this.health.getHp() <= 0) {
      this.triggerGameOver()
      this.refreshDbg()
      return
    }
    this.combat.update()
    this.enemyAI.update(this.time.now)
  }

  private createHeroAnims() {
    const facings: Facing[] = ['down', 'up', 'left', 'right']
    for (const facing of facings) {
      this.anims.create({
        key: `hero-walk-${facing}`,
        frames: [
          { key: 'hero', frame: this.frameFor(facing, 0) },
          { key: 'hero', frame: this.frameFor(facing, 1) },
          { key: 'hero', frame: this.frameFor(facing, 2) },
          { key: 'hero', frame: this.frameFor(facing, 1) },
        ],
        frameRate: 10,
        repeat: -1,
      })
    }
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

  private frameFor(facing: Facing, step: 0 | 1 | 2) {
    const rowByFacing: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 }
    return rowByFacing[facing] * 3 + step
  }

  private refreshDbg() {
    const rawEnemies = this.mapRuntime.enemies?.getChildren?.() ?? []
    ;(window as any).__dbg = {
      player: this.player,
      mapKey: this.mapRuntime.mapKey,
      spawnName: this.mapRuntime.spawnName,
      facing: this.facing,
      getLastAttack: () => this.combat?.getDebug?.() ?? { at: 0, hits: 0 },
      tryAttack: () => this.combat?.tryAttack?.(),
      getPlayerHp: () => this.health?.getHp?.() ?? null,
      getPlayerMaxHp: () => this.health?.getMaxHp?.() ?? null,
      setPlayerHp: (hp: number) => this.health?.setHp?.(hp),
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
      getGameState: () => ({ paused: this.paused, gameOver: this.gameOver, checkpoint: { ...this.checkpoint } }),
      togglePause: () => this.setPaused(!this.paused),
      respawn: () => this.respawn(),
      depths: {
        ground: this.mapRuntime.groundDepth,
        player: this.player.depth,
      },
    }
  }

  private updateCheckpoint() {
    const mk = this.mapRuntime.mapKey
    const sn = this.mapRuntime.spawnName
    if (typeof mk === 'string' && mk && typeof sn === 'string' && sn) this.checkpoint = { mapKey: mk, spawnName: sn }
  }

  private setPaused(paused: boolean) {
    if (this.paused === paused) return
    this.paused = paused

    if (this.paused) {
      this.player.setVelocity(0, 0)
      this.physics.world.pause()
      this.anims.pauseAll()
      this.overlay.showPause(['ESC or I: Resume', '', 'Inventory (stub)', '- Sword: Basic', '- Keys: 0'])
    } else {
      this.physics.world.resume()
      this.anims.resumeAll()
      this.overlay.hide()
    }
  }

  private triggerGameOver() {
    if (this.gameOver) return
    this.gameOver = true
    this.paused = false

    this.player.setVelocity(0, 0)
    this.physics.world.pause()
    this.anims.pauseAll()
    this.overlay.showGameOver(['Press ENTER to respawn at last checkpoint.'])
  }

  private respawn() {
    if (!this.gameOver) return
    this.gameOver = false

    this.health.reset()
    this.physics.world.resume()
    this.anims.resumeAll()
    this.overlay.hide()

    this.mapRuntime.load(this.checkpoint.mapKey as any, this.checkpoint.spawnName)
    this.updateCheckpoint()
    this.mapNameUI.set(this.mapRuntime.mapKey)
    this.refreshDbg()
  }
}

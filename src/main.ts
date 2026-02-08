import './style.css'
import * as Phaser from 'phaser'

installFatalErrorOverlay()

function installFatalErrorOverlay() {
  const show = (title: string, details: unknown) => {
    const el = document.getElementById('app')
    if (!el) return
    const text = details instanceof Error ? `${details.name}: ${details.message}\n\n${details.stack ?? ''}` : String(details)
    el.innerHTML = `<pre style="max-width: 960px; white-space: pre-wrap; padding: 16px; margin: 16px; border-radius: 12px; background: rgba(0,0,0,0.65); color: #f4f2ec; font: 14px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${title}\n\n${escapeHtml(text)}</pre>`
  }

  window.addEventListener('error', (e) => show('Uncaught error', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => show('Unhandled promise rejection', e.reason))
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const TILE_SIZE = 64
const HERO_W = 48
const HERO_H = 72

type Facing = 'down' | 'up' | 'left' | 'right'

type MapKey = 'overworld' | 'cave'

class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }
  private player!: Phaser.Physics.Arcade.Sprite
  private speed = 240
  private facing: Facing = 'down'

  private currentMapKey: MapKey = 'overworld'
  private map?: Phaser.Tilemaps.Tilemap
  private groundLayer?: Phaser.Tilemaps.TilemapLayer
  private groundCollider?: Phaser.Physics.Arcade.Collider
  private warpZones: Phaser.GameObjects.Zone[] = []
  private warpOverlaps: Phaser.Physics.Arcade.Collider[] = []
  private transitioning = false

  constructor() {
    super('game')
  }

  preload() {
    // Real sprite pipeline: load a spritesheet from /public.
    // Layout: 3 columns (walk frames), 4 rows (down, up, left, right).
    this.load.spritesheet('hero', '/sprites/hero.png', { frameWidth: HERO_W, frameHeight: HERO_H })

    // Tilemap pipeline (Tiled JSON + tileset image in /public).
    this.load.image('overworldTiles', '/tilesets/overworld.png')
    this.load.tilemapTiledJSON('overworld', '/maps/overworld.json')
    this.load.tilemapTiledJSON('cave', '/maps/cave.json')
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

    // Create the player once and keep it across map loads.
    this.player = this.physics.add.sprite(0, 0, 'hero', this.frameFor(this.facing, 0))
    this.player.setOrigin(0.5, 0.8)
    this.player.setCollideWorldBounds(true)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setSize(28, 28)
    body.setOffset((HERO_W - 28) / 2, HERO_H - 28 - 8)

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.createHeroAnims()

    this.loadMap('overworld', 'player_spawn')

    // Expose a tiny bit of state for automated playtests (and debugging).
    this.refreshDbg()

    this.add
      .text(24, 24, 'Top-Down RPG Starter', {
        fontFamily: 'Georgia, serif',
        fontSize: '24px',
        color: '#f4f2ec',
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { left: 12, right: 12, top: 8, bottom: 8 },
      })
      .setScrollFactor(0)
  }

  private loadMap(mapKey: MapKey, spawnName: string) {
    this.destroyCurrentMap()

    this.currentMapKey = mapKey
    const map = this.make.tilemap({ key: mapKey })
    const tileset = map.addTilesetImage('overworld', 'overworldTiles')
    if (!tileset) throw new Error('Failed to create tileset. Check tileset name in Tiled JSON.')

    const ground = map.createLayer('Ground', tileset, 0, 0)
    if (!ground) throw new Error('Failed to create Ground layer. Check layer name in Tiled JSON.')

    ground.setCollisionByProperty({ collides: true })

    this.map = map
    this.groundLayer = ground

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)

    const spawn = map.findObject('Objects', (o) => o.name === spawnName)
    const spawnX = spawn?.x ?? TILE_SIZE * 5 + TILE_SIZE / 2
    const spawnY = spawn?.y ?? TILE_SIZE * 5 + TILE_SIZE / 2

    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.reset(spawnX, spawnY)
    this.player.setVelocity(0, 0)

    this.groundCollider = this.physics.add.collider(this.player, ground)

    this.installWarps(map)

    this.refreshDbg()
  }

  private destroyCurrentMap() {
    for (const o of this.warpOverlaps) o.destroy()
    this.warpOverlaps = []

    for (const z of this.warpZones) z.destroy()
    this.warpZones = []

    this.groundCollider?.destroy()
    this.groundCollider = undefined

    this.groundLayer?.destroy()
    this.groundLayer = undefined

    this.map?.destroy()
    this.map = undefined
  }

  private installWarps(map: Phaser.Tilemaps.Tilemap) {
    const layer = map.getObjectLayer('Objects')
    const objects = layer?.objects ?? []

    for (const o of objects) {
      if (o.type !== 'warp') continue
      if (typeof o.x !== 'number' || typeof o.y !== 'number') continue
      if (typeof o.width !== 'number' || typeof o.height !== 'number') continue
      if (o.width <= 0 || o.height <= 0) continue

      const props = (o.properties ?? []) as any[]
      const toMap = props.find((p) => p?.name === 'toMap')?.value
      const toSpawn = props.find((p) => p?.name === 'toSpawn')?.value
      if (typeof toMap !== 'string' || !toMap) continue

      const zone = this.add.zone(o.x + o.width / 2, o.y + o.height / 2, o.width, o.height)
      this.physics.add.existing(zone, true)
      this.warpZones.push(zone)

      const overlap = this.physics.add.overlap(this.player, zone, () => {
        if (this.transitioning) return
        this.transitioning = true

        // Small delay avoids edge cases where the overlap fires repeatedly in the same step.
        this.time.delayedCall(60, () => {
          this.loadMap(toMap as MapKey, typeof toSpawn === 'string' && toSpawn ? toSpawn : 'player_spawn')
          this.time.delayedCall(250, () => (this.transitioning = false))
        })
      })

      this.warpOverlaps.push(overlap)
    }
  }

  private refreshDbg() {
    ;(window as any).__dbg = { player: this.player, mapKey: this.currentMapKey }
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

  private frameFor(facing: Facing, step: 0 | 1 | 2) {
    const rowByFacing: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 }
    return rowByFacing[facing] * 3 + step
  }

  update() {
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
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 600,
  backgroundColor: '#10131a',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [GameScene],
  render: {
    antialias: true,
    pixelArt: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
})

void game

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

const WORLD_WIDTH = 1600
const WORLD_HEIGHT = 1000
const TILE_SIZE = 64
const HERO_W = 48
const HERO_H = 72

type Facing = 'down' | 'up' | 'left' | 'right'

class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key }
  private player!: Phaser.Physics.Arcade.Sprite
  private speed = 240
  private facing: Facing = 'down'

  constructor() {
    super('game')
  }

  preload() {
    // Generate simple HD-style textures at runtime (placeholder art).
    const g = this.add.graphics()

    g.fillStyle(0x2f8f2f, 1)
    g.fillRoundedRect(0, 0, TILE_SIZE, TILE_SIZE, 8)
    g.generateTexture('tile-grass', TILE_SIZE, TILE_SIZE)
    g.clear()

    g.fillStyle(0x7a5a3a, 1)
    g.fillRoundedRect(0, 0, TILE_SIZE, TILE_SIZE, 10)
    g.generateTexture('tile-dirt', TILE_SIZE, TILE_SIZE)
    g.clear()

    g.fillStyle(0x2d2d2d, 1)
    g.fillRoundedRect(0, 0, TILE_SIZE, TILE_SIZE, 12)
    g.generateTexture('tile-rock', TILE_SIZE, TILE_SIZE)
    g.clear()

    g.destroy()

    // Real sprite pipeline: load a spritesheet from /public.
    // Layout: 3 columns (walk frames), 4 rows (down, up, left, right).
    this.load.spritesheet('hero', '/sprites/hero.png', { frameWidth: HERO_W, frameHeight: HERO_H })
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

    // Important: Arcade Physics world bounds default to the canvas size.
    // Our map is larger, so set bounds to avoid "invisible walls" at ~960x600.
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    const tiles = this.physics.add.staticGroup()
    const rocks = this.physics.add.staticGroup()

    for (let y = 0; y < WORLD_HEIGHT; y += TILE_SIZE) {
      for (let x = 0; x < WORLD_WIDTH; x += TILE_SIZE) {
        const isDirt = (x / TILE_SIZE + y / TILE_SIZE) % 7 === 0
        tiles.create(x + TILE_SIZE / 2, y + TILE_SIZE / 2, isDirt ? 'tile-dirt' : 'tile-grass')
      }
    }

    const obstacleCoords = [
      [5, 4],
      [6, 4],
      [7, 4],
      [8, 4],
      [12, 7],
      [12, 8],
      [2, 10],
      [3, 10],
      [4, 10],
      [9, 2],
      [10, 2],
      [11, 2],
    ]

    for (const [gx, gy] of obstacleCoords) {
      rocks.create(gx * TILE_SIZE + TILE_SIZE / 2, gy * TILE_SIZE + TILE_SIZE / 2, 'tile-rock')
    }

    this.player = this.physics.add.sprite(320, 320, 'hero', this.frameFor(this.facing, 0))
    this.player.setOrigin(0.5, 0.8)
    this.player.setCollideWorldBounds(true)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.setSize(28, 28)
    body.setOffset((HERO_W - 28) / 2, HERO_H - 28 - 8)

    this.physics.add.collider(this.player, rocks)

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.createHeroAnims()

    // Expose a tiny bit of state for automated playtests (and debugging).
    ;(window as any).__dbg = { player: this.player }

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

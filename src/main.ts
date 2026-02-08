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

const DEPTH_GROUND = 0
const DEPTH_WARP = 5
const DEPTH_PLAYER = 10
const DEPTH_HITBOX = 11
const DEPTH_ENEMY = 9
const DEPTH_UI = 1000

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
  private enemies?: Phaser.Physics.Arcade.Group
  private enemyGroundCollider?: Phaser.Physics.Arcade.Collider
  private enemyPlayerCollider?: Phaser.Physics.Arcade.Collider
  private warpZones: Phaser.GameObjects.Zone[] = []
  private warpIndicators: Phaser.GameObjects.GameObject[] = []
  private warpOverlaps: Phaser.Physics.Arcade.Collider[] = []
  private attackHitboxes: Phaser.GameObjects.GameObject[] = []
  private transitioning = false
  private attackLock = false
  private lastAttack = { at: 0, hits: 0 }

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

    // Enemy + VFX placeholder textures.
    const g = this.add.graphics()
    g.fillStyle(0x42d36d, 1)
    g.fillRoundedRect(0, 0, 44, 34, 16)
    g.fillStyle(0x2a7a3f, 0.75)
    g.fillEllipse(22, 28, 36, 14)
    g.fillStyle(0x0a0d12, 0.9)
    g.fillCircle(15, 14, 3)
    g.fillCircle(29, 14, 3)
    g.lineStyle(3, 0x0a0d12, 0.65)
    g.strokeRoundedRect(0, 0, 44, 34, 16)
    g.generateTexture('slime', 44, 34)
    g.clear()

    // Sword (64x64): blade + hilt. We'll animate its rotation for the swing.
    // Draw it pointing "right" (0 radians); rotate for other facings.
    g.fillStyle(0x3b2a1a, 1) // handle
    g.fillRoundedRect(10, 30, 12, 6, 3)
    g.fillStyle(0xb08a5a, 1) // pommel
    g.fillCircle(10, 33, 4)
    g.fillStyle(0x1b1b1b, 0.75) // guard
    g.fillRoundedRect(18, 26, 6, 14, 3)

    g.fillStyle(0xd9e3ee, 1) // blade
    g.fillRoundedRect(22, 30, 34, 6, 3)
    g.fillStyle(0xffffff, 0.7) // blade highlight
    g.fillRoundedRect(26, 31, 26, 2, 1)
    g.fillStyle(0xb2c0cf, 0.85) // blade edge shadow
    g.fillRoundedRect(26, 34, 26, 1, 1)
    g.fillStyle(0xd9e3ee, 1) // tip
    g.fillTriangle(56, 30, 64, 33, 56, 36)

    g.lineStyle(3, 0x0a0d12, 0.55)
    g.strokeRoundedRect(22, 30, 34, 6, 3)
    g.strokeRoundedRect(18, 26, 6, 14, 3)
    g.strokeRoundedRect(10, 30, 12, 6, 3)
    g.strokeTriangle(56, 30, 64, 33, 56, 36)

    g.generateTexture('sword', 64, 64)
    g.clear()

    // Sword slash swish (64x64) as a subtle trail (kept lightweight).
    g.lineStyle(10, 0xfff2a8, 0.55)
    g.beginPath()
    g.moveTo(14, 52)
    g.lineTo(54, 12)
    g.strokePath()
    g.lineStyle(5, 0xffffff, 0.35)
    g.beginPath()
    g.moveTo(20, 52)
    g.lineTo(56, 18)
    g.strokePath()
    g.generateTexture('slash', 64, 64)
    g.destroy()
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
    keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    keyboard.on('keydown-SPACE', () => this.tryAttack())

    // Create the player once and keep it across map loads.
    this.player = this.physics.add.sprite(0, 0, 'hero', this.frameFor(this.facing, 0))
    this.player.setOrigin(0.5, 0.8)
    this.player.setDepth(DEPTH_PLAYER)
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
      .setDepth(DEPTH_UI)
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
    ground.setDepth(DEPTH_GROUND)

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
    this.player.setDepth(DEPTH_PLAYER)
    this.children.bringToTop(this.player)

    this.groundCollider = this.physics.add.collider(this.player, ground)

    this.enemies = this.physics.add.group()
    this.spawnEnemiesFromObjects(map)
    this.enemyGroundCollider = this.physics.add.collider(this.enemies, ground)
    this.enemyPlayerCollider = this.physics.add.collider(this.player, this.enemies)

    this.installWarps(map)

    this.refreshDbg()
  }

  private destroyCurrentMap() {
    for (const o of this.warpOverlaps) o.destroy()
    this.warpOverlaps = []

    for (const z of this.warpZones) z.destroy()
    this.warpZones = []

    for (const i of this.warpIndicators) {
      this.tweens.killTweensOf(i)
      i.destroy()
    }
    this.warpIndicators = []

    for (const a of this.attackHitboxes) {
      this.tweens.killTweensOf(a)
      a.destroy()
    }
    this.attackHitboxes = []

    this.enemyGroundCollider?.destroy()
    this.enemyGroundCollider = undefined
    this.enemyPlayerCollider?.destroy()
    this.enemyPlayerCollider = undefined
    this.enemies?.clear(true, true)
    this.enemies?.destroy()
    this.enemies = undefined

    this.groundCollider?.destroy()
    this.groundCollider = undefined

    this.groundLayer?.destroy()
    this.groundLayer = undefined

    this.map?.destroy()
    this.map = undefined
  }

  private spawnEnemiesFromObjects(map: Phaser.Tilemaps.Tilemap) {
    const layer = map.getObjectLayer('Objects')
    const objects = layer?.objects ?? []

    for (const o of objects) {
      if (o.type !== 'enemy') continue
      if (typeof o.x !== 'number' || typeof o.y !== 'number') continue

      const props = (o.properties ?? []) as any[]
      const hpRaw = props.find((p) => p?.name === 'hp')?.value
      const hp = typeof hpRaw === 'number' ? Math.max(1, Math.floor(hpRaw)) : 3

      const enemy = this.physics.add.sprite(o.x, o.y, 'slime')
      enemy.setDepth(DEPTH_ENEMY)
      enemy.setOrigin(0.5, 0.9)
      enemy.setCollideWorldBounds(true)
      enemy.setPushable(false)
      enemy.setDataEnabled()
      enemy.setData('hp', hp)
      enemy.setData('invulnUntil', 0)

      const body = enemy.body as Phaser.Physics.Arcade.Body
      body.setSize(34, 22)
      body.setOffset((44 - 34) / 2, 34 - 22 - 4)

      this.enemies?.add(enemy)
    }
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

      // Visual indicator: make warp zones obvious without needing special tiles.
      this.warpIndicators.push(...this.makeWarpIndicator(zone.x, zone.y, o.width, o.height))

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

  private makeWarpIndicator(x: number, y: number, w: number, h: number) {
    const rect = this.add
      .rectangle(x, y, w, h, 0x00d0ff, 0.18)
      .setStrokeStyle(3, 0x76fff8, 0.75)
      .setDepth(DEPTH_WARP)

    const label = this.add
      .text(x, y - h / 2 - 18, 'WARP', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#eaffff',
        backgroundColor: 'rgba(0,0,0,0.35)',
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH_WARP)

    const diamond = this.add.graphics().setDepth(DEPTH_WARP)
    diamond.lineStyle(4, 0x76fff8, 0.85)
    diamond.fillStyle(0x00d0ff, 0.08)
    const r = Math.min(w, h) * 0.22
    diamond.fillPoints(
      [
        { x, y: y - r },
        { x: x + r, y },
        { x, y: y + r },
        { x: x - r, y },
      ],
      true,
    )
    diamond.strokePoints(
      [
        { x, y: y - r },
        { x: x + r, y },
        { x, y: y + r },
        { x: x - r, y },
      ],
      true,
    )

    this.tweens.add({
      targets: rect,
      alpha: { from: 0.12, to: 0.28 },
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    })

    this.tweens.add({
      targets: label,
      alpha: { from: 0.6, to: 1 },
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    })

    this.tweens.add({
      targets: diamond,
      angle: { from: -3, to: 3 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    })

    return [rect, label, diamond]
  }

  private refreshDbg() {
    ;(window as any).__dbg = {
      player: this.player,
      mapKey: this.currentMapKey,
      getEnemies: () => {
        const enemies = this.enemies?.getChildren?.() ?? []
        return enemies
          .filter((e: any) => e?.active)
          .map((e: any) => ({ x: e.x, y: e.y, hp: e.getData?.('hp') ?? null }))
      },
      lastAttack: this.lastAttack,
      facing: this.facing,
      depths: {
        ground: this.groundLayer?.depth ?? null,
        player: this.player.depth,
      },
    }
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

    // Attack is handled via a keydown listener (see create()).
  }

  private tryAttack() {
    if (this.attackLock) return
    if (!this.enemies) return

    this.attackLock = true
    this.lastAttack = { at: this.time.now, hits: 0 }

    const offset = 42
    const sizeW = 50
    const sizeH = 34

    let hx = this.player.x
    let hy = this.player.y
    if (this.facing === 'up') hy -= offset
    if (this.facing === 'down') hy += offset
    if (this.facing === 'left') hx -= offset
    if (this.facing === 'right') hx += offset

    // Hit detection: use ArcadePhysics.overlapRect against world bodies. This avoids
    // creating short-lived physics bodies (and is reliable across Phaser versions).
    const left = hx - sizeW / 2
    const top = hy - sizeH / 2
    const bodies = this.physics.overlapRect(left, top, sizeW, sizeH, true, false) as Phaser.Physics.Arcade.Body[]
    for (const b of bodies) {
      const go = (b as any)?.gameObject as Phaser.GameObjects.GameObject | undefined
      if (!go || !go.active) continue
      if (go === this.player) continue
      const hasHp = (go as any).getData && (go as any).getData('hp') != null
      if (!hasHp) continue
      this.lastAttack.hits++
      this.damageEnemy(go as Phaser.Physics.Arcade.Sprite)
    }

    const rotByFacing: Record<Facing, number> = {
      right: 0,
      down: Math.PI / 2,
      left: Math.PI,
      up: -Math.PI / 2,
    }
    const baseRot = rotByFacing[this.facing]

    const sword = this.add.image(this.player.x, this.player.y, 'sword').setDepth(DEPTH_HITBOX).setAlpha(1)
    sword.setOrigin(0.2, 0.5) // near handle
    sword.setRotation(baseRot)

    const slash = this.add.image(hx, hy, 'slash').setDepth(DEPTH_HITBOX).setAlpha(0.6)
    slash.setBlendMode(Phaser.BlendModes.ADD)
    slash.setRotation(baseRot)
    slash.setScale(0.85)

    // Position the sword slightly ahead of the player, in the facing direction.
    const swordOffset = 22
    const sx = this.player.x + Math.cos(baseRot) * swordOffset
    const sy = this.player.y + Math.sin(baseRot) * swordOffset
    sword.setPosition(sx, sy)

    const swing = 0.55
    const from = baseRot - swing
    const to = baseRot + swing
    sword.setRotation(from)

    this.tweens.add({
      targets: slash,
      alpha: { from: 0.6, to: 0 },
      scale: { from: 0.85, to: 1.15 },
      duration: 140,
      ease: 'sine.out',
      onComplete: () => slash.destroy(),
    })

    this.tweens.add({
      targets: sword,
      rotation: { from, to },
      duration: 120,
      ease: 'sine.inOut',
      onComplete: () => sword.destroy(),
    })
    this.refreshDbg()

    this.time.delayedCall(220, () => {
      this.attackLock = false
    })
  }

  private damageEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const now = this.time.now
    const inv = (enemy.getData('invulnUntil') as number) ?? 0
    if (now < inv) return

    const hp = (enemy.getData('hp') as number) ?? 1
    const nextHp = hp - 1
    enemy.setData('hp', nextHp)
    enemy.setData('invulnUntil', now + 250)

    enemy.setTintFill(0xffffff)
    this.time.delayedCall(70, () => {
      if (!enemy.active) return
      enemy.clearTint()
    })

    // Knockback.
    const dx = enemy.x - this.player.x
    const dy = enemy.y - this.player.y
    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(220)
    if (enemy.body) enemy.setVelocity(v.x, v.y)
    this.time.delayedCall(120, () => {
      if (!enemy.active) return
      if (!enemy.body) return
      enemy.setVelocity(0, 0)
    })

    if (nextHp <= 0) {
      // Disable immediately so follow-up timers / overlaps don't interact with a dead enemy.
      const b = enemy.body as Phaser.Physics.Arcade.Body | undefined
      if (b) b.enable = false
      enemy.setVisible(false)
      this.time.delayedCall(60, () => {
        if (!enemy.scene) return
        enemy.destroy()
      })
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

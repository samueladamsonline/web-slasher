import * as Phaser from 'phaser'
import { Enemy } from '../entities/Enemy'
import { DEPTH_GROUND, DEPTH_PLAYER, DEPTH_WARP, TILE_SIZE } from './constants'
import type { MapKey } from './types'
import type { InteractionSystem } from '../systems/InteractionSystem'
import type { PickupSystem } from '../systems/PickupSystem'

type GameObj = Phaser.GameObjects.GameObject

type MapRuntimeState = {
  mapKey: MapKey
  spawnName: string
  map: Phaser.Tilemaps.Tilemap
  ground: Phaser.Tilemaps.TilemapLayer
  enemies: Phaser.Physics.Arcade.Group
}

type TiledObjectGroup = {
  name?: string
  objects?: Phaser.Types.Tilemaps.TiledObject[]
}

export class MapRuntime {
  private scene: Phaser.Scene
  private player: Phaser.Physics.Arcade.Sprite
  private onChanged?: () => void
  private canWarp?: () => boolean
  private pickupSystem?: PickupSystem
  private interactionSystem?: InteractionSystem

  private state?: MapRuntimeState

  private groundCollider?: Phaser.Physics.Arcade.Collider
  private enemyGroundCollider?: Phaser.Physics.Arcade.Collider

  private warpZones: Phaser.GameObjects.Zone[] = []
  private warpIndicators: GameObj[] = []
  private warpOverlaps: Phaser.Physics.Arcade.Collider[] = []
  private transitioning = false

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    opts?: { onChanged?: () => void; canWarp?: () => boolean; pickupSystem?: PickupSystem; interactionSystem?: InteractionSystem },
  ) {
    this.scene = scene
    this.player = player
    this.onChanged = opts?.onChanged
    this.canWarp = opts?.canWarp
    this.pickupSystem = opts?.pickupSystem
    this.interactionSystem = opts?.interactionSystem
  }

  setPickupSystem(pickupSystem: PickupSystem | undefined) {
    this.pickupSystem = pickupSystem
  }

  setInteractionSystem(interactionSystem: InteractionSystem | undefined) {
    this.interactionSystem = interactionSystem
  }

  get mapKey() {
    return this.state?.mapKey ?? null
  }

  get enemies() {
    return this.state?.enemies
  }

  get spawnName() {
    return this.state?.spawnName ?? null
  }

  get groundDepth() {
    return this.state?.ground.depth ?? null
  }

  destroy() {
    this.destroyCurrent()
  }

  load(mapKey: MapKey, spawnName: string) {
    this.loadInternal(mapKey, spawnName, { preserveTransition: false })
  }

  requestWarp(toMap: MapKey, toSpawn: string) {
    if (this.transitioning) return
    if (this.canWarp && !this.canWarp()) return
    this.transitioning = true

    this.scene.time.delayedCall(60, () => {
      this.loadInternal(toMap, toSpawn, { preserveTransition: true })
      this.scene.time.delayedCall(250, () => (this.transitioning = false))
    })
  }

  private loadInternal(mapKey: MapKey, spawnName: string, opts: { preserveTransition: boolean }) {
    this.destroyCurrent(opts)

    const map = this.scene.make.tilemap({ key: mapKey })
    const tileset = map.addTilesetImage('overworld', 'overworldTiles')
    if (!tileset) throw new Error('Failed to create tileset. Check tileset name in Tiled JSON.')

    const ground = map.createLayer('Ground', tileset, 0, 0)
    if (!ground) throw new Error('Failed to create Ground layer. Check layer name in Tiled JSON.')

    ground.setCollisionByProperty({ collides: true })
    ground.setDepth(DEPTH_GROUND)

    this.scene.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.scene.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)

    const spawn = this.findObject(map, (o) => o.type === 'spawn' && o.name === spawnName)
    const spawnX = spawn?.x ?? TILE_SIZE * 5 + TILE_SIZE / 2
    const spawnY = spawn?.y ?? TILE_SIZE * 5 + TILE_SIZE / 2

    const pbody = this.player.body as Phaser.Physics.Arcade.Body
    pbody.reset(spawnX, spawnY)
    this.player.setVelocity(0, 0)
    this.player.setDepth(DEPTH_PLAYER)
    this.scene.children.bringToTop(this.player)

    this.groundCollider = this.scene.physics.add.collider(this.player, ground)

    const enemies = this.scene.physics.add.group()
    const objects = this.getObjects(map, ['Enemies', 'Objects'])
    this.spawnEnemiesFromObjects(objects, enemies)
    this.enemyGroundCollider = this.scene.physics.add.collider(enemies, ground)

    this.state = { mapKey, spawnName, map, ground, enemies }

    this.installWarps(objects)
    this.pickupSystem?.install(mapKey, objects)
    this.interactionSystem?.install(mapKey, objects, { requestWarp: (to, sp) => this.requestWarp(to, sp) })

    this.onChanged?.()
  }

  private destroyCurrent(opts?: { preserveTransition?: boolean }) {
    this.pickupSystem?.clear()
    this.interactionSystem?.clear()

    for (const o of this.warpOverlaps) o.destroy()
    this.warpOverlaps = []

    for (const z of this.warpZones) z.destroy()
    this.warpZones = []

    for (const i of this.warpIndicators) {
      this.scene.tweens.killTweensOf(i)
      i.destroy()
    }
    this.warpIndicators = []

    this.enemyGroundCollider?.destroy()
    this.enemyGroundCollider = undefined
    this.state?.enemies.clear(true, true)
    this.state?.enemies.destroy()

    this.groundCollider?.destroy()
    this.groundCollider = undefined

    this.state?.ground.destroy()
    this.state?.map.destroy()

    this.state = undefined
    if (!opts?.preserveTransition) this.transitioning = false
  }

  private spawnEnemiesFromObjects(objects: Phaser.Types.Tilemaps.TiledObject[], group: Phaser.Physics.Arcade.Group) {
    for (const o of objects) {
      if (o.type !== 'enemy') continue
      const enemy = Enemy.fromTiledObject(this.scene, o)
      if (!enemy) continue
      group.add(enemy)
    }
  }

  private installWarps(objects: Phaser.Types.Tilemaps.TiledObject[]) {
    for (const o of objects) {
      if (o.type !== 'warp') continue
      if (typeof o.x !== 'number' || typeof o.y !== 'number') continue
      if (typeof o.width !== 'number' || typeof o.height !== 'number') continue
      if (o.width <= 0 || o.height <= 0) continue

      const props = (o.properties ?? []) as any[]
      const toMap = props.find((p) => p?.name === 'toMap')?.value
      const toSpawn = props.find((p) => p?.name === 'toSpawn')?.value
      if (typeof toMap !== 'string' || !toMap) continue

      const zone = this.scene.add.zone(o.x + o.width / 2, o.y + o.height / 2, o.width, o.height)
      this.scene.physics.add.existing(zone, true)
      this.warpZones.push(zone)

      this.warpIndicators.push(...this.makeWarpIndicator(zone.x, zone.y, o.width, o.height))

      const overlap = this.scene.physics.add.overlap(this.player, zone, () => {
        this.requestWarp(toMap as MapKey, typeof toSpawn === 'string' && toSpawn ? toSpawn : 'player_spawn')
      })

      this.warpOverlaps.push(overlap)
    }
  }

  private getObjects(map: Phaser.Tilemaps.Tilemap, preferredLayerOrder: string[] | null) {
    const allLayers = ((map as any).objects ?? []) as TiledObjectGroup[]
    const byName = new Map<string, TiledObjectGroup>()
    for (const l of allLayers) if (l?.name) byName.set(l.name, l)

    if (Array.isArray(preferredLayerOrder) && preferredLayerOrder.length) {
      const out: Phaser.Types.Tilemaps.TiledObject[] = []
      const used = new Set<string>()
      for (const name of preferredLayerOrder) {
        const layer = byName.get(name)
        if (!layer) continue
        used.add(name)
        out.push(...(layer.objects ?? []))
      }
      // Include other object layers afterwards to make the loader resilient.
      for (const l of allLayers) {
        if (!l?.name || used.has(l.name)) continue
        out.push(...(l.objects ?? []))
      }
      return out
    }

    return allLayers.flatMap((l) => l.objects ?? [])
  }

  private findObject(map: Phaser.Tilemaps.Tilemap, pred: (o: Phaser.Types.Tilemaps.TiledObject) => boolean) {
    const objs = this.getObjects(map, null)
    return objs.find(pred)
  }

  private makeWarpIndicator(x: number, y: number, w: number, h: number) {
    const rect = this.scene.add
      .rectangle(x, y, w, h, 0x00d0ff, 0.18)
      .setStrokeStyle(3, 0x76fff8, 0.75)
      .setDepth(DEPTH_WARP)

    const label = this.scene.add
      .text(x, y - h / 2 - 18, 'WARP', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#eaffff',
        backgroundColor: 'rgba(0,0,0,0.35)',
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH_WARP)

    const diamond = this.scene.add.graphics().setDepth(DEPTH_WARP)
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

    this.scene.tweens.add({ targets: rect, alpha: { from: 0.12, to: 0.28 }, duration: 650, yoyo: true, repeat: -1, ease: 'sine.inOut' })
    this.scene.tweens.add({ targets: label, alpha: { from: 0.6, to: 1 }, duration: 850, yoyo: true, repeat: -1, ease: 'sine.inOut' })
    this.scene.tweens.add({ targets: diamond, angle: { from: -3, to: 3 }, duration: 900, yoyo: true, repeat: -1, ease: 'sine.inOut' })

    return [rect, label, diamond]
  }
}

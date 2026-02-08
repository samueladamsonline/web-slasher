import * as Phaser from 'phaser'
import { DEPTH_MAP_OVERLAY, DEPTH_MINIMAP, TILE_SIZE } from '../game/constants'
import type { WarpTileRect } from '../game/MapRuntime'

type TileSize = { w: number; h: number }

export class MinimapUI {
  private scene: Phaser.Scene
  private player: Phaser.Physics.Arcade.Sprite
  private getMapKey: () => string | null
  private getMapSizeTiles: () => TileSize | null
  private isTileBlocked: (tx: number, ty: number) => boolean
  private getWarpRects: () => WarpTileRect[]
  private getEnemyPoints: () => { x: number; y: number }[]

  private miniRadiusTiles = 10

  private miniContainer: Phaser.GameObjects.Container
  private miniPanel: Phaser.GameObjects.Rectangle
  private miniG: Phaser.GameObjects.Graphics
  private miniPad = 10
  private miniTilePx = 6

  private mapContainer: Phaser.GameObjects.Container
  private mapDim: Phaser.GameObjects.Rectangle
  private mapPanel: Phaser.GameObjects.Rectangle
  private mapTitle: Phaser.GameObjects.Text
  private mapHint: Phaser.GameObjects.Text
  private mapG: Phaser.GameObjects.Graphics
  private mapPad = 18
  private mapTilePx = 16
  private mapDrawX = 0
  private mapDrawY = 0

  constructor(
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Sprite,
    deps: {
      getMapKey: () => string | null
      getMapSizeTiles: () => TileSize | null
      isTileBlocked: (tx: number, ty: number) => boolean
      getWarpRects: () => WarpTileRect[]
      getEnemyPoints: () => { x: number; y: number }[]
    },
  ) {
    this.scene = scene
    this.player = player
    this.getMapKey = deps.getMapKey
    this.getMapSizeTiles = deps.getMapSizeTiles
    this.isTileBlocked = deps.isTileBlocked
    this.getWarpRects = deps.getWarpRects
    this.getEnemyPoints = deps.getEnemyPoints

    // Small minimap HUD (top-right).
    this.miniPanel = scene.add.rectangle(0, 0, 10, 10, 0x0a0d12, 0.45).setOrigin(0, 0)
    this.miniPanel.setStrokeStyle(2, 0xffffff, 0.22)
    this.miniG = scene.add.graphics()
    this.miniContainer = scene.add.container(0, 0, [this.miniPanel, this.miniG])
    this.miniContainer.setScrollFactor(0)
    this.miniContainer.setDepth(DEPTH_MINIMAP)

    // Large map overlay (toggled with M).
    this.mapDim = scene.add.rectangle(0, 0, 10, 10, 0x0a0d12, 0.62).setOrigin(0, 0)
    this.mapPanel = scene.add.rectangle(0, 0, 10, 10, 0x101722, 0.94).setOrigin(0.5, 0.5)
    this.mapPanel.setStrokeStyle(3, 0xffffff, 0.22)

    this.mapTitle = scene.add
      .text(0, 0, 'MAP', { fontFamily: 'Georgia, serif', fontSize: '26px', color: '#f4f2ec' })
      .setOrigin(0.5, 0.5)
    this.mapHint = scene.add
      .text(0, 0, 'M or ESC: Close', { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#d7d3c8' })
      .setOrigin(0.5, 0.5)
    this.mapG = scene.add.graphics()
    this.mapContainer = scene.add.container(0, 0, [this.mapDim, this.mapPanel, this.mapTitle, this.mapHint, this.mapG])
    this.mapContainer.setScrollFactor(0)
    this.mapContainer.setDepth(DEPTH_MAP_OVERLAY)
    this.mapContainer.setVisible(false)

    this.layout()
    scene.scale.on('resize', this.layout, this)
  }

  destroy() {
    this.scene.scale.off('resize', this.layout, this)
    this.miniContainer.destroy(true)
    this.mapContainer.destroy(true)
  }

  setMiniVisible(visible: boolean) {
    this.miniContainer.setVisible(visible)
  }

  setMapVisible(visible: boolean) {
    this.mapContainer.setVisible(visible)
  }

  isMapVisible() {
    return this.mapContainer.visible
  }

  update() {
    if (this.miniContainer.visible) this.drawMini()
    if (this.mapContainer.visible) this.drawMap()
  }

  onMapChanged() {
    this.layout()
  }

  private drawMini() {
    const size = this.getMapSizeTiles()
    if (!size) return

    const radius = this.miniRadiusTiles
    const grid = radius * 2 + 1
    const ptx = Math.floor(this.player.x / TILE_SIZE)
    const pty = Math.floor(this.player.y / TILE_SIZE)

    const sx = ptx - radius
    const sy = pty - radius

    const g = this.miniG
    g.clear()

    // Palette tuned for readability at tiny sizes.
    const open = 0x284229
    const blocked = 0x0b111a
    const gridLine = 0xffffff
    const warp = 0x00d0ff
    const enemy = 0xdb2b3f
    const player = 0xf4f2ec

    const pad = this.miniPad
    const tile = this.miniTilePx

    // Base tiles.
    for (let y = 0; y < grid; y++) {
      const ty = sy + y
      for (let x = 0; x < grid; x++) {
        const tx = sx + x
        const c = this.isWalkableTile(size, tx, ty) ? open : blocked
        g.fillStyle(c, 1)
        g.fillRect(pad + x * tile, pad + y * tile, tile, tile)
      }
    }

    // Warp tiles.
    for (const r of this.getWarpRects()) {
      const x0 = r.tx - sx
      const y0 = r.ty - sy
      const x1 = x0 + r.w
      const y1 = y0 + r.h
      if (x1 <= 0 || y1 <= 0 || x0 >= grid || y0 >= grid) continue
      const bx = pad + Math.max(0, x0) * tile
      const by = pad + Math.max(0, y0) * tile
      const bw = (Math.min(grid, x1) - Math.max(0, x0)) * tile
      const bh = (Math.min(grid, y1) - Math.max(0, y0)) * tile
      g.fillStyle(warp, 0.24)
      g.fillRect(bx, by, bw, bh)
      g.lineStyle(1, warp, 0.85)
      g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1)
    }

    // Tile grid for legibility (very low alpha).
    g.lineStyle(1, gridLine, 0.06)
    for (let i = 0; i <= grid; i++) {
      const x = pad + i * tile
      const y = pad + i * tile
      g.lineBetween(x, pad, x, pad + grid * tile)
      g.lineBetween(pad, y, pad + grid * tile, y)
    }

    // Enemies (dots).
    const enemies = this.getEnemyPoints()
    g.fillStyle(enemy, 0.9)
    for (const e of enemies) {
      const etx = Math.floor(e.x / TILE_SIZE)
      const ety = Math.floor(e.y / TILE_SIZE)
      const lx = etx - sx
      const ly = ety - sy
      if (lx < 0 || ly < 0 || lx >= grid || ly >= grid) continue
      const cx = pad + lx * tile + tile / 2
      const cy = pad + ly * tile + tile / 2
      g.fillCircle(cx, cy, Math.max(1, Math.floor(tile * 0.22)))
    }

    // Player marker.
    const px = pad + radius * tile + tile / 2
    const py = pad + radius * tile + tile / 2
    g.fillStyle(0x0a0d12, 0.6)
    g.fillCircle(px, py, Math.max(2, Math.floor(tile * 0.4)))
    g.fillStyle(player, 1)
    g.fillCircle(px, py, Math.max(1, Math.floor(tile * 0.26)))
  }

  private drawMap() {
    const size = this.getMapSizeTiles()
    if (!size) return

    const g = this.mapG
    g.clear()

    const open = 0x2f4b30
    const blocked = 0x0b111a
    const warp = 0x00d0ff
    const enemy = 0xdb2b3f
    const player = 0xf4f2ec

    // Map label includes the current map key.
    const key = this.getMapKey()
    this.mapTitle.setText(key ? `MAP: ${String(key).toUpperCase()}` : 'MAP')

    const tile = this.mapTilePx
    const ox = this.mapDrawX
    const oy = this.mapDrawY

    // Base tiles.
    for (let ty = 0; ty < size.h; ty++) {
      for (let tx = 0; tx < size.w; tx++) {
        const c = this.isWalkableTile(size, tx, ty) ? open : blocked
        g.fillStyle(c, 1)
        g.fillRect(ox + tx * tile, oy + ty * tile, tile, tile)
      }
    }

    // Warps.
    for (const r of this.getWarpRects()) {
      if (r.w <= 0 || r.h <= 0) continue
      g.fillStyle(warp, 0.2)
      g.fillRect(ox + r.tx * tile, oy + r.ty * tile, r.w * tile, r.h * tile)
      g.lineStyle(2, warp, 0.75)
      g.strokeRect(ox + r.tx * tile + 1, oy + r.ty * tile + 1, r.w * tile - 2, r.h * tile - 2)
    }

    // Enemies.
    const enemies = this.getEnemyPoints()
    g.fillStyle(enemy, 0.9)
    for (const e of enemies) {
      const etx = Math.floor(e.x / TILE_SIZE)
      const ety = Math.floor(e.y / TILE_SIZE)
      if (etx < 0 || ety < 0 || etx >= size.w || ety >= size.h) continue
      const cx = ox + etx * tile + tile / 2
      const cy = oy + ety * tile + tile / 2
      g.fillCircle(cx, cy, Math.max(2, Math.floor(tile * 0.2)))
    }

    // Player.
    const ptx = Math.floor(this.player.x / TILE_SIZE)
    const pty = Math.floor(this.player.y / TILE_SIZE)
    const cx = ox + ptx * tile + tile / 2
    const cy = oy + pty * tile + tile / 2
    g.fillStyle(0x0a0d12, 0.65)
    g.fillCircle(cx, cy, Math.max(3, Math.floor(tile * 0.32)))
    g.fillStyle(player, 1)
    g.fillCircle(cx, cy, Math.max(2, Math.floor(tile * 0.22)))

    // Subtle border around the map pixels.
    g.lineStyle(2, 0xffffff, 0.12)
    g.strokeRect(ox + 1, oy + 1, size.w * tile - 2, size.h * tile - 2)
  }

  private isWalkableTile(size: TileSize, tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= size.w || ty >= size.h) return false
    return !this.isTileBlocked(tx, ty)
  }

  private layout() {
    const w = this.scene.scale.width
    const h = this.scene.scale.height

    // Minimap (top-right).
    const s = Math.min(w, h)
    const target = Math.floor(s * 0.26)
    const panel = Math.min(240, Math.max(160, target))
    const radius = this.miniRadiusTiles
    const grid = radius * 2 + 1
    const pad = 10
    const tile = Math.max(3, Math.floor((panel - pad * 2) / grid))
    const content = tile * grid
    const actualPanel = content + pad * 2

    this.miniPad = pad
    this.miniTilePx = tile
    this.miniPanel.setSize(actualPanel, actualPanel)

    const margin = 16
    const mx = Math.floor(w - margin - actualPanel)
    const my = Math.floor(margin + 34) // leave room for MapNameUI above
    this.miniContainer.setPosition(mx, my)

    // Large map overlay (center, ~75% of screen).
    this.mapDim.setSize(w, h)

    const pw = Math.min(w - 40, Math.max(420, Math.floor(w * 0.75)))
    const ph = Math.min(h - 40, Math.max(320, Math.floor(h * 0.75)))
    const cx = Math.floor(w / 2)
    const cy = Math.floor(h / 2)

    this.mapPanel.setSize(pw, ph)
    this.mapPanel.setPosition(cx, cy)

    this.mapTitle.setPosition(cx, cy - ph / 2 + 46)
    this.mapHint.setPosition(cx, cy + ph / 2 - 24)

    // Compute map draw rect inside the panel.
    const mapSize = this.getMapSizeTiles()
    if (!mapSize) return

    const usableW = pw - this.mapPad * 2
    const usableH = ph - this.mapPad * 2 - 70 // header/hint room
    const tilePx = Math.max(5, Math.min(28, Math.floor(Math.min(usableW / mapSize.w, usableH / mapSize.h))))
    this.mapTilePx = tilePx

    const drawW = mapSize.w * tilePx
    const drawH = mapSize.h * tilePx

    const top = cy - ph / 2 + 76
    this.mapDrawX = Math.floor(cx - drawW / 2)
    this.mapDrawY = Math.floor(top + (usableH - drawH) / 2)
  }
}

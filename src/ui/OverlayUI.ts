import * as Phaser from 'phaser'
import { DEPTH_UI } from '../game/constants'

export class OverlayUI {
  private scene: Phaser.Scene

  private container: Phaser.GameObjects.Container
  private dim: Phaser.GameObjects.Rectangle
  private panel: Phaser.GameObjects.Rectangle
  private title: Phaser.GameObjects.Text
  private body: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene) {
    this.scene = scene

    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x0a0d12, 0.52).setOrigin(0, 0)
    this.panel = scene.add.rectangle(0, 0, 10, 10, 0x101722, 0.92).setOrigin(0.5, 0.5)
    this.panel.setStrokeStyle(3, 0xffffff, 0.22)

    this.title = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '32px',
        color: '#f4f2ec',
      })
      .setOrigin(0.5, 0.5)

    this.body = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#d7d3c8',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0.5)

    this.container = scene.add.container(0, 0, [this.dim, this.panel, this.title, this.body])
    this.container.setScrollFactor(0)
    this.container.setDepth(DEPTH_UI)
    this.container.setVisible(false)

    this.layout()
    scene.scale.on('resize', this.layout, this)
  }

  destroy() {
    this.scene.scale.off('resize', this.layout, this)
    this.container.destroy(true)
  }

  hide() {
    this.container.setVisible(false)
  }

  showPause(lines: string[]) {
    this.title.setText('PAUSED')
    this.body.setText(lines.join('\n'))
    this.container.setVisible(true)
    this.layout()
  }

  showInventory(lines: string[]) {
    this.title.setText('INVENTORY')
    this.body.setText(lines.join('\n'))
    this.container.setVisible(true)
    this.layout()
  }

  showGameOver(lines: string[]) {
    this.title.setText('GAME OVER')
    this.body.setText(lines.join('\n'))
    this.container.setVisible(true)
    this.layout()
  }

  private layout() {
    const w = this.scene.scale.width
    const h = this.scene.scale.height

    this.dim.setSize(w, h)

    const pw = Math.min(520, Math.max(360, Math.floor(w * 0.75)))
    const ph = Math.min(320, Math.max(240, Math.floor(h * 0.55)))
    this.panel.setSize(pw, ph)

    const cx = Math.floor(w / 2)
    const cy = Math.floor(h / 2)
    this.panel.setPosition(cx, cy)
    this.title.setPosition(cx, cy - ph / 2 + 54)
    this.body.setPosition(cx, cy + 14)
  }
}

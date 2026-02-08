import * as Phaser from 'phaser'
import { DEPTH_UI } from '../game/constants'

export class MapNameUI {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private bg: Phaser.GameObjects.Rectangle
  private text: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.bg = scene.add.rectangle(0, 0, 160, 28, 0x0a0d12, 0.45).setOrigin(1, 0)
    this.bg.setStrokeStyle(2, 0xffffff, 0.22)
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#f4f2ec',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setOrigin(1, 0)

    this.container = scene.add.container(0, 0, [this.bg, this.text])
    this.container.setScrollFactor(0)
    this.container.setDepth(DEPTH_UI)

    this.layout()
    scene.scale.on('resize', this.layout, this)
  }

  destroy() {
    this.scene.scale.off('resize', this.layout, this)
    this.container.destroy(true)
  }

  set(mapKey: string | null) {
    const label = mapKey ? mapKey.toUpperCase() : ''
    this.text.setText(label)
    this.container.setVisible(!!label)
    this.layout()
  }

  private layout() {
    const w = this.scene.scale.width
    this.container.setPosition(w - 18, 14)

    // Resize background to the text width (with padding already included in text bounds).
    const tw = Math.max(120, this.text.width + 16)
    this.bg.width = tw
    this.bg.height = 28
  }
}


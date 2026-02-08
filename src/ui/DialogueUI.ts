import * as Phaser from 'phaser'
import { DEPTH_UI } from '../game/constants'

export class DialogueUI {
  private scene: Phaser.Scene

  private container: Phaser.GameObjects.Container
  private panel: Phaser.GameObjects.Rectangle
  private text: Phaser.GameObjects.Text
  private hint: Phaser.GameObjects.Text

  private open = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene

    this.panel = scene.add.rectangle(0, 0, 10, 10, 0x0a0d12, 0.88).setOrigin(0.5, 1)
    this.panel.setStrokeStyle(2, 0xffffff, 0.22)

    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#f4f2ec',
        wordWrap: { width: 10, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)

    this.hint = scene.add
      .text(0, 0, 'E: Continue', {
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        color: '#d7d3c8',
      })
      .setOrigin(1, 1)

    this.container = scene.add.container(0, 0, [this.panel, this.text, this.hint])
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

  isOpen() {
    return this.open
  }

  getText() {
    return this.text.text
  }

  show(body: string) {
    this.open = true
    this.text.setText(body)
    this.container.setVisible(true)
    this.layout()
  }

  hide() {
    this.open = false
    this.container.setVisible(false)
  }

  private layout() {
    const w = this.scene.scale.width
    const h = this.scene.scale.height

    const pw = Math.min(860, Math.max(360, Math.floor(w * 0.92)))
    const ph = Math.min(220, Math.max(150, Math.floor(h * 0.26)))
    const cx = Math.floor(w / 2)
    const bottom = Math.floor(h - 18)

    this.panel.setSize(pw, ph)
    this.panel.setPosition(cx, bottom)

    this.text.setWordWrapWidth(pw - 44)
    this.text.setPosition(cx - pw / 2 + 22, bottom - ph + 18)

    this.hint.setPosition(cx + pw / 2 - 18, bottom - 12)
  }
}


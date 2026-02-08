import * as Phaser from 'phaser'
import { DEPTH_PROMPT } from '../game/constants'

export class InteractPromptUI {
  private container: Phaser.GameObjects.Container
  private bg: Phaser.GameObjects.Ellipse
  private text: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.ellipse(0, 0, 26, 26, 0x0a0d12, 0.8).setStrokeStyle(2, 0xffffff, 0.32)
    this.text = scene.add
      .text(0, 0, 'E', { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#f4f2ec' })
      .setOrigin(0.5, 0.5)

    this.container = scene.add.container(0, 0, [this.bg, this.text])
    this.container.setDepth(DEPTH_PROMPT)
    this.container.setVisible(false)
  }

  destroy() {
    this.container.destroy(true)
  }

  hide() {
    this.container.setVisible(false)
  }

  showAt(x: number, y: number) {
    this.container.setVisible(true)
    this.container.setPosition(x, y)
  }
}

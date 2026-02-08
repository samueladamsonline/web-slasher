import * as Phaser from 'phaser'
import { DEPTH_UI } from '../game/constants'

export class HeartsUI {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private hearts: Phaser.GameObjects.Image[] = []

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.container = scene.add.container(22, 18)
    this.container.setScrollFactor(0)
    this.container.setDepth(DEPTH_UI)
  }

  destroy() {
    this.container.destroy(true)
  }

  set(maxHp: number, hp: number) {
    // Rebuild if needed.
    if (this.hearts.length !== maxHp) {
      this.container.removeAll(true)
      this.hearts = []
      for (let i = 0; i < maxHp; i++) {
        const img = this.scene.add.image(i * 26, 0, 'heart_full').setOrigin(0, 0)
        img.setScale(1)
        this.container.add(img)
        this.hearts.push(img)
      }
    }

    for (let i = 0; i < this.hearts.length; i++) {
      this.hearts[i]!.setTexture(i < hp ? 'heart_full' : 'heart_empty')
    }
  }

  static preload(scene: Phaser.Scene) {
    const g = scene.add.graphics()

    // Full heart 24x20.
    g.fillStyle(0xdb2b3f, 1)
    g.fillCircle(7, 7, 6)
    g.fillCircle(17, 7, 6)
    g.fillTriangle(1, 10, 23, 10, 12, 19)
    g.lineStyle(2, 0x0a0d12, 0.35)
    g.strokeCircle(7, 7, 6)
    g.strokeCircle(17, 7, 6)
    g.strokeTriangle(1, 10, 23, 10, 12, 19)
    g.generateTexture('heart_full', 24, 20)
    g.clear()

    // Empty heart.
    g.fillStyle(0x1d2530, 0.8)
    g.fillCircle(7, 7, 6)
    g.fillCircle(17, 7, 6)
    g.fillTriangle(1, 10, 23, 10, 12, 19)
    g.lineStyle(2, 0xe2e2e2, 0.55)
    g.strokeCircle(7, 7, 6)
    g.strokeCircle(17, 7, 6)
    g.strokeTriangle(1, 10, 23, 10, 12, 19)
    g.generateTexture('heart_empty', 24, 20)

    g.destroy()
  }
}


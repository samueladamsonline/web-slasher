import * as Phaser from 'phaser'
import { SPELLS, type SpellGrant } from '../content/spells'
import { DEPTH_UI } from '../game/constants'

export class SpellSlotUI {
  static preload(scene: Phaser.Scene) {
    const key = 'spell-icon-none'
    if (scene.textures.exists(key)) return
    const g = scene.add.graphics()
    g.fillStyle(0x0b111a, 0.95)
    g.fillRoundedRect(2, 2, 28, 28, 6)
    g.lineStyle(3, 0xd7d3c8, 0.22)
    g.strokeRoundedRect(2, 2, 28, 28, 6)
    g.lineStyle(3, 0xd7d3c8, 0.28)
    g.strokeLineShape(new Phaser.Geom.Line(10, 10, 22, 22))
    g.strokeLineShape(new Phaser.Geom.Line(22, 10, 10, 22))
    g.generateTexture(key, 32, 32)
    g.destroy()
  }

  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container
  private panel: Phaser.GameObjects.Rectangle
  private icon: Phaser.GameObjects.Image
  private name: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene) {
    this.scene = scene

    this.panel = scene.add.rectangle(0, 0, 10, 10, 0x0b111a, 0.68).setOrigin(0.5, 0.5)
    this.panel.setStrokeStyle(2, 0xe0c68a, 0.22)

    this.icon = scene.add.image(0, 0, 'spell-icon-none').setOrigin(0.5, 0.5)
    this.name = scene.add
      .text(0, 0, 'No Spell', {
        fontFamily: 'Georgia, serif',
        fontSize: '12px',
        color: '#f1e6c8',
      })
      .setOrigin(0.5, 0.5)

    this.container = scene.add.container(0, 0, [this.panel, this.icon, this.name])
    this.container.setScrollFactor(0)
    this.container.setDepth(DEPTH_UI)

    scene.scale.on('resize', this.layout, this)
    this.layout()
  }

  destroy() {
    this.scene.scale.off('resize', this.layout, this)
    this.container.destroy(true)
  }

  setVisible(visible: boolean) {
    this.container.setVisible(visible)
  }

  setSpell(spell: SpellGrant | null) {
    if (!spell) {
      this.icon.setTexture('spell-icon-none').setAlpha(0.7)
      this.name.setText('No Spell').setAlpha(0.75)
      return
    }

    const def = SPELLS[spell.id]
    if (!def) {
      this.icon.setTexture('spell-icon-none').setAlpha(0.7)
      this.name.setText('No Spell').setAlpha(0.75)
      return
    }

    this.icon.setTexture(def.iconTexture).setAlpha(0.95)
    this.name.setText(def.name).setAlpha(1)
  }

  private layout() {
    const w = this.scene.scale.width
    const h = this.scene.scale.height

    const margin = 16
    const boxW = 148
    const boxH = 86

    const cx = Math.floor(w - margin - boxW / 2)
    const cy = Math.floor(h - margin - boxH / 2)

    this.panel.setPosition(cx, cy).setSize(boxW, boxH)
    this.icon.setPosition(cx, cy - 10).setScale(1.15)
    this.name.setPosition(cx, cy + boxH / 2 - 16)
  }
}

